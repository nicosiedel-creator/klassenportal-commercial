const CUSTOMER_NAV_DROPDOWN_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';

if(CUSTOMER_NAV_DROPDOWN_PATH){
  const clearRememberedState=()=>{try{sessionStorage.removeItem('kp_customer_nav_more');}catch{}};
  const closePanel=()=>{
    const panel=document.querySelector('#kp-customer-nav-more-panel');
    const toggle=document.querySelector('#kp-customer-more-toggle');
    if(panel)panel.hidden=true;
    toggle?.setAttribute('aria-expanded','false');
    clearRememberedState();
  };

  clearRememberedState();

  document.addEventListener('click',event=>{
    const target=event.target instanceof Element?event.target:null;
    if(!target)return;
    if(target.closest('#kp-customer-more-toggle'))return;
    const panel=document.querySelector('#kp-customer-nav-more-panel');
    if(!panel||panel.hidden)return;
    if(target.closest('#kp-customer-nav-more-panel .nav')||!target.closest('#kp-customer-nav-more-panel'))closePanel();
  });

  document.addEventListener('keydown',event=>{if(event.key==='Escape')closePanel();});
  window.addEventListener('kp:customer-view-changed',event=>{if(event.detail?.reason==='modules')return;closePanel();});
}
