const AREA=location.pathname==='/plattform-admin'?'platform':location.pathname==='/kunden-admin'?'customer':null;
if(AREA){
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};
  let me=null,scheduled=false;
  const isPlatformOwner=()=>!!(me?.isPlatformAdmin||me?.supportPlatformAdmin);
  async function loadMe(){try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(r.ok)me=(await r.json()).user||null;}catch{}}
  function applyCustomerMode(side){
    setText(side.querySelector('h1'),'Klassenportal · Kunden-Admin');
    const tenantNav=side.querySelector('[data-v="tenants"]');
    if(tenantNav)tenantNav.style.display='none';
    side.querySelector('#pa-onboarding-nav')?.remove();
    side.querySelector('#kp-commerce-platform')?.remove();
    document.querySelector('#pa-new-customer')?.remove();
    const newTenant=document.querySelector('#newTenant');if(newTenant)newTenant.style.display='none';
    const platformTitle=[...document.querySelectorAll('.content h2')].find(x=>x.textContent?.trim()==='Plattformübersicht');
    setText(platformTitle,'Kundenübersicht');
    const customerBilling=side.querySelector('#kp-commerce-tenant');setText(customerBilling,'Paket & Abrechnung');
    const content=document.querySelector('.content');
    if(isPlatformOwner()&&content&&!content.querySelector('#kp-support-mode')){
      const n=document.createElement('div');n.id='kp-support-mode';n.className='notice ok';
      n.innerHTML='<strong>Kunden-Admin · Supportansicht</strong> · Oben wählst Du den Kunden aus. Alle Funktionen darunter gehören ausschließlich zum ausgewählten Kundenkonto.';
      const top=content.querySelector(':scope > .top');top?.after(n);
    }
  }
  function apply(){
    document.title=AREA==='platform'?'Klassenportal · Plattform-Admin':'Klassenportal · Kunden-Admin';
    const brand=document.querySelector('.login .brand');
    if(brand)setText(brand,AREA==='platform'?'Klassenportal · Plattform-Admin':'Klassenportal · Kunden-Admin');
    const side=document.querySelector('.side');
    if(!side)return;
    if(AREA==='customer')applyCustomerMode(side);else setText(side.querySelector('h1'),'Klassenportal · Plattform');
    let switcher=side.querySelector('#kp-area-switch');
    if(isPlatformOwner()&&!switcher){
      switcher=document.createElement('button');switcher.className='nav';switcher.id='kp-area-switch';
      switcher.textContent=AREA==='platform'?'Zur Kunden-Adminseite':'Zur Plattform-Adminseite';
      switcher.onclick=()=>location.assign(AREA==='platform'?'/kunden-admin':'/plattform-admin');
      const logout=side.querySelector('#logout');logout?.before(switcher);
    }
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;apply();});}
  await loadMe();
  if(AREA==='platform'&&me&&!isPlatformOwner())location.replace('/kunden-admin');
  const target=document.querySelector('#app')||document.body;
  new MutationObserver(schedule).observe(target,{subtree:true,childList:true});
  apply();
}
