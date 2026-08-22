const PATH_OK=/^\/portal\/[^/]+\/[^/]+\/?$/.test(location.pathname);
if(PATH_OK){
  const V='20260822-student-hotfix-4';
  const asset=name=>`/${name}.js?v=${V}`;
  const loaded=new Set(),loading=new Map();let bootPromise=null;
  const GATE_SUPPORT=['auth-mfa-ui','account-mail-ui'];
  const HIGH=['portal-layout','portal-compact','vfa13-refinement','student-dashboard-v2'];
  const FEATURES=['portal-calendar-lookback','portal-targeted-messages','portal-attendance-ui','portal-assignments-ui','portal-learning-collaboration-ui','portal-teams-ui','portal-certificates-ui','portal-advanced-ui','class-admin-student-tools','lesson-hub-ui','portal-curriculum-ui','portal-learning-mode-ui','portal-report-book-ui','portal-signature-inbox-ui','legal-footer-ui'];
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  const idle=()=>new Promise(resolve=>('requestIdleCallback'in window?requestIdleCallback(()=>resolve(),{timeout:1200}):setTimeout(resolve,250)));
  const portalRoot=()=>document.querySelector('#class-portal')||document.body;
  const relocalize=()=>{try{window.KP_I18N?.localize?.(portalRoot());}catch{}};

  async function loadLocalization(){
    if(window.KP_I18N){relocalize();return true;}
    const Native=window.MutationObserver;
    class NoopObserver{observe(){}disconnect(){}takeRecords(){return[];}}
    try{
      window.MutationObserver=NoopObserver;
      await import(`/localization.js?v=${V}`);
      relocalize();
      return true;
    }catch(error){console.error('Student portal localization failed',error);return false;}
    finally{window.MutationObserver=Native;}
  }
  async function loadOne(name){
    const src=asset(name);
    if(loaded.has(src))return true;
    if(loading.has(src))return loading.get(src);
    const p=import(src).then(()=>{loaded.add(src);relocalize();window.dispatchEvent(new CustomEvent('kp:portal-module-loaded',{detail:{name}}));return true;}).catch(error=>{console.error('Student portal module failed to load',{name,error:String(error?.message||error)});return false;}).finally(()=>loading.delete(src));
    loading.set(src,p);return p;
  }
  async function loadList(names,workers=2){
    const queue=[...names];let failures=0;
    const pool=Array.from({length:Math.max(1,Math.min(workers,queue.length||1))},async()=>{while(queue.length){const name=queue.shift();if(!name)return;if(!await loadOne(name))failures++;await nextFrame();}});
    await Promise.all(pool);return failures;
  }
  function boot(){
    if(bootPromise)return bootPromise;
    bootPromise=(async()=>{
      await nextFrame();
      await loadLocalization();
      await loadList(GATE_SUPPORT,2);
      const data=window.__KP_PORTAL_DATA;
      if(!data)return;
      if(['class_admin','tenant_admin','platform_admin'].includes(String(data.viewer?.role||'')))await loadOne('admin-mfa-enrollment-ui');
      await loadList(HIGH,2);
      await idle();
      const failures=await loadList(FEATURES,3);
      window.dispatchEvent(new CustomEvent('kp:portal-modules-ready',{detail:{failures}}));
      await idle();
      void loadOne('pwa-client');
    })();
    return bootPromise;
  }

  window.addEventListener('kp:portal-data',relocalize);
  window.addEventListener('kp:localechange',relocalize);
  window.addEventListener('kp:portal-base-ready',()=>void boot(),{once:true});
  if(window.__KP_PORTAL_BASE_PROMISE)window.__KP_PORTAL_BASE_PROMISE.then(()=>void boot()).catch(()=>{});
}
