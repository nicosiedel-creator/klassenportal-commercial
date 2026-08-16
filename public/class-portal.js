const root=document.querySelector('#class-portal');
const path=location.pathname.split('/').filter(Boolean);
const tenantSlug=decodeURIComponent(path[1]||'');
const courseCode=decodeURIComponent(path[2]||'');
const codeStoreKey=`kp_access_${tenantSlug}_${courseCode}`;
let lastData=null;

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeColor=(v,fallback)=>/^#[0-9a-f]{6}$/i.test(String(v||''))?String(v):fallback;
const roleName=r=>({platform_admin:'Plattform-Admin',tenant_admin:'Kunden-Admin',class_admin:'Klassenverantwortliche/r',participant:'Teilnehmer/in',guest:'Gast'})[r]||r||'';

function dateObj(v){const d=new Date(String(v||''));return Number.isNaN(d.getTime())?null:d;}
function dateKey(d,tz){if(!d)return'';const p=new Intl.DateTimeFormat('de-DE',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);const g=t=>p.find(x=>x.type===t)?.value||'';return `${g('year')}-${g('month')}-${g('day')}`;}
function fmtDate(v,tz,opts={weekday:'short',day:'2-digit',month:'2-digit'}){const d=dateObj(v);return d?new Intl.DateTimeFormat('de-DE',{timeZone:tz,...opts}).format(d):'—';}
function fmtTime(v,tz){const d=dateObj(v);return d?new Intl.DateTimeFormat('de-DE',{timeZone:tz,hour:'2-digit',minute:'2-digit'}).format(d):'';}
function fmtDateTime(v,tz){const d=dateObj(v);return d?new Intl.DateTimeFormat('de-DE',{timeZone:tz,weekday:'short',day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d):'—';}
function isFuture(v){const d=dateObj(v);return !!d&&d.getTime()>=Date.now()-60000;}
function sectionEnabled(modules,key){return modules?.[key]!==false;}
function textOr(v,f=''){return String(v??'').trim()||f;}

async function fetchJson(url,opt={}){
  const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});
  let d={};try{d=await r.json();}catch{}
  if(!r.ok){const e=new Error(d.error||`HTTP_${r.status}`);e.status=r.status;e.data=d;throw e;}return d;
}

async function overview(accessCode=''){
  const u=new URL(`/public/${encodeURIComponent(tenantSlug)}/${encodeURIComponent(courseCode)}/overview`,location.origin);
  if(accessCode)u.searchParams.set('access_code',accessCode);
  return fetchJson(u.pathname+u.search);
}

function applyBrand(course={}){
  document.documentElement.style.setProperty('--portal-primary',safeColor(course.primary_color,'#2563eb'));
  document.documentElement.style.setProperty('--portal-secondary',safeColor(course.secondary_color,'#0f172a'));
  document.documentElement.style.setProperty('--portal-bg',safeColor(course.background_color,'#f8fafc'));
  document.title=`${textOr(course.portal_name,'Klassenportal')} · ${textOr(course.name,'Klasse/Kurs')}`;
}

function gateLogo(course){return course?.logo_url?`<img class="portal-logo" src="${esc(course.logo_url)}" alt="">`:'';}
function gateShell(inner,course={}){applyBrand(course);root.className='';root.innerHTML=`<div class="portal-gate"><div class="portal-gate-card"><div class="portal-gate-brand">${gateLogo(course)}<div><strong>${esc(textOr(course.portal_name,'Klassenportal'))}</strong><div class="muted">${esc(textOr(course.name,'Geschützter Bereich'))}</div></div></div>${inner}</div></div>`;}

