import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const onboarding=await readFile('src/core/onboarding.ts','utf8');
const runtimeRouter=await readFile('src/core/runtime-schema-router.ts','utf8');
const runtimeSchema=await readFile('src/core/onboarding-schema.ts','utf8');
const launchReadiness=await readFile('src/core/launch-readiness.ts','utf8');
const forwardMigration=await readFile('migrations/0090_onboarding_production_history_repair.sql','utf8');
const tombstoneMigration=await readFile('migrations/0089_onboarding_claim_tombstone.sql','utf8');
const claimMigration=await readFile('migrations/0025_onboarding_claims.sql','utf8');
const original0024=await readFile('migrations/0024_customer_onboarding.sql','utf8');

const CANONICAL_TRIGGERS=['trg_onboarding_claim_tombstone_on_delete','trg_onboarding_claim_replay_guard','trg_onboarding_revoke_active_claim_guard','trg_onboarding_expiry_active_claim_guard'];
const LEGACY_TRIGGERS=['trg_onboarding_claim_completed_tombstone','trg_onboarding_claim_block_replay','trg_onboarding_claim_block_revoke','trg_onboarding_claim_skip_expire'];

assert.match(forwardMigration,/CREATE TABLE IF NOT EXISTS onboarding_claims/,'forward repair must recreate the atomic claim table when historical production is missing it');
assert.match(forwardMigration,/CREATE TABLE IF NOT EXISTS onboarding_claim_tombstones/,'forward repair must recreate durable replay tombstones');
assert.match(forwardMigration,/DROP TRIGGER IF EXISTS trg_onboarding_claim_tombstone_on_delete[\s\S]*CREATE TRIGGER trg_onboarding_claim_tombstone_on_delete/,'forward repair must replace stale trigger definitions instead of trusting edited historical migrations');
assert.match(forwardMigration,/RAISE\(ABORT,'ONBOARDING_ALREADY_USED'\)/,'replay guard must remain fail closed');
assert.doesNotMatch(forwardMigration,/SET\s+status\s*=\s*'processing'/i,'forward repair must not depend on the later processing status mutation');
assert.doesNotMatch(forwardMigration,/CURRENT_TIMESTAMP/,'tombstone timestamps must stay in the ISO-8601 format the application parses');
for(const legacy of LEGACY_TRIGGERS)assert.match(forwardMigration,new RegExp(`DROP TRIGGER IF EXISTS ${legacy}`),`forward repair must retire the superseded 0089 trigger ${legacy}`);

