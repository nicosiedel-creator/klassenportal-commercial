const studentRoot=document.querySelector('#class-portal');
if(studentRoot){
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const path=location.pathname.split('/').filter(Boolean),tenantSlug=decodeURIComponent(path[1]||''),courseCode=decodeURIComponent(path[2]||''),codeKey=`kp_access_${tenantSlug}_${courseCode}`;
  let busy=false,stamp='',timer=0;
  const dateObj=v=>{const d=new Date(String(v||''));return Number.isNaN(d.getTime())?null:d;};
  const text=(v,f='')=>String(v??'').trim()||f;
  function safeHref(v){try{const u=new URL(String(v||''),location.origin);return ['http:','https:'].includes(u.protocol)?u.href:'#';}catch{return '#';}}
  function parts(d,tz){const out={};for(const p of new Intl.DateTimeFormat('de-DE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(d))if(p.type!=='literal')out[p.type]=p.value;return out;}
  function dateKey(d,tz){if(!d)return'';const p=parts(d,tz);return `${p.year}-${p.month}-${p.day}`;}
  function timeText(v,tz){const d=dateObj(v);return d?new Intl.DateTimeFormat('de-DE',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(d):'';}
  function shortDate(v,tz){const d=dateObj(v);return d?new Intl.DateTimeFormat('de-DE',{timeZone:tz,weekday:'short',day:'2-digit',month:'2-digit'}).format(d):'—';}
  function currentWeekKeys(tz){const p=parts(new Date(),tz),anchor=new Date(Date.UTC(Number(p.year),Number(p.month)-1,Number(p.day),12)),day=(anchor.getUTCDay()+6)%7,monday=new Date(anchor);monday.setUTCDate(anchor.getUTCDate()-day);const out=[];for(let i=0;i<7;i++){const d=new Date(monday);d.setUTCDate(monday.getUTCDate()+i);out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`);}return out;}
  function pastelClass(s){let h=0;for(const ch of String(s||''))h=(h*31+ch.charCodeAt(0))>>>0;return `kp-lesson-tone-${h%5}`;}
  async function overview(){
    const code=sessionStorage.getItem(codeKey)||'';
    const r=await fetch(`/public/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(courseCode)}/overview`,{credentials:'same-origin',cache:'no-store',headers:code?{'X-Klassenportal-Access-Code':code}:{}});
    if(!r.ok)return null;try{return await r.json();}catch{return null;}
  }
  function nowLesson(data,tz){
    const n=Date.now(),lessons=(data.lessons||[]).map(x=>({...x,_s:dateObj(x.starts_at)?.getTime()||0,_e:dateObj(x.ends_at)?.getTime()||0})).filter(x=>x._s&&x._e).sort((a,b)=>a._s-b._s);
    const current=lessons.find(x=>x._s<=n&&x._e>=n);if(current)return{lesson:current,current:true};const next=lessons.find(x=>x._s>n);return next?{lesson:next,current:false}:null;
  }
  function nowCard(data,tz){
    const state=nowLesson(data,tz);if(!state)return'';const x=state.lesson,n=Date.now(),total=Math.max(1,x._e-x._s),elapsed=Math.min(total,Math.max(0,n-x._s)),progress=state.current?Math.round(elapsed/total*100):0,mins=state.current?Math.max(0,Math.ceil((x._e-n)/60000)):Math.max(0,Math.ceil((x._s-n)/60000)),subject=text(x.subject_name,x.notes||'Unterricht'),meta=[timeText(x.starts_at,tz)+'–'+timeText(x.ends_at,tz),x.teacher_name,x.room].filter(Boolean).join(' · ');
    return `<section class="kp-now-card${state.current?'':' is-next'}" data-kp-now data-start="${E(x.starts_at)}" data-end="${E(x.ends_at)}" data-current="${state.current?'1':'0'}"><div><div class="kp-now-label">${state.current?'Jetzt · Unterricht':'Als Nächstes'}</div><div class="kp-now-title">${E(subject)}</div><div class="kp-now-meta">${E(meta)}</div>${state.current?`<div class="kp-now-progress"><i style="width:${progress}%"></i></div>`:''}</div><div class="kp-now-count"><strong>${mins} min</strong><span>${state.current?'verbleibend':'bis Beginn'}</span></div></section>`;
  }
  function lessonMap(data,tz){
    const week=currentWeekKeys(tz),byDay=new Map(week.map(k=>[k,[]]));for(const x of data.lessons||[]){const k=dateKey(dateObj(x.starts_at),tz);if(byDay.has(k))byDay.get(k).push(x);}const activeDays=week.slice(0,5);if(week.slice(5).some(k=>(byDay.get(k)||[]).length))activeDays.push(...week.slice(5));
    const slots=[...new Map((data.lessons||[]).filter(x=>activeDays.includes(dateKey(dateObj(x.starts_at),tz))).map(x=>{const s=timeText(x.starts_at,tz),e=timeText(x.ends_at,tz);return [`${s}|${e}`,{key:`${s}|${e}`,s,e,start:dateObj(x.starts_at)?.getTime()||0}];})).values()].sort((a,b)=>a.start-b.start);
    const dayNames=['Mo','Di','Mi','Do','Fr','Sa','So'],today=dateKey(new Date(),tz);let html=`<div class="kp-week-grid" style="--kp-days:${activeDays.length}"><div class="kp-week-corner"></div>`;activeDays.forEach((k,i)=>{html+=`<div class="kp-week-day${k===today?' is-today':''}"${k===today?' data-kp-today="1"':''}>${dayNames[i]}</div>`;});
    if(!slots.length)return `<div class="kp-week-grid" style="--kp-days:${activeDays.length}"><div class="kp-week-empty">Für diese Woche sind keine Unterrichtstermine eingetragen.</div></div>`;
    const n=Date.now();for(const slot of slots){html+=`<div class="kp-week-time">${E(slot.s)}<br>${E(slot.e)}</div>`;for(const k of activeDays){const todayClass=k===today?' is-today':'';const lesson=(byDay.get(k)||[]).find(x=>`${timeText(x.starts_at,tz)}|${timeText(x.ends_at,tz)}`===slot.key);if(!lesson){html+=`<div class="kp-week-cell${todayClass}"></div>`;continue;}const s=dateObj(lesson.starts_at)?.getTime()||0,e=dateObj(lesson.ends_at)?.getTime()||0,current=s<=n&&e>=n,subject=text(lesson.subject_name,lesson.notes||'Unterricht'),meta=[lesson.teacher_name,lesson.room].filter(Boolean).join(' · ');html+=`<div class="kp-week-cell${todayClass}"><div class="kp-week-lesson ${pastelClass(subject)}${current?' is-current':''}" data-kp-lesson-id="${E(lesson.id||'')}"><strong>${E(subject)}</strong><span>${E(meta||'')}</span></div></div>`;} }
    return html+'</div>';
  }
  function sideCard(title,count,body,target){const interactive=target?` is-clickable" data-kp-target="${E(target)}" tabindex="0" role="link" aria-label="${E(title)} öffnen`:'"';return `<section class="kp-side-card${interactive}"><div class="kp-dashboard-card-head"><strong>${E(title)}</strong>${count?`<span>${E(count)}</span>`:''}</div><div class="kp-side-card-body">${body}</div></section>`;}
  function sideRows(rows,empty){return rows.length?rows.map(r=>{const attrs=r.target?` data-kp-entry data-kp-target="${E(r.target)}"${r.itemId?` data-kp-item-id="${E(r.itemId)}"`:''}${r.itemTitle?` data-kp-item-title="${E(r.itemTitle)}"`:''} tabindex="0" role="link" aria-label="${E(r.title)} öffnen"`:'';return `<div class="kp-side-row${r.target?' is-clickable':''}"${attrs}><i class="kp-side-dot"></i><div><strong>${E(r.title)}</strong><small>${E(r.meta||'')}</small></div>${r.tail?`<small>${E(r.tail)}</small>`:''}</div>`;}).join(''):`<div class="kp-side-empty">${E(empty)}</div>`;}
  function sideStack(data,tz){
    const now=Date.now(),today=dateKey(new Date(),tz),nextExam=(data.exams||[]).filter(x=>(dateObj(x.starts_at)?.getTime()||0)>=now).sort((a,b)=>dateObj(a.starts_at)-dateObj(b.starts_at))[0],todayLessons=(data.lessons||[]).filter(x=>dateKey(dateObj(x.starts_at),tz)===today&&(dateObj(x.ends_at)?.getTime()||0)>=now).sort((a,b)=>dateObj(a.starts_at)-dateObj(b.starts_at)).slice(0,4),tasks=(data.homework||[]).filter(x=>!x.due_at||(dateObj(x.due_at)?.getTime()||0)>=now).sort((a,b)=>(dateObj(a.due_at)?.getTime()||Infinity)-(dateObj(b.due_at)?.getTime()||Infinity)).slice(0,3),links=(data.links||[]).slice(0,4);
    const examRows=nextExam?[{title:nextExam.title||'Prüfung',meta:[shortDate(nextExam.starts_at,tz),timeText(nextExam.starts_at,tz),nextExam.subject_name,nextExam.room].filter(Boolean).join(' · '),target:'pruefungen',itemTitle:nextExam.title||'Prüfung'}]:[];
    const examBody=sideRows(examRows,'Keine kommende Prüfung eingetragen.');
    const lessonRows=todayLessons.map(x=>({title:text(x.subject_name,x.notes||'Unterricht'),meta:[timeText(x.starts_at,tz)+'–'+timeText(x.ends_at,tz),x.teacher_name,x.room].filter(Boolean).join(' · '),tail:(dateObj(x.starts_at)?.getTime()||0)<=now?'jetzt':'',target:'week',itemId:String(x.id||'')}));
    const taskRows=tasks.map(x=>({title:x.title||'Aufgabe',meta:x.due_at?`Fällig ${shortDate(x.due_at,tz)} ${timeText(x.due_at,tz)}`:'Ohne Fälligkeit',target:'aufgaben',itemTitle:x.title||'Aufgabe'}));
    const linkBody=links.length?links.map(x=>`<a class="kp-side-link" href="${E(safeHref(x.url))}" target="_blank" rel="noopener noreferrer"><strong>${E(x.title||'Link')}</strong><span>↗</span></a>`).join(''):'<div class="kp-side-empty">Keine Links hinterlegt.</div>';
    return `<div class="kp-side-stack">${sideCard('Nächste Prüfung','',examBody,'pruefungen')}${sideCard('Heute',todayLessons.length?`${todayLessons.length} Termin${todayLessons.length===1?'':'e'}`:'',sideRows(lessonRows,'Heute steht kein weiterer Unterricht an.'),'week')}${sideCard('Aufgaben',tasks.length?`${tasks.length} offen`:'',sideRows(taskRows,'Keine offenen Aufgaben.'),'aufgaben')}${sideCard('Links',links.length?`${links.length}`:'',linkBody,'links')}</div>`;
  }
  function flash(node,className='kp-dashboard-focus-item'){if(!node)return;node.classList.remove(className);void node.offsetWidth;node.classList.add(className);setTimeout(()=>node.classList.remove(className),1800);}
  function openCompactSection(id,itemTitle=''){
    const section=studentRoot.querySelector(`#${CSS.escape(id)}`);if(!section)return;
    section.classList.add('portal-compact-open');const toggle=section.querySelector('.portal-compact-toggle');if(toggle){toggle.textContent='Schließen';toggle.setAttribute('aria-expanded','true');}
    let focus=section;if(itemTitle){const strong=[...section.querySelectorAll('.portal-item strong')].find(x=>x.textContent?.trim()===itemTitle.trim());if(strong)focus=strong.closest('.portal-item')||section;}
    flash(focus);requestAnimationFrame(()=>focus.scrollIntoView({behavior:'smooth',block:'center'}));
  }
  function focusWeek(itemId=''){
    const week=studentRoot.querySelector('.kp-week-card');if(!week)return;let focus=null;
    if(itemId)focus=week.querySelector(`[data-kp-lesson-id="${CSS.escape(itemId)}"]`);if(!focus)focus=week.querySelector('.kp-week-lesson.is-current')||week.querySelector('.kp-week-cell.is-today .kp-week-lesson')||week.querySelector('.kp-week-day.is-today')||week;
    flash(week,'kp-dashboard-focus');if(focus!==week)flash(focus);requestAnimationFrame(()=>focus.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'}));
  }
  function activateTarget(el){const target=el?.dataset?.kpTarget||'';if(!target)return;if(target==='week')focusWeek(el.dataset.kpItemId||'');else openCompactSection(target,el.dataset.kpItemTitle||'');}
  function bindDashboardInteractions(dash){
    dash.addEventListener('click',e=>{if(e.target.closest('a.kp-side-link'))return;const entry=e.target.closest('[data-kp-entry]');if(entry){e.stopPropagation();activateTarget(entry);return;}const card=e.target.closest('.kp-side-card[data-kp-target]');if(card)activateTarget(card);});
    dash.addEventListener('keydown',e=>{if(!['Enter',' '].includes(e.key)||e.target.closest('a.kp-side-link'))return;const el=e.target.closest('[data-kp-entry],.kp-side-card[data-kp-target]');if(!el)return;e.preventDefault();e.stopPropagation();activateTarget(el);});
  }
  function managementStrip(){const s=studentRoot.querySelector('#class-admin-student-tools'),dash=studentRoot.querySelector('.kp-student-dashboard');if(s){s.classList.add('kp-class-admin-strip');s.dataset.keepOpen='1';if(dash&&s.previousElementSibling!==dash)dash.insertAdjacentElement('afterend',s);}}
  function render(data){
    const main=studentRoot.querySelector('.portal-main'),grid=main?.querySelector('.portal-grid'),nav=main?.querySelector('.portal-nav');if(!main||!grid||!nav)return;const c=data.course||{},tz=text(c.timezone,'Europe/Berlin'),sig=JSON.stringify([c.id,(data.lessons||[]).map(x=>[x.id,x.starts_at,x.ends_at,x.subject_name,x.teacher_name,x.room]),(data.exams||[]).map(x=>[x.id,x.starts_at,x.title,x.subject_name,x.room]),(data.homework||[]).map(x=>[x.id,x.due_at,x.title]),(data.links||[]).map(x=>[x.id,x.title,x.url])]);if(stamp===sig&&main.querySelector('.kp-student-dashboard')){managementStrip();return;}stamp=sig;main.querySelector('.kp-student-dashboard')?.remove();const dash=document.createElement('div');dash.className='kp-student-dashboard';dash.innerHTML=`${nowCard(data,tz)}<section class="kp-week-card" data-kp-week-card><div class="kp-dashboard-card-head"><strong>Wochenplan · ${E(c.name||'Klasse')}</strong><span>aktuelle Woche</span></div>${lessonMap(data,tz)}</section>${sideStack(data,tz)}`;nav.insertAdjacentElement('afterend',dash);bindDashboardInteractions(dash);studentRoot.classList.add('kp-dashboard-ready');managementStrip();startTimer();
  }
  function startTimer(){clearInterval(timer);timer=setInterval(()=>{const c=studentRoot.querySelector('[data-kp-now]');if(!c)return;const current=c.dataset.current==='1',start=dateObj(c.dataset.start)?.getTime()||0,end=dateObj(c.dataset.end)?.getTime()||0,n=Date.now(),target=current?end:start,mins=Math.max(0,Math.ceil((target-n)/60000)),strong=c.querySelector('.kp-now-count strong');if(strong)strong.textContent=`${mins} min`;if(current){const total=Math.max(1,end-start),p=Math.max(0,Math.min(100,Math.round((n-start)/total*100))),bar=c.querySelector('.kp-now-progress i');if(bar)bar.style.width=`${p}%`;if(n>end)queue();}else if(n>=start)queue();},60000);}
  async function build(){if(busy||!studentRoot.querySelector('.portal-shell'))return;busy=true;try{const d=await overview();if(d?.course)render(d);}finally{busy=false;}}
  let queued=false;function queue(){if(queued)return;queued=true;setTimeout(()=>{queued=false;build().catch(()=>{});},50);}
  new MutationObserver(queue).observe(studentRoot,{childList:true,subtree:true});queue();
}
