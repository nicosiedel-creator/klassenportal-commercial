const CLASS_ADMIN_PATH=location.pathname.replace(/\/$/,'')==='/klassen-admin';

if(CLASS_ADMIN_PATH){
  let me=null,scheduled=false,scopeCourseName='';
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const moduleMeta={
    statistics:{name:'Statistiken',description:'Auswertungen zu deiner Klasse, Teilnehmenden, Aufgaben, Prüfungen und Nutzung.',benefits:['Entwicklung und Nutzung schneller überblicken','Wichtige Kennzahlen an einem Ort','Weniger manuelle Auswertung']},
    surveys:{name:'Umfragen',description:'Direkte Rückmeldungen und Abstimmungen innerhalb deiner Klasse.',benefits:['Stimmungen und Feedback schnell erfassen','Einmalige Stimmabgabe pro Teilnehmer','Ergebnisse sofort auswerten']},
    substitution_updates:{name:'Vertretungsänderungen',description:'Raum-, Vertretungs- und Stundenplanänderungen sofort an deine Klasse geben.',benefits:['Änderungen zentral veröffentlichen','Teilnehmer automatisch informieren','Weniger Rückfragen bei kurzfristigen Änderungen']},
    microsoft_365:{name:'Microsoft 365 / Outlook',description:'Den Klassenkalender automatisch in Outlook oder Microsoft 365 abonnieren.',benefits:['Termine ohne manuelles Übertragen','Kalender aktualisiert sich automatisch','Auch auf Smartphone und Desktop nutzbar']},
    microsoft_teams:{name:'Microsoft Teams',description:'Neue Inhalte und Änderungen automatisch über den eingerichteten Teams-Workflow verteilen.',benefits:['Informationen zusätzlich in Teams','Weniger doppelte Pflege','Automatische Benachrichtigungen']},
  };

  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
  async function loadMe(){try{me=(await api('/api/auth/me')).user||null;}catch{me=null;}}
  function isActualClassAdmin(){return !!me&&!me.isPlatformAdmin&&(me.tenantRoles||[]).some(x=>x.role==='class_admin')&&!(me.tenantRoles||[]).some(x=>x.role==='tenant_admin');}
  function mayPreview(){return !!me&&(me.isPlatformAdmin||(me.tenantRoles||[]).some(x=>x.role==='tenant_admin'));}
  function tenantId(){return document.querySelector('#tenantPick')?.value||new URLSearchParams(location.search).get('tenant_id')||'';}
  function displayName(){return me?.displayName||'';}

  async function refreshScopeName(){
    const tenant=tenantId();if(!tenant){scopeCourseName='';return;}
    try{const xs=(await api(`/api/courses?tenant_id=${encodeURIComponent(tenant)}`)).courses||[];const wanted=new URLSearchParams(location.search).get('course_id');const row=(wanted&&xs.find(x=>String(x.id)===wanted))||xs[0];scopeCourseName=row?.name||'';}catch{scopeCourseName='';}
  }
  function normalizeSidebar(){
    const side=document.querySelector('.side');if(!side)return;
    setText(side.querySelector('h1'),'Klassenportal · Klassen-Admin');
    const names={overview:'Übersicht',users:'Teilnehmer',content:'Inhalte',exams:'Prüfungen'};
    Object.entries(names).forEach(([key,label])=>setText(side.querySelector(`[data-v="${key}"]`),label));
    for(const key of ['tenants','courses','branding','modules','data'])side.querySelector(`[data-v="${key}"]`)?.remove();
    document.querySelector('#newCourse')?.remove();
    side.querySelector('#kp-commerce-platform')?.remove();side.querySelector('#kp-commerce-tenant')?.remove();side.querySelector('#kp-stripe-customer-portal')?.remove();
    ensureExtensionsNav(side);
    const active=side.querySelector('.nav.active');if(active&&active.dataset?.v==='courses')side.querySelector('[data-v="overview"]')?.click();
  }
  function normalizePicker(){
    const pick=document.querySelector('#tenantPick');if(!pick)return;
    pick.style.display='none';pick.closest('#kp-class-tenant-picker')?.querySelector('span')?.remove();
    const top=pick.closest('.top');if(top&&!top.querySelector('#kp-class-scope')){const s=document.createElement('div');s.id='kp-class-scope';s.className='pill';s.textContent=scopeCourseName?`Klasse: ${scopeCourseName}`:'Klassenbereich';top.append(s);}
    else setText(document.querySelector('#kp-class-scope'),scopeCourseName?`Klasse: ${scopeCourseName}`:'Klassenbereich');
  }
  function normalizeUsers(){
    const content=document.querySelector('.content'),title=content?.querySelector(':scope > .top h2')?.textContent?.trim();if(title!=='Benutzer & Rollen'&&title!=='Teilnehmer')return;
    setText(content.querySelector(':scope > .top h2'),'Teilnehmer');setText(document.querySelector('#newUser'),'+ Teilnehmer hinzufügen');
    document.querySelectorAll('select[name="role"] option').forEach(o=>{if(o.value!=='participant')o.remove();});
    const role=document.querySelector('select[name="role"]');if(role){role.value='participant';const f=role.closest('.field');if(f)f.style.display='none';}
    const course=document.querySelector('select[name="course_id"]');if(course&&course.options.length===1){course.selectedIndex=0;const f=course.closest('.field');if(f)f.style.display='none';}
  }
  function normalizeOverview(){
    const content=document.querySelector('.content'),title=content?.querySelector(':scope > .top h2');if(!content||title?.textContent?.trim()!=='Übersicht')return;
    const cards=[...content.querySelectorAll(':scope > .grid > .card')];
    cards.find(x=>x.querySelector('.muted')?.textContent?.trim()==='Mandanten')?.remove();
    const cc=cards.find(x=>x.querySelector('.muted')?.textContent?.trim()==='Klassen/Kurse');if(cc){setText(cc.querySelector('.muted'),'Freigegebene Klasse');setText(cc.querySelector('.stat'),scopeCourseName||'—');}
    const active=cards.find(x=>x.querySelector('.muted')?.textContent?.trim()==='Aktiver Mandant');active?.remove();
  }
  function ensureNotice(){
    const content=document.querySelector('.content');if(!content)return;let n=content.querySelector('#kp-class-admin-notice');if(!n){n=document.createElement('div');n.id='kp-class-admin-notice';n.className='notice ok';content.querySelector(':scope > .top')?.after(n);}
    const html=mayPreview()?`<strong>Klassen-Admin · Supportvorschau</strong> · Sichtbar und bearbeitbar ist ausschließlich ${esc(scopeCourseName||'die ausgewählte Klasse')}. Andere Klassen, andere Kunden, Tarife und kundenweite Einstellungen gehören nicht in diesen Arbeitsbereich.`:`<strong>Klassen-Admin</strong> · Du arbeitest ausschließlich in ${esc(scopeCourseName||'deiner freigegebenen Klasse')}. Du kannst Teilnehmer und Klasseninhalte verwalten, aber die Klasse selbst, andere Klassen oder kundenweite Einstellungen nicht ändern.`;
    if(n.innerHTML!==html)n.innerHTML=html;
  }
  function ensureExtensionsNav(side){
    let b=side.querySelector('#kp-advanced-nav');if(!b){b=document.createElement('button');b.className='nav';b.id='kp-advanced-nav';const anchor=side.querySelector('[data-v="exams"]');anchor?.after(b);}setText(b,'Erweiterungen');b.onclick=()=>void openExtensions();
  }
  async function openExtensions(){
    const tenant=tenantId(),content=document.querySelector('.content');if(!tenant||!content)return;
    document.querySelectorAll('.side .nav').forEach(x=>x.classList.remove('active'));document.querySelector('#kp-advanced-nav')?.classList.add('active');
    content.innerHTML=`<div class="top"><div><h2>Erweiterungen</h2><div class="muted">${esc(displayName())}</div></div><div class="pill">${esc(scopeCourseName||'Deine Klasse')}</div></div><div class="notice"><strong>Aktive Erweiterungen kannst du direkt nutzen.</strong> Noch nicht aktive Erweiterungen werden dir als Vorschau gezeigt. Freischaltung und Buchung erfolgen ausschließlich durch den Bildungsträger – du siehst hier keine Preise oder Abrechnungsdaten.</div><div class="grid" id="kp-extension-grid" style="margin-top:14px"><div class="card">Lädt …</div></div>`;
    const grid=content.querySelector('#kp-extension-grid');
    try{
      const flags=(await api(`/api/tenant/modules?tenant_id=${encodeURIComponent(tenant)}`)).modules||[],map=new Map(flags.map(x=>[String(x.feature_key),Number(x.enabled)===1]));
      grid.innerHTML=Object.entries(moduleMeta).map(([key,m])=>{const active=map.get(key)===true,teams=key==='microsoft_teams';return`<div class="card" style="position:relative"><span class="pill" style="float:right">${active?'Aktiv':'Noch nicht aktiv'}</span><h3 style="margin-top:0">${esc(m.name)}</h3><p>${esc(m.description)}</p><ul style="padding-left:20px">${m.benefits.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>${active?(teams?'<div class="notice ok"><strong>Aktiv.</strong> Die technische Teams-Verbindung wird vom Bildungsträger eingerichtet; du musst hier nichts konfigurieren.</div>':`<button class="btn secondary kp-open-extension" data-key="${esc(key)}">Erweiterung öffnen</button>`):'<div class="notice"><strong>Interesse?</strong> Diese Erweiterung kann dein Bildungsträger im Kunden-Admin jederzeit für die Organisation freischalten bzw. zubuchen.</div>'}</div>`;}).join('');
      grid.querySelectorAll('.kp-open-extension').forEach(b=>b.onclick=()=>window.dispatchEvent(new CustomEvent('kp-open-advanced-module',{detail:{key:b.dataset.key}})));
    }catch(e){grid.innerHTML=`<div class="notice error">Erweiterungen konnten nicht geladen werden: ${esc(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(e):e.message)}</div>`;}
  }
  function apply(){document.title='Klassenportal · Klassen-Admin';normalizeSidebar();normalizePicker();normalizeOverview();normalizeUsers();ensureNotice();}
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;apply();});}

  await loadMe();
  if(me&&!isActualClassAdmin()&&!mayPreview())location.replace('/');
  else{
    await refreshScopeName();
    new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});
    document.addEventListener('change',e=>{if(e.target?.id==='tenantPick')setTimeout(async()=>{await refreshScopeName();apply();},0);});
    apply();
  }
}
