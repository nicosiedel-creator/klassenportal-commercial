const root=document.querySelector('#class-portal');
if(root){
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const path=location.pathname.split('/').filter(Boolean),tenant=decodeURIComponent(path[1]||''),course=decodeURIComponent(path[2]||''),codeKey=`kp_access_${tenant}_${course}`;
  let busy=false,lastSignature='',timer=0,queued=false,currentData=null;
  const dt=v=>{const d=new Date(String(v||''));return Number.isNaN(d.getTime())?null:d;};
  const txt=(v,f='')=>String(v??'').trim()||f;
  function accessCode(){try{return sessionStorage.getItem(codeKey)||'';}catch{return'';}}
  function fmt(v,tz,opt){const d=dt(v);return d?new Intl.DateTimeFormat('de-DE',{timeZone:tz,...opt}).format(d):'';}
  function time(v,tz){return fmt(v,tz,{hour:'2-digit',minute:'2-digit'});}
  function shortDate(v,tz){return fmt(v,tz,{weekday:'short',day:'2-digit',month:'2-digit'});}
  function key(v,tz){const d=dt(v);if(!d)return'';const p=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d),g=t=>p.find(x=>x.type===t)?.value||'';return `${g('year')}-${g('month')}-${g('day')}`;}
  function weekKeys(tz){const todayKey=key(new Date(),tz),[y,m,d]=todayKey.split('-').map(Number),anchor=new Date(Date.UTC(y,m-1,d,12)),dow=(anchor.getUTCDay()+6)%7,monday=new Date(anchor);monday.setUTCDate(anchor.getUTCDate()-dow);return Array.from({length:7},(_,i)=>{const x=new Date(monday);x.setUTCDate(monday.getUTCDate()+i);return `${x.getUTCFullYear()}-${String(x.getUTCMonth()+1).padStart(2,'0')}-${String(x.getUTCDate()).padStart(2,'0')}`;});}
  function dayLabel(k){const [y,m,d]=k.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d,12));return new Intl.DateTimeFormat('de-DE',{weekday:'short',day:'2-digit',month:'2-digit',timeZone:'UTC'}).format(x);}
  function safeHref(v){try{const u=new URL(String(v||''),location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return'#';}}
  function tone(s){let h=0;for(const c of String(s||''))h=(h*33+c.charCodeAt(0))>>>0;return `kp2-tone-${h%6}`;}
  function done(x){const s=x.my_submission||{};return ['submitted','graded'].includes(s.status)||(x.submission_mode==='info'&&x.my_state?.progress==='completed');}
  function taskMeta(x,tz){if(!x.due_at)return x.submission_mode==='info'?'Lese-/Arbeitsaufgabe · ohne Frist':'Ohne Fälligkeit';const due=dt(x.due_at)?.getTime()||0,when=`${shortDate(x.due_at,tz)} ${time(x.due_at,tz)}`;return due<Date.now()?`Überfällig · ${when}`:`Fällig ${when}`;}
  async function overview(){
    const code=accessCode(),r=await fetch(`/public/${encodeURIComponent(tenant)}/${encodeURIComponent(course)}/overview`,{credentials:'same-origin',cache:'no-store',headers:code?{'X-Klassenportal-Access-Code':code}:{}});
    if(!r.ok)return null;try{return await r.json();}catch{return null;}
  }
  async function enrichAssignments(data){
    if(!['participant','class_admin'].includes(data.viewer?.role)||!data.viewer?.tenantId||!data.course?.id)return;
    const suffix=`tenant_id=${encodeURIComponent(data.viewer.tenantId)}&course_id=${encodeURIComponent(data.course.id)}`;
    try{
      const [a,s]=await Promise.all([fetch(`/api/assignments?${suffix}`,{credentials:'same-origin',cache:'no-store'}),fetch(`/api/assignments/my-state?${suffix}`,{credentials:'same-origin',cache:'no-store'})]);
      if(!a.ok)return;const ad=await a.json(),sd=s.ok?await s.json():{states:[]},states=new Map((sd.states||[]).map(x=>[String(x.homework_id),x]));
      data._personalAssignments=(ad.assignments||[]).map(x=>({...x,my_state:states.get(String(x.id))||null}));
      updateTaskSurfaces(data);
    }catch{}
  }
  function currentLesson(data){
    const n=Date.now(),lessons=(data.lessons||[]).map(x=>({...x,_s:dt(x.starts_at)?.getTime()||0,_e:dt(x.ends_at)?.getTime()||0})).filter(x=>x._s&&x._e).sort((a,b)=>a._s-b._s),active=lessons.find(x=>x._s<=n&&x._e>=n);
    if(active)return{lesson:active,current:true};const next=lessons.find(x=>x._s>n);return next?{lesson:next,current:false}:null;
  }
  function nowCard(data,tz){
    const state=currentLesson(data);if(!state)return'';
    const x=state.lesson,n=Date.now(),subject=txt(x.subject_name,x.notes||'Unterricht'),meta=[`${time(x.starts_at,tz)}–${time(x.ends_at,tz)}`,x.teacher_name,x.room].filter(Boolean).join(' · '),target=state.current?x._e:x._s,mins=Math.max(0,Math.ceil((target-n)/60000));
    const progress=state.current?Math.max(0,Math.min(100,Math.round((n-x._s)/Math.max(1,x._e-x._s)*100))):0;
    return `<section class="kp2-now${state.current?' is-current':' is-next'}" data-kp2-now data-start="${E(x.starts_at)}" data-end="${E(x.ends_at)}" data-current="${state.current?'1':'0'}"><div class="kp2-now-copy"><span>${state.current?'JETZT IM UNTERRICHT':'ALS NÄCHSTES'}</span><strong>${E(subject)}</strong><small>${E(meta)}</small>${state.current?`<i><b style="width:${progress}%"></b></i>`:''}</div><div class="kp2-now-time"><strong>${mins}</strong><span>Min.</span></div></section>`;
  }
  function openTasks(data){return (data._personalAssignments||data.homework||[]).filter(x=>!done(x)).sort((a,b)=>(dt(a.due_at)?.getTime()||Infinity)-(dt(b.due_at)?.getTime()||Infinity));}
  function taskCard(data,tz){
    const tasks=openTasks(data),rows=tasks.slice(0,4).map(x=>`<button class="kp2-row" type="button" data-open-section="aufgaben" data-item-title="${E(x.title||'Aufgabe')}"><span class="kp2-row-icon">✓</span><span><strong>${E(x.title||'Aufgabe')}</strong><small>${E(taskMeta(x,tz))}</small></span></button>`).join('');
    return `<section class="kp2-card kp2-tasks"><header><div><span>DEINE AUFGABEN</span><strong>Aufgaben</strong></div><b>${tasks.length?`${tasks.length} offen`:'Alles erledigt'}</b></header><div class="kp2-card-body" data-kp2-task-body>${rows||'<div class="kp2-empty">Keine offenen Aufgaben.</div>'}</div><button class="kp2-card-link" type="button" data-open-section="aufgaben">Alle Aufgaben ansehen →</button></section>`;
  }
  function nextCard(data,tz){
    const n=Date.now(),events=[];
    for(const x of data.appointments||[])if((dt(x.starts_at)?.getTime()||0)>=n)events.push({at:x.starts_at,title:x.title||'Termin',meta:x.location||'',kind:'Termin',target:'termine'});
    for(const x of data.exams||[])if((dt(x.starts_at)?.getTime()||0)>=n)events.push({at:x.starts_at,title:x.title||'Prüfung',meta:[x.subject_name,x.room].filter(Boolean).join(' · '),kind:'Prüfung',target:'pruefungen'});
    const rows=events.sort((a,b)=>dt(a.at)-dt(b.at)).slice(0,4).map(x=>`<button class="kp2-row" type="button" data-open-section="${E(x.target)}"><span class="kp2-row-icon">•</span><span><strong>${E(x.title)}</strong><small>${E(`${shortDate(x.at,tz)} · ${time(x.at,tz)}${x.meta?` · ${x.meta}`:''}`)}</small></span><em>${E(x.kind)}</em></button>`).join('');
    return `<section class="kp2-card kp2-next"><header><div><span>IM BLICK BEHALTEN</span><strong>Termine & Prüfungen</strong></div></header><div class="kp2-card-body">${rows||'<div class="kp2-empty">Aktuell nichts bevorstehend.</div>'}</div></section>`;
  }
  function weekCard(data,tz){
    const week=weekKeys(tz),byDay=new Map(week.map(k=>[k,[]]));for(const x of data.lessons||[]){const k=key(x.starts_at,tz);if(byDay.has(k))byDay.get(k).push(x);}
    const tasks=openTasks(data),taskCounts=new Map();for(const x of tasks){const k=key(x.due_at,tz);if(k)taskCounts.set(k,(taskCounts.get(k)||0)+1);}
    const active=week.slice(0,5);if(week.slice(5).some(k=>(byDay.get(k)||[]).length||taskCounts.get(k)))active.push(...week.slice(5));
    const slots=[...new Map((data.lessons||[]).filter(x=>active.includes(key(x.starts_at,tz))).map(x=>{const s=time(x.starts_at,tz),e=time(x.ends_at,tz);return [`${s}|${e}`,{s,e,start:dt(x.starts_at)?.getTime()||0}];})).values()].sort((a,b)=>a.start-b.start);
    const today=key(new Date(),tz);
    let html=`<div class="kp2-week-grid" style="--kp2-days:${active.length}"><div class="kp2-week-corner"></div>`;
    for(const k of active){const count=taskCounts.get(k)||0;html+=`<div class="kp2-week-day${k===today?' is-today':''}"><strong>${E(dayLabel(k))}</strong>${count?`<span>${count} Aufgabe${count===1?'':'n'}</span>`:''}</div>`;}
    if(!slots.length)html+=`<div class="kp2-week-empty">Für diese Woche sind keine Unterrichtstermine eingetragen.</div>`;
    const n=Date.now();
    for(const slot of slots){
      html+=`<div class="kp2-week-time">${E(slot.s)}<br><span>${E(slot.e)}</span></div>`;
      for(const k of active){
        const lesson=(byDay.get(k)||[]).find(x=>`${time(x.starts_at,tz)}|${time(x.ends_at,tz)}`===`${slot.s}|${slot.e}`);
        if(!lesson){html+=`<div class="kp2-week-cell${k===today?' is-today':''}"></div>`;continue;}
        const s=dt(lesson.starts_at)?.getTime()||0,e=dt(lesson.ends_at)?.getTime()||0,subject=txt(lesson.subject_name,lesson.notes||'Unterricht'),meta=[lesson.teacher_name,lesson.room].filter(Boolean).join(' · ');
        html+=`<div class="kp2-week-cell${k===today?' is-today':''}"><button type="button" class="kp2-lesson ${tone(subject)}${s<=n&&e>=n?' is-current':''}" data-open-section="stundenplan"><strong>${E(subject)}</strong><span>${E(meta)}</span></button></div>`;
      }
    }
    html+='</div>';
    return `<section class="kp2-card kp2-week"><header><div><span>DEINE WOCHE</span><strong>Wochenplan · ${E(data.course?.name||'Klasse')}</strong></div><b>aktuelle Woche</b></header>${html}</section>`;
  }
  function miniCards(data,tz){
    const anns=(data.announcements||[]).slice(0,2),links=(data.links||[]).slice(0,3),exam=(data.exams||[]).filter(x=>(dt(x.starts_at)?.getTime()||0)>=Date.now()).sort((a,b)=>dt(a.starts_at)-dt(b.starts_at))[0];
    const annBody=anns.length?anns.map(x=>`<button class="kp2-mini-row" type="button" data-open-section="meldungen"><strong>${E(x.title||'Meldung')}</strong><span>${E(shortDate(x.published_at||x.created_at,tz))}</span></button>`).join(''):'<div class="kp2-empty">Keine neuen Meldungen.</div>';
    const examBody=exam?`<button class="kp2-mini-row" type="button" data-open-section="pruefungen"><strong>${E(exam.title||'Prüfung')}</strong><span>${E(`${shortDate(exam.starts_at,tz)} · ${time(exam.starts_at,tz)}`)}</span></button>`:'<div class="kp2-empty">Keine kommende Prüfung.</div>';
    const linkBody=links.length?links.map(x=>`<a class="kp2-mini-row" href="${E(safeHref(x.url))}" target="_blank" rel="noopener noreferrer"><strong>${E(x.title||'Link')}</strong><span>↗</span></a>`).join(''):'<div class="kp2-empty">Keine Links hinterlegt.</div>';
    return `<div class="kp2-mini-grid"><section class="kp2-card"><header><div><span>NEUIGKEITEN</span><strong>Meldungen</strong></div></header><div class="kp2-mini-body">${annBody}</div></section><section class="kp2-card"><header><div><span>NÄCHSTER TERMIN</span><strong>Prüfung</strong></div></header><div class="kp2-mini-body">${examBody}</div></section><section class="kp2-card"><header><div><span>SCHNELLZUGRIFF</span><strong>Links</strong></div></header><div class="kp2-mini-body">${linkBody}</div></section></div>`;
  }
  function signature(data){return JSON.stringify([data.course?.id,(data.lessons||[]).map(x=>[x.id,x.starts_at,x.ends_at,x.subject_name,x.teacher_name,x.room]),(data.homework||[]).map(x=>[x.id,x.title,x.due_at]),(data.appointments||[]).map(x=>[x.id,x.title,x.starts_at]),(data.exams||[]).map(x=>[x.id,x.title,x.starts_at]),(data.announcements||[]).map(x=>[x.id,x.title,x.published_at]),(data.links||[]).map(x=>[x.id,x.title,x.url])]);}
  function render(data){
    const main=root.querySelector('.portal-main'),nav=main?.querySelector('.portal-nav');if(!main||!nav)return;
    const sig=signature(data);if(sig===lastSignature&&main.querySelector('.kp2-dashboard'))return;lastSignature=sig;currentData=data;
    main.querySelector('.kp2-dashboard')?.remove();const tz=txt(data.course?.timezone,'Europe/Berlin'),dash=document.createElement('div');dash.className='kp2-dashboard';
    dash.innerHTML=`${nowCard(data,tz)}<div class="kp2-mosaic">${weekCard(data,tz)}<div class="kp2-side">${taskCard(data,tz)}${nextCard(data,tz)}</div></div>${miniCards(data,tz)}`;
    nav.insertAdjacentElement('afterend',dash);root.classList.add('kp-dashboard-ready');bind(dash);startTimer();
  }
  function updateTaskSurfaces(data){
    currentData=data;const dash=root.querySelector('.kp2-dashboard');if(!dash)return;const tz=txt(data.course?.timezone,'Europe/Berlin'),replacement=document.createElement('div');replacement.innerHTML=taskCard(data,tz);dash.querySelector('.kp2-tasks')?.replaceWith(replacement.firstElementChild);
    const week=dash.querySelector('.kp2-week'),tmp=document.createElement('div');tmp.innerHTML=weekCard(data,tz);week?.replaceWith(tmp.firstElementChild);bind(dash);
  }
  function openSection(id,title=''){
    const section=root.querySelector(`#${CSS.escape(id)}`);if(!section)return;
    section.classList.add('portal-compact-open');const toggle=section.querySelector('.portal-compact-toggle');if(toggle){toggle.textContent='Schließen';toggle.setAttribute('aria-expanded','true');}
    let target=section;if(title){const strong=[...section.querySelectorAll('.portal-item strong')].find(x=>x.textContent?.trim()===title.trim());if(strong)target=strong.closest('.portal-item')||section;}
    target.classList.add('kp2-focus');setTimeout(()=>target.classList.remove('kp2-focus'),1600);requestAnimationFrame(()=>target.scrollIntoView({behavior:'smooth',block:'center'}));
  }
  function bind(dash){
    if(dash.dataset.bound==='1')return;dash.dataset.bound='1';
    dash.addEventListener('click',e=>{const el=e.target.closest('[data-open-section]');if(!el)return;e.preventDefault();openSection(el.dataset.openSection,el.dataset.itemTitle||'');});
  }
  function startTimer(){clearInterval(timer);timer=setInterval(()=>{if(!currentData)return;const now=root.querySelector('[data-kp2-now]');if(!now)return;const current=now.dataset.current==='1',start=dt(now.dataset.start)?.getTime()||0,end=dt(now.dataset.end)?.getTime()||0,n=Date.now();if((current&&n>end)||(!current&&n>=start)){lastSignature='';render(currentData);return;}const target=current?end:start,strong=now.querySelector('.kp2-now-time strong');if(strong)strong.textContent=String(Math.max(0,Math.ceil((target-n)/60000)));if(current){const bar=now.querySelector('.kp2-now-copy i b');if(bar)bar.style.width=`${Math.max(0,Math.min(100,Math.round((n-start)/Math.max(1,end-start)*100)))}%`; }},30000);}
  async function build(){if(busy||!root.querySelector('.portal-shell'))return;busy=true;try{const data=await overview();if(!data?.course)return;render(data);enrichAssignments(data);}finally{busy=false;}}
  function queue(){if(queued)return;queued=true;setTimeout(()=>{queued=false;build().catch(()=>{});},0);}
  new MutationObserver(queue).observe(root,{subtree:true,childList:true});
  window.addEventListener('kp-assignment-change',()=>{if(currentData)enrichAssignments(currentData);});
  queue();
}