// A forward migration may only reference columns that the historical migration which first
// created the table actually produced. `CREATE TABLE IF NOT EXISTS` silently keeps the old shape.
function declaredColumns(sql,table){
  const match=sql.match(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\s*\\(([\\s\\S]*?)\\n\\);`));
  if(!match)return null;
  return match[1].split('\n').map(line=>line.trim()).filter(line=>line&&!/^(FOREIGN KEY|PRIMARY KEY|UNIQUE|CHECK)\b/i.test(line)).map(line=>line.split(/\s+/)[0]);
}
assert.deepEqual(declaredColumns(forwardMigration,'onboarding_claim_tombstones'),declaredColumns(tombstoneMigration,'onboarding_claim_tombstones'),'0090 must declare exactly the tombstone columns 0089 already created');
assert.deepEqual(declaredColumns(forwardMigration,'onboarding_claims'),declaredColumns(claimMigration,'onboarding_claims'),'0090 must declare exactly the claim columns 0025 already created');

assert.match(runtimeSchema,/STALE_CLAIM_MS/,'runtime recovery must distinguish active claims from abandoned claims');
assert.match(runtimeSchema,/actorUserId[\s\S]*onboarding:[\s\S]*provisioning_log/,'stale recovery must identify orphan tenants by the exact onboarding actor');
assert.match(runtimeSchema,/status IN \('open','processing'\)/,'runtime recovery must understand legacy processing rows while reopening only recoverable states');
assert.match(runtimeSchema,/if\(invitation\.status!=='open'&&invitation\.status!=='processing'\)return;/,'completed, revoked and expired invitations must never enter destructive stale recovery');
assert.match(runtimeSchema,/ONBOARDING_RECOVERY_REQUIRED/,'unsafe recovery must remain fail closed');
assert.match(runtimeSchema,/SELECT id FROM onboarding_invitations WHERE tenant_id=\? AND id<>\? AND status='completed'/,'recovery must never delete a tenant owned by another completed onboarding');
assert.match(runtimeSchema,/requireColumns\(env,'provisioning_log'/,'runtime schema check must include the recovery evidence table');
assert.doesNotMatch(runtimeSchema,/recorded_at/,'the runtime guard must not require a tombstone column the historical migrations never created');
assert.match(runtimeSchema,/onboarding_claim_tombstones:\['invitation_id','completed_at'\]/,'the runtime guard must require exactly the shipped tombstone shape');

const ensurePos=runtimeRouter.indexOf('await ensureOnboardingSchema(env)');
const offerPos=runtimeRouter.indexOf('await ensureOfferSchema(env)');
assert.ok(ensurePos>=0&&offerPos>ensurePos,'onboarding schema compatibility must run before offer-schema ALTERs on onboarding routes');
assert.match(runtimeRouter,/recoverOnboardingRequestState\(env,decodeURIComponent\(publicMatch\[1\]\)\)/,'public onboarding requests must run deterministic stale-state recovery before the core handler');

assert.doesNotMatch(onboarding,/UPDATE onboarding_invitations SET status='processing'/,'rollback must never write processing because original production 0024 can reject it');
assert.doesNotMatch(onboarding,/LEGACY_PARTIAL_COMPLETION/,'a completed tenant must never be inferred corrupt from missing legacy form data');
assert.match(onboarding,/Keeping the[\s\S]*claim blocks duplicate provisioning/,'failed rollback must retain the claim instead of reopening an unproven state');
assert.match(onboarding,/ONBOARDING_PROVISIONING_FAILED/,'raw provisioning failures must become a stable stage code');
assert.match(onboarding,/ONBOARDING_COMMERCE_FAILED/,'raw commerce failures must become a stable stage code');
assert.match(onboarding,/ONBOARDING_FINALIZATION_FAILED/,'raw finalization failures must become a stable stage code');
assert.match(onboarding,/onboarding_claim_tombstones/,'claim acquisition must distinguish durable replay from an active claim');
assert.match(launchReadiness,/onboardingSchemaStatus/,'production readiness must inspect onboarding schema instead of trusting fresh-D1 migration history');
assert.match(launchReadiness,/onboardingSchema:onboardingSchema\.ready/,'readiness output must expose the onboarding schema gate');

const HISTORICAL_BASE=`
  PRAGMA foreign_keys=ON;
  CREATE TABLE plans(id TEXT PRIMARY KEY);
  CREATE TABLE users(id TEXT PRIMARY KEY);
  CREATE TABLE tenants(id TEXT PRIMARY KEY);
  INSERT INTO plans(id) VALUES('provider');
  INSERT INTO users(id) VALUES('platform-admin');
  CREATE TABLE onboarding_invitations (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    customer_email TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','revoked','expired')),
    expires_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    completed_at TEXT,
    tenant_id TEXT,
    form_json TEXT,
    FOREIGN KEY(plan_id) REFERENCES plans(id),
    FOREIGN KEY(created_by) REFERENCES users(id),
    FOREIGN KEY(tenant_id) REFERENCES tenants(id)
  );
`;

function invitation(db,id,token){
  db.exec(`INSERT INTO onboarding_invitations(id,token_hash,customer_email,plan_id,status,expires_at,created_by,created_at)
    VALUES('${id}','${token}','customer@example.com','provider','open','2099-01-01T00:00:00.000Z','platform-admin','2026-08-27T00:00:00.000Z')`);
}

function assertCanonicalTriggerSet(db,label){
  const triggers=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_onboarding%'").all().map(row=>String(row.name)));
  for(const name of CANONICAL_TRIGGERS)assert.ok(triggers.has(name),`${label}: missing repaired trigger ${name}`);
  for(const name of LEGACY_TRIGGERS)assert.ok(!triggers.has(name),`${label}: superseded 0089 trigger ${name} must be retired so no event runs two overlapping programs`);
}

// Full onboarding claim lifecycle against a repaired database: claim, complete, release, replay.
function assertClaimLifecycle(db,label){
  invitation(db,'obi_life','hash-life');
  db.exec("INSERT INTO onboarding_claims(invitation_id,nonce,claimed_at) VALUES('obi_life','claim-1','2026-08-27T00:00:00.000Z')");
  assert.throws(()=>db.exec("UPDATE onboarding_invitations SET status='revoked' WHERE id='obi_life'"),/ONBOARDING_ALREADY_IN_PROGRESS/,`${label}: revoke must not overtake an active claim`);
  db.exec("UPDATE onboarding_invitations SET status='expired' WHERE id='obi_life'");
  assert.equal(db.prepare("SELECT status FROM onboarding_invitations WHERE id='obi_life'").get().status,'open',`${label}: expiry housekeeping must skip a claimed invitation`);

  // Rollback path: releasing a claim of an invitation that never completed must not tombstone it.
  db.exec("DELETE FROM onboarding_claims WHERE invitation_id='obi_life'");
  assert.equal(db.prepare("SELECT COUNT(*) n FROM onboarding_claim_tombstones WHERE invitation_id='obi_life'").get().n,0,`${label}: an aborted activation must stay retryable`);
  db.exec("INSERT INTO onboarding_claims(invitation_id,nonce,claimed_at) VALUES('obi_life','claim-2','2026-08-27T00:02:00.000Z')");

  // Success path: the completion batch flips the status and releases the claim in one transaction.
  db.exec("UPDATE onboarding_invitations SET status='completed',completed_at='2026-08-27T00:03:00.000Z' WHERE id='obi_life'");
  db.exec("DELETE FROM onboarding_claims WHERE invitation_id='obi_life' AND nonce='claim-2'");
  const tombstone=db.prepare("SELECT completed_at FROM onboarding_claim_tombstones WHERE invitation_id='obi_life'").get();
  assert.equal(tombstone?.completed_at,'2026-08-27T00:03:00.000Z',`${label}: completed activation must leave a durable replay tombstone`);
  assert.throws(()=>db.exec("INSERT INTO onboarding_claims(invitation_id,nonce,claimed_at) VALUES('obi_life','claim-3','2026-08-27T00:04:00.000Z')"),/ONBOARDING_ALREADY_USED/,`${label}: repaired database must reject replay after completion`);

  // A tombstone written without a recorded completion timestamp must still be ISO-8601.
  invitation(db,'obi_nots','hash-nots');
  db.exec("INSERT INTO onboarding_claims(invitation_id,nonce,claimed_at) VALUES('obi_nots','claim-n','2026-08-27T00:00:00.000Z')");
  db.exec("UPDATE onboarding_invitations SET status='completed' WHERE id='obi_nots'");
  db.exec("DELETE FROM onboarding_claims WHERE invitation_id='obi_nots'");
  const fallback=String(db.prepare("SELECT completed_at FROM onboarding_claim_tombstones WHERE invitation_id='obi_nots'").get().completed_at);
  assert.match(fallback,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,`${label}: fallback tombstone timestamp must be ISO-8601`);
  assert.ok(Number.isFinite(Date.parse(fallback)),`${label}: fallback tombstone timestamp must be parseable`);
}

// Scenario A: the first production shape. processing was not an allowed status and neither the
// claim nor the tombstone table existed. The forward repair runs twice to prove idempotency.
{
  const db=new DatabaseSync(':memory:');
  db.exec(HISTORICAL_BASE);
  invitation(db,'obi_hist','hash-hist');
  assert.throws(()=>db.exec("UPDATE onboarding_invitations SET status='processing' WHERE id='obi_hist'"),/CHECK constraint failed/,'historical production CHECK must reject processing so this regression really models the old database');
  db.exec(forwardMigration);
  db.exec(forwardMigration);
  const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>String(row.name)));
  assert.ok(tables.has('onboarding_claims'));
  assert.ok(tables.has('onboarding_claim_tombstones'));
  assertCanonicalTriggerSet(db,'historical');
  assertClaimLifecycle(db,'historical');
  db.close();
}

// Scenario B: every database that actually reaches 0090 in the field - production and a fresh D1
// alike - already ran 0025 and 0089 first. `CREATE TABLE IF NOT EXISTS` keeps their shapes, so
// 0090 must operate on exactly those tables. This is the ordering the browser E2E exercises.
{
  const db=new DatabaseSync(':memory:');
  db.exec(HISTORICAL_BASE);
  db.exec(claimMigration);
  db.exec(tombstoneMigration);
  const beforeTombstone=db.prepare('PRAGMA table_info(onboarding_claim_tombstones)').all().map(row=>String(row.name));
  db.exec(forwardMigration);
  db.exec(forwardMigration);
  assert.deepEqual(db.prepare('PRAGMA table_info(onboarding_claim_tombstones)').all().map(row=>String(row.name)),beforeTombstone,'0090 must not assume it can widen the tombstone table that 0089 already created');
  assertCanonicalTriggerSet(db,'0089-then-0090');
  // The regression that broke the release: every claim release used to fail at prepare time
  // because the replacement trigger referenced a column the existing table did not have.
  db.exec("DELETE FROM onboarding_claims WHERE invitation_id='does-not-exist'");
  assertClaimLifecycle(db,'0089-then-0090');
  db.close();
}

// Scenario C: a database that has the 0025 claim table but never received the 0089 trigger set -
// the state the runtime schema guard repairs on its own when a migration never reached a database.
{
  const db=new DatabaseSync(':memory:');
  db.exec(HISTORICAL_BASE);
  db.exec(claimMigration);
  db.exec(forwardMigration);
  assertCanonicalTriggerSet(db,'claims-without-0089');
  assertClaimLifecycle(db,'claims-without-0089');
  db.close();
}

// Current 0024 remains untouched. Production may have applied an older definition and therefore
// must be repaired only through 0090/runtime compatibility, never by editing this historical file again.
assert.match(original0024,/CREATE TABLE IF NOT EXISTS onboarding_invitations/);

console.log('Production-history onboarding recovery, forward-repair schema convergence across historical/0089/fresh databases and fail-closed rollback contract: OK');
