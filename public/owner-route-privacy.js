(()=>{
  const path=location.pathname.replace(/\/$/,'')||'/';
  if(path==='/plattform-admin')return;
  function scrub(){
    document.querySelectorAll('a[href^="/plattform-admin"],a[href*="/plattform-admin?"]').forEach(a=>a.remove());
    const support=document.querySelector('#kp-support-mode');
    if(support&&/Plattform-Admin/i.test(support.textContent||''))support.innerHTML='<strong>Kunden-Admin · Supportansicht</strong> · Du verwaltest ausschließlich den ausgewählten Kunden.';
    document.querySelectorAll('[data-platform-admin-link],#kp-area-switch').forEach(x=>x.remove());
  }
  let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;scrub();});};
  new MutationObserver(schedule).observe(document.documentElement,{subtree:true,childList:true});scrub();
})();
