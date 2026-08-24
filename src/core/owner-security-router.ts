import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { cancelOwnerTenantDeletion, finalizeOwnerTenantDeletion, ownerSystemHealth, requestOwnerTenantDeletion } from './owner-cockpit.js';
import { handlePlatformAccountingApi } from './platform-accounting-router.js';
import { handlePlatformAccountingAutopilotApi } from './platform-accounting-autopilot-router.js';
import { assertSameOrigin, json } from './utils.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown):Response{const code=String((e as Error)?.message||'INTERNAL_ERROR');const status=code==='UNAUTHENTICATED'?401:code==='FORBIDDEN'||code.includes('ADMIN_REQUIRED')||code==='CURRENT_PASSWORD_INVALID'||code==='PLATFORM_ORIGIN_MISMATCH'?403:code.includes('NOT_FOUND')?404:code.includes('EXPIRED')?410:code.includes('LOCKED')||code==='LOGIN_RATE_LIMITED'?429:code.includes('ALREADY')||code.includes('GRACE_PERIOD')||code==='ACTIVE_BILLING_MUST_END_FIRST'?409:code.includes('REQUIRED')||code.includes('INVALID')?400:500;return json({ok:false,error:code},status);}

export async function handleOwnerSecurityApi(request:Request,env:Env):Promise<Response|null>{
  const autopilot=await handlePlatformAccountingAutopilotApi(request,env);if(autopilot)return autopilot;
  const accounting=await handlePlatformAccountingApi(request,env);if(accounting)return accounting;
  const u=new URL(request.url);
  if(!u.pathname.startsWith('/api/platform/owner/'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);
    if(u.pathname==='/api/platform/owner/health'&&request.method==='GET')return json({ok:true,health:await ownerSystemHealth(env,auth)});
    const requestDeletion=u.pathname.match(/^\/api\/platform\/owner\/tenants\/([^/]+)\/deletion$/);
    if(requestDeletion&&request.method==='POST')return json({ok:true,deletion:await requestOwnerTenantDeletion(env,auth,decodeURIComponent(requestDeletion[1]),await body(request))},201);
    const deletionAction=u.pathname.match(/^\/api\/platform\/owner\/tenants\/([^/]+)\/deletion\/([^/]+)\/(cancel|finalize)$/);
    if(deletionAction&&request.method==='POST'){const tenantId=decodeURIComponent(deletionAction[1]),requestId=decodeURIComponent(deletionAction[2]);if(deletionAction[3]==='cancel')return json({ok:true,...await cancelOwnerTenantDeletion(env,auth,tenantId,requestId)});return json({ok:true,...await finalizeOwnerTenantDeletion(env,auth,tenantId,requestId,await body(request))});}
    return null;
  }catch(e){return fail(e);}
}
