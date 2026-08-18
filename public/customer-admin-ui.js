const CUSTOMER_ADMIN_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';

if(CUSTOMER_ADMIN_PATH){
  let me=null;
  let scheduled=false;
  let setupLoadingTenant='';

  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const PRIMARY_NAV_LABELS=new Set(['Übersicht','Klassen/Kurse','Benutzer & Rollen','Teilnehmer importieren','Inhalte','Prüfungen','Module','Paket & Abrechnung']);
  const NAV_GROUPS=[
    {id:'learning',title:'Lernen & Kommunikation',labels:new Set(['Lernen & Berichte','Meldungen & Zielgruppen','Anwesenheit & Klassenbuch','Aufgaben & Bewertungen','Teilnehmer 360°','Automationen & Bescheinigungen'])},
    {id:'organization',title:'Organisation & Betrieb',labels:new Set(['Unterlagen jetzt einwerfen','Branding','Import/Export/Backups','Struktur & Zuständigkeiten','Zuständigkeiten'])},
    {id:'technology',title:'Technik & Integrationen',labels:new Set(['Eingang & Automationen','SSO SCIM & API'])},
  ];

  async function loadMe(){
    try{
      const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
      if(r.ok)me=(await r.json()).user||null;
    }catch{}
  }

  function selectedTenantId(){return document.querySelector('#tenantPick')?.value||'';}
  function selectedCustomerName(){
    const pick=document.querySelector('#tenantPick');
    return pick?.selectedOptions?.[0]?.textContent?.trim()||'';
  }

  function cleanPlatformControls(){
    document.querySelector('[data-v="tenants"]')?.remove();
    document.querySelector('#newTenant')?.remove();
    document.querySelector('#pa-onboarding-nav')?.remove();
    document.querySelector('#pa-new-customer')?.remove();
    document.querySelector('#kp-commerce-platform')?.remove();
  }

  function navLabel(button){return String(button?.textContent||'').replace(/\s+/g,' ').trim();}
  function navSourceLabel(button){
    if(!button)return'';
    if(button.dataset.customerNavSourceLabel)return button.dataset.customerNavSourceLabel;
    const label=navLabel(button);
    button.dataset.customerNavSourceLabel=label;
    return label;
  }
  function navMemorySet(open){try{sessionStorage.setItem('kp_customer_nav_more',open?'1':'0');}catch{}}
  function navMemoryGet(){try{return sessionStorage.getItem('kp_customer_nav_more')==='1';}catch{return false;}}
  function navGroupFor(label){return NAV_GROUPS.find(group=>group.labels.has(label))||{id:'more',title:'Weitere Verwaltung'};}
  function ensureNavGroup(groups,id,title){
    let group=groups.querySelector(`[data-customer-nav-group="${CSS.escape(id)}"]`);
    if(group)return group.querySelector('.kp-customer-nav-group-items');
    group=document.createElement('section');
    group.className='kp-customer-nav-group';
    group.dataset.customerNavGroup=id;
    group.innerHTML=`<h2 class="kp-customer-nav-group-title">${esc(title)}</h2><div class="kp-customer-nav-group-items"></div>`;
    groups.append(group);
    return group.querySelector('.kp-customer-nav-group-items');
  }

  function organizeCustomerNavigation(){
    const side=document.querySelector('.side');
    if(!side)return;
    side.classList.add('kp-customer-nav');
    side.querySelectorAll(':scope > .spacer').forEach(el=>el.remove());

    let head=side.querySelector(':scope > .kp-customer-nav-head');
    if(!head){
      head=document.createElement('div');
      head.className='kp-customer-nav-head';
      const title=side.querySelector(':scope > h1')||side.querySelector('h1');
      const logout=side.querySelector(':scope > #logout')||side.querySelector('#logout');
      side.prepend(head);
      if(title)head.append(title);
      const actions=document.createElement('div');
      actions.className='kp-customer-nav-actions';
      const more=document.createElement('button');
      more.type='button';
      more.id='kp-customer-more-toggle';
      more.className='kp-customer-more-toggle';
      more.setAttribute('aria-controls','kp-customer-nav-more-panel');
      more.setAttribute('aria-expanded','false');
      more.innerHTML='Weitere Bereiche <span class="kp-customer-more-count">0</span>';
      more.addEventListener('click',()=>{
        const panel=side.querySelector('#kp-customer-nav-more-panel');
        if(!panel)return;
        const open=panel.hidden;
        panel.hidden=!open;
        more.setAttribute('aria-expanded',String(open));
        navMemorySet(open);
      });
      actions.append(more);
      if(logout)actions.append(logout);
      head.append(actions);

      const primary=document.createElement('nav');
      primary.className='kp-customer-nav-primary';
      primary.setAttribute('aria-label','Hauptnavigation Kunden-Admin');
      side.append(primary);

      const panel=document.createElement('section');
      panel.id='kp-customer-nav-more-panel';
      panel.className='kp-customer-nav-more-panel';
      panel.hidden=true;
      panel.innerHTML='<div class="kp-customer-nav-groups"></div>';
      side.append(panel);
    }

    const primary=side.querySelector(':scope > .kp-customer-nav-primary');
    const panel=side.querySelector(':scope > .kp-customer-nav-more-panel');
    const groups=panel?.querySelector('.kp-customer-nav-groups');
    const more=side.querySelector('#kp-customer-more-toggle');
    if(!primary||!panel||!groups||!more)return;

    const buttons=[...side.querySelectorAll('.nav')].filter(button=>button.id!=='logout');
    let extraCount=0;
    let extraActive=false;
    for(const button of buttons){
      const label=navSourceLabel(button);
      if(PRIMARY_NAV_LABELS.has(label)){
        if(button.parentElement!==primary)primary.append(button);
        continue;
      }
      const group=navGroupFor(label);
      const target=ensureNavGroup(groups,group.id,group.title);
      if(button.parentElement!==target)target.append(button);
      extraCount+=1;
      if(button.classList.contains('active'))extraActive=true;
    }

    groups.querySelectorAll('.kp-customer-nav-group').forEach(group=>{group.hidden=!group.querySelector('.nav');});
    const count=more.querySelector('.kp-customer-more-count');
    if(count)setText(count,String(extraCount));
    more.hidden=extraCount===0;
    const storedOpen=navMemoryGet();
    const open=extraCount>0&&(extraActive||storedOpen);
    panel.hidden=!open;
    more.setAttribute('aria-expanded',String(open));
  }

  function normalizeOverview(){
    const content=document.querySelector('.content');
    if(!content)return;
    const title=content.querySelector(':scope > .top h2');
    if(title&&['Übersicht','Kundenübersicht','Plattformübersicht'].includes(title.textContent?.trim()||''))setText(title,'Kundenübersicht');

    const cards=[...content.querySelectorAll(':scope > .grid > .card')];
    const tenantCountCard=cards.find(card=>card.querySelector('.muted')?.textContent?.trim()==='Mandanten');
    tenantCountCard?.remove();

    const activeCard=[...content.querySelectorAll(':scope > .grid > .card')].find(card=>card.querySelector('.muted')?.textContent?.trim()==='Aktiver Mandant');
    if(activeCard){
      setText(activeCard.querySelector('.muted'),'Organisation');
      const name=selectedCustomerName();
      if(name)setText(activeCard.querySelector('.stat'),name);
    }
  }

  function normalizeCustomerPicker(){
    const pick=document.querySelector('#tenantPick');
    if(!pick)return;
    if(me?.supportPlatformAdmin){
      pick.style.display='';
      if(!pick.closest('#kp-support-customer-picker')){
        const wrap=document.createElement('label');
        wrap.id='kp-support-customer-picker';
        wrap.className='field';
        wrap.style.minWidth='260px';
        const caption=document.createElement('span');
        caption.textContent='Kunde auswählen (Support)';
        wrap.append(caption);
        pick.parentNode?.insertBefore(wrap,pick);
        wrap.append(pick);
      }
    }else{
      pick.style.display='none';
    }
  }

  function ensureSupportNotice(){
    if(!me?.supportPlatformAdmin)return;
    const content=document.querySelector('.content');
    if(!content||content.querySelector('#kp-support-mode'))return;
    const n=document.createElement('div');
    n.id='kp-support-mode';
    n.className='notice ok';
    n.innerHTML='<strong>Supportansicht Kunden-Admin</strong> · Du verwaltest ausschließlich den oben ausgewählten Kunden. Neue Bildungsträger werden nur im Plattform-Admin angelegt.';
    content.querySelector(':scope > .top')?.after(n);
  }

  function managedSetupCard(data){
    const x=data.managedSetup||{},status=String(x.status||'ready');
    const statusText={ready:'Zahlung bestätigt · Einrichtung steht bereit',in_progress:'Kompletteinrichtung läuft',completed:'Kompletteinrichtung abgeschlossen'}[status]||status;
    const detail=status==='ready'?'Der Auftrag wurde automatisch an unseren Einrichtungsbereich übergeben.':status==='in_progress'?'Dein Portal wird aktuell anhand des gebuchten Umfangs eingerichtet.':'Die gebuchte Einrichtung wurde als abgeschlossen markiert. Du kannst alle Bereiche weiterhin selbst anpassen.';
    return `<section id="kp-setup-progress" class="card" data-tenant="${esc(selectedTenantId())}" style="margin-top:16px"><div class="top"><div><h3 style="margin:0">Einrichtungsservice</h3><div class="muted">${esc(x.setup_name||'Managed Setup')} · bis ${esc(x.course_count||'')} Klasse(n)/Kurs(e)</div></div><span class="pill">${esc(statusText)}</span></div><div class="notice ok" style="margin-top:12px"><strong>${esc(statusText)}</strong><div style="margin-top:5px">${esc(detail)}</div></div>${status==='completed'?'<div class="toolbar" style="margin-top:12px"><button type="button" class="btn secondary kp-setup-go" data-view="branding">Branding öffnen</button><button type="button" class="btn secondary kp-setup-go" data-view="courses">Klassen/Kurse öffnen</button></div>':''}</section>`;
  }

  function selfSetupCard(data){
    const p=data.progress||{},steps=data.steps||[];
    const rows=steps.map(s=>`<div class="item" style="display:flex;align-items:center;gap:10px;justify-content:space-between"><div style="display:flex;gap:10px;align-items:flex-start"><span style="font-size:20px;line-height:1">${s.done?'✓':'○'}</span><div><strong>${esc(s.label)}</strong>${s.required?'':' <span class="muted">(empfohlen)</span>'}</div></div>${s.done?'<span class="pill">Erledigt</span>':`<button type="button" class="btn secondary kp-setup-go" data-view="${esc(s.target)}" ${s.action?`data-action="${esc(s.action)}"`:''}>Jetzt erledigen</button>`}</div>`).join('');
    const headline=p.requiredReady?'Grundkonfiguration einsatzbereit':'Portal fertig einrichten';
    const hint=p.requiredReady?'Die für den Start notwendigen Schritte sind erledigt. Die empfohlenen Punkte kannst du jederzeit ergänzen.':'Das Portal prüft automatisch, was bereits erledigt ist, und führt dich direkt zum nächsten Schritt.';
    return `<section id="kp-setup-progress" class="card" data-tenant="${esc(selectedTenantId())}" style="margin-top:16px"><div class="top"><div><h3 style="margin:0">${headline}</h3><div class="muted">${esc(p.completed||0)} von ${esc(p.total||4)} Schritten erledigt · ${esc(p.percent||0)} %</div></div><span class="pill">Self-Service</span></div><div style="height:8px;background:#e2e8f0;border-radius:999px;overflow:hidden;margin:14px 0"><div style="height:100%;width:${Math.max(0,Math.min(100,Number(p.percent||0)))}%;background:currentColor"></div></div><p class="muted">${hint}</p><div>${rows}</div></section>`;
  }

  async function ensureSetupProgress(){
    const content=document.querySelector('.content'),title=content?.querySelector(':scope > .top h2');
    if(!content||title?.textContent?.trim()!=='Kundenübersicht')return;
    const tenant=selectedTenantId();if(!tenant)return;
    const existing=content.querySelector('#kp-setup-progress');if(existing?.dataset.tenant===tenant)return;
    existing?.remove();if(setupLoadingTenant===tenant)return;setupLoadingTenant=tenant;
    try{
      const r=await fetch(`/api/billing/setup-progress?tenant_id=${encodeURIComponent(tenant)}`,{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;
      const data=await r.json();
      if(selectedTenantId()!==tenant||content.querySelector(':scope > .top h2')?.textContent?.trim()!=='Kundenübersicht')return;
      const grid=content.querySelector(':scope > .grid');if(!grid)return;
      grid.insertAdjacentHTML('afterend',data.mode==='managed'?managedSetupCard(data):selfSetupCard(data));
    }catch{}finally{if(setupLoadingTenant===tenant)setupLoadingTenant='';}
  }

  function setupNavigation(target){
    const view=target.dataset.view,action=target.dataset.action;
    const nav=document.querySelector(`[data-v="${CSS.escape(view||'')}"]`);if(!nav)return;
    nav.click();
    if(action==='timetable'){
      let tries=0;const timer=setInterval(()=>{const b=document.querySelector('#timetable-import-open');if(b){clearInterval(timer);b.click();}else if(++tries>20)clearInterval(timer);},50);
    }
  }

  function apply(){
    document.title='Klassenportal · Kunden-Admin';
    cleanPlatformControls();
    organizeCustomerNavigation();
    const side=document.querySelector('.side');
    if(side)setText(side.querySelector('h1'),'Klassenportal · Kunden-Admin');
    normalizeCustomerPicker();
    normalizeOverview();
    ensureSupportNotice();
    void ensureSetupProgress();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;apply();});
  }

  await loadMe();
  const target=document.querySelector('#app')||document.body;
  new MutationObserver(schedule).observe(target,{subtree:true,childList:true});
  document.addEventListener('change',e=>{if(e.target?.id==='tenantPick'){document.querySelector('#kp-setup-progress')?.remove();setupLoadingTenant='';setTimeout(schedule,0);}});
  document.addEventListener('click',e=>{const b=e.target?.closest?.('.kp-setup-go');if(b)setupNavigation(b);});
  apply();
}