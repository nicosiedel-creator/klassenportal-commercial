const CLASS_ADMIN_PATH=location.pathname.replace(/\/$/,'')==='/klassen-admin';

if(CLASS_ADMIN_PATH){
  let me=null,scheduled=false;
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};

  async function loadMe(){
    try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(r.ok)me=(await r.json()).user||null;}catch{}
  }
  function isActualClassAdmin(){return !!me&&!me.isPlatformAdmin&&(me.tenantRoles||[]).some(x=>x.role==='class_admin')&&!(me.tenantRoles||[]).some(x=>x.role==='tenant_admin');}
  function mayPreview(){return !!me&&(me.isPlatformAdmin||(me.tenantRoles||[]).some(x=>x.role==='tenant_admin'));}
  function selectedTenantName(){return document.querySelector('#tenantPick')?.selectedOptions?.[0]?.textContent?.trim()||'';}

  function normalizeSidebar(){
    const side=document.querySelector('.side');if(!side)return;
    setText(side.querySelector('h1'),'Klassenportal · Klassen-Admin');
    const names={overview:'Übersicht',courses:'Meine Klassen/Kurse',users:'Teilnehmer',content:'Inhalte',exams:'Prüfungen'};
    Object.entries(names).forEach(([key,label])=>setText(side.querySelector(`[data-v="${key}"]`),label));
    for(const key of ['tenants','branding','modules','data'])side.querySelector(`[data-v="${key}"]`)?.remove();
    document.querySelector('#newCourse')?.remove();
    side.querySelector('#kp-commerce-platform')?.remove();
    side.querySelector('#kp-commerce-tenant')?.remove();
    side.querySelector('#kp-stripe-customer-portal')?.remove();
  }
  function normalizePicker(){
    const pick=document.querySelector('#tenantPick');if(!pick)return;
    if(isActualClassAdmin()&&pick.options.length<=1){pick.style.display='none';return;}
    pick.style.display='';
    if(!pick.closest('#kp-class-tenant-picker')){
      const wrap=document.createElement('label');wrap.id='kp-class-tenant-picker';wrap.className='field';wrap.style.minWidth='260px';
      const caption=document.createElement('span');caption.textContent=mayPreview()?'Kunde auswählen (Support)':'Organisation auswählen';
      pick.parentNode?.insertBefore(wrap,pick);wrap.append(pick);
    }
  }
  function normalizeUsers(){
    const content=document.querySelector('.content'),title=content?.querySelector(':scope > .top h2')?.textContent?.trim();
    if(title!=='Benutzer & Rollen'&&title!=='Teilnehmer')return;
    setText(content.querySelector(':scope > .top h2'),'Teilnehmer');
    setText(document.querySelector('#newUser'),'+ Teilnehmer');
    document.querySelectorAll('select[name="role"] option').forEach(o=>{if(['tenant_admin','class_admin'].includes(o.value))o.remove();});
  }
  function normalizeCourses(){
    const content=document.querySelector('.content'),title=content?.querySelector(':scope > .top h2')?.textContent?.trim();
    if(title==='Klassen/Kurse')setText(content.querySelector(':scope > .top h2'),'Meine Klassen/Kurse');
    document.querySelector('#newCourse')?.remove();
  }
  function normalizeOverview(){
    const content=document.querySelector('.content'),title=content?.querySelector(':scope > .top h2');
    if(!content||title?.textContent?.trim()!=='Übersicht')return;
    const cards=[...content.querySelectorAll(':scope > .grid > .card')];
    cards.find(x=>x.querySelector('.muted')?.textContent?.trim()==='Mandanten')?.remove();
    const active=[...content.querySelectorAll(':scope > .grid > .card')].find(x=>x.querySelector('.muted')?.textContent?.trim()==='Aktiver Mandant');
    if(active){setText(active.querySelector('.muted'),'Organisation');setText(active.querySelector('.stat'),selectedTenantName()||'—');}
  }
  function ensureNotice(){
    const content=document.querySelector('.content');if(!content||content.querySelector('#kp-class-admin-notice'))return;
    const n=document.createElement('div');n.id='kp-class-admin-notice';n.className='notice ok';
    n.innerHTML=mayPreview()?'<strong>Klassen-Admin · Supportansicht</strong> · Diese Ansicht entspricht dem Arbeitsbereich eines Klassenverantwortlichen. Kundenweite Einstellungen, Abrechnung, Branding, Module und Backups sind hier bewusst ausgeblendet.':'<strong>Klassen-Admin</strong> · Du verwaltest nur die dir zugeordneten Klassen/Kurse, deren Teilnehmer, Inhalte und Prüfungen.';
    content.querySelector(':scope > .top')?.after(n);
  }
  function apply(){
    document.title='Klassenportal · Klassen-Admin';
    normalizeSidebar();normalizePicker();normalizeOverview();normalizeUsers();normalizeCourses();ensureNotice();
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;apply();});}

  await loadMe();
  if(me&&!isActualClassAdmin()&&!mayPreview()){location.replace('/');}
  else{
    new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});
    document.addEventListener('change',e=>{if(e.target?.id==='tenantPick')setTimeout(schedule,0);});
    apply();
  }
}
