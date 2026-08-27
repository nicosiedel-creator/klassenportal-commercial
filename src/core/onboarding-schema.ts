import type { Env } from './types.js';
import { audit } from './audit.js';
import { nowIso, sha256Text } from './utils.js';

type TableColumn={name:string;notnull:number;dflt_value:string|null;pk:number};
type InvitationState={id:string;status:string;tenant_id:string|null;form_json:string|null};
type ClaimState={invitation_id:string;claimed_at:string};

const STALE_CLAIM_MS=15*60_000;

async function tableExists(env:Env,name:string):Promise<boolean>{
  return !!(await env.DB.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?").bind(name).first());
}

async function tableColumns(env:Env,name:string):Promise<Set<string>>{
  const rows=await env.DB.prepare(`PRAGMA table_info(${name})`).all<TableColumn>();
  return new Set((rows.results??[]).map(row=>String(row.name)));
}

async function requireColumns(env:Env,table:string,required:string[]):Promise<void>{
  if(!await tableExists(env,table))throw new Error('ONBOARDING_SCHEMA_INCOMPATIBLE');
  const columns=await tableColumns(env,table);
  if(required.some(column=>!columns.has(column)))throw new Error('ONBOARDING_SCHEMA_INCOMPATIBLE');
}

async function ensureRecoveryTables(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS onboarding_claims (
    invitation_id TEXT PRIMARY KEY,
    nonce TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    FOREIGN KEY(invitation_id) REFERENCES onboarding_invitations(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS onboarding_claim_tombstones (
    invitation_id TEXT PRIMARY KEY,
    completed_at TEXT NOT NULL,
    recorded_at TEXT NOT NULL,
    FOREIGN KEY(invitation_id) REFERENCES onboarding_invitations(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_onboarding_claim_tombstone_on_delete
    BEFORE DELETE ON onboarding_claims
    FOR EACH ROW
    WHEN EXISTS(SELECT 1 FROM onboarding_invitations WHERE id=OLD.invitation_id AND status='completed')
    BEGIN
      INSERT OR IGNORE INTO onboarding_claim_tombstones(invitation_id,completed_at,recorded_at)
      SELECT id,COALESCE(completed_at,CURRENT_TIMESTAMP),CURRENT_TIMESTAMP FROM onboarding_invitations WHERE id=OLD.invitation_id;
    END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_onboarding_claim_replay_guard
    BEFORE INSERT ON onboarding_claims
    FOR EACH ROW
    WHEN EXISTS(SELECT 1 FROM onboarding_claim_tombstones WHERE invitation_id=NEW.invitation_id)
    BEGIN
      SELECT RAISE(ABORT,'ONBOARDING_ALREADY_USED');
    END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_onboarding_revoke_active_claim_guard
    BEFORE UPDATE OF status ON onboarding_invitations
    FOR EACH ROW
    WHEN NEW.status='revoked' AND EXISTS(SELECT 1 FROM onboarding_claims WHERE invitation_id=OLD.id)
    BEGIN
      SELECT RAISE(ABORT,'ONBOARDING_ALREADY_IN_PROGRESS');
    END`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_onboarding_expiry_active_claim_guard
    BEFORE UPDATE OF status ON onboarding_invitations
    FOR EACH ROW
    WHEN NEW.status='expired' AND EXISTS(SELECT 1 FROM onboarding_claims WHERE invitation_id=OLD.id)
    BEGIN
      SELECT RAISE(IGNORE);
    END`).run();
}

export async function ensureOnboardingSchema(env:Env):Promise<void>{
  await requireColumns(env,'onboarding_invitations',['id','token_hash','customer_email','plan_id','status','expires_at','created_by','created_at','completed_at','tenant_id','form_json']);
  await requireColumns(env,'tenant_profiles',['tenant_id','legal_name','contact_name','contact_email','onboarding_invitation_id','updated_at']);
  await ensureRecoveryTables(env);
  await requireColumns(env,'onboarding_claims',['invitation_id','nonce','claimed_at']);
  await requireColumns(env,'onboarding_claim_tombstones',['invitation_id','completed_at','recorded_at']);
}

async function tenantUsersAvailable(env:Env):Promise<boolean>{return tableExists(env,'tenant_users');}

async function orphanTenants(env:Env,invitation:InvitationState):Promise<string[]>{
  const actorFragment=`\"actorUserId\":\"onboarding:${invitation.id}\"`;
  const rows=await env.DB.prepare(`SELECT DISTINCT tenant_id FROM provisioning_log
    WHERE tenant_id IS NOT NULL AND action='tenant_created' AND status='completed' AND instr(COALESCE(detail_json,''),?)>0`)
    .bind(actorFragment).all<{tenant_id:string}>();
  const ids=new Set((rows.results??[]).map(row=>String(row.tenant_id||'')).filter(Boolean));
  if(invitation.tenant_id)ids.add(invitation.tenant_id);
  return [...ids];
}

async function recoverInterruptedState(env:Env,invitation:InvitationState,reason:string):Promise<void>{
  const tenantIds=await orphanTenants(env,invitation),adminIds=new Set<string>();
  for(const tenantId of tenantIds){
    const protectedTenant=await env.DB.prepare("SELECT id FROM onboarding_invitations WHERE tenant_id=? AND id<>? AND status='completed' LIMIT 1").bind(tenantId,invitation.id).first();
    if(protectedTenant)throw new Error('ONBOARDING_RECOVERY_REQUIRED');
    const admins=await env.DB.prepare("SELECT DISTINCT user_id FROM memberships WHERE tenant_id=? AND role='tenant_admin'").bind(tenantId).all<{user_id:string}>();
    for(const admin of admins.results??[])adminIds.add(String(admin.user_id));
  }
  const statements=[];
  for(const tenantId of tenantIds)statements.push(env.DB.prepare('DELETE FROM tenants WHERE id=?').bind(tenantId));
  statements.push(env.DB.prepare("UPDATE onboarding_invitations SET status='open',completed_at=NULL,tenant_id=NULL,form_json=NULL WHERE id=? AND status IN ('open','processing')").bind(invitation.id));
  statements.push(env.DB.prepare('DELETE FROM onboarding_claims WHERE invitation_id=?').bind(invitation.id));
  try{await env.DB.batch(statements);}catch{throw new Error('ONBOARDING_RECOVERY_REQUIRED');}

  const tenantUsers=await tenantUsersAvailable(env);
  for(const userId of adminIds){
    const sql=tenantUsers
      ?`DELETE FROM users WHERE id=? AND is_platform_admin=0 AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=?) AND NOT EXISTS(SELECT 1 FROM tenant_users WHERE user_id=?)`
      :`DELETE FROM users WHERE id=? AND is_platform_admin=0 AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=?)`;
    const values=tenantUsers?[userId,userId,userId]:[userId,userId];
    await env.DB.prepare(sql).bind(...values).run().catch(()=>undefined);
  }
  await audit(env.DB,`onboarding:${invitation.id}`,'onboarding.recovery.completed',undefined,undefined,'onboarding_invitation',invitation.id,{reason,tenantIds}).catch(()=>undefined);
}

export async function recoverOnboardingRequestState(env:Env,token:string):Promise<void>{
  if(token.length<20||token.length>100)return;
  const hash=await sha256Text(token),invitation=await env.DB.prepare('SELECT id,status,tenant_id,form_json FROM onboarding_invitations WHERE token_hash=?').bind(hash).first<InvitationState>();
  if(!invitation)return;
  const claim=await env.DB.prepare('SELECT invitation_id,claimed_at FROM onboarding_claims WHERE invitation_id=?').bind(invitation.id).first<ClaimState>();
  if(invitation.status==='processing'&&!claim){
    await recoverInterruptedState(env,invitation,'LEGACY_PROCESSING_WITHOUT_CLAIM');
    return;
  }
  if(!claim)return;
  const claimedAt=Date.parse(String(claim.claimed_at||''));
  if(Number.isFinite(claimedAt)&&Date.now()-claimedAt<STALE_CLAIM_MS)return;
  await recoverInterruptedState(env,invitation,'STALE_CLAIM');
}

export async function onboardingSchemaStatus(env:Env):Promise<{ready:boolean;issues:string[]}>{
  const issues:string[]=[];
  try{await ensureOnboardingSchema(env);}catch{issues.push('onboarding_schema');}
  if(!issues.length){
    const requiredTriggers=['trg_onboarding_claim_tombstone_on_delete','trg_onboarding_claim_replay_guard','trg_onboarding_revoke_active_claim_guard','trg_onboarding_expiry_active_claim_guard'];
    const rows=(await env.DB.prepare(`SELECT name FROM sqlite_master WHERE type='trigger' AND name IN (${requiredTriggers.map(()=>'?').join(',')})`).bind(...requiredTriggers).all<{name:string}>()).results??[];
    const names=new Set(rows.map(row=>row.name));
    for(const trigger of requiredTriggers)if(!names.has(trigger))issues.push(trigger);
  }
  return{ready:issues.length===0,issues};
}
