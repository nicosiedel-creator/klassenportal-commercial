const PLATFORM_OFFER_ADMIN_PREVIEW_PATH=location.pathname.replace(/\/$/,'')==='/plattform-admin';
if(PLATFORM_OFFER_ADMIN_PREVIEW_PATH){
  let activeOfferId='';
  function relabel(){document.querySelectorAll('[data-print]').forEach(button=>{button.textContent='Angebot ansehen / PDF';});}
  new MutationObserver(()=>queueMicrotask(relabel)).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});
  relabel();
  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    const detail=target.closest('[data-detail]');
    if(detail?.dataset?.detail)activeOfferId=String(detail.dataset.detail);
    const print=target.closest('[data-print]');
    if(!print||!activeOfferId)return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const url=`/angebot.html?admin_offer=${encodeURIComponent(activeOfferId)}`;
    const opened=window.open(url,'_blank');
    if(opened)opened.opener=null;
    else alert('Die Angebotsansicht konnte nicht in einem neuen Tab geöffnet werden. Bitte Pop-ups für diese Seite erlauben.');
  },true);
}
