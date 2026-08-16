import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { consumeAccountToken, createActivationForUser, inspectAccountToken, requestPasswordReset } from './account-recovery.js';
import { requireRole } from './permissions.js';
import { assertSameOrigin, json } from './utils.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown):Response{const code=String((e as Error)?.message||'INTERNAL_ERROR');const status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')?403:code.includes('EXPIRED')?410:code.includes('INVALID')||code.includes('REQUIRED')||code.includes('LENGTH')?400:code.includes('NOT_CONFIGURED')?503:code.includes('NOT_FOUND')?404:500;return json({ok:false,error:code},status);}
export async function handleAccountRecoveryApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);
  try{
    if(u.pathname==='/api/auth/password-reset/request'&&request.method==='POST'){assertSameOrigin(request,env.APP_ORIGIN);const b=await body(request);return json({ok:true,...await requestPasswordReset(env,request,b.email)});}
    if(u.pathname==='/api/auth/account-token'&&request.method==='GET'){const type=u.searchParams.get('type');if(type!=='activation'&&type!=='password_reset')throw new Error('ACCOUNT_TOKEN_TYPE_INVALID');return json({ok:true,...await inspectAccountToken(env,u.searchParams.get('token'),type)});}
    if(u.pathname==='/api/auth/account-token/consume'&&request.method==='POST'){assertSameOrigin(request,env.APP_ORIGIN);const b=await body(request),type=String(b.type);if(type!=='activation'&&type!=='password_reset')throw new Error('ACCOUNT_TOKEN_TYPE_INVALID');return json({ok:true,...await consumeAccountToken(env,b.token,type,b.new_password)});}
    const invite=u.pathname.match(/^\/api\/tenant\/users\/([^/]+)\/invite$/);if(invite&&request.method==='POST'){
      assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'',userId=decodeURIComponent(invite[1]);if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId);requireRole(auth,'tenant_admin');
      if(!auth.isPlatformAdmin){const member=await env.DB.prepare('SELECT id FROM memberships WHERE tenant_id=? AND user_id=? LIMIT 1').bind(tenantId,userId).first();if(!member)throw new Error('USER_NOT_FOUND');}
      return json({ok:true,...await createActivationForUser(env,auth,userId)});
    }
    return null;
  }catch(e){return fail(e);}
}
