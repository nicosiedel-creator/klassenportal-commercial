const AREA=location.pathname==='/plattform-admin'?'platform':location.pathname==='/kunden-admin'?'customer':null;
if(AREA){
  const setText=(el,text)=>{if(el&&el.textContent!==text)el.textContent=text;};
  let me=null,scheduled=false;
  async function loadMe(){try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(r.ok)me=(await r.json()).user||null;}catch{}}
  function apply(){
    document.title=AREA==='platform'?'Klassenportal · Plattform-Admin':'Klassenportal · Kunden-Admin';
    const brand=document.querySelector('.login .brand');
    if(brand)setText(brand,AREA==='platform'?'Klassenportal · Plattform-Admin':'Klassenportal · Kunden-Admin');
    const side=document.querySelector('.side');
    if(!side)return;
    setText(side.querySelector('h1'),AREA==='platform'?'Klassenportal · Plattform-Admin':'Klassenportal · Kunden-Admin');
    let switcher=side.querySelector('#kp-area-switch');
    if(me?.isPlatformAdmin&&!switcher){
      switcher=document.createElement('button');switcher.className='nav';switcher.id='kp-area-switch';
      switcher.textContent=AREA==='platform'?'Zur Kunden-Adminseite':'Zur Plattform-Adminseite';
      switcher.onclick=()=>location.assign(AREA==='platform'?'/kunden-admin':'/plattform-admin');
      const logout=side.querySelector('#logout');logout?.before(switcher);
    }
    const content=document.querySelector('.content');
    if(AREA==='customer'&&me?.isPlatformAdmin&&content&&!content.querySelector('#kp-support-mode')){
      const n=document.createElement('div');n.id='kp-support-mode';n.className='notice ok';
      n.innerHTML='<strong>Kunden-Admin · Supportansicht</strong> · Du arbeitest im oben ausgewählten Kundenkonto. Deine Plattformrechte bleiben erhalten.';
      const top=content.querySelector(':scope > .top');top?.after(n);
    }
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;apply();});}
  await loadMe();
  if(AREA==='platform'&&me&&!me.isPlatformAdmin){location.replace('/kunden-admin');}
  const target=document.querySelector('#app')||document.body;
  new MutationObserver(schedule).observe(target,{subtree:true,childList:true});
  apply();
}
