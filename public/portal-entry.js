const ROOT=document.querySelector('#class-portal');
const VERSION='20260823-vfa13-commercial-1';

function fatal(message){
  if(!ROOT)return;
  ROOT.className='';
  ROOT.innerHTML=`<div class="portal-gate"><div class="portal-gate-card"><h1>Klassenportal nicht verfügbar</h1><p>${String(message||'Das Portal konnte nicht geladen werden.').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p><button class="portal-btn" type="button" id="portal-entry-reload">Neu laden</button></div></div>`;
  ROOT.querySelector('#portal-entry-reload')?.addEventListener('click',()=>location.reload());
}

const base=import(`/class-portal.js?v=${VERSION}`);
window.__KP_PORTAL_BASE_PROMISE=base;
base.then(()=>window.dispatchEvent(new CustomEvent('kp:portal-base-ready',{detail:{data:window.__KP_PORTAL_DATA||null}})))
  .catch(error=>{
    console.error('VFA13 portal base failed to load',error);
    fatal('Die Portaloberfläche konnte nicht gestartet werden. Bitte neu laden.');
    window.dispatchEvent(new CustomEvent('kp:portal-base-failed'));
  });
