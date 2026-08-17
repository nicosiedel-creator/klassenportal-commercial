const KP_ADMIN_ENTRY_PATH=['','/','/index.html'].includes(location.pathname.replace(/\/$/,'')||'/');

if(KP_ADMIN_ENTRY_PATH){
  let busy=false;
  let timer=0;

  function hasContinuation(){
    const value=new URLSearchParams(location.search).get('continue')||'';
    if(!value)return false;
    try{
      const u=new URL(value,location.origin);
      return u.origin===location.origin;
    }catch{return false;}
  }

  function destination(user){
    if(!user||user.mustChangePassword||hasContinuation())return'';
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
