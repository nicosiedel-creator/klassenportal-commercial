import type { CoreAuthContext, Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { audit } from './audit.js';
import { requireRole } from './permissions.js';
import { assertSameOrigin, json, nowIso } from './utils.js';

function moduleError(e:unknown):Response{
  const code=(e as Error)?.message||'INTERNAL_ERROR';
  const status=code==='UNAUTHENTICATED'||code==='LOGIN_REQUIRED'?401
    :code==='FORBIDDEN_ROLE'||code==='FEATURE_NOT_INCLUDED'?403
    :code==='FEATURE_NOT_FOUND'?404
    :code==='INTERNAL_ERROR'?500:400;
  return json({ok:false,error:code},status);
}

async function listModules(env:Env,auth:CoreAuthContext,tenantId:string){
  requireRole(auth,'guest');
  const r=await env.DB.prepare(`
    SELECT
      f.feature_key,
      f.enabled AS available,
      CASE
        WHEN f.enabled=1 THEN COALESCE(p.enabled,1)
        ELSE 0
      END AS enabled,
      f.source,
      COALESCE(p.updated_at,f.updated_at) AS updated_at
    FROM feature_flags f
    LEFT JOIN tenant_module_preferences p
      ON p.tenant_id=f.tenant_id AND p.feature_key=f.feature_key
    WHERE f.tenant_id=?
    ORDER BY f.feature_key
  `).bind(tenantId).all();
  return r.results??[];
}

async function setModulePreference(env:Env,auth:CoreAuthContext,tenantId:string,key:string,enabled:boolean){
  requireRole(auth,'tenant_admin');
  if(!/^[a-z0-9_]{2,80}$/.test(key))throw new Error('FEATURE_KEY_INVALID');

  const feature=await env.DB.prepare('SELECT enabled FROM feature_flags WHERE tenant_id=? AND feature_key=?')
    .bind(tenantId,key).first<{enabled:number}>();
  if(!feature)throw new Error('FEATURE_NOT_FOUND');
  if(Number(feature.enabled)!==1)throw new Error('FEATURE_NOT_INCLUDED');

  const ts=nowIso();
  await env.DB.prepare(`
    INSERT INTO tenant_module_preferences(tenant_id,feature_key,enabled,updated_at)
    VALUES(?,?,?,?)
    ON CONFLICT(tenant_id,feature_key) DO UPDATE SET
      enabled=excluded.enabled,
      updated_at=excluded.updated_at
  `).bind(tenantId,key,enabled?1:0,ts).run();

  await audit(env.DB,auth.userId,'module.preference.updated',tenantId,undefined,'feature',key,{enabled});
}

export async function handleModulePreferencesApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);
  if(u.pathname!=='/api/tenant/modules')return null;

  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    const tenantId=u.searchParams.get('tenant_id')||'';
    if(!tenantId)throw new Error('TENANT_ID_REQUIRED');
    const auth=await resolveCoreAuth(env,request,tenantId);

    if(request.method==='GET')return json({ok:true,modules:await listModules(env,auth,tenantId)});
    if(request.method==='PUT'){
      let payload:Record<string,unknown>={};
      try{payload=await request.json() as Record<string,unknown>;}catch{}
      await setModulePreference(env,auth,tenantId,String(payload.feature_key||''),payload.enabled===true);
      return json({ok:true});
    }
    return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
  }catch(e){
    return moduleError(e);
  }
}
