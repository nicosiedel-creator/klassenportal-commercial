let sessionUser=null;
let classUiScheduled=false;

async function loadSession(){
  try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(r.ok)sessionUser=(await r.json()).user||null;}catch{}
}
function selectedTenant(){return document.querySelector('#tenantPick')?.value||'';}
function classAdminOnly(user){
  if(!user||user.isPlatformAdmin)return false;
  const roles=user.tenantRoles||[];
  return roles.some(x=>x.role==='class_admin')&&!roles.some(x=>x.role==='tenant_admin');
}
function tenantRole(tenantId){
  if(sessionUser?.isPlatformAdmin)return 'platform_admin';
  const rows=(sessionUser?.tenantRoles||[]).filter(x=>x.tenantId===tenantId);
  const rank={tenant_admin:4,class_admin:3,participant:2,guest:1};
  return [...rows].sort((a,b)=>(rank[b.role]||0)-(rank[a.role]||0))[0]?.role||null;
}
function setDisplay(el,value){if(el&&el.style.display!==value)el.style.display=value;}
function applyClassScope(){
  if(!sessionUser||sessionUser.isPlatformAdmin)return;
  const role=tenantRole(selectedTenant());
  const classOnly=role==='class_admin';
  for(const key of ['tenants','branding','modules','data'])setDisplay(document.querySelector(`[data-v="${key}"]`),classOnly?'none':'');
  setDisplay(document.querySelector('#newCourse'),classOnly?'none':'');
  if(classOnly){
    document.querySelectorAll('select[name="role"] option').forEach(o=>{if(['tenant_admin','class_admin'].includes(o.value))o.remove();});
    const active=document.querySelector('.nav.active');
    if(active&&active.style.display==='none')document.querySelector('[data-v="overview"]')?.click();
  }
}
function scheduleClassScope(){if(classUiScheduled)return;classUiScheduled=true;queueMicrotask(()=>{classUiScheduled=false;applyClassScope();});}

await loadSession();
const adminShell=['/','/kunden-admin','/kunden-admin/','/plattform-admin','/plattform-admin/'];
if(classAdminOnly(sessionUser)&&adminShell.includes(location.pathname))location.replace('/klassen-admin');
else if(sessionUser&&!sessionUser.isPlatformAdmin){
  const target=document.querySelector('#app')||document.body;
  new MutationObserver(scheduleClassScope).observe(target,{subtree:true,childList:true});
  document.addEventListener('change',e=>{if(e.target?.id==='tenantPick')setTimeout(scheduleClassScope,0)});
  applyClassScope();
}
