import type { Env } from './types.js';
import { audit } from './audit.js';
import { nowIso, sha256Text } from './utils.js';

type InvitationState={id:string;status:string;tenant_id:string|null};
type ClaimState={invitation_id:string;claimed_at:string};

const STALE_CLAIM_MS=15*60_000;

// Canonical trigger program installed by migration 0090.
const RECOVERY_TRIGGERS=['trg_onboarding_claim_tombstone_on_delete','trg_onboarding_claim_replay_guard','trg_onboarding_revoke_active_claim_guard','trg_onboarding_expiry_active_claim_guard'];
// 0089 shipped the same guarantees under different names. A repaired database keeps only one set.
const LEGACY_TRIGGERS=['trg_onboarding_claim_completed_tombstone','trg_onboarding_claim_block_replay','trg_onboarding_claim_block_revoke','trg_onboarding_claim_skip_expire'];
const RECOVERY_TABLES=['onboarding_claims','onboarding_claim_tombstones'];

// Schema shape contract: these column lists must stay identical to migrations 0025/0089/0090.
// `CREATE TABLE IF NOT EXISTS` cannot widen an existing table, so requiring a column that the
// historical migrations never created would fail closed on every real production database.
const REQUIRED_COLUMNS:Record<string,string[]>={
  onboarding_invitations:['id','token_hash','customer_email','plan_id','status','expires_at','created_by','created_at','completed_at','tenant_id','form_json'],
  tenant_profiles:['tenant_id','legal_name','contact_name','contact_email','onboarding_invitation_id','updated_at'],
  provisioning_log:['tenant_id','action','status','detail_json'],
  onboarding_claims:['invitation_id','nonce','claimed_at'],
  onboarding_claim_tombstones:['invitation_id','completed_at'],
};

// Verifying the onboarding schema costs a handful of D1 round trips. The public setup routes call
// it on every request, and a schema only ever moves forward, so a proven-good result is cached for
// the lifetime of the isolate. Failures are never cached.
const verified=new WeakSet<object>();

async function tableColumns(env:Env,name:string):Promise<Set<string>>{
  // PRAGMA table_info returns an empty result for a missing table, so this doubles as an
  // existence check without a second round trip.
  const rows=await env.DB.prepare(`PRAGMA table_info(${name})`).all<Record<string,unknown>>();
  return new Set((rows.results??[]).map(row=>String(row['name']??'')).filter(Boolean));
}

async function requireColumns(env:Env,table:string):Promise<void>{
  const required=REQUIRED_COLUMNS[table]??[];
  const columns=await tableColumns(env,table);
  if(!columns.size||required.some(column=>!columns.has(column)))throw new Error('ONBOARDING_SCHEMA_INCOMPATIBLE');
}

async function schemaObjects(env:Env):Promise<Set<string>>{
  const names=[...RECOVERY_TABLES,...RECOVERY_TRIGGERS,...LEGACY_TRIGGERS];
  const rows=await env.DB.prepare(`SELECT name FROM sqlite_master WHERE name IN (${names.map(()=>'?').join(',')})`).bind(...names).all<Record<string,unknown>>();
  return new Set((rows.results??[]).map(row=>String(row['name']??'')).filter(Boolean));
}

function recoverySchemaComplete(objects:Set<string>):boolean{
  if(RECOVERY_TABLES.some(table=>!objects.has(table)))return false;
  if(RECOVERY_TRIGGERS.some(trigger=>!objects.has(trigger)))return false;
  return !LEGACY_TRIGGERS.some(trigger=>objects.has(trigger));
}

