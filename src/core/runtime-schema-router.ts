import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { applyReleaseSchema, releaseSchemaStatus } from './runtime-schema.js';
import { getPortalLayout, resetPortalLayout, savePortalLayout } from './portal-layout.js';
import { assertSameOrigin, json } from './utils.js';

function error(e:unknown):Response{
  const code=(e as Error)?.message||'INTERNAL_ERROR';
  const status=code==='UNAUTHENTICATED'?401:code==='PLATFORM_ADMIN_REQUIRED'||code==='FORBIDDEN'?403:code.includes('NOT_FOUND')?404:code.includes('INVALID')||code.includes('REQUIRED')?400:500;
  return json({ok:false,error:code},status);
}
async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}

export async function handleRuntimeSchemaApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);
  if(u.pathname==='/api/personal/portal-layout'){
    try{
      assertSameOrigin(request,env.APP_ORIGIN);
      const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||'';
      if(!tenantId)throw new Error('TENANT_ID_REQUIRED');if(!courseId)throw new Error('COURSE_ID_REQUIRED');
      const auth=await resolveCoreAuth(env,request,tenantId,courseId);
      if(request.method==='GET')return json({ok:true,order:await getPortalLayout(env,auth,tenantId,courseId)});
      if(request.method==='PUT')return json({ok:true,order:await savePortalLayout(env,auth,tenantId,courseId,await body(request))});
      if(request.method==='DELETE'){await resetPortalLayout(env,auth,tenantId,courseId);return json({ok:true,order:[]});}
      return new Response('Methode nicht erlaubt',{status:405});
    }catch(e){return error(e);}
  }
  if(u.pathname!=='/api/platform/system/schema')return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    const auth=await resolveCoreAuth(env,request);
    if(request.method==='GET')return json({ok:true,schema:await releaseSchemaStatus(env,auth)});
    if(request.method==='POST')return json({ok:true,schema:await applyReleaseSchema(env,auth)});
    return new Response('Methode nicht erlaubt',{status:405});
  }catch(e){return error(e);}
}
