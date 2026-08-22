const KP_AUTOPILOT_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';
if(KP_AUTOPILOT_PATH){
  let busy=false;
  function installStyles(){if(document.querySelector('#kp-autopilot-entry-style'))return;const s=document.createElement('style');s.id='kp-autopilot-entry-style';s.textContent=`
    .customer-portal-admin .kp-autopilot-primary{display:flex!important;align-items:center!important;gap:9px!important;min-height:50px!important;margin:3px 0 8px!important;padding:9px 10px!important;background:linear-gradient(135deg,#173b69,#235f9e)!important;color:#fff!important;border:1px solid #173b69!important;box-shadow:0 4px 12px rgba(23,59,105,.16)!important}
    .customer-portal-admin .kp-autopilot-primary:hover{background:linear-gradient(135deg,#12345f,#1e5792)!important;color:#fff!important}
    .customer-portal-admin .kp-autopilot-primary .kp-autopilot-mark{display:grid;place-items:center;width:28px;height:28px;flex:0 0 28px;border-radius:7px;background:rgba(255,255,255,.14);font-size:1rem}
    .customer-portal-admin .kp-autopilot-primary span:last-child{display:block;min-width:0}.customer-portal-admin .kp-autopilot-primary strong{display:block;font-size:.88rem}.customer-portal-admin .kp-autopilot-primary small{display:block;margin-top:2px;white-space:normal;color:rgba(255,255,255,.78);font-size:.66rem;font-weight:520;line-height:1.25}
    .customer-portal-admin .kp-autopilot-header{margin-left:auto!important;background:#173b69!important;color:#fff!important;border-color:#173b69!important;box-shadow:0 2px 8px rgba(23,59,105,.14)!important}.customer-portal-admin .kp-autopilot-header:hover{background:#12345f!important}
    #kp-autopilot-entry-status{position:fixed;right:18px;bottom:18px;z-index:2800;max-width:360px;padding:9px 12px;border:1px solid #dbe3ec;border-radius:8px;background:#fff;color:#172033;box-shadow:0 8px 24px #0002;font:13px/1.35 system-ui}#kp-autopilot-entry-status[data-kind="error"]{border-color:#efc6c6;background:#fff7f7;color:#8b2525}
    #education-os-nav[data-kp-legacy-autopilot]{display:none!important}
  `;document.head.append(s);}
  function status(text,kind='info'){
    let n=document.querySelector('#kp-autopilot-entry-status');
    if(!n){n=document.createElement('div');n.id='kp-autopilot-entry-status';n.setAttribute('role','status');n.setAttribute('aria-live','polite');document.body.append(n);}
    n.dataset.kind=kind;n.textContent=text;clearTimeout(status.timer);status.timer=setTimeout(()=>n?.remove(),kind==='error'?7000:2200);
  }
  function openLoadedOs(){const legacy=document.querySelector('#education-os-nav');if(!legacy)return false;legacy.dataset.kpLegacyAutopilot='1';legacy.click();requestAnimationFrame(()=>document.querySelector('.eo-os-nav [data-pane="intent"]')?.click());return true;}
  async function openAutopilot(){
    if(busy)return;busy=true;document.querySelectorAll('[data-kp-autopilot-open]').forEach(b=>b.disabled=true);status('Autopilot wird geöffnet …');
    try{
      if(!openLoadedOs()){const ok=await window.KPCustomerModules?.loadGroup?.('autopilot');if(ok===false)throw new Error('AUTOPILOT_LOAD_FAILED');if(!openLoadedOs())throw new Error('AUTOPILOT_NOT_READY');}
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
  function mount(){installStyles();primaryButton();headerButton();const legacy=document.querySelector('#education-os-nav');if(legacy)legacy.dataset.kpLegacyAutopilot='1';}
  window.addEventListener('kp:customer-view-changed',mount);
  window.addEventListener('kp:localechange',mount);
  window.addEventListener('kp:customer-modules-group-ready',mount);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>requestAnimationFrame(mount),{once:true});else requestAnimationFrame(mount);
}