function renderGate(code,course={},wrongCode=false){
  const loginNeeded=code==='LOGIN_REQUIRED'||code==='LOGIN_OR_CODE_REQUIRED';
  const codeNeeded=code==='ACCESS_CODE_REQUIRED'||code==='LOGIN_OR_CODE_REQUIRED';
  let html=`<h1>Zugang zum Klassenportal</h1><p>${code==='LOGIN_OR_CODE_REQUIRED'?'Du kannst dich anmelden oder den Zugangscode der Klasse verwenden.':loginNeeded?'Bitte melde dich mit deinem Klassenportal-Konto an.':'Bitte gib den Zugangscode der Klasse ein.'}</p>`;
  if(loginNeeded)html+=`<form class="portal-form" id="portal-login"><label class="portal-field">E-Mail<input name="email" type="email" autocomplete="username" required></label><label class="portal-field">Passwort<input name="password" type="password" autocomplete="current-password" required></label><button class="portal-btn" type="submit">Anmelden</button><div class="portal-error" id="portal-login-error"></div></form>`;
  if(loginNeeded&&codeNeeded)html+='<div class="portal-divider">oder mit Zugangscode</div>';
  if(codeNeeded)html+=`<form class="portal-form" id="portal-code"><label class="portal-field">Zugangscode<input name="access_code" type="password" autocomplete="off" minlength="6" required></label><button class="portal-btn${loginNeeded?' secondary':''}" type="submit">Portal öffnen</button><div class="portal-error" id="portal-code-error">${wrongCode?'Der Zugangscode ist nicht korrekt.':''}</div></form>`;
  gateShell(html,course);
  root.querySelector('#portal-login')?.addEventListener('submit',async e=>{
    e.preventDefault();const msg=root.querySelector('#portal-login-error');msg.textContent='';const button=e.currentTarget.querySelector('button');button.disabled=true;
    try{await fetchJson('/api/auth/login',{method:'POST',body:JSON.stringify(Object.fromEntries(new FormData(e.currentTarget)))});sessionStorage.removeItem(codeStoreKey);await load();}
    catch(x){msg.textContent=({LOGIN_INVALID:'E-Mail oder Passwort ist nicht korrekt.',LOGIN_RATE_LIMITED:'Zu viele Anmeldeversuche. Bitte später erneut versuchen.',PASSWORD_CHANGE_REQUIRED:'Das Passwort muss zuerst im Hauptportal geändert werden.'})[x.message]||'Anmeldung nicht möglich.';}
    finally{button.disabled=false;}
  });
  root.querySelector('#portal-code')?.addEventListener('submit',async e=>{
    e.preventDefault();const msg=root.querySelector('#portal-code-error');msg.textContent='';const button=e.currentTarget.querySelector('button'),value=String(new FormData(e.currentTarget).get('access_code')||'').trim();button.disabled=true;
    try{const d=await overview(value);sessionStorage.setItem(codeStoreKey,value);renderPortal(d);}
    catch(x){msg.textContent=x.message==='ACCESS_CODE_REQUIRED'||x.message==='LOGIN_OR_CODE_REQUIRED'?'Der Zugangscode ist nicht korrekt.':'Zugang derzeit nicht möglich.';}
    finally{button.disabled=false;}
  });
}

function item(title,meta='',body='',pill=''){
  return `<div class="portal-item"><div class="portal-item-top"><strong>${esc(title)}</strong>${pill?`<span class="portal-pill">${esc(pill)}</span>`:''}</div>${meta?`<div class="meta">${esc(meta)}</div>`:''}${body?`<div class="body">${esc(body)}</div>`:''}</div>`;
}
function empty(text){return `<div class="portal-empty">${esc(text)}</div>`;}
function section(id,title,content,count,wide=false){return `<section class="portal-section${wide?' wide':''}" id="${id}"><div class="portal-section-head"><h2>${esc(title)}</h2><span>${count}</span></div>${content}</section>`;}

