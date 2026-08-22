const CUSTOMER_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';
if(CUSTOMER_PATH){
  const GROUPS={
    learning:[
      '/communication-admin-ui.js?v=20260822-2','/teacher-message-admin-ui.js?v=20260822-2','/teacher-assignment-ui.js?v=20260822-2',
      '/assignment-gradebook-ui.js?v=20260822-2','/learning-report-collab-admin-ui.js?v=20260822-2','/gradebook-policy-ui.js?v=20260822-2',
      '/gradebook-default-scale-ui.js?v=20260822-2','/participant-360-ui.js?v=20260822-2','/materials-admin-ui.js?v=20260822-2',
      '/certificate-workflow-ui.js?v=20260822-2','/exam-documentation-admin-ui.js?v=20260822-2','/department-lead-admin-ui.js?v=20260822-2',
      '/education-signature-compose-ui.js?v=20260822-2'
    ],
    organization:[
      '/enterprise-admin-ui.js?v=20260822-2','/responsibility-ui.js?v=20260822-2','/participant-import-ui.js?v=20260822-2',
      '/organization-import-ui.js?v=20260822-2','/intake-center-ui.js?v=20260822-2','/intake-quick-upload-ui.js?v=20260822-2',
      '/planning-resource-ui.js?v=20260822-2','/operational-crud-ui.js?v=20260822-2'
    ],
    automation:[
      '/education-operations-admin-ui.js?v=20260822-2','/education-operations-extended-ui.js?v=20260822-2',
      '/education-os-ui.js?v=20260822-2','/education-os-readiness-ui.js?v=20260822-2','/education-os-innovation-ui.js?v=20260822-2',
      '/module-catalog-ui.js?v=20260822-2','/module-cancellation-ui.js?v=20260822-2'
    ],
    technology:[
      '/teams-management-ui.js?v=20260822-2','/custom-domain-ui.js?v=20260822-2','/advanced-module-ui.js?v=20260822-2'
    ],
    commerce:[
      '/class-role-ui.js?v=20260822-2','/commerce-safe-ui.js?v=20260822-2','/billing-addons-ui.js?v=20260822-2',
      '/area-mode.js?v=20260822-2','/stripe-customer-portal-ui.js?v=20260822-2','/class-portal-admin-ui.js?v=20260822-2',
      '/legal-footer-ui.js?v=20260822-2'
    ]
  };
  const CSS_GROUPS={
    learning:['/role-dashboard.css?v=20260822-2','/role-dashboard-polish.css?v=20260822-2'],
    automation:['/education-os.css?v=20260822-2']
  };
  const loaded=new Set(),loading=new Map(),styles=new Set();
  const state={groups:{},errors:[]};
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function showStatus(message,kind='muted'){
    let box=document.querySelector('#kp-module-load-status');
    if(!box){box=document.createElement('div');box.id='kp-module-load-status';box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2300;max-width:360px;padding:9px 12px;border:1px solid #dbe3ec;border-radius:10px;background:#fff;color:#172033;box-shadow:0 8px 24px #0002;font:13px/1.35 system-ui';document.body.append(box);}
    box.className=kind;box.textContent=message;
    clearTimeout(showStatus.timer);showStatus.timer=setTimeout(()=>box?.remove(),kind==='warn'?8000:2200);
  }
  function ensureStyle(href){
    if(styles.has(href)||document.querySelector(`link[data-kp-lazy-style="${CSS.escape(href)}"]`))return Promise.resolve();
    styles.add(href);return new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.kpLazyStyle=href;link.onload=()=>resolve();link.onerror=()=>{state.errors.push(href);resolve();};document.head.append(link);});
  }
  async function loadOne(src){
    if(loaded.has(src))return;
    if(loading.has(src))return loading.get(src);
    const p=(async()=>{try{await import(src);loaded.add(src);}catch(error){state.errors.push(src);console.error('Customer module failed to load',{src,error:String(error?.message||error)});throw error;}finally{loading.delete(src);}})();
    loading.set(src,p);return p;
  }
  async function loadGroup(group){
    if(state.groups[group]==='ready')return true;
    if(state.groups[group]==='loading')return false;
    const modules=GROUPS[group];if(!modules)return false;
    state.groups[group]='loading';
    showStatus('Bereich wird geladen …');
    await Promise.all((CSS_GROUPS[group]||[]).map(ensureStyle));
    const queue=[...modules];let failures=0;
    const workers=Array.from({length:2},async()=>{while(queue.length){const src=queue.shift();if(!src)return;try{await loadOne(src);}catch{failures++;}await pause();}});
    await Promise.all(workers);
    state.groups[group]=failures?'partial':'ready';
    window.dispatchEvent(new CustomEvent('kp:customer-modules-group-ready',{detail:{group,failures}}));
    window.dispatchEvent(new CustomEvent('kp:customer-view-changed',{detail:{reason:'modules',group}}));
    if(failures)showStatus(`${failures} Teilmodul(e) konnten nicht geladen werden. Bitte erneut versuchen.`,'warn');else showStatus('Bereich geladen.');
    return failures===0;
  }
  window.KPCustomerModules={loadGroup,isLoaded:group=>state.groups[group]==='ready',state};
  window.addEventListener('kp:customer-load-modules',event=>{const group=String(event.detail?.group||'');if(group)void loadGroup(group);});
}
