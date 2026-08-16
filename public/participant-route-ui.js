const PRU=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pruBusy=false,pruParticipantMode=false,pruSignature='';
async function pruJson(url){const r=await fetch(url,{credentials:'same-origin',cache:'no-store'});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
function participantOnly(user){if(!user||user.isPlatformAdmin)return false;const roles=user.tenantRoles||[];return roles.length>0&&!roles.some(x=>x.role==='tenant_admin'||x.role==='class_admin')&&roles.some(x=>x.role==='participant'||x.role==='guest');}
async function participantDestinations(user){
  const tenants=(await pruJson('/api/platform/tenants')).tenants||[],out=[];
  for(const tenant of tenants){
    let courses=[];try{courses=(await pruJson(`/api/courses?tenant_id=${encodeURIComponent(tenant.id)}`)).courses||[];}catch{}
    for(const course of courses)out.push({tenant,course,href:`/portal/${encodeURIComponent(tenant.slug)}/${encodeURIComponent(course.code)}`});
  }
  return out;
}
function renderHub(user,rows){
  const root=document.querySelector('#app');if(!root)return;pruParticipantMode=true;
  root.innerHTML=`<main class="center" style="align-items:flex-start;padding-top:7vh"><div style="width:min(760px,94vw)"><div class="card"><div class="top"><div><h2 style="margin:0">Meine Klassen & Kurse</h2><div class="muted">Hallo ${PRU(user.displayName||'')}</div></div><button class="btn secondary" id="pru-logout">Abmelden</button></div><div class="grid" style="margin-top:16px">${rows.length?rows.map(x=>`<a class="card" style="text-decoration:none;color:inherit" href="${PRU(x.href)}"><div class="muted">${PRU(x.tenant.name)}</div><h3 style="margin:5px 0 6px">${PRU(x.course.name)}</h3><div class="muted">Klassenportal öffnen →</div></a>`).join(''):'<div class="notice">Deinem Konto ist aktuell keine aktive Klasse zugeordnet.</div>'}</div></div></div></main>`;
  root.querySelector('#pru-logout')?.addEventListener('click',async()=>{try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});}catch{}location.reload();});
}
async function routeParticipant(){
  if(pruBusy)return;pruBusy=true;
  try{
    const user=(await pruJson('/api/auth/me')).user||null;if(!participantOnly(user)){pruParticipantMode=false;return;}
    const sig=`${user.userId}:${(user.tenantRoles||[]).map(x=>`${x.tenantId}:${x.courseId}:${x.role}`).sort().join('|')}`;
    if(pruParticipantMode&&sig===pruSignature&&document.querySelector('#pru-logout'))return;
    pruSignature=sig;const rows=await participantDestinations(user);
    if(rows.length===1){const target=new URL(rows[0].href,location.origin);if(location.pathname!==target.pathname)location.replace(target.pathname);return;}
    renderHub(user,rows);
  }catch{}finally{pruBusy=false;}
}
let pruTimer=0;function pruSchedule(){clearTimeout(pruTimer);pruTimer=setTimeout(routeParticipant,80);}
new MutationObserver(()=>{if(!pruParticipantMode||!document.querySelector('#pru-logout'))pruSchedule();}).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});
routeParticipant();
