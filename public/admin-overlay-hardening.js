(()=>{
  const selector='.modal-back,.class-admin-modal-back,.kp-modal-back';
  function overlays(){return [...document.querySelectorAll(selector)];}
  function normalize(){
    for(const el of overlays())if(el.parentElement!==document.body)document.body.append(el);
    document.body.classList.toggle('kp-admin-modal-open',overlays().length>0);
  }
  const observer=new MutationObserver(normalize);
  const start=()=>{normalize();observer.observe(document.documentElement,{childList:true,subtree:true});};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