async function repairRecoverySchema(env:Env):Promise<void>{
  const statements=[
    // Shapes mirror migrations 0025 and 0089 exactly. See REQUIRED_COLUMNS above.
    `CREATE TABLE IF NOT EXISTS onboarding_claims (
      invitation_id TEXT PRIMARY KEY,
      nonce TEXT NOT NULL,
      claimed_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS onboarding_claim_tombstones (
      invitation_id TEXT PRIMARY KEY,
      completed_at TEXT NOT NULL,
      FOREIGN KEY(invitation_id) REFERENCES onboarding_invitations(id) ON DELETE CASCADE
    )`,
    ...LEGACY_TRIGGERS.map(trigger=>`DROP TRIGGER IF EXISTS ${trigger}`),
    `DROP TRIGGER IF EXISTS trg_onboarding_claim_tombstone_on_delete`,
    `CREATE TRIGGER trg_onboarding_claim_tombstone_on_delete
      BEFORE DELETE ON onboarding_claims
      FOR EACH ROW
      WHEN EXISTS(SELECT 1 FROM onboarding_invitations WHERE id=OLD.invitation_id AND status='completed')
      BEGIN
        INSERT OR IGNORE INTO onboarding_claim_tombstones(invitation_id,completed_at)
        SELECT id,COALESCE(completed_at,strftime('%Y-%m-%dT%H:%M:%fZ','now')) FROM onboarding_invitations WHERE id=OLD.invitation_id;
      END`,
    `DROP TRIGGER IF EXISTS trg_onboarding_claim_replay_guard`,
    `CREATE TRIGGER trg_onboarding_claim_replay_guard
      BEFORE INSERT ON onboarding_claims
      FOR EACH ROW
      WHEN EXISTS(SELECT 1 FROM onboarding_claim_tombstones WHERE invitation_id=NEW.invitation_id)
      BEGIN
        SELECT RAISE(ABORT,'ONBOARDING_ALREADY_USED');
      END`,
    `DROP TRIGGER IF EXISTS trg_onboarding_revoke_active_claim_guard`,
    `CREATE TRIGGER trg_onboarding_revoke_active_claim_guard
      BEFORE UPDATE OF status ON onboarding_invitations
      FOR EACH ROW
      WHEN NEW.status='revoked' AND EXISTS(SELECT 1 FROM onboarding_claims WHERE invitation_id=OLD.id)
      BEGIN
        SELECT RAISE(ABORT,'ONBOARDING_ALREADY_IN_PROGRESS');
      END`,
    `DROP TRIGGER IF EXISTS trg_onboarding_expiry_active_claim_guard`,
    `CREATE TRIGGER trg_onboarding_expiry_active_claim_guard
      BEFORE UPDATE OF status ON onboarding_invitations
      FOR EACH ROW
      WHEN NEW.status='expired' AND EXISTS(SELECT 1 FROM onboarding_claims WHERE invitation_id=OLD.id)
      BEGIN
        SELECT RAISE(IGNORE);
      END`,
  ];
  // Als Batch, nicht als Schleife: DROP TRIGGER gefolgt von CREATE TRIGGER ist einzeln
  // ausgefuehrt fuer parallele Requests offen - zwei Isolate, die gleichzeitig ein historisches
  // Schema vorfinden, koennen sich zwischen DROP und CREATE verschraenken, und das zweite
  // CREATE scheitert mit "already exists" ausgerechnet auf dem Onboarding-Pfad. Ein Batch
  // laeuft in einer Transaktion und in einem Roundtrip.
  await env.DB.batch(statements.map(statement=>env.DB.prepare(statement)));
}

async function ensureRecoveryTables(env:Env):Promise<void>{
  if(recoverySchemaComplete(await schemaObjects(env)))return;
  await repairRecoverySchema(env);
}

async function verifyOnboardingSchema(env:Env):Promise<void>{
  await requireColumns(env,'onboarding_invitations');
  await requireColumns(env,'tenant_profiles');
  await requireColumns(env,'provisioning_log');
  await ensureRecoveryTables(env);
  await requireColumns(env,'onboarding_claims');
  await requireColumns(env,'onboarding_claim_tombstones');
}

export async function ensureOnboardingSchema(env:Env):Promise<void>{
  const key=env.DB as unknown as object;
  if(key&&verified.has(key))return;
  await verifyOnboardingSchema(env);
  if(key)verified.add(key);
}

