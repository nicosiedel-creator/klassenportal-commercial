const TARGETED_PORTAL_PATH=/^\/portal\/[^/]+\/[^/]+\/?$/.test(location.pathname);
if(TARGETED_PORTAL_PATH){
  const E=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
  const fmt=v=>v?new Date(v).toLocaleString('de-DE'):'—';
  let currentContext=null,loading=false,loadedKey='';
  function contextFromPortal(data){if(!['participant','guest'].includes(data?.viewer?.role)||!data.viewer?.tenantId||!data.course?.id)return null;return{tenantId:String(data.viewer.tenantId),courseId:String(data.course.id)};}
  async function load(ctx=currentContext,force=false){
    if(!ctx||loading)return;const key=`${ctx.tenantId}:${ctx.courseId}`;if(!force&&loadedKey===key)return;loading=true;
    try{const data=await api(`/api/communications/my?tenant_id=${encodeURIComponent(ctx.tenantId)}&course_id=${encodeURIComponent(ctx.courseId)}`);loadedKey=key;render(ctx,data.messages||[]);}catch{}finally{loading=false;}
  }
  function render(ctx,messages){
    let host=document.querySelector('#portal-personal-messages');if(!messages.length){host?.remove();return;}
    if(!host){host=document.createElement('section');host.id='portal-personal-messages';host.className='portal-section wide';const main=document.querySelector('.portal-main'),hero=main?.querySelector('.portal-hero');if(hero?.nextSibling)hero.parentNode.insertBefore(host,hero.nextSibling);else main?.prepend(host);}
    const urgent=messages.filter(x=>x.priority==='urgent').length,needsAck=messages.filter(x=>x.require_ack&&!x.acknowledged_at).length;
    host.innerHTML=`<div class="portal-section-head"><h2>Für Dich</h2><span>${messages.length}${needsAck?` · ${needsAck} zu bestätigen`:''}</span></div><div class="portal-list">${messages.map(m=>`<article class="portal-item${m.read_at?'':' portal-unread'}" data-personal-message="${E(m.id)}" style="border-left:${m.priority==='urgent'?'5px solid currentColor':m.priority==='important'?'3px solid currentColor':'inherit'}"><div class="portal-item-top"><div><strong>${m.priority==='urgent'?'⚠️ ':''}${E(m.title)}</strong><div class="meta">${E(fmt(m.published_at))} · Nur für die festgelegten Empfänger${m.ends_at?` · bis ${E(fmt(m.ends_at))}`:''}</div></div><span class="portal-pill">${E(({urgent:'Dringend',important:'Wichtig',normal:'Persönlich',info:'Information'})[m.priority]||'Persönlich')}</span></div><div class="body" style="white-space:pre-wrap;margin-top:8px">${E(m.body)}</div>${m.require_ack?`<div class="portal-notification-actions" style="margin-top:12px">${m.acknowledged_at?`<span class="portal-pill">✓ Bestätigt ${E(fmt(m.acknowledged_at))}</span>`:`<button class="portal-btn" type="button" data-ack="${E(m.id)}">Gelesen & verbindlich bestätigen</button>${m.ack_due_at?`<span class="meta">Bitte bis ${E(fmt(m.ack_due_at))}</span>`:''}`}</div>`:m.require_read&&!m.read_at?`<div class="portal-notification-actions" style="margin-top:12px"><button class="portal-btn secondary" type="button" data-read="${E(m.id)}">Als gelesen markieren</button></div>`:m.read_at?'<div class="meta" style="margin-top:8px">✓ Gelesen</div>':''}</article>`).join('')}</div>`;
    if(urgent)requestAnimationFrame(()=>host.scrollIntoView({block:'nearest'}));
    host.querySelectorAll('[data-read]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{await api(`/api/communications/${encodeURIComponent(b.dataset.read)}/read?tenant_id=${encodeURIComponent(ctx.tenantId)}&course_id=${encodeURIComponent(ctx.courseId)}`,{method:'PATCH',body:'{}'});await load(ctx,true);}catch{b.disabled=false;}});
    host.querySelectorAll('[data-ack]').forEach(b=>b.onclick=async()=>{if(!confirm('Bestätigst Du, dass Du diese Meldung gelesen und zur Kenntnis genommen hast?'))return;b.disabled=true;try{await api(`/api/communications/${encodeURIComponent(b.dataset.ack)}/ack?tenant_id=${encodeURIComponent(ctx.tenantId)}&course_id=${encodeURIComponent(ctx.courseId)}`,{method:'POST',body:'{}'});await load(ctx,true);}catch{b.disabled=false;}});
  }
  function onPortalData(data){currentContext=contextFromPortal(data);loadedKey='';if(currentContext)void load(currentContext);else document.querySelector('#portal-personal-messages')?.remove();}
  window.addEventListener('kp:portal-data',event=>onPortalData(event.detail?.data));
  if(window.__KP_PORTAL_DATA)onPortalData(window.__KP_PORTAL_DATA);
}