function renderPortal(d){
  lastData=d;const c=d.course||{},m=d.modules||{},tz=textOr(c.timezone,'Europe/Berlin');applyBrand(c);
  const now=new Date(),today=dateKey(now,tz),futureLessons=(d.lessons||[]).filter(x=>isFuture(x.ends_at||x.starts_at)),todayLessons=(d.lessons||[]).filter(x=>dateKey(dateObj(x.starts_at),tz)===today);
  const futureHomework=(d.homework||[]).filter(x=>!x.due_at||isFuture(x.due_at));
  const futureAppointments=(d.appointments||[]).filter(x=>isFuture(x.starts_at));
  const futureExams=(d.exams||[]).filter(x=>isFuture(x.starts_at));
  const nav=[];const sections=[];

  if(sectionEnabled(m,'announcements')){
    nav.push(['meldungen','Meldungen']);const rows=(d.announcements||[]).slice(0,8).map(x=>item(x.title,fmtDateTime(x.published_at,tz),x.body)).join('');
    sections.push(section('meldungen','Meldungen',`<div class="portal-list">${rows||empty('Aktuell gibt es keine Meldungen.')}</div>`,`${(d.announcements||[]).length}`));
  }
  if(sectionEnabled(m,'schedule')){
    nav.push(['stundenplan','Stundenplan']);const rows=futureLessons.slice(0,24).map(x=>{const subject=textOr(x.subject_name,x.notes||'Unterricht'),teacher=x.teacher_name?` · ${x.teacher_name}`:'',room=x.room?` · ${x.room}`:'';return item(subject,`${fmtDate(x.starts_at,tz)} · ${fmtTime(x.starts_at,tz)}–${fmtTime(x.ends_at,tz)}${teacher}${room}`,x.notes&&x.notes!==subject?x.notes:'',dateKey(dateObj(x.starts_at),tz)===today?'Heute':'');}).join('');
    sections.push(section('stundenplan','Stundenplan',`<div class="portal-list">${rows||empty('Keine kommenden Unterrichtstermine eingetragen.')}</div>`,`${futureLessons.length} kommend`,true));
  }
  if(sectionEnabled(m,'homework')){
    nav.push(['aufgaben','Aufgaben']);const rows=futureHomework.slice(0,20).map(x=>item(x.title,x.due_at?`Fällig: ${fmtDateTime(x.due_at,tz)}`:'Ohne Fälligkeit',x.description||x.submission_info||'',x.subject_short_name||x.subject_name||'' )).join('');
    sections.push(section('aufgaben','Aufgaben',`<div class="portal-list">${rows||empty('Keine offenen Aufgaben eingetragen.')}</div>`,`${futureHomework.length} offen`));
  }
  if(sectionEnabled(m,'appointments')){
    nav.push(['termine','Termine']);const rows=futureAppointments.slice(0,20).map(x=>item(x.title,`${fmtDateTime(x.starts_at,tz)}${x.location?` · ${x.location}`:''}`,x.description||'')).join('');
    sections.push(section('termine','Termine',`<div class="portal-list">${rows||empty('Keine kommenden Termine eingetragen.')}</div>`,`${futureAppointments.length} kommend`));
  }
  if(sectionEnabled(m,'exams_progress')){
    nav.push(['pruefungen','Prüfungen']);const rows=futureExams.slice(0,20).map(x=>item(x.title,`${fmtDateTime(x.starts_at,tz)}${x.room?` · ${x.room}`:''}`,[x.subject_name,x.allowed_aids?`Hilfsmittel: ${x.allowed_aids}`:'',x.notes].filter(Boolean).join('\n'))).join('');
    sections.push(section('pruefungen','Prüfungen',`<div class="portal-list">${rows||empty('Keine kommenden Prüfungen freigegeben.')}</div>`,`${futureExams.length} kommend`));
  }
  if(sectionEnabled(m,'links')){
    nav.push(['links','Links']);const rows=(d.links||[]).slice(0,40).map(x=>`<div class="portal-item"><div class="portal-item-top"><a class="portal-link" href="${esc(x.url)}" target="_blank" rel="noopener noreferrer">${esc(x.title)}</a>${x.category?`<span class="portal-pill">${esc(x.category)}</span>`:''}</div></div>`).join('');
    sections.push(section('links','Links',`<div class="portal-list">${rows||empty('Keine Links hinterlegt.')}</div>`,`${(d.links||[]).length}`));
  }

  const adminRole=['platform_admin','tenant_admin','class_admin'].includes(d.viewer?.role);const adminHref=d.viewer?.role==='platform_admin'?'/kunden-admin':'/';
  const headerActions=`${d.viewer?.authenticated?`<span class="portal-user">${esc(d.viewer.displayName||roleName(d.viewer.role))}</span>`:''}${adminRole?`<a class="portal-btn secondary" href="${adminHref}">Verwaltung</a>`:''}${d.viewer?.authenticated?'<button class="portal-btn secondary" id="portal-logout" type="button">Abmelden</button>':''}`;
  const logo=c.logo_url?`<img class="portal-logo" src="${esc(c.logo_url)}" alt="Logo ${esc(c.tenant_name||'')}">`:'';
  const day=new Intl.DateTimeFormat('de-DE',{timeZone:tz,day:'2-digit'}).format(now),month=new Intl.DateTimeFormat('de-DE',{timeZone:tz,month:'long'}).format(now),weekday=new Intl.DateTimeFormat('de-DE',{timeZone:tz,weekday:'long'}).format(now);
  const heroMessage=textOr(c.welcome_text,`Willkommen im Portal von ${textOr(c.tenant_name,'deinem Bildungsträger')}.`);
  root.className='';root.innerHTML=`<div class="portal-shell"><header class="portal-header"><div class="portal-header-inner">${logo}<div class="portal-brand"><strong>${esc(textOr(c.portal_name,'Klassenportal'))}</strong><span>${esc(textOr(c.name,'Klasse/Kurs'))}</span></div><div class="portal-header-actions">${headerActions}</div></div></header><main class="portal-main"><section class="portal-hero"><div><div class="portal-kicker">${esc(textOr(c.tenant_name,'Klassenportal'))}</div><h1>${esc(textOr(c.name,'Klasse/Kurs'))}</h1><p>${esc(heroMessage)}</p></div><div class="portal-date"><strong>${esc(day)}</strong><span>${esc(`${weekday}, ${month}`)}</span></div></section><div class="portal-stats"><div class="portal-stat"><strong>${todayLessons.length}</strong><span>Unterricht heute</span></div><div class="portal-stat"><strong>${futureHomework.length}</strong><span>offene Aufgaben</span></div><div class="portal-stat"><strong>${futureAppointments.length}</strong><span>kommende Termine</span></div><div class="portal-stat"><strong>${futureExams.length}</strong><span>kommende Prüfungen</span></div></div><nav class="portal-nav" aria-label="Portalbereiche">${nav.map(([id,n])=>`<a href="#${id}">${esc(n)}</a>`).join('')}</nav><div class="portal-grid">${sections.join('')}</div></main><footer class="portal-footer">${Number(c.white_label)===1?esc(c.tenant_name||''): 'Klassenportal'} · Daten der Klasse ${esc(c.name||'')}</footer></div>`;
  root.querySelector('#portal-logout')?.addEventListener('click',async()=>{try{await fetchJson('/api/auth/logout',{method:'POST',body:'{}'});}catch{}sessionStorage.removeItem(codeStoreKey);await load();});
}

