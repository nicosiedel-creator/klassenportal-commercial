const KP_CLASS_ADMIN_PATH=location.pathname.replace(/\/$/,'')==='/klassen-admin';
if(KP_CLASS_ADMIN_PATH){
  const p=new URLSearchParams(location.search),scopeTenant=p.get('tenant_id')||'',scopeCourse=p.get('course_id')||'';
  if(scopeTenant)localStorage.setItem('kp_tenant',scopeTenant);
  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const raw=typeof input==='string'?input:input instanceof URL?input.href:input?.url||'';
    let url;try{url=new URL(raw,location.origin);}catch{return nativeFetch(input,init);}
    const same=url.origin===location.origin,method=String(init?.method||(typeof input==='object'&&input?.method)||'GET').toUpperCase();
    if(same&&scopeCourse&&method==='GET'&&['/api/tenant/users','/api/surveys','/api/substitutions'].includes(url.pathname)&&!url.searchParams.get('course_id'))url.searchParams.set('course_id',scopeCourse);
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
    if(url.pathname==='/api/integrations/microsoft365/feeds'&&scopeCourse&&method==='GET'){
      try{const d=await response.clone().json(),rows=(d.feeds||[]).filter(x=>String(x.course_id)===scopeCourse);return Response.json({...d,feeds:rows},{status:response.status,headers:response.headers});}catch{return response;}
    }
    if(url.pathname==='/api/modules/statistics'&&scopeCourse&&method==='GET'){
      try{const d=await response.clone().json(),s=d.statistics||{},row=(s.byCourse||[]).find(x=>String(x.id)===scopeCourse);if(!row)return Response.json({...d,statistics:{...s,courses:0,participants:0,lessons:0,homework:0,appointments:0,exams:0,announcements:0,materials:0,recentAudit:0,byCourse:[]}},{status:response.status,headers:response.headers});return Response.json({...d,statistics:{...s,courses:1,participants:Number(row.participants||0),lessons:Number(row.lessons||0),homework:Number(row.homework||0),exams:Number(row.exams||0),appointments:0,announcements:0,materials:0,recentAudit:0,byCourse:[row]}},{status:response.status,headers:response.headers});}catch{return response;}
    }
    return response;
  };
}
