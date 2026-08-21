if(location.pathname.replace(/\/$/,'')==='/kunden-admin'){
  const nativeFetch=window.fetch.bind(window);
  const norm=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('de-DE').replace(/[–—]/g,'-').replace(/\s+/g,' ').trim();
  const compact=v=>norm(v).replace(/[^a-z0-9äöüß]/g,'');
  const roomIntent=text=>/\b(raum|ressource)\b/i.test(text)&&/\b(gesperrt|defekt|ausgefallen|nicht\s+verfügbar|geschlossen)\b/i.test(text);
  const localToUtc=(date,time,timeZone='Europe/Berlin')=>{
    const [y,m,d]=date.split('-').map(Number),[hh,mm]=time.split(':').map(Number),wanted=Date.UTC(y,m-1,d,hh,mm,0);let guess=wanted;
    const parts=x=>{const a=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(x));const get=t=>Number(a.find(p=>p.type===t)?.value||0);return{year:get('year'),month:get('month'),day:get('day'),hour:get('hour'),minute:get('minute'),second:get('second')}};
    for(let i=0;i<4;i++){const p=parts(guess),seen=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second),delta=wanted-seen;if(!delta)break;guess+=delta;}return new Date(guess).toISOString();
  };
  const berlinToday=()=>{const p=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),get=t=>p.find(x=>x.type===t)?.value;return`${get('year')}-${get('month')}-${get('day')}`};
  const parseDate=s=>{const m=String(s).match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);if(!m)return null;let y=Number(m[3]);if(y<100)y+=2000;return`${y}-${String(Number(m[2])).padStart(2,'0')}-${String(Number(m[1])).padStart(2,'0')}`};
  async function enrichIntentRequest(url,opt){
    if(!opt?.body||opt.method!=='POST'||!String(url).includes('/api/education-os/intent/'))return opt;
    let payload;try{payload=JSON.parse(String(opt.body));}catch{return opt;}
    const intent=String(payload.intent||'');if(!roomIntent(intent))return opt;
    payload.context=payload.context&&typeof payload.context==='object'?payload.context:{};
    const u=new URL(String(url),location.origin),tenantId=u.searchParams.get('tenant_id')||document.querySelector('#tenantPick')?.value||'';
    if(!payload.context.resource_id&&tenantId){
      try{
        const r=await nativeFetch(`/api/education/planning/resources?tenant_id=${encodeURIComponent(tenantId)}`,{credentials:'same-origin',cache:'no-store'});
        if(r.ok){const d=await r.json(),rows=d.resources||[],n=norm(intent),c=compact(intent);let hits=rows.filter(x=>n.includes(norm(x.name)));if(!hits.length)hits=rows.filter(x=>{const k=compact(x.name);return k.length>=2&&c.includes(k)});if(hits.length===1)payload.context.resource_id=hits[0].id;}
      }catch{}
    }
    if(!payload.context.starts_at&&!payload.context.ends_at){
      const until=intent.match(/\bbis\s+(\d{1,2}\.\d{1,2}\.\d{2,4})\b/i),from=intent.match(/\b(?:von|ab)\s+(\d{1,2}\.\d{1,2}\.\d{2,4})\b/i);
      if(until){const end=parseDate(until[1]),start=from?parseDate(from[1]):berlinToday();if(start&&end&&start<=end){payload.context.starts_at=localToUtc(start,'00:00');payload.context.ends_at=localToUtc(end,'23:59');}}
    }
    return{...opt,body:JSON.stringify(payload)};
  }
  window.fetch=async function(input,opt={}){const url=typeof input==='string'?input:input?.url||String(input);const enriched=await enrichIntentRequest(url,opt);return nativeFetch(input,enriched);};

  const humanField=f=>({resource_id:'Raum/Ressource',teacher_id:'Dozent',course_id:'Kurs',exam_id:'Prüfung',date:'Datum',new_date:'neues Datum',new_time:'neue Uhrzeit',scenario_type:'Vorgang'})[f]||String(f).replace(/_id$/,'').replaceAll('_',' ');
  function humanizeIntentPane(root=document){
    const pane=root.querySelector?.('[data-pane-body="intent"]');if(!pane)return;
    const result=pane.querySelector('[data-intent-result]');if(!result)return;
    result.querySelectorAll('.eo-os-note.warn').forEach(n=>{
      const text=n.textContent||'';
      if(text.trim().startsWith('Fehlt:')){const raw=text.split(':').slice(1).join(':').split(',').map(x=>x.trim()).filter(Boolean),labels=raw.map(humanField);n.innerHTML=`<strong>Noch eine Angabe nötig</strong><div class="eo-os-small">${labels.join(', ')} konnte nicht eindeutig zugeordnet werden. Prüfe die Bezeichnung oder wähle einen passenden Treffer aus.</div>`;n.classList.add('kp-intent-blocked');}
    });
    result.querySelectorAll('.eo-os-small').forEach(n=>{
      const current=n.textContent||'';
      const next=current.replace(/resource_id/g,'Raum/Ressource').replace(/teacher_id/g,'Dozent').replace(/course_id/g,'Kurs').replace(/exam_id/g,'Prüfung');
      if(next!==current)n.textContent=next;
    });
    const simulate=pane.querySelector('[data-simulate]');
    if(simulate&&!pane.querySelector('.kp-intent-human-help')){
      const help=document.createElement('div');help.className='kp-intent-human-help';help.innerHTML='<strong>Was jetzt passiert:</strong> Ich löse Personen, Räume, Kurse und Zeiträume gegen die echten Mandantendaten auf. Danach prüft die Simulation betroffene Termine, Konflikte und sichere Alternativen. Es wird dabei noch nichts produktiv geändert.';simulate.closest('.eo-os-card')?.append(help);
    }
    if(simulate){const title=simulate.disabled?'Sobald alle Angaben eindeutig aufgelöst sind, kann die Simulation berechnet werden.':'Berechnet Auswirkungen und Alternativen ohne Produktivdaten zu ändern.';if(simulate.title!==title)simulate.title=title;}
  }

  const intentSelector='[data-pane-body="intent"]';
  const touchesIntent=m=>{
    const target=m.target?.nodeType===1?m.target:m.target?.parentElement;
    if(target?.closest?.(intentSelector))return true;
    return [...(m.addedNodes||[])].some(n=>n.nodeType===1&&(n.matches?.(intentSelector)||n.querySelector?.(intentSelector)));
  };
  let frame=0;
  const observerTarget=document.querySelector('#app')||document.body;
  new MutationObserver(ms=>{
    if(frame||!ms.some(touchesIntent))return;
    frame=requestAnimationFrame(()=>{frame=0;humanizeIntentPane();});
  }).observe(observerTarget,{subtree:true,childList:true,characterData:true});
  humanizeIntentPane();
}
