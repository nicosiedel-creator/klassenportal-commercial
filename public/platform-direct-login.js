const PLATFORM_DIRECT_PATH=location.pathname.replace(/\/$/,'')==='/plattform-admin';

if(PLATFORM_DIRECT_PATH){
  let loginAttempt=false;
  let checking=false;
  let timer=0;

  async function checkSession(){
    if(!loginAttempt||checking)return;
    checking=true;
    try{
      const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)return;
      const user=(await r.json()).user||null;
      if(!user)return;
      loginAttempt=false;
      if(user.isPlatformAdmin){
        location.reload();
        return;
      }
      const roles=user.tenantRoles||[];
      if(roles.some(x=>x.role==='tenant_admin'))location.replace('/kunden-admin');
      else if(roles.some(x=>x.role==='class_admin'))location.replace('/klassen-admin');
      else location.replace('/');
    }catch{}finally{checking=false;}
  }

  function poll(){
    clearInterval(timer);
    timer=setInterval(checkSession,250);
    void checkSession();
  }

  document.addEventListener('submit',e=>{
    const form=e.target;
    if(!(form instanceof HTMLFormElement))return;
    if(!form.querySelector('input[name="email"]')||!form.querySelector('input[name="password"]'))return;
    loginAttempt=true;
    poll();
  },true);

  window.addEventListener('beforeunload',()=>clearInterval(timer));
}
