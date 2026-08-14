(()=>{
  const nativeFetch=window.fetch.bind(window);
  let tenantCache=null,tenantCacheAt=0;
  async function tenantRoles(){
    if(tenantCache&&Date.now()-tenantCacheAt<30000)return tenantCache;
    try{
      const r=await nativeFetch('/api/platform/tenants',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)return[];
      const d=await r.json();
      tenantCache=(d.tenants||[]).map(t=>({tenantId:t.id,courseId:null,role:'tenant_admin'}));tenantCacheAt=Date.now();return tenantCache;
    }catch{return[];}
  }
  window.fetch=async(input,init)=>{
    const requestUrl=typeof input==='string'?new URL(input,location.href):new URL(input.url,location.href);
    const response=await nativeFetch(input,init);
    if(requestUrl.origin!==location.origin||requestUrl.pathname!=='/api/auth/me'||!response.ok)return response;
    try{
      const data=await response.clone().json();
      if(!data?.user?.isPlatformAdmin)return response;
      const roles=await tenantRoles();
      const projected={...data,user:{...data.user,isPlatformAdmin:false,supportPlatformAdmin:true,tenantRoles:roles}};
      const headers=new Headers(response.headers);headers.set('content-type','application/json; charset=utf-8');headers.set('cache-control','no-store');
      return new Response(JSON.stringify(projected),{status:response.status,statusText:response.statusText,headers});
    }catch{return response;}
  };
})();
