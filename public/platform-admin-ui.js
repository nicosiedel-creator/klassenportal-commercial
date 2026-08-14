const PA=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let platformUser=null;
async function paJson(url,opt={}){const r=await fetch(url,{credentials:'same-origin',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok){const e=new Error(d.error||`HTTP_${r.status}`);e.data=d;throw e;}return d;}
const planName=x=>({starter:'Starter',provider:'Bildungsträger',white_label:'White-Label'})[x]||x;
const statusName=x=>({open:'Offen',processing:'Wird eingerichtet',completed:'Eingerichtet',revoked:'Widerrufen',expired:'Abgelaufen'})[x]||x;

function copyText(text,button){navigator.clipboard?.writeText(text).then(()=>{const old=button.textContent;button.textContent='Kopiert';setTimeout(()=>button.textContent=old,1300)}).catch(()=>{prompt('Einrichtungslink kopieren:',text)});}

async function openInvitations(){
  let rows=[];try{rows=(await paJson('/api/platform/onboarding-invitations')).invitations||[]}catch(e){alert(e.message);return;}
  const back=document.createElement('div');back.className='modal-back';back.innerHTML=`<div class="modal" style="width:min(980px,96vw);max-height:92vh;overflow:auto"><div class="top"><div><h3 style="margin:0">Kunden-Einrichtung</h3><div class="muted">Du gibst nur Auftrag, Paket und Empfänger vor. Die Stammdaten trägt der Kunde selbst ein.</div></div><button type="button" class="btn secondary" id="pa-close">×</button></div>
    <form id="pa-new" class="card" style="margin-top:14px"><h3>Neuen Einrichtungslink erstellen</h3><div class="row"><label class="field">Kunden-E-Mail<input name="customer_email" type="email" required placeholder="ansprechpartner@kunde.de"></label><label class="field">Paket<select name="plan_id"><option value="provider">Bildungsträger</option><option value="starter">Starter</option><option value="white_label">White-Label</option></select></label><label class="field">Gültig<select name="valid_days"><option value="7">7 Tage</option><option value="14" selected>14 Tage</option><option value="30">30 Tage</option></select></label></div><button class="btn">Einrichtungslink erzeugen</button><span id="pa-create-status" class="muted" style="margin-left:10px"></span><div id="pa-created"></div></form>
    <div class="card" style="margin-top:14px"><div class="top"><h3 style="margin:0">Einladungen</h3><button type="button" class="btn secondary" id="pa-refresh">Aktualisieren</button></div><div id="pa-list"></div></div></div>`;document.body.append(back);
  const close=()=>back.remove();back.querySelector('#pa-close').onclick=close;back.addEventListener('click',e=>{if(e.target===back)close()});
  const list=back.querySelector('#pa-list');
  function render(){list.innerHTML=rows.length?`<div class="table-wrap"><table><tr><th>E-Mail</th><th>Paket</th><th>Status</th><th>Gültig bis</th><th>Kunde</th><th></th></tr>${rows.map(r=>`<tr><td>${PA(r.customer_email)}</td><td>${PA(planName(r.plan_id))}</td><td><span class="pill">${PA(statusName(r.status))}</span></td><td>${PA(new Date(r.expires_at).toLocaleDateString('de-DE'))}</td><td>${PA(r.tenant_name||'—')}</td><td>${r.status==='open'?`<button type="button" class="btn secondary pa-revoke" data-id="${PA(r.id)}">Widerrufen</button>`:''}</td></tr>`).join('')}</table></div>`:'<p class="muted">Noch keine Einrichtungslinks.</p>';list.querySelectorAll('.pa-revoke').forEach(b=>b.onclick=async()=>{if(!confirm('Diesen Einrichtungslink wirklich widerrufen?'))return;await paJson(`/api/platform/onboarding-invitations/${encodeURIComponent(b.dataset.id)}/revoke`,{method:'POST',body:'{}'});rows=(await paJson('/api/platform/onboarding-invitations')).invitations||[];render();});}
  render();
  back.querySelector('#pa-refresh').onclick=async()=>{rows=(await paJson('/api/platform/onboarding-invitations')).invitations||[];render();};
  back.querySelector('#pa-new').onsubmit=async e=>{e.preventDefault();const status=back.querySelector('#pa-create-status'),created=back.querySelector('#pa-created');status.textContent='Link wird erstellt …';created.innerHTML='';try{const data=Object.fromEntries(new FormData(e.currentTarget));const r=await paJson('/api/platform/onboarding-invitations',{method:'POST',body:JSON.stringify(data)});status.textContent='Fertig.';created.innerHTML=`<div class="notice ok" style="margin-top:12px"><strong>Einrichtungslink für ${PA(r.customer_email)}</strong><div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap"><input id="pa-link" value="${PA(r.url)}" readonly style="min-width:min(620px,100%);flex:1"><button type="button" class="btn" id="pa-copy">Link kopieren</button></div><div class="muted" style="margin-top:6px">Diesen Link schickst Du dem Kunden. Danach erledigt er die Einrichtung selbst.</div></div>`;created.querySelector('#pa-copy').onclick=()=>copyText(r.url,created.querySelector('#pa-copy'));rows=(await paJson('/api/platform/onboarding-invitations')).invitations||[];render();e.currentTarget.reset();}catch(x){status.textContent=x.message;}};
}

let summaryBusy=false;
async function refreshPlatformOverview(){
  if(summaryBusy)return;const title=[...document.querySelectorAll('.content h2')].find(x=>x.textContent?.trim()==='Übersicht');if(!title)return;summaryBusy=true;
  try{const [ts,is]=await Promise.all([paJson('/api/platform/tenants'),paJson('/api/platform/onboarding-invitations')]);const tenants=ts.tenants||[],inv=is.invitations||[];const grid=title.closest('.content')?.querySelector('.grid');if(grid){grid.innerHTML=`<div class="card"><div class="muted">Aktive Kunden</div><div class="stat">${tenants.filter(x=>x.status==='active').length}</div></div><div class="card"><div class="muted">Offene Einrichtungen</div><div class="stat">${inv.filter(x=>x.status==='open'||x.status==='processing').length}</div></div><div class="card"><div class="muted">Insgesamt eingerichtet</div><div class="stat">${tenants.length}</div></div>`;}title.textContent='Plattformübersicht';}catch{}finally{summaryBusy=false;}
}

function applyPlatformUi(){
  if(!platformUser?.isPlatformAdmin)return;
  document.querySelectorAll('[data-v]').forEach(b=>{const key=b.dataset.v;if(['overview','tenants'].includes(key))b.style.display='';else b.style.display='none';});
  const tenants=document.querySelector('[data-v="tenants"]');if(tenants)tenants.textContent='Kunden';
  const side=document.querySelector('.side');if(side){const h=side.querySelector('h1');if(h)h.textContent='Klassenportal · Plattform';if(!side.querySelector('#pa-onboarding-nav')){const b=document.createElement('button');b.className='nav';b.id='pa-onboarding-nav';b.textContent='Kunden-Einrichtung';b.onclick=openInvitations;tenants?.after(b);}}
  document.querySelector('#tenantPick')?.remove();
  const newTenant=document.querySelector('#newTenant');if(newTenant){newTenant.style.display='none';const bar=newTenant.parentElement;if(bar&&!bar.querySelector('#pa-new-customer')){const b=document.createElement('button');b.className='btn';b.id='pa-new-customer';b.textContent='+ Kunden-Einrichtung starten';b.onclick=openInvitations;bar.prepend(b);}}
  const title=[...document.querySelectorAll('.content h2')].find(x=>x.textContent?.trim()==='Mandanten'||x.textContent?.trim()==='Kunden');if(title)title.textContent='Kunden';
  refreshPlatformOverview();
}

(async()=>{try{platformUser=(await paJson('/api/auth/me')).user;if(!platformUser?.isPlatformAdmin)return;new MutationObserver(applyPlatformUi).observe(document.documentElement,{subtree:true,childList:true});document.addEventListener('click',e=>{if(e.target?.matches?.('[data-v="overview"],[data-v="tenants"]'))setTimeout(applyPlatformUi,0)});applyPlatformUi();}catch{}})();
