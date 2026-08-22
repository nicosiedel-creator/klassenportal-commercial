const CUSTOMER_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';
if(CUSTOMER_PATH){
  const V='20260822-3';
  const asset=name=>`/${name}.js?v=${V}`;
  const GROUPS={
    learning:['communication-admin-ui','teacher-message-admin-ui','teacher-assignment-ui','assignment-gradebook-ui','learning-report-collab-admin-ui','gradebook-policy-ui','gradebook-default-scale-ui','participant-360-ui','materials-admin-ui','certificate-workflow-ui','exam-documentation-admin-ui','department-lead-admin-ui','education-signature-compose-ui'].map(asset),
    organization:['branding-assistant','timetable-assistant','timetable-bulk-v3','enterprise-admin-ui','responsibility-ui','participant-import-ui','organization-import-ui','intake-center-ui','intake-quick-upload-ui','planning-resource-ui','operational-crud-ui'].map(asset),
    automation:['customer-moat-ui','education-operations-admin-ui','education-operations-extended-ui','education-os-ui','education-os-readiness-ui','education-os-innovation-ui','module-catalog-ui','module-cancellation-ui'].map(asset),
    technology:['teams-management-ui','custom-domain-ui','advanced-module-ui'].map(asset),
    commerce:['class-role-ui','commerce-safe-ui','billing-addons-ui','area-mode','stripe-customer-portal-ui','class-portal-admin-ui','legal-footer-ui'].map(asset)
  };
  const CSS_GROUPS={learning:[`/role-dashboard.css?v=${V}`,`/role-dashboard-polish.css?v=${V}`],automation:[`/education-os.css?v=${V}`]};
  const loaded=new Set(),loading=new Map(),groupPromises=new Map(),styles=new Set();
  const state={groups:{},errors:[]};
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function showStatus(message,kind='muted'){
    let box=document.querySelector('#kp-module-load-status');
    if(!box){box=document.createElement('div');box.id='kp-module-load-status';box.setAttribute('role','status');box.setAttribute('aria-live','polite');box.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2300;max-width:360px;padding:9px 12px;border:1px solid #dbe3ec;border-radius:8px;background:#fff;color:#172033;box-shadow:0 8px 24px #0002;font:13px/1.35 system-ui';document.body.append(box);}
    box.className=kind;box.textContent=message;clearTimeout(showStatus.timer);showStatus.timer=setTimeout(()=>box?.remove(),kind==='warn'?8000:2200);
  }
  function ensureStyle(href){if(styles.has(href)||document.querySelector(`link[data-kp-lazy-style="${CSS.escape(href)}"]`))return Promise.resolve();styles.add(href);return new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.kpLazyStyle=href;link.onload=()=>resolve();link.onerror=()=>{state.errors.push(href);resolve();};document.head.append(link);});}
  async function loadOne(src){if(loaded.has(src))return;if(loading.has(src))return loading.get(src);const p=(async()=>{try{await import(src);loaded.add(src);}catch(error){state.errors.push(src);console.error('Customer module failed to load',{src,error:String(error?.message||error)});throw error;}finally{loading.delete(src);}})();loading.set(src,p);return p;}
  function loadGroup(group){
    if(state.groups[group]==='ready')return Promise.resolve(true);
    if(groupPromises.has(group))return groupPromises.get(group);
    const modules=GROUPS[group];if(!modules)return Promise.resolve(false);
    const promise=(async()=>{state.groups[group]='loading';showStatus('Bereich wird geladen …');await Promise.all((CSS_GROUPS[group]||[]).map(ensureStyle));const queue=[...modules];let failures=0;const workers=Array.from({length:2},async()=>{while(queue.length){const src=queue.shift();if(!src)return;try{await loadOne(src);}catch{failures++;}await pause();}});await Promise.all(workers);state.groups[group]=failures?'partial':'ready';window.dispatchEvent(new CustomEvent('kp:customer-modules-group-ready',{detail:{group,failures}}));if(failures)showStatus(`${failures} Teilmodul(e) konnten nicht geladen werden. Erneutes Öffnen versucht nur die fehlenden Module.`,'warn');else showStatus('Bereich geladen.');return failures===0;})().finally(()=>groupPromises.delete(group));
    groupPromises.set(group,promise);return promise;
  }
  window.KPCustomerModules={loadGroup,isLoaded:group=>state.groups[group]==='ready',state};
  window.addEventListener('kp:customer-load-modules',event=>{const group=String(event.detail?.group||'');if(group)void loadGroup(group);});
}
