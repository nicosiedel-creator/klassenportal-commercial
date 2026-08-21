(()=>{
  const nativeFetch=window.fetch.bind(window);
  const TTL=8000;
  const responseCache=new Map();
  const inflight=new Map();
  let authCache=null,authCacheAt=0;

  const requestInfo=(input,init={})=>{
    const url=typeof input==='string'?new URL(input,location.href):new URL(input.url,location.href);
    const method=String(init?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();
    return{url,method};
  };
  const startupPath=url=>url.origin===location.origin&&(url.pathname==='/api/platform/tenants'||url.pathname==='/api/courses'||url.pathname==='/api/billing/setup-progress');
  function clearBootstrapCache(){responseCache.clear();inflight.clear();authCache=null;authCacheAt=0;}
  async function cachedNative(input,init={}){
    const {url,method}=requestInfo(input,init);
    if(method!=='GET'||!startupPath(url))return nativeFetch(input,init);
    const key=url.pathname+url.search,hit=responseCache.get(key),now=Date.now();
    if(hit&&now-hit.at<TTL)return hit.response.clone();
    const running=inflight.get(key);if(running)return (await running).clone();
    const p=nativeFetch(input,init).then(r=>{if(r.ok)responseCache.set(key,{at:Date.now(),response:r.clone()});return r;}).finally(()=>inflight.delete(key));
    inflight.set(key,p);return (await p).clone();
  }
  async function tenantData(){
    try{const r=await cachedNative('/api/platform/tenants',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return[];return (await r.json()).tenants||[];}catch{return[];}
  }
  function jsonResponse(data,source){
    const headers=new Headers(source?.headers||{});headers.set('content-type','application/json; charset=utf-8');headers.set('cache-control','no-store');
    return new Response(JSON.stringify(data),{status:source?.status||200,statusText:source?.statusText||'OK',headers});
  }

  window.fetch=async(input,init={})=>{
    const {url,method}=requestInfo(input,init);
    if(method!=='GET'){
      if(url.origin===location.origin&&url.pathname.startsWith('/api/'))clearBootstrapCache();
      return nativeFetch(input,init);
    }
    if(url.origin===location.origin&&url.pathname==='/api/auth/me'){
      if(authCache&&Date.now()-authCacheAt<TTL)return jsonResponse(authCache);
      const tenantsPromise=tenantData();
      const response=await nativeFetch(input,init);if(!response.ok)return response;
      try{
        const data=await response.clone().json();
        let projected=data;
        if(data?.user?.isPlatformAdmin){
          const tenants=await tenantsPromise;
          const roles=tenants.map(t=>({tenantId:t.id,courseId:null,role:'tenant_admin'}));
          projected={...data,user:{...data.user,isPlatformAdmin:false,supportPlatformAdmin:true,tenantRoles:roles}};
        }
        authCache=projected;authCacheAt=Date.now();return jsonResponse(projected,response);
      }catch{return response;}
    }
    if(startupPath(url))return cachedNative(input,init);
    return nativeFetch(input,init);
  };

  // Warm the independent bootstrap reads in parallel before app.js starts its sequential shell bootstrap.
  void cachedNative('/api/platform/tenants',{credentials:'same-origin',cache:'no-store'}).catch(()=>{});
  try{
    const tenant=localStorage.getItem('kp_tenant');
    if(tenant){
      void cachedNative(`/api/courses?tenant_id=${encodeURIComponent(tenant)}`,{credentials:'same-origin',cache:'no-store'}).catch(()=>{});
      void cachedNative(`/api/billing/setup-progress?tenant_id=${encodeURIComponent(tenant)}`,{credentials:'same-origin',cache:'no-store'}).catch(()=>{});
    }
  }catch{}
})();