async function tableExists(env:Env,name:string):Promise<boolean>{
  return !!(await env.DB.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?").bind(name).first());
}

async function tenantUsersAvailable(env:Env):Promise<boolean>{return tableExists(env,'tenant_users');}

async function orphanTenants(env:Env,invitation:InvitationState):Promise<string[]>{
  const actorFragment=`"actorUserId":"onboarding:${invitation.id}"`;
  const rows=await env.DB.prepare(`SELECT DISTINCT tenant_id FROM provisioning_log
    WHERE tenant_id IS NOT NULL AND action='tenant_created' AND status='completed' AND instr(COALESCE(detail_json,''),?)>0`)
    .bind(actorFragment).all<{tenant_id:string}>();
  const ids=new Set((rows.results??[]).map(row=>String(row.tenant_id||'')).filter(Boolean));
  if(invitation.tenant_id)ids.add(invitation.tenant_id);
  return [...ids];
}

async function recoverInterruptedState(env:Env,invitation:InvitationState,reason:string):Promise<void>{
  if(invitation.status!=='open'&&invitation.status!=='processing')throw new Error('ONBOARDING_RECOVERY_REQUIRED');
  const tenantIds=await orphanTenants(env,invitation),adminIds=new Set<string>();
  for(const tenantId of tenantIds){
    const protectedTenant=await env.DB.prepare("SELECT id FROM onboarding_invitations WHERE tenant_id=? AND id<>? AND status='completed' LIMIT 1").bind(tenantId,invitation.id).first();
    if(protectedTenant)throw new Error('ONBOARDING_RECOVERY_REQUIRED');
    const admins=await env.DB.prepare("SELECT DISTINCT user_id FROM memberships WHERE tenant_id=? AND role='tenant_admin'").bind(tenantId).all<{user_id:string}>();
    for(const admin of admins.results??[])adminIds.add(String(admin.user_id));
  }
  const statements=[env.DB.prepare("UPDATE onboarding_invitations SET status='open',completed_at=NULL,tenant_id=NULL,form_json=NULL WHERE id=? AND status IN ('open','processing')").bind(invitation.id)];
  for(const tenantId of tenantIds)statements.push(env.DB.prepare('DELETE FROM tenants WHERE id=?').bind(tenantId));
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
  const hash=await sha256Text(token),invitation=await env.DB.prepare('SELECT id,status,tenant_id FROM onboarding_invitations WHERE token_hash=?').bind(hash).first<InvitationState>();
  if(!invitation)return;
  if(invitation.status!=='open'&&invitation.status!=='processing')return;
  const claim=await env.DB.prepare('SELECT invitation_id,claimed_at FROM onboarding_claims WHERE invitation_id=?').bind(invitation.id).first<ClaimState>();
  if(invitation.status==='processing'&&!claim){
    await recoverInterruptedState(env,invitation,'LEGACY_PROCESSING_WITHOUT_CLAIM');
    return;
  }
  if(!claim)return;
  const claimedAt=Date.parse(String(claim.claimed_at||''));
  // An unparsable claim timestamp must not read as "fresh"; treat it as abandoned so a broken
  // historical row can still be recovered instead of blocking the link forever.
  if(Number.isFinite(claimedAt)&&Date.now()-claimedAt<STALE_CLAIM_MS)return;
  await recoverInterruptedState(env,invitation,'STALE_CLAIM');
}

export async function onboardingSchemaStatus(env:Env):Promise<{ready:boolean;issues:string[]}>{
  const issues:string[]=[];
  // Readiness is an explicit platform-admin probe: never answer it from the isolate cache.
  try{await verifyOnboardingSchema(env);}catch{issues.push('onboarding_schema');}
  if(!issues.length){
    const objects=await schemaObjects(env);
    for(const trigger of RECOVERY_TRIGGERS)if(!objects.has(trigger))issues.push(trigger);
    for(const trigger of LEGACY_TRIGGERS)if(objects.has(trigger))issues.push(`${trigger}_superseded`);
  }
  if(!issues.length){const key=env.DB as unknown as object;if(key)verified.add(key);}
  return{ready:issues.length===0,issues};
}
