const KP_PLATFORM_LAZY_PATH=location.pathname.replace(/\/$/,'')==='/plattform-admin';
if(KP_PLATFORM_LAZY_PATH){
  const V='20260822-platform-perf-1';
  const asset=name=>`/${name}.js?v=${V}`;
  const GROUPS={
    owner:['platform-owner-ui'].map(asset),
    offers:['platform-offers-ui','platform-offer-admin-preview-ui','platform-offer-accepted-link-ui'].map(asset),
    legal:['legal-owner-ui'].map(asset),
    release:['launch-readiness-ui'].map(asset),
    security:['owner-security-ui','schema-upgrade-ui'].map(asset),
    finance:['platform-accounting-ui','platform-accounting-autopilot-ui','module-pricing-platform-ui','commerce-safe-ui'].map(asset),
    integrations:['custom-domain-ui'].map(asset),
    operations:['branding-assistant','timetable-assistant','timetable-bulk-v3','class-role-ui','area-mode'].map(asset)
  };
  const CONFIG={
    offers:{label:'Angebote',i18n:'offers',target:'#platform-offers-nav'},
    legal:{label:'Recht & Datenschutz',i18n:'legal_privacy',target:'#legal-owner-nav'},
    release:{label:'Live-Freigabe',i18n:'live_release',target:'#release-readiness-nav'},
    security:{label:'System & Sicherheit',i18n:'system_security',target:'#owner-security-nav'},
    finance:{label:'Buchhaltung & Finanzen',i18n:'accounting_finance',target:'#platform-accounting-nav'},
    integrations:{label:'Domains & Integrationen',i18n:'integrations',target:null}
  };
  const loaded=new Set(),loading=new Map(),groupPromises=new Map();
  const pause=()=>new Promise(resolve=>setTimeout(resolve,0));
  function note(message,kind='ok'){
    let n=document.querySelector('#kp-platform-module-status');
    if(!n){n=document.createElement('div');n.id='kp-platform-module-status';n.setAttribute('role','status');n.setAttribute('aria-live','polite');n.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2600;max-width:360px;padding:9px 12px;border:1px solid #dbe3ec;border-radius:8px;background:#fff;color:#172033;box-shadow:0 8px 24px #0002;font:13px/1.35 system-ui';document.body.append(n);}
    n.textContent=message;n.dataset.kind=kind;clearTimeout(note.timer);note.timer=setTimeout(()=>n?.remove(),kind==='warn'?7000:2200);
  }
  async function loadOne(src){if(loaded.has(src))return true;if(loading.has(src))return loading.get(src);const p=(async()=>{try{await import(src);loaded.add(src);return true;}catch(error){console.error('Platform module failed to load',{src,error:String(error?.message||error)});return false;}finally{loading.delete(src);}})();loading.set(src,p);return p;}
  function loadGroup(group){if(groupPromises.has(group))return groupPromises.get(group);const modules=GROUPS[group];if(!modules)return Promise.resolve(false);const p=(async()=>{const t=window.KP_PLATFORM_I18N?.t||((k)=>({loading_area:'Bereich wird geladen …',load_failed:'Bereich konnte nicht geladen werden.',area_ready:'Bereich geladen.'})[k]||k);note(t('loading_area'));const queue=[...modules];let failures=0;const workers=Array.from({length:2},async()=>{while(queue.length){const src=queue.shift();if(!src)return;if(!await loadOne(src))failures++;await pause();}});await Promise.all(workers);window.dispatchEvent(new CustomEvent('kp:platform-modules-group-ready',{detail:{group,failures}}));note(t(failures?'load_failed':'area_ready'),failures?'warn':'ok');return failures===0;})().finally(()=>groupPromises.delete(group));groupPromises.set(group,p);return p;}
  function launcher(group,config){const b=document.createElement('button');b.type='button';b.className='nav kp-platform-lazy-launcher';b.dataset.platformLoad=group;b.dataset.platformI18n=config.i18n;b.textContent=window.KP_PLATFORM_I18N?.t?.(config.i18n)||config.label;b.onclick=async()=>{b.disabled=true;const ok=await loadGroup(group);b.disabled=false;if(!ok)return;const target=config.target?document.querySelector(config.target):null;if(target&&target!==b){b.remove();target.click();}else if(config.target&&document.querySelector(config.target)){b.remove();}};return b;}
  function ensureLaunchers(){const side=document.querySelector('.side');if(!side)return;const spacer=side.querySelector('.spacer'),logout=side.querySelector('#logout');for(const [group,config] of Object.entries(CONFIG)){if(document.querySelector(config.target||`[data-platform-load="${group}"]`))continue;if(side.querySelector(`[data-platform-load="${group}"]`))continue;const b=launcher(group,config);side.insertBefore(b,spacer||logout||null);}window.KP_PLATFORM_I18N?.apply?.();}
  async function maybeOwner(event){if(event?.detail?.view!=='tenants'&&!document.querySelector('[data-v="tenants"].active'))return;await loadGroup('owner');}
  window.KPPlatformModules={loadGroup};
  window.addEventListener('kp:app-rendered',event=>{ensureLaunchers();void maybeOwner(event);});
  window.addEventListener('kp:platform-ui-applied',ensureLaunchers);
  window.addEventListener('kp:localechange',ensureLaunchers);
  ensureLaunchers();
}
