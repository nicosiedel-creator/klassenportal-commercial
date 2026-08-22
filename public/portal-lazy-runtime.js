const PATH_OK=/^\/portal\/[^/]+\/[^/]+\/?$/.test(location.pathname);
if(PATH_OK){
  const V='20260822-student-hotfix-5';
  const asset=name=>`/${name}.js?v=${V}`;
  const style=name=>`/${name}.css?v=${V}`;
  const loaded=new Set(),loading=new Map(),styles=new Set(),styleLoading=new Map();let bootPromise=null,backgroundStarted=false;
  const GATE_SUPPORT=['auth-mfa-ui','account-mail-ui'];
  const CORE_ENHANCERS=['portal-layout','portal-compact','vfa13-refinement'];
  const FEATURES=['portal-calendar-lookback','portal-targeted-messages','portal-attendance-ui','portal-assignments-ui','portal-learning-collaboration-ui','portal-teams-ui','portal-certificates-ui','portal-advanced-ui','class-admin-student-tools','lesson-hub-ui','portal-curriculum-ui','portal-learning-mode-ui','portal-report-book-ui','portal-signature-inbox-ui','legal-footer-ui'];
  const CSS_BY_MODULE={
    'student-dashboard-v2':['role-dashboard','role-dashboard-polish','student-dashboard-v2'],
    'lesson-hub-ui':['lesson-hub'],
    'portal-learning-collaboration-ui':['integrated-workspace'],
    'portal-curriculum-ui':['integrated-workspace'],
    'portal-report-book-ui':['integrated-workspace'],
    'portal-learning-mode-ui':['learning-mode-badges']
  };
  const SECTION_MODULES={
    benachrichtigungen:['portal-targeted-messages'],
    stundenplan:['lesson-hub-ui','portal-calendar-lookback'],
    aufgaben:['portal-assignments-ui','portal-learning-collaboration-ui'],
    termine:['portal-calendar-lookback'],
    pruefungen:['portal-certificates-ui'],
    kalender:['portal-calendar-lookback'],
    materialien:['portal-learning-collaboration-ui']
  };
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const idle=(timeout=1200)=>new Promise(resolve=>('requestIdleCallback'in window?requestIdleCallback(()=>resolve(),{timeout}):setTimeout(resolve,Math.min(timeout,500))));
  const portalRoot=()=>document.querySelector('#class-portal')||document.body;
  const relocalize=()=>{try{window.KP_I18N?.localize?.(portalRoot());}catch{}};

  function ensureStyle(name){
    const href=style(name);if(styles.has(href))return Promise.resolve(true);if(styleLoading.has(href))return styleLoading.get(href);
    const p=new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.kpStudentStyle=name;link.onload=()=>{styles.add(href);resolve(true);};link.onerror=()=>{console.error('Student portal stylesheet failed',{name});resolve(false);};document.head.append(link);}).finally(()=>styleLoading.delete(href));
    styleLoading.set(href,p);return p;
  }
  async function loadLocalization(){
    if(window.KP_I18N){relocalize();return true;}
    const Native=window.MutationObserver;
    class NoopObserver{observe(){}disconnect(){}takeRecords(){return[];}}
    try{window.MutationObserver=NoopObserver;await import(`/localization.js?v=${V}`);relocalize();return true;}
    catch(error){console.error('Student portal localization failed',error);return false;}
    finally{window.MutationObserver=Native;}
  }
  async function loadOne(name){
    const src=asset(name);if(loaded.has(src))return true;if(loading.has(src))return loading.get(src);
    const p=(async()=>{await Promise.all((CSS_BY_MODULE[name]||[]).map(ensureStyle));try{await import(src);loaded.add(src);relocalize();window.dispatchEvent(new CustomEvent('kp:portal-module-loaded',{detail:{name}}));return true;}catch(error){console.error('Student portal module failed to load',{name,error:String(error?.message||error)});return false;}})().finally(()=>loading.delete(src));
    loading.set(src,p);return p;
  }
  async function loadList(names,workers=2){
    const queue=[...new Set(names)];let failures=0;
    const pool=Array.from({length:Math.max(1,Math.min(workers,queue.length||1))},async()=>{while(queue.length){const name=queue.shift();if(!name)return;if(!await loadOne(name))failures++;await nextFrame();}});
    await Promise.all(pool);return failures;
  }
  function requestedSection(target){
    const link=target?.closest?.('.portal-nav a[href^="#"]');if(link)return decodeURIComponent((link.getAttribute('href')||'').slice(1));
    const opener=target?.closest?.('[data-open-section]');return opener?.dataset?.openSection||'';
  }
  function bindInteractionLoading(){
    document.addEventListener('click',event=>{const id=requestedSection(event.target);const names=SECTION_MODULES[id];if(names?.length)void loadList(names,2);},{capture:true});
  }
  async function backgroundWarmup(){
    if(backgroundStarted)return;backgroundStarted=true;
    await pause(5000);await idle(5000);
    let failures=0;
    for(const name of FEATURES){if(!await loadOne(name))failures++;await pause(120);await nextFrame();}
    window.dispatchEvent(new CustomEvent('kp:portal-modules-ready',{detail:{failures}}));
    await pause(3000);await idle(4000);void loadOne('pwa-client');
  }
  function boot(){
    if(bootPromise)return bootPromise;
    bootPromise=(async()=>{
      await nextFrame();
      const data=window.__KP_PORTAL_DATA;
      if(!data){await Promise.all([loadLocalization(),loadList(GATE_SUPPORT,2)]);return;}
      performance.mark?.('kp-student-base-visible');
      bindInteractionLoading();
      void loadLocalization();
      await loadList(CORE_ENHANCERS,2);
      if(['class_admin','tenant_admin','platform_admin'].includes(String(data.viewer?.role||'')))void loadOne('admin-mfa-enrollment-ui');
      await idle(900);void loadOne('student-dashboard-v2');
      void backgroundWarmup();
    })();
    return bootPromise;
  }

  window.KPStudentModules={loadOne,loadList,isLoaded:name=>loaded.has(asset(name))};
  window.addEventListener('kp:portal-data',relocalize);
  window.addEventListener('kp:localechange',relocalize);
  window.addEventListener('kp:portal-base-ready',()=>void boot(),{once:true});
  if(window.__KP_PORTAL_BASE_PROMISE)window.__KP_PORTAL_BASE_PROMISE.then(()=>void boot()).catch(()=>{});
}
