const KP_CALENDAR_PORTAL=/^\/portal\/[^/]+\/[^/]+\/?$/.test(location.pathname);

if(KP_CALENDAR_PORTAL){
  const E=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  const path=location.pathname.split('/').filter(Boolean);
  const tenantSlug=decodeURIComponent(path[1]||'');
  const courseCode=decodeURIComponent(path[2]||'');
  const codeKey=`kp_access_${tenantSlug}_${courseCode}`;
  let mode='all';
  let loading=false;
  let lastSignature='';

  const dateObject=value=>{const date=new Date(String(value||''));return Number.isNaN(date.getTime())?null:date;};
  const dayKey=(date,tz)=>{
    const parts=new Intl.DateTimeFormat('de-DE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
    const get=type=>parts.find(part=>part.type===type)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  };
  const dayLabel=(value,tz)=>{
    const date=dateObject(value);
    return date?new Intl.DateTimeFormat('de-DE',{timeZone:tz,weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(date):'—';
  };
  const timeLabel=(value,tz)=>{
    const date=dateObject(value);
    return date?new Intl.DateTimeFormat('de-DE',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(date):'';
  };

  async function overview(){
    const code=sessionStorage.getItem(codeKey)||'';
    const response=await fetch(`/public/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(courseCode)}/overview`,{
      credentials:'same-origin',
      cache:'no-store',
      headers:code?{'X-Klassenportal-Access-Code':code}:{},
    });
    if(!response.ok)return null;
    try{return await response.json();}catch{return null;}
  }

  function combinedEvents(data){
    const events=[];
    for(const item of data.lessons||[])events.push({kind:'Unterricht',at:item.starts_at,title:item.subject_name||item.notes||'Unterricht',detail:[item.teacher_name,item.room].filter(Boolean).join(' · ')});
    for(const item of data.homework||[])if(item.due_at)events.push({kind:'Aufgabe',at:item.due_at,title:item.title||'Aufgabe',detail:item.subject_short_name||item.subject_name||''});
    for(const item of data.appointments||[])events.push({kind:'Termin',at:item.starts_at,title:item.title||'Termin',detail:item.location||''});
    for(const item of data.exams||[])events.push({kind:'Prüfung',at:item.starts_at,title:item.title||'Prüfung',detail:[item.subject_name,item.room].filter(Boolean).join(' · ')});
    return events.filter(event=>dateObject(event.at)).sort((a,b)=>dateObject(a.at)-dateObject(b.at));
  }

  function windowed(events){
    const now=Date.now();
    const pastFrom=now-28*86400000;
    const futureTo=now+30*86400000;
    return events.filter(event=>{
      const time=dateObject(event.at)?.getTime()||0;
      return time>=pastFrom&&time<=futureTo;
    });
  }

  function visible(events){
    const now=Date.now();
    if(mode==='past')return events.filter(event=>(dateObject(event.at)?.getTime()||0)<now);
    if(mode==='future')return events.filter(event=>(dateObject(event.at)?.getTime()||0)>=now);
    return events;
  }

  function eventRow(event,tz){
    const isPast=(dateObject(event.at)?.getTime()||0)<Date.now();
    return `<div class="portal-item"${isPast?' style="opacity:.72"':''}><div class="portal-item-top"><div><strong>${E(event.title)}</strong><div class="meta">${E(timeLabel(event.at,tz))}${event.detail?` · ${E(event.detail)}`:''}</div></div><span class="portal-pill">${E(isPast?'Vergangen':event.kind)}</span></div>${isPast?`<div class="meta">${E(event.kind)}</div>`:''}</div>`;
  }

  function grouped(events,tz){
    const groups=new Map();
    for(const event of events){
      const key=dayKey(dateObject(event.at),tz);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(event);
    }
    return [...groups.values()].map(rows=>`<div class="portal-day"><h3>${E(dayLabel(rows[0].at,tz))}</h3><div class="portal-list">${rows.map(event=>eventRow(event,tz)).join('')}</div></div>`).join('');
  }

  function render(data){
    const section=document.querySelector('#kalender');
    if(!section)return;
    const tz=String(data.course?.timezone||'Europe/Berlin');
    const events=windowed(combinedEvents(data));
    const rows=visible(events);
    const head=section.querySelector(':scope > .portal-section-head');
    if(head){
      const title=head.querySelector('h2');
      const count=head.querySelector('span');
      if(title)title.textContent='Kalender · 4 Wochen zurück / 30 Tage voraus';
      if(count)count.textContent=`${events.length} Einträge`;
    }
    let body=section.querySelector(':scope > .portal-compact-body');
    const target=body||section;
    const old=target.querySelector(':scope > .kp-calendar-lookback');
    const html=`<div class="kp-calendar-lookback"><div class="toolbar" style="margin-bottom:12px"><button class="portal-btn ${mode==='all'?'':'secondary'}" type="button" data-cal-mode="all">Alles</button><button class="portal-btn ${mode==='past'?'':'secondary'}" type="button" data-cal-mode="past">Letzte 4 Wochen</button><button class="portal-btn ${mode==='future'?'':'secondary'}" type="button" data-cal-mode="future">Kommende 30 Tage</button></div>${rows.length?`<div class="portal-calendar">${grouped(rows,tz)}</div>`:'<div class="portal-empty">Für diesen Zeitraum gibt es keine Kalendereinträge.</div>'}</div>`;
    if(old)old.outerHTML=html;
    else{
      if(body)body.innerHTML=html;
      else [...section.children].filter(node=>node!==head).forEach(node=>node.remove()),section.insertAdjacentHTML('beforeend',html);
    }
    section.querySelectorAll('[data-cal-mode]').forEach(button=>button.addEventListener('click',()=>{mode=button.dataset.calMode||'all';render(data);}));
  }

  async function refresh(){
    if(loading)return;
    loading=true;
    try{
      const data=await overview();
      if(!data?.course)return;
      const signature=JSON.stringify([
        data.course.id,
        (data.lessons||[]).map(x=>[x.id,x.starts_at,x.ends_at]),
        (data.homework||[]).map(x=>[x.id,x.due_at]),
        (data.appointments||[]).map(x=>[x.id,x.starts_at]),
        (data.exams||[]).map(x=>[x.id,x.starts_at]),
      ]);
      if(signature!==lastSignature||!document.querySelector('#kalender .kp-calendar-lookback')){
        lastSignature=signature;
        render(data);
      }
    }finally{loading=false;}
  }

  let queued=false;
  function schedule(){
    if(queued)return;
    queued=true;
    setTimeout(()=>{queued=false;if(document.querySelector('.portal-main'))refresh().catch(()=>{});},80);
  }
  new MutationObserver(schedule).observe(document.querySelector('#class-portal')||document.body,{subtree:true,childList:true});
  schedule();
}
