const KP_ADMIN_ENTRY_PATH=['','/','/index.html'].includes(location.pathname.replace(/\/$/,'')||'/');

if(KP_ADMIN_ENTRY_PATH){
  let busy=false;
  let timer=0;

  function destination(user){
    if(!user||user.mustChangePassword)return'';
    if(user.isPlatformAdmin)return'/plattform-admin';
    const roles=user.tenantRoles||[];
    if(roles.some(x=>x.role==='tenant_admin'))return'/kunden-admin';
    if(roles.some(x=>x.role==='class_admin'))return'/klassen-admin';
    return'';
  }

  async function routeAdmin(){
    if(busy)return;
    busy=true;
    try{
      const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)return;
      const data=await r.json();
      const target=destination(data.user);
      if(target&&location.pathname!==target)location.replace(target);
    }catch{}finally{busy=false;}
  }

  function schedule(){
    clearTimeout(timer);
    timer=setTimeout(routeAdmin,40);
  }

  new MutationObserver(schedule).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});
  document.addEventListener('submit',schedule,true);
  void routeAdmin();
}