function renderFatal(message){root.className='';root.innerHTML=`<div class="portal-gate"><div class="portal-gate-card"><h1>Klassenportal nicht verfügbar</h1><p>${esc(message)}</p><button class="portal-btn" type="button" onclick="location.reload()">Neu laden</button></div></div>`;}

async function load(){
  if(!tenantSlug||!courseCode){renderFatal('Der Portal-Link ist unvollständig.');return;}
  root.className='portal-loading';root.textContent='Klassenportal wird geladen …';const stored=sessionStorage.getItem(codeStoreKey)||'';
  try{const d=await overview(stored);renderPortal(d);}
  catch(e){
    if(stored&&(e.message==='ACCESS_CODE_REQUIRED'||e.message==='LOGIN_OR_CODE_REQUIRED'))sessionStorage.removeItem(codeStoreKey);
    if(['LOGIN_REQUIRED','ACCESS_CODE_REQUIRED','LOGIN_OR_CODE_REQUIRED'].includes(e.message)){renderGate(e.message,lastData?.course||{},!!stored);return;}
    if(e.message==='COURSE_NOT_FOUND'){renderFatal('Diese Klasse oder dieser Kurs wurde nicht gefunden oder ist nicht mehr aktiv.');return;}
    renderFatal('Das Portal konnte gerade nicht geladen werden.');
  }
}

await load();
