let sessionUser=null;

async function loadSession(){
  try{const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});if(r.ok)sessionUser=(await r.json()).user||null;}catch{}
}
function selectedTenant(){return document.querySelector('#tenantPick')?.value||'';}
function tenantRole(tenantId){
  if(sessionUser?.isPlatformAdmin)return 'platform_admin';
  const rows=(sessionUser?.tenantRoles||[]).filter(x=>x.tenantId===tenantId);
  const rank={tenant_admin:4,class_admin:3,participant:2,guest:1};
  return [...rows].sort((a,b)=>(rank[b.role]||0)-(rank[a.role]||0))[0]?.role||null;
}
function applyClassScope(){
  if(!sessionUser)return;
  const role=tenantRole(selectedTenant());
  const classOnly=role==='class_admin';
  for(const key of ['tenants','branding','modules','data']){
    const b=document.querySelector(`[data-v="${key}"]`);if(b)b.style.display=classOnly?'none':'';
  }
  const newCourse=document.querySelector('#newCourse');if(newCourse)newCourse.style.display=classOnly?'none':'';
  if(classOnly){
    document.querySelectorAll('select[name="role"] option').forEach(o=>{if(['tenant_admin','class_admin'].includes(o.value))o.remove();});
    const active=document.querySelector('.nav.active');
    if(active&&active.style.display==='none')document.querySelector('[data-v="overview"]')?.click();
  }
}

await loadSession();
new MutationObserver(applyClassScope).observe(document.documentElement,{subtree:true,childList:true});
document.addEventListener('change',e=>{if(e.target?.id==='tenantPick')setTimeout(applyClassScope,0)});
applyClassScope();
