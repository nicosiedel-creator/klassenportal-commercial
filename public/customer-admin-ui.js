const CUSTOMER_ADMIN_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';

if(CUSTOMER_ADMIN_PATH){
  let me=null;
  let scheduled=false;

  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};

  async function loadMe(){
    try{
      const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
      if(r.ok)me=(await r.json()).user||null;
    }catch{}
  }

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

  function apply(){
    document.title='Klassenportal · Kunden-Admin';
    const side=document.querySelector('.side');
    if(side)setText(side.querySelector('h1'),'Klassenportal · Kunden-Admin');
    cleanPlatformControls();
    normalizeCustomerPicker();
    normalizeOverview();
    ensureSupportNotice();
  }

  function schedule(){
    if(scheduled)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;apply();});
  }

  await loadMe();
  const target=document.querySelector('#app')||document.body;
  new MutationObserver(schedule).observe(target,{subtree:true,childList:true});
  document.addEventListener('change',e=>{if(e.target?.id==='tenantPick')setTimeout(schedule,0);});
  apply();
}
