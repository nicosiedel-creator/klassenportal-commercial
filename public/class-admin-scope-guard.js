const KP_CLASS_ADMIN_PATH=location.pathname.replace(/\/$/,'')==='/klassen-admin';
if(KP_CLASS_ADMIN_PATH){
  const p=new URLSearchParams(location.search),scopeTenant=p.get('tenant_id')||'',scopeCourse=p.get('course_id')||'';
  if(scopeTenant)localStorage.setItem('kp_tenant',scopeTenant);
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const raw=typeof input==='string'?input:input instanceof URL?input.href:input?.url||'';
    let url;try{url=new URL(raw,location.origin);}catch{return nativeFetch(input,init);}
    const same=url.origin===location.origin;
    if(same&&scopeCourse&&url.pathname==='/api/tenant/users'&&!url.searchParams.get('course_id'))url.searchParams.set('course_id',scopeCourse);
    const requestInput=typeof input==='string'||input instanceof URL?url.href:new Request(url.href,input);
    const response=await nativeFetch(requestInput,init);
    if(!same||!response.ok||(!scopeTenant&&!scopeCourse))return response;
    if(url.pathname==='/api/platform/tenants'&&scopeTenant){
      try{const d=await response.clone().json(),rows=(d.tenants||[]).filter(x=>String(x.id)===scopeTenant);return Response.json({...d,tenants:rows},{status:response.status,headers:response.headers});}catch{return response;}
    }
    if(url.pathname==='/api/courses'&&scopeCourse){
      try{const d=await response.clone().json(),rows=(d.courses||[]).filter(x=>String(x.id)===scopeCourse);return Response.json({...d,courses:rows},{status:response.status,headers:response.headers});}catch{return response;}
    }
    if(url.pathname==='/api/tenant/users'&&scopeCourse){
      try{const d=await response.clone().json(),rows=(d.users||[]).filter(x=>String(x.course_id)===scopeCourse&&String(x.role)==='participant');return Response.json({...d,users:rows},{status:response.status,headers:response.headers});}catch{return response;}
    }
    if(url.pathname==='/api/integrations/microsoft365/feeds'&&scopeCourse&&requestInput.method!=='POST'){
      try{const d=await response.clone().json(),rows=(d.feeds||[]).filter(x=>String(x.course_id)===scopeCourse);return Response.json({...d,feeds:rows},{status:response.status,headers:response.headers});}catch{return response;}
    }
    return response;
  };
}
