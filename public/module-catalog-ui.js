const MODULE_CATALOG_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';

if(MODULE_CATALOG_PATH){
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let scheduled=false,loadingTenant='',renderedTenant='';

  const sections=[
    {title:'Portal & Kommunikation',items:[
      {keys:['announcements'],label:'Meldungen & Informationen',description:'Wichtige Hinweise und aktuelle Informationen im Klassenportal veröffentlichen.'},
      {keys:['schedule'],label:'Stundenplan',description:'Unterrichtszeiten, Fächer, Räume und Lehrkräfte anzeigen.'},
      {keys:['appointments'],label:'Termine',description:'Termine und Veranstaltungen für einzelne Klassen oder den gesamten Bildungsträger.'},
      {keys:['calendar'],label:'Kalender',description:'Termine, Unterricht und Prüfungen in einer gemeinsamen Kalenderansicht bündeln.'},
      {keys:['weekly_overview'],label:'Wochenübersicht',description:'Die wichtigsten Inhalte einer Woche kompakt zusammenfassen.'},
      {keys:['reminders'],label:'Erinnerungen',description:'Teilnehmende rechtzeitig an Aufgaben, Termine und Prüfungen erinnern.'},
      {keys:['links'],label:'Links',description:'Wichtige externe Seiten und Ressourcen zentral bereitstellen.'},
    ]},
    {title:'Lernen & Materialien',items:[
      {keys:['homework'],label:'Aufgaben & Hausaufgaben',description:'Aufgaben mit Beschreibung, Fälligkeit und Abgabehinweisen verwalten.'},
      {keys:['files','learning_materials'],label:'Lernmaterialien & Dateien',description:'Unterlagen hochladen und für Klassen oder den gesamten Bildungsträger freigeben.'},
      {keys:['exams_progress'],label:'Prüfungen & Lernfortschritt',description:'Prüfungstermine, Hinweise und persönlichen Lernfortschritt im Portal abbilden.'},
      {keys:['personal_grades'],label:'Persönliche Noten',description:'Teilnehmende können private, nur für sie sichtbare Notizen zu eigenen Ergebnissen führen.'},
    ]},
  ];

  const planned=[
    ['microsoft_teams','Microsoft Teams','Teams-Anbindung und automatisierte Übergaben werden erst nach vollständiger Integrationsprüfung freigeschaltet.'],
    ['microsoft_365','Microsoft 365','Microsoft-365-Integration ist für eine spätere Ausbaustufe vorgesehen.'],
    ['statistics','Statistiken','Erweiterte Auswertungen und Nutzungsstatistiken sind noch nicht produktiv freigegeben.'],
    ['surveys','Umfragen','Umfragen werden als separates Erweiterungsmodul umgesetzt.'],
    ['substitution_updates','Vertretungsänderungen','Automatische Vertretungs- und Stundenplanänderungen sind für eine spätere Ausbaustufe vorgesehen.'],
  ];

  async function json(url,opt={}){
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});
    let d={};try{d=await r.json();}catch{}
    if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;
  }
  function tenantId(){return document.querySelector('#tenantPick')?.value||'';}
  function moduleTitle(){return document.querySelector('.content > .top h2')?.textContent?.trim()==='Module';}
  function sourceLabel(rows){
    const sources=[...new Set(rows.map(x=>String(x?.source||'')).filter(Boolean))];
    if(sources.includes('manual'))return 'Individuell eingestellt';
    if(sources.includes('trial'))return 'Testzugang';
    if(sources.includes('plan'))return 'Im Tarif enthalten';
    return 'Nicht zugeordnet';
  }
  function liveCard(item,map){
    const rows=item.keys.map(k=>map.get(k)).filter(Boolean),enabled=rows.some(x=>Number(x.enabled)===1);
    const keys=item.keys.join(',');
    return `<label class="card" style="display:flex;gap:12px;align-items:flex-start;cursor:pointer"><input type="checkbox" class="kp-module-toggle" data-keys="${esc(keys)}" ${enabled?'checked':''} style="margin-top:4px"><span style="display:block;min-width:0"><strong>${esc(item.label)}</strong><span class="muted" style="display:block;margin-top:5px;line-height:1.4">${esc(item.description)}</span><span class="pill" style="display:inline-block;margin-top:10px">${esc(sourceLabel(rows))}</span></span></label>`;
  }
  function plannedCard([,label,description]){
    return `<div class="card" style="opacity:.82"><div class="top" style="align-items:flex-start"><div><strong>${esc(label)}</strong><div class="muted" style="margin-top:5px;line-height:1.4">${esc(description)}</div></div><span class="pill">In Vorbereitung</span></div></div>`;
  }
  function markup(modules,tenant){
    const map=new Map(modules.map(x=>[String(x.feature_key),x]));
    return `<div id="kp-module-catalog" data-tenant="${esc(tenant)}">
      <div class="notice" style="margin-bottom:16px"><strong>Module für den Kunden</strong><div style="margin-top:5px">Hier werden nur Funktionen angezeigt, die tatsächlich im Portal nutzbar sind. Technische Schalter und interne Modulnamen werden nicht mehr angezeigt.</div></div>
      ${sections.map(section=>`<section style="margin-bottom:22px"><h3 style="margin:0 0 10px">${esc(section.title)}</h3><div class="grid">${section.items.map(item=>liveCard(item,map)).join('')}</div></section>`).join('')}
      <section style="margin-bottom:22px"><div class="top"><div><h3 style="margin:0">Branding & Domain</h3><div class="muted">White-Label, Logo, Farben und eine eigene Domain gehören zur Marken-/Domain-Konfiguration und nicht in die Modulschalter.</div></div><button type="button" class="btn secondary" id="kp-module-branding">Branding öffnen</button></div></section>
      <section><h3 style="margin:0 0 10px">Geplante Erweiterungen</h3><div class="grid">${planned.map(plannedCard).join('')}</div></section>
    </div>`;
  }

  async function render(force=false){
    if(!moduleTitle())return;
    const tenant=tenantId();if(!tenant)return;
    const existing=document.querySelector('#kp-module-catalog');
    const rawGrid=[...document.querySelectorAll('.content > .grid')].find(x=>!x.closest('#kp-module-catalog'));
    if(!force&&existing?.dataset.tenant===tenant&&!rawGrid)return;
    if(loadingTenant===tenant)return;loadingTenant=tenant;
    try{
      const data=await json(`/api/tenant/modules?tenant_id=${encodeURIComponent(tenant)}`),modules=data.modules||[];
      if(!moduleTitle()||tenantId()!==tenant)return;
      const html=markup(modules,tenant);
      if(rawGrid)rawGrid.outerHTML=html;
      else if(existing)existing.outerHTML=html;
      else document.querySelector('.content > .top')?.insertAdjacentHTML('afterend',html);
      renderedTenant=tenant;
      wire();
    }catch(e){
      const raw=[...document.querySelectorAll('.content > .grid')].find(x=>!x.closest('#kp-module-catalog'));
      if(raw)raw.innerHTML=`<div class="notice error">Module konnten nicht geladen werden: ${esc(e.message)}</div>`;
    }finally{if(loadingTenant===tenant)loadingTenant='';}
  }
  function wire(){
    document.querySelectorAll('.kp-module-toggle').forEach(input=>input.addEventListener('change',async e=>{
      const box=e.currentTarget,tenant=tenantId(),enabled=box.checked,keys=String(box.dataset.keys||'').split(',').filter(Boolean);
      box.disabled=true;
      try{
        await Promise.all(keys.map(feature_key=>json(`/api/tenant/modules?tenant_id=${encodeURIComponent(tenant)}`,{method:'PUT',body:JSON.stringify({feature_key,enabled})})));
        renderedTenant='';await render(true);
      }catch(err){box.checked=!enabled;alert(`Modul konnte nicht geändert werden: ${err.message}`);}finally{box.disabled=false;}
    }));
    document.querySelector('#kp-module-branding')?.addEventListener('click',()=>document.querySelector('[data-v="branding"]')?.click());
  }
  function schedule(){if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;void render();});}

  new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});
  document.addEventListener('change',e=>{if(e.target?.id==='tenantPick'){renderedTenant='';setTimeout(()=>void render(true),0);}});
  void render();
}
