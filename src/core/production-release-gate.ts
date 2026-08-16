import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { verifyPassword } from './auth.js';
import { createMfaChallenge, ownerMfaEnabled, verifyMfaChallenge } from './mfa.js';
import { requirePlatform } from './permissions.js';
import { productionReadiness } from './launch-readiness.js';
import { currentWorkerVersion, ensureProductionReleaseSchema, productionOriginStatus } from './production-release-state.js';
import { nowIso } from './utils.js';

async function ownerStepUp(env:Env,auth:CoreAuthContext,password:unknown,mfaCode:unknown):Promise<void>{
  requirePlatform(auth);
  const current=String(password??'');if(!current)throw new Error('CURRENT_PASSWORD_REQUIRED');
  const user=await env.DB.prepare("SELECT password_hash FROM users WHERE id=? AND status='active' AND is_platform_admin=1").bind(auth.userId).first<{password_hash:string}>();
  if(!user||!(await verifyPassword(current,user.password_hash)))throw new Error('CURRENT_PASSWORD_INVALID');
  if(!(await ownerMfaEnabled(env,auth.userId)))throw new Error('MFA_REQUIRED_FOR_PRODUCTION_RELEASE');
  const challenge=await createMfaChallenge(env,auth.userId);await verifyMfaChallenge(env,challenge,mfaCode);
}

export async function releaseStateForOwner(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);await ensureProductionReleaseSchema(env);
  const origin=productionOriginStatus(env),version=currentWorkerVersion(env);
  let approval:null|{approved_at:string;approved_by:string;revoked_at:string|null;revoked_by:string|null}=null;
  if(version&&origin.origin){approval=await env.DB.prepare('SELECT approved_at,approved_by,revoked_at,revoked_by FROM production_release_approvals WHERE version_id=? AND app_origin=?').bind(version.id,origin.origin).first<typeof approval extends infer _T ? any : never>() as typeof approval;}
  return{production:origin.ok,origin,version,approved:!!approval&&!approval.revoked_at,approval};
}

export async function approveProductionRelease(env:Env,auth:CoreAuthContext,input:Record<string,unknown>){
  requirePlatform(auth);await ensureProductionReleaseSchema(env);
  if(String(input.confirmation||'')!=='LIVE FREIGEBEN')throw new Error('LIVE_RELEASE_CONFIRMATION_REQUIRED');
  const origin=productionOriginStatus(env);if(!origin.ok)throw new Error('PRODUCTION_ORIGIN_NOT_READY');
  const version=currentWorkerVersion(env);if(!version)throw new Error('WORKER_VERSION_METADATA_REQUIRED');
  const readiness=await productionReadiness(env,auth);if(!readiness.ready)throw new Error('PRODUCTION_NOT_READY');
  await ownerStepUp(env,auth,input.current_password,input.mfa_code);
  const ts=nowIso();
  await env.DB.prepare(`INSERT INTO production_release_approvals(version_id,version_tag,version_timestamp,app_origin,approved_by,approved_at,readiness_json,revoked_at,revoked_by)
    VALUES(?,?,?,?,?,?,?,NULL,NULL)
    ON CONFLICT(version_id) DO UPDATE SET version_tag=excluded.version_tag,version_timestamp=excluded.version_timestamp,app_origin=excluded.app_origin,
      approved_by=excluded.approved_by,approved_at=excluded.approved_at,readiness_json=excluded.readiness_json,revoked_at=NULL,revoked_by=NULL`)
    .bind(version.id,version.tag,version.timestamp,origin.origin,auth.userId,ts,JSON.stringify(readiness)).run();
  await audit(env.DB,auth.userId,'platform.production_release_approved',undefined,undefined,'worker_version',version.id,{origin:origin.origin,versionTag:version.tag,checkedAt:readiness.checkedAt});
  return{approved:true,version,origin:origin.origin,approvedAt:ts};
}

export async function revokeProductionRelease(env:Env,auth:CoreAuthContext,input:Record<string,unknown>){
  requirePlatform(auth);await ensureProductionReleaseSchema(env);
  if(String(input.confirmation||'')!=='PRODUKTION SPERREN')throw new Error('PRODUCTION_LOCK_CONFIRMATION_REQUIRED');
  const origin=productionOriginStatus(env),version=currentWorkerVersion(env);if(!origin.ok||!version)throw new Error('PRODUCTION_RELEASE_STATE_UNAVAILABLE');
  await ownerStepUp(env,auth,input.current_password,input.mfa_code);
  const ts=nowIso(),result=await env.DB.prepare('UPDATE production_release_approvals SET revoked_at=?,revoked_by=? WHERE version_id=? AND app_origin=? AND revoked_at IS NULL').bind(ts,auth.userId,version.id,origin.origin).run();
  if(Number((result.meta as {changes?:number}|undefined)?.changes||0)!==1)throw new Error('PRODUCTION_RELEASE_NOT_ACTIVE');
  await audit(env.DB,auth.userId,'platform.production_release_revoked',undefined,undefined,'worker_version',version.id,{origin:origin.origin});
  return{revoked:true,version,origin:origin.origin,revokedAt:ts};
}
