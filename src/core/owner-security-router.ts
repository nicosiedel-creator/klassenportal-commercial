import type { Env } from './types.js';
import { getSession, issueSession, resolveCoreAuth, verifyPassword } from './auth.js';
import { beginOwnerMfaSetup, confirmOwnerMfaSetup, ownerMfaStatus, verifyMfaChallenge } from './mfa.js';
import { cancelOwnerTenantDeletion, finalizeOwnerTenantDeletion, finishOwnerMfaSetup, ownerSystemHealth, requestOwnerTenantDeletion, startOwnerMfaSetup } from './owner-cockpit.js';
import { handlePlatformAccountingApi } from './platform-accounting-router.js';
import { handlePlatformAccountingAutopilotApi } from './platform-accounting-autopilot-router.js';
import { assertSameOrigin, json, noCookie } from './utils.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown):Response{const code=String((e as Error)?.message||'INTERNAL_ERROR');const status=code==='UNAUTHENTICATED'?401:code==='FORBIDDEN'||code.includes('ADMIN_REQUIRED')||code==='CURRENT_PASSWORD_INVALID'||code==='PLATFORM_ORIGIN_MISMATCH'?403:code.includes('NOT_FOUND')?404:code.includes('EXPIRED')?410:code.includes('LOCKED')||code==='LOGIN_RATE_LIMITED'?429:code.includes('ALREADY')||code.includes('GRACE_PERIOD')||code==='ACTIVE_BILLING_MUST_END_FIRST'?409:code.includes('REQUIRED')||code.includes('INVALID')||code.includes('MFA_')?400:500;return json({ok:false,error:code},status);}
async function administrative(env:Env,user:{userId:string;isPlatformAdmin:boolean;tenantRoles:Array<{role:string}>}){if(user.isPlatformAdmin||user.tenantRoles.some(x=>x.role==='tenant_admin'||x.role==='class_admin'))return true;try{return !!await env.DB.prepare("SELECT 1 AS ok FROM teacher_portal_assignments WHERE user_id=? AND status='active' LIMIT 1").bind(user.userId).first();}catch{return false;}}

export async function handleOwnerSecurityApi(request:Request,env:Env):Promise<Response|null>{
  const autopilot=await handlePlatformAccountingAutopilotApi(request,env);if(autopilot)return autopilot;
  const accounting=await handlePlatformAccountingApi(request,env);if(accounting)return accounting;
  const u=new URL(request.url);
  if(u.pathname==='/api/auth/mfa/verify'&&request.method==='POST'){
    try{assertSameOrigin(request,env.APP_ORIGIN);const b=await body(request),userId=await verifyMfaChallenge(env,b.challenge_token,b.code),user=await env.DB.prepare("SELECT is_platform_admin,status FROM users WHERE id=?").bind(userId).first<{is_platform_admin:number;status:string}>();if(!user||user.status!=='active')throw new Error('FORBIDDEN');return issueSession(env,userId,!!user.is_platform_admin,'mfa',undefined,request);}catch(e){return fail(e);}
  }
  if(u.pathname==='/api/auth/mfa/status'&&request.method==='GET'){
    try{const session=await getSession(env,request);if(!session)throw new Error('UNAUTHENTICATED');const status=await ownerMfaStatus(env,session.userId),protectedAccess=await administrative(env,session);return json({ok:true,status:{...status,administrative:protectedAccess,required:protectedAccess&&!session.isPlatformAdmin&&session.authMethod!=='oidc',authMethod:session.authMethod||'password'}});}catch(e){return fail(e);}
  }
  if(u.pathname==='/api/auth/mfa/setup'&&request.method==='POST'){
    try{assertSameOrigin(request,env.APP_ORIGIN);const session=await getSession(env,request);if(!session)throw new Error('UNAUTHENTICATED');if(!await administrative(env,session))throw new Error('FORBIDDEN');const b=await body(request);if(session.authMethod!=='oidc'){const current=String(b.current_password||''),user=await env.DB.prepare("SELECT password_hash FROM users WHERE id=? AND status='active'").bind(session.userId).first<{password_hash:string}>();if(!current||!user||!await verifyPassword(current,user.password_hash))throw new Error('CURRENT_PASSWORD_INVALID');}const setup=await beginOwnerMfaSetup(env,session.userId,session.email);return json({ok:true,setup});}catch(e){return fail(e);}
  }
  if(u.pathname==='/api/auth/mfa/confirm'&&request.method==='POST'){
    try{assertSameOrigin(request,env.APP_ORIGIN);const session=await getSession(env,request);if(!session)throw new Error('UNAUTHENTICATED');if(!await administrative(env,session))throw new Error('FORBIDDEN');const b=await body(request),result=await confirmOwnerMfaSetup(env,session.userId,b.code);await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(session.userId).run();return json({ok:true,...result,reloginRequired:true},200,{'set-cookie':noCookie('kp_session')});}catch(e){return fail(e);}
  }
  if(!u.pathname.startsWith('/api/platform/owner/')&&!u.pathname.startsWith('/api/platform/security/'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);
    if(u.pathname==='/api/platform/owner/health'&&request.method==='GET')return json({ok:true,health:await ownerSystemHealth(env,auth)});
    if(u.pathname==='/api/platform/security/mfa/setup'&&request.method==='POST')return json({ok:true,setup:await startOwnerMfaSetup(env,auth,await body(request))});
    if(u.pathname==='/api/platform/security/mfa/confirm'&&request.method==='POST'){const result=await finishOwnerMfaSetup(env,auth,await body(request));return json({ok:true,...result,reloginRequired:true},200,{'set-cookie':noCookie('kp_session')});}
    const requestDeletion=u.pathname.match(/^\/api\/platform\/owner\/tenants\/([^/]+)\/deletion$/);
    if(requestDeletion&&request.method==='POST')return json({ok:true,deletion:await requestOwnerTenantDeletion(env,auth,decodeURIComponent(requestDeletion[1]),await body(request))},201);
    const deletionAction=u.pathname.match(/^\/api\/platform\/owner\/tenants\/([^/]+)\/deletion\/([^/]+)\/(cancel|finalize)$/);
    if(deletionAction&&request.method==='POST'){const tenantId=decodeURIComponent(deletionAction[1]),requestId=decodeURIComponent(deletionAction[2]);if(deletionAction[3]==='cancel')return json({ok:true,...await cancelOwnerTenantDeletion(env,auth,tenantId,requestId)});return json({ok:true,...await finalizeOwnerTenantDeletion(env,auth,tenantId,requestId,await body(request))});}
    return null;
  }catch(e){return fail(e);}
}