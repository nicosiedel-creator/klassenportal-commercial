(()=> {
  if(window.__kpPortalFetchWarmupInstalled)return;
  window.__kpPortalFetchWarmupInstalled=true;
  const nativeFetch=window.fetch.bind(window);
  const parts=location.pathname.split('/').filter(Boolean);
  if(parts[0]!=='portal'||!parts[1]||!parts[2])return;
  const tenant=decodeURIComponent(parts[1]),course=decodeURIComponent(parts[2]);
  const encTenant=encodeURIComponent(tenant),encCourse=encodeURIComponent(course);
  const metaPath=`/public/${encTenant}/${encCourse}/meta`;
  const overviewPath=`/public/${encTenant}/${encCourse}/overview`;
  const legacyCode=new URLSearchParams(location.search).get('code')||'';
  let storedCode='';try{storedCode=sessionStorage.getItem(`kp_access_${tenant}_${course}`)||'';}catch{}
  const accessCode=legacyCode||storedCode;
  const cache=new Map();
  const now=()=>Date.now();

  function requestInfo(input,init={}){
    const request=input instanceof Request?input:null;
    const url=new URL(request?.url||String(input),location.origin);
    const method=String(init.method||request?.method||'GET').toUpperCase();
    const headers=new Headers(request?.headers||{});
    if(init.headers)new Headers(init.headers).forEach((v,k)=>headers.set(k,v));
    return {url,method,headers};
  }
  function cacheKey(url,headers){
    if(url.origin!==location.origin)return'';
    if(url.pathname===metaPath)return`meta:${metaPath}`;
    if(url.pathname===overviewPath)return`overview:${overviewPath}:${headers.get('X-Klassenportal-Access-Code')||''}`;
    return'';
  }
  function remember(key,promise,ttl=20000){
    const entry={promise,expires:now()+ttl};
    cache.set(key,entry);
    promise.then(r=>{if(!r.ok)entry.expires=Math.min(entry.expires,now()+500);}).catch(()=>cache.delete(key));
    return entry;
  }
  function warm(url,init,key){
    if(cache.has(key))return;
    remember(key,nativeFetch(url,init),20000);
  }
  window.fetch=async function(input,init={}){
    const info=requestInfo(input,init),key=info.method==='GET'?cacheKey(info.url,info.headers):'';
    if(!key)return nativeFetch(input,init);
    const hit=cache.get(key);
    if(hit&&hit.expires>now()){
      try{return (await hit.promise).clone();}catch{cache.delete(key);}
    }
    const entry=remember(key,nativeFetch(input,init),20000);
    return (await entry.promise).clone();
  };

  const common={credentials:'same-origin',cache:'no-store'};
  warm(metaPath,common,`meta:${metaPath}`);
  warm(overviewPath,{...common,headers:accessCode?{'X-Klassenportal-Access-Code':accessCode}:{}},`overview:${overviewPath}:${accessCode}`);
})();