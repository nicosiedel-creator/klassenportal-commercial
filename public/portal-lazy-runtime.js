const PATH_OK=/^\/portal\/[^/]+\/[^/]+\/?$/.test(location.pathname);
if(PATH_OK){
  const V='20260823-vfa13-commercial-1';
  const asset=name=>`/${name}.js?v=${V}`;
  const style=name=>`/${name}.css?v=${V}`;
  const loaded=new Set(),loading=new Map(),styles=new Set(),styleLoading=new Map();let bootPromise=null,backgroundStarted=false,interactionBound=false,currentData=null;
  const GATE_SUPPORT=['auth-mfa-ui','account-mail-ui'];
  const CORE_ENHANCERS=['portal-layout','portal-compact','vfa13-refinement'];
  const PUBLIC_FEATURES=['portal-calendar-lookback','portal-advanced-ui','lesson-hub-ui','legal-footer-ui'];
  const AUTH_FEATURES=['portal-targeted-messages','portal-attendance-ui','portal-assignments-ui','portal-learning-collaboration-ui','portal-teams-ui','portal-certificates-ui','class-admin-student-tools','portal-curriculum-ui','portal-learning-mode-ui','portal-report-book-ui','portal-signature-inbox-ui'];
  const CSS_BY_MODULE={
    'student-dashboard-v2':['role-dashboard','role-dashboard-polish','student-dashboard-v2'],
    'lesson-hub-ui':['lesson-hub'],
    'portal-learning-collaboration-ui':['integrated-workspace'],
    'portal-curriculum-ui':['integrated-workspace'],
    'portal-report-book-ui':['integrated-workspace'],
    'portal-learning-mode-ui':['learning-mode-badges']
  };
  const PUBLIC_SECTIONS={stundenplan:['lesson-hub-ui','portal-calendar-lookback'],termine:['portal-calendar-lookback'],kalender:['portal-calendar-lookback']};
  const AUTH_SECTIONS={benachrichtigungen:['portal-targeted-messages'],aufgaben:['portal-assignments-ui','portal-learning-collaboration-ui'],pruefungen:['portal-certificates-ui'],materialien:['portal-learning-collaboration-ui']};
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve()));
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const idle=(timeout=1200)=>new Promise(resolve=>('requestIdleCallback'in window?requestIdleCallback(()=>resolve(),{timeout}):setTimeout(resolve,Math.min(timeout,500))));
  const portalRoot=()=>document.querySelector('#class-portal')||document.body;
  const authenticated=()=>Boolean(currentData?.viewer?.authenticated);
  const relocalize=()=>{try{window.KP_I18N?.localize?.(portalRoot());}catch{}};

  function ensureStyle(name){const href=style(name);if(styles.has(href))return Promise.resolve(true);if(styleLoading.has(href))return styleLoading.get(href);const p=new Promise(resolve=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.kpStudentStyle=name;link.onload=()=>{styles.add(href);resolve(true);};link.onerror=()=>{console.error('VFA13 stylesheet failed',{name});resolve(false);};document.head.append(link);}).finally(()=>styleLoading.delete(href));styleLoading.set(href,p);return p;}
  async function loadLocalization(){if(window.KP_I18N){relocalize();return true;}const Native=window.MutationObserver;class NoopObserver{observe(){}disconnect(){}takeRecords(){return[];}}try{window.MutationObserver=NoopObserver;await import(`/localization.js?v=${V}`);relocalize();return true;}catch(error){console.error('VFA13 localization failed',error);return false;}finally{window.MutationObserver=Native;}}
  async function loadOne(name){const src=asset(name);if(loaded.has(src))return true;if(loading.has(src))return loading.get(src);const p=(async()=>{await Promise.all((CSS_BY_MODULE[name]||[]).map(ensureStyle));try{await import(src);loaded.add(src);relocalize();window.dispatchEvent(new CustomEvent('kp:portal-module-loaded',{detail:{name}}));return true;}catch(error){console.error('VFA13 module failed',{name,error:String(error?.message||error)});return false;}})().finally(()=>loading.delete(src));loading.set(src,p);return p;}
  async function loadList(names,workers=2){const queue=[...new Set(names)];let failures=0;const pool=Array.from({length:Math.max(1,Math.min(workers,queue.length||1))},async()=>{while(queue.length){const name=queue.shift();if(!name)return;if(!await loadOne(name))failures++;await nextFrame();}});await Promise.all(pool);return failures;}
  function requestedSection(target){const link=target?.closest?.('.portal-nav a[href^="#"]');if(link)return decodeURIComponent((link.getAttribute('href')||'').slice(1));const opener=target?.closest?.('[data-open-section]');return opener?.dataset?.openSection||'';}
  function bindInteractionLoading(){if(interactionBound)return;interactionBound=true;document.addEventListener('click',event=>{const id=requestedSection(event.target),names=PUBLIC_SECTIONS[id]||(authenticated()?AUTH_SECTIONS[id]:null);if(names?.length)void loadList(names,2);},{capture:true});}
  async function backgroundWarmup(){if(backgroundStarted)return;backgroundStarted=true;await pause(12000);await idle(4000);const features=authenticated()?[...PUBLIC_FEATURES,...AUTH_FEATURES]:PUBLIC_FEATURES;let failures=0;for(const name of features){await idle(1600);if(!await loadOne(name))failures++;await pause(document.hidden?900:300);await nextFrame();}window.dispatchEvent(new CustomEvent('kp:portal-modules-ready',{detail:{failures}}));await pause(10000);await idle(4000);void loadOne('pwa-client');}
  async function deferredLocalization(data){const stored=String(localStorage.getItem('kp_locale')||'').toLowerCase(),courseLocale=String(data?.course?.locale||'de').toLowerCase();if((stored&&stored!=='de')||(!stored&&!courseLocale.startsWith('de'))){await loadLocalization();return;}await pause(2200);await idle(2500);void loadLocalization();}
  function boot(){if(bootPromise)return bootPromise;bootPromise=(async()=>{await nextFrame();currentData=window.__KP_PORTAL_DATA||null;if(!currentData){await Promise.all([loadLocalization(),loadList(GATE_SUPPORT,2)]);return;}performance.mark?.('kp-vfa13-base-visible');bindInteractionLoading();void deferredLocalization(currentData);await idle(650);await loadList(CORE_ENHANCERS,2);await idle(1200);void loadOne('student-dashboard-v2');void backgroundWarmup();})();return bootPromise;}

  window.KPStudentModules={loadOne,loadList,isLoaded:name=>loaded.has(asset(name))};
  window.addEventListener('kp:portal-data',event=>{currentData=event.detail?.data||currentData;relocalize();});
  window.addEventListener('kp:localechange',relocalize);
  window.addEventListener('kp:portal-base-ready',()=>void boot(),{once:true});
  if(window.__KP_PORTAL_BASE_PROMISE)window.__KP_PORTAL_BASE_PROMISE.then(()=>void boot()).catch(()=>{});
}
