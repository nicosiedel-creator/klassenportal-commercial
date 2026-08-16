import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { applyReleaseSchema, releaseSchemaStatus } from './runtime-schema.js';
import { assertSameOrigin, json } from './utils.js';

function error(e:unknown):Response{
  const code=(e as Error)?.message||'INTERNAL_ERROR';
  const status=code==='UNAUTHENTICATED'?401:code==='PLATFORM_ADMIN_REQUIRED'||code==='FORBIDDEN'?403:500;
  return json({ok:false,error:code},status);
}

export async function handleRuntimeSchemaApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);
  if(u.pathname!=='/api/platform/system/schema')return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    const auth=await resolveCoreAuth(env,request);
    if(request.method==='GET')return json({ok:true,schema:await releaseSchemaStatus(env,auth)});
    if(request.method==='POST')return json({ok:true,schema:await applyReleaseSchema(env,auth)});
    return new Response('Methode nicht erlaubt',{status:405});
  }catch(e){return error(e);}
}
