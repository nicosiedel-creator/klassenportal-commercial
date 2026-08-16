async function schemaJson(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}

async function initSchemaUpgrade(){
  let status;try{status=(await schemaJson('/api/platform/system/schema')).schema;}catch{return;}
  if(status?.ready)return;
  if(document.querySelector('#schema-upgrade-banner'))return;
  const banner=document.createElement('div');banner.id='schema-upgrade-banner';banner.className='notice warn';banner.style.margin='14px';banner.innerHTML=`<strong>Datenbank-Update erforderlich</strong><div style="margin-top:6px">Der neue Portalstand benötigt noch die vorbereiteten Datenbank-Erweiterungen für Managed Setup, Lernmaterialien und Benachrichtigungen.</div><button type="button" class="btn" id="schema-upgrade-button" style="margin-top:10px">Datenbank jetzt aktualisieren</button><span id="schema-upgrade-status" class="muted" style="margin-left:10px"></span>`;
  const app=document.querySelector('#app')||document.body;app.prepend(banner);
  const button=banner.querySelector('#schema-upgrade-button'),msg=banner.querySelector('#schema-upgrade-status');
  button.onclick=async()=>{button.disabled=true;msg.textContent='Update läuft …';try{const r=await schemaJson('/api/platform/system/schema',{method:'POST',body:'{}'});if(!r.schema?.ready)throw new Error('SCHEMA_NOT_READY');msg.textContent='Fertig. Seite wird neu geladen …';setTimeout(()=>location.reload(),700);}catch(e){msg.textContent=`Fehler: ${e.message}`;button.disabled=false;}};
}

initSchemaUpgrade();
