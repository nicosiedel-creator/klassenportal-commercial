const KP_AUTOPILOT_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';
if(KP_AUTOPILOT_PATH){
  let busy=false;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function status(text,kind='info'){
    let n=document.querySelector('#kp-autopilot-entry-status');
    if(!n){n=document.createElement('div');n.id='kp-autopilot-entry-status';n.setAttribute('role','status');n.setAttribute('aria-live','polite');document.body.append(n);}
    n.dataset.kind=kind;n.textContent=text;clearTimeout(status.timer);status.timer=setTimeout(()=>n?.remove(),kind==='error'?7000:2200);
  }
  async function openAutopilot(){
    if(busy)return;busy=true;document.querySelectorAll('[data-kp-autopilot-open]').forEach(b=>b.disabled=true);status('Autopilot wird geöffnet …');
    try{
      if(!window.KPEducationOS){const ok=await window.KPCustomerModules?.loadGroup?.('autopilot');if(ok===false&&!window.KPEducationOS)throw new Error('AUTOPILOT_LOAD_FAILED');}
      if(!window.KPEducationOS?.open)throw new Error('AUTOPILOT_NOT_READY');
      window.KPEducationOS.open('intent');
    }catch(error){console.error('Autopilot entry failed',error);status('Der Autopilot konnte gerade nicht geöffnet werden. Bitte erneut versuchen.','error');}
    finally{busy=false;document.querySelectorAll('[data-kp-autopilot-open]').forEach(b=>b.disabled=false);}
  }
  function primaryButton(){
    const nav=document.querySelector('.kp-customer-nav-primary');if(!nav)return;
    let button=nav.querySelector('#kp-autopilot-primary');
    if(!button){button=document.createElement('button');button.id='kp-autopilot-primary';button.type='button';button.className='nav kp-autopilot-primary';button.dataset.kpAutopilotOpen='1';button.innerHTML='<span class="kp-autopilot-mark">✦</span><span><strong>Autopilot</strong><small>Änderung beschreiben → prüfen → simulieren</small></span>';button.addEventListener('click',openAutopilot);nav.prepend(button);}
  }
  function headerButton(){
    const top=document.querySelector('.content > .top');if(!top||top.querySelector('#kp-autopilot-header'))return;
    const button=document.createElement('button');button.id='kp-autopilot-header';button.type='button';button.className='btn kp-autopilot-header';button.dataset.kpAutopilotOpen='1';button.innerHTML='<span>✦</span> Autopilot';button.title='Autopilot direkt öffnen';button.addEventListener('click',openAutopilot);top.append(button);
  }
  function mount(){primaryButton();headerButton();}
  window.addEventListener('kp:customer-view-changed',mount);
  window.addEventListener('kp:localechange',mount);
  window.addEventListener('kp:customer-modules-group-ready',mount);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(mount),{once:true});else requestAnimationFrame(mount);
}
