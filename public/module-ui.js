const MODULE_META={
  schedule:{label:'Stundenplan',group:'Portal & Kommunikation'},
  homework:{label:'Aufgaben / Hausaufgaben',group:'Lernen & Materialien'},
  appointments:{label:'Termine',group:'Portal & Kommunikation'},
  announcements:{label:'Meldungen / Informationen',group:'Portal & Kommunikation'},
  links:{label:'Links',group:'Portal & Kommunikation'},
  files:{label:'Dateien',group:'Lernen & Materialien'},
  calendar:{label:'Kalender',group:'Portal & Kommunikation'},
  reminders:{label:'Erinnerungen',group:'Portal & Kommunikation'},
  weekly_overview:{label:'Wochenübersicht',group:'Portal & Kommunikation'},
  exams_progress:{label:'Prüfungen & Lernfortschritt',group:'Lernen & Materialien'},
  personal_grades:{label:'Persönliche Noten',group:'Lernen & Materialien'},
  learning_materials:{label:'Lernmaterialien',group:'Lernen & Materialien'},
  microsoft_teams:{label:'Microsoft Teams',group:'In Vorbereitung',planned:true},
  microsoft_365:{label:'Microsoft 365',group:'In Vorbereitung',planned:true},
  statistics:{label:'Statistiken',group:'In Vorbereitung',planned:true},
  surveys:{label:'Umfragen',group:'In Vorbereitung',planned:true},
  substitution_updates:{label:'Vertretungsänderungen',group:'In Vorbereitung',planned:true},
  custom_domain:{label:'Eigene Domain',hidden:true},
  white_label:{label:'White Label',hidden:true},
};
const MODULE_GROUPS=['Portal & Kommunikation','Lernen & Materialien','In Vorbereitung'];
let moduleUiScheduled=false;
let moduleUiBusy=false;

const moduleEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function moduleTitle(){
  return [...document.querySelectorAll('.content h2')].find(x=>x.textContent?.trim()==='Module')||null;
}

function moduleTenantId(){return document.querySelector('#tenantPick')?.value||'';}

function moduleStatusText(x,meta){
  if(meta?.planned)return 'In Vorbereitung';
  if(Number(x.available)!==1)return 'Nicht im Paket · Upgrade erforderlich';
  return x.enabled?'Aktiv':'Im Paket enthalten · derzeit ausgeblendet';
}

function moduleRow(x){
  const meta=MODULE_META[x.feature_key]||{label:x.feature_key,group:'Weitere Module'};
  const available=Number(x.available)===1;
  const planned=!!meta.planned;
  const disabled=!available||planned;
  return `<label class="item" style="display:flex;gap:10px;align-items:flex-start;justify-content:space-between">
    <span style="display:flex;gap:10px;align-items:flex-start">
      <input type="checkbox" class="kp-module-toggle" data-k="${moduleEsc(x.feature_key)}" ${x.enabled?'checked':''} ${disabled?'disabled':''}>
      <span><strong>${moduleEsc(meta.label)}</strong><div class="muted kp-module-status">${moduleEsc(moduleStatusText(x,meta))}</div></span>
    </span>
    ${!available&&!planned?'<span class="pill">Upgrade</span>':planned?'<span class="pill">Später</span>':''}
  </label>`;
}

async function saveModuleToggle(input){
  const tenantId=moduleTenantId();
  if(!tenantId)return;
  const previous=!input.checked;
  input.disabled=true;
  const status=input.closest('.item')?.querySelector('.kp-module-status');
  if(status)status.textContent='Wird gespeichert …';
  try{
    const r=await fetch(`/api/tenant/modules?tenant_id=${encodeURIComponent(tenantId)}`,{
      method:'PUT',credentials:'same-origin',headers:{'content-type':'application/json'},
      body:JSON.stringify({feature_key:input.dataset.k,enabled:input.checked}),
    });
    let d={};try{d=await r.json();}catch{}
    if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);
    if(status)status.textContent=input.checked?'Aktiv':'Im Paket enthalten · derzeit ausgeblendet';
  }catch(e){
    input.checked=previous;
    const messages={FEATURE_NOT_INCLUDED:'Dieses Modul ist nicht im gebuchten Paket enthalten.',FORBIDDEN_ROLE:'Nur Kunden-Admins dürfen Module verwalten.'};
    if(status)status.textContent=messages[e.message]||'Änderung konnte nicht gespeichert werden.';
  }finally{
    input.disabled=false;
  }
}

async function enhanceModuleView(){
  const title=moduleTitle();
  if(!title||moduleUiBusy)return;
  const tenantId=moduleTenantId();
  if(!tenantId)return;
  const content=title.closest('.content');
  const grid=content?.querySelector(':scope > .grid');
  if(!grid||grid.dataset.kpModuleEnhanced===tenantId)return;

  moduleUiBusy=true;
  try{
    const r=await fetch(`/api/tenant/modules?tenant_id=${encodeURIComponent(tenantId)}`,{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)return;
    const modules=(await r.json()).modules||[];
    const visible=modules.filter(x=>!MODULE_META[x.feature_key]?.hidden);
    const unknown=visible.some(x=>!MODULE_META[x.feature_key]);
    const groups=[...MODULE_GROUPS,...(unknown?['Weitere Module']:[])];

    grid.innerHTML=groups.map(group=>{
      const rows=visible.filter(x=>(MODULE_META[x.feature_key]?.group||'Weitere Module')===group);
      if(!rows.length)return'';
      const help=group==='In Vorbereitung'?'<p class="muted">Diese Funktionen sind bereits vorgesehen, aber noch nicht zur Nutzung freigegeben.</p>':'';
      return `<section class="card" style="grid-column:1/-1"><h3>${moduleEsc(group)}</h3>${help}<div>${rows.map(moduleRow).join('')}</div></section>`;
    }).join('');
    grid.dataset.kpModuleEnhanced=tenantId;
    grid.querySelectorAll('.kp-module-toggle:not(:disabled)').forEach(x=>x.addEventListener('change',()=>saveModuleToggle(x)));
  }finally{
    moduleUiBusy=false;
  }
}

function scheduleModuleUi(){
  if(moduleUiScheduled)return;
  moduleUiScheduled=true;
  queueMicrotask(()=>{moduleUiScheduled=false;enhanceModuleView();});
}

const moduleTarget=document.querySelector('#app')||document.body;
new MutationObserver(scheduleModuleUi).observe(moduleTarget,{subtree:true,childList:true});
document.addEventListener('change',e=>{if(e.target?.id==='tenantPick')setTimeout(scheduleModuleUi,0)});
scheduleModuleUi();
