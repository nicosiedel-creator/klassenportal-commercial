const PATH=location.pathname.replace(/\/$/,'');
if(PATH==='/kunden-admin'){
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const originalFetch=window.fetch.bind(window);
  const inflight=new Map();
  window.fetch=function(input,opt={}){
    const method=String(opt?.method||'GET').toUpperCase();
    const url=typeof input==='string'?input:input?.url||String(input);
    if(method!=='GET'||!String(url).startsWith('/api/'))return originalFetch(input,opt);
    const key=`GET ${url}`;
    const active=inflight.get(key);if(active)return active.then(r=>r.clone());
    const p=originalFetch(input,opt).finally(()=>inflight.delete(key));inflight.set(key,p);return p.then(r=>r.clone());
  };

  function navButton(pattern){return [...document.querySelectorAll('button.nav,button[data-view],.side button')].find(b=>pattern.test(String(b.dataset.customerNavSourceLabel||b.textContent||'')));}
  function openArea(pattern){const b=navButton(pattern);if(b){b.click();b.scrollIntoView?.({block:'nearest'});return true;}return false;}
  function operationsHub(){
    const section=document.createElement('section');section.id='kp-operations-hub';section.className='card';section.style.marginTop='16px';
    section.innerHTML=`<div class="top"><div><h3 style="margin:0">Planung & Daten</h3><div class="muted" style="margin-top:4px">Die Einrichtung ist abgeschlossen. Hier pflegst du jetzt den laufenden Betrieb.</div></div><span class="pill">Betrieb</span></div><div class="grid" style="margin-top:14px"><div class="card"><strong>Stunden- & Raumpläne</strong><div class="muted" style="margin:6px 0 10px">Neue oder geänderte Pläne einspielen, Räume pflegen und Änderungen vor der Übernahme prüfen.</div><button class="btn secondary" type="button" data-kp-op="plans">Planung öffnen</button></div><div class="card"><strong>Organisation & Zuständigkeiten</strong><div class="muted" style="margin:6px 0 10px">Bereiche, Verantwortliche, Vertretungen und organisatorische Änderungen aktuell halten.</div><button class="btn secondary" type="button" data-kp-op="org">Organisation öffnen</button></div><div class="card"><strong>Teilnehmer & Personal</strong><div class="muted" style="margin:6px 0 10px">Änderungen an Teilnehmern, Rollen und Personal gesammelt einspielen oder kontrollieren.</div><button class="btn secondary" type="button" data-kp-op="people">Personen öffnen</button></div><div class="card"><strong>Daten, Import & Sicherung</strong><div class="muted" style="margin:6px 0 10px">Importe, Exporte und Sicherungen zentral verwalten.</div><button class="btn secondary" type="button" data-kp-op="data">Datenbereich öffnen</button></div></div>`;
    section.querySelector('[data-kp-op="plans"]').onclick=()=>openArea(/Stundenplan|Planung|Räume\s*&\s*Ressourcen/i);
    section.querySelector('[data-kp-op="org"]').onclick=()=>openArea(/Organisation|Struktur|Verantwortliche/i);
    section.querySelector('[data-kp-op="people"]').onclick=()=>openArea(/Teilnehmer importieren|Benutzer\s*&\s*Rollen|Personal/i);
    section.querySelector('[data-kp-op="data"]').onclick=()=>openArea(/Daten|Import.*Export|Backup|Sicherung/i);
    return section;
  }
  function setupReady(progress){
    if(!progress)return false;
    if(progress.dataset.setupReady==='1'||progress.dataset.setupComplete==='1')return true;
    const text=String(progress.textContent||'');return /Grundkonfiguration einsatzbereit|4\s+von\s+4\s+Schritten erledigt|100\s*%|Einrichtung abgeschlossen/i.test(text);
  }
  function replaceCompletedSetup(){
    const content=document.querySelector('.content');if(!content)return;
    const progress=content.querySelector('#kp-setup-progress');if(!setupReady(progress))return;
    progress.style.display='none';
    content.querySelector('#kp-setup-preparation')?.remove();
    if(content.querySelector('#kp-operations-hub'))return;
    const grid=content.querySelector('.grid');const anchor=grid||progress;anchor?.insertAdjacentElement('afterend',operationsHub());
  }
  function fixDepartmentLinks(root=document){
    root.querySelectorAll?.('a[href*="fachbereichsleitung.html"]').forEach(a=>{const u=new URL(a.href,location.origin);u.pathname='/department-lead.html';a.href=u.pathname+u.search;a.textContent=a.textContent?.replace('Fachbereichsportal','Fachbereichsportal')||'Fachbereichsportal ↗';});
    root.querySelectorAll?.('.notice,.muted').forEach(n=>{if(n.children.length)return;if(String(n.textContent||'').includes('/fachbereichsleitung.html'))n.textContent=n.textContent.replace('/fachbereichsleitung.html','/department-lead.html');});
  }
  function renameAssistant(root=document){
    root.querySelectorAll?.('button,h3,strong,.brand').forEach(n=>{if(n.children.length)return;const t=String(n.textContent||'');if(t.includes('Vorsprung'))n.textContent=t.replace(/Vorsprung/g,'Arbeitsassistent');});
    root.querySelectorAll?.('.error,.notice,.eo-os-note,[role="alert"]').forEach(n=>{if(String(n.textContent||'').trim()==='TENANT_ADMIN_REQUIRED')n.textContent='Der Kundenadmin-Arbeitsbereich dieses Bildungsträgers ist für diese Aktion nicht aktiv. Wechsle in den Kundenadmin des gewünschten Bildungsträgers und öffne den Arbeitsassistenten dort erneut.';});
  }
  function apply(root=document){replaceCompletedSetup();fixDepartmentLinks(root);renameAssistant(root);}
  let queued=false;new MutationObserver(ms=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)apply(n);replaceCompletedSetup();});}).observe(document.body,{subtree:true,childList:true});
  document.addEventListener('click',e=>{
    const b=e.target.closest?.('button[data-copy]');if(!b)return;const modal=b.closest('.modal');const a=modal?.querySelector('a[href*="department-lead.html"]');if(!a)return;e.preventDefault();e.stopImmediatePropagation();const url=new URL(a.href,location.origin).href;navigator.clipboard?.writeText(url).then(()=>b.textContent='Kopiert ✓').catch(()=>prompt('Link kopieren:',url));
  },true);
  apply();
}
