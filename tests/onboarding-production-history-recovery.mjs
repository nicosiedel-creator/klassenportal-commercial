import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const onboarding=await readFile('src/core/onboarding.ts','utf8');
const runtimeRouter=await readFile('src/core/runtime-schema-router.ts','utf8');
const runtimeSchema=await readFile('src/core/onboarding-schema.ts','utf8');
const launchReadiness=await readFile('src/core/launch-readiness.ts','utf8');
const forwardMigration=await readFile('migrations/0090_onboarding_production_history_repair.sql','utf8');
const original0024=await readFile('migrations/0024_customer_onboarding.sql','utf8');

assert.match(forwardMigration,/CREATE TABLE IF NOT EXISTS onboarding_claims/,'forward repair must recreate the atomic claim table when historical production is missing it');
assert.match(forwardMigration,/CREATE TABLE IF NOT EXISTS onboarding_claim_tombstones/,'forward repair must recreate durable replay tombstones');
assert.match(forwardMigration,/DROP TRIGGER IF EXISTS trg_onboarding_claim_tombstone_on_delete[\s\S]*CREATE TRIGGER trg_onboarding_claim_tombstone_on_delete/,'forward repair must replace stale trigger definitions instead of trusting edited historical migrations');
assert.match(forwardMigration,/RAISE\(ABORT,'ONBOARDING_ALREADY_USED'\)/,'replay guard must remain fail closed');
assert.doesNotMatch(forwardMigration,/SET\s+status\s*=\s*'processing'/i,'forward repair must not depend on the later processing status mutation');

assert.match(runtimeSchema,/STALE_CLAIM_MS/,'runtime recovery must distinguish active claims from abandoned claims');
assert.match(runtimeSchema,/actorUserId[\s\S]*onboarding:[\s\S]*provisioning_log/,'stale recovery must identify orphan tenants by the exact onboarding actor');
assert.match(runtimeSchema,/status IN \('open','processing'\)/,'runtime recovery must understand legacy processing rows while reopening only recoverable states');
assert.match(runtimeSchema,/ONBOARDING_RECOVERY_REQUIRED/,'unsafe recovery must remain fail closed');
assert.match(runtimeSchema,/SELECT id FROM onboarding_invitations WHERE tenant_id=\? AND id<>\? AND status='completed'/,'recovery must never delete a tenant owned by another completed onboarding');
assert.match(runtimeSchema,/requireColumns\(env,'provisioning_log'/,'runtime schema check must include the recovery evidence table');

const ensurePos=runtimeRouter.indexOf('await ensureOnboardingSchema(env)');
const offerPos=runtimeRouter.indexOf('await ensureOfferSchema(env)');
assert.ok(ensurePos>=0&&offerPos>ensurePos,'onboarding schema compatibility must run before offer-schema ALTERs on onboarding routes');
assert.match(runtimeRouter,/recoverOnboardingRequestState\(env,decodeURIComponent\(publicMatch\[1\]\)\)/,'public onboarding requests must run deterministic stale-state recovery before the core handler');

assert.doesNotMatch(onboarding,/UPDATE onboarding_invitations SET status='processing'/,'rollback must never write processing because original production 0024 can reject it');
assert.match(onboarding,/Keeping the[\s\S]*claim blocks duplicate provisioning/,'failed rollback must retain the claim instead of reopening an unproven state');
assert.match(onboarding,/ONBOARDING_PROVISIONING_FAILED/,'raw provisioning failures must become a stable stage code');
assert.match(onboarding,/ONBOARDING_COMMERCE_FAILED/,'raw commerce failures must become a stable stage code');
assert.match(onboarding,/ONBOARDING_FINALIZATION_FAILED/,'raw finalization failures must become a stable stage code');
assert.match(onboarding,/onboarding_claim_tombstones/,'claim acquisition must distinguish durable replay from an active claim');
assert.match(launchReadiness,/onboardingSchemaStatus/,'production readiness must inspect onboarding schema instead of trusting fresh-D1 migration history');
assert.match(launchReadiness,/onboardingSchema:onboardingSchema\.ready/,'readiness output must expose the onboarding schema gate');

// Reconstruct the first production 0024 shape: processing was not an allowed status and
// claims/tombstones did not exist yet. Then execute the new forward migration twice to prove
// that a historical database is repairable and that the repair is idempotent.
const db=new DatabaseSync(':memory:');
db.exec(`
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
  INSERT INTO onboarding_invitations(id,token_hash,customer_email,plan_id,status,expires_at,created_by,created_at)
    VALUES('obi_hist','hash','customer@example.com','provider','open','2099-01-01T00:00:00.000Z','platform-admin','2026-08-27T00:00:00.000Z');
`);
assert.throws(()=>db.exec("UPDATE onboarding_invitations SET status='processing' WHERE id='obi_hist'"),/CHECK constraint failed/,'historical production CHECK must reject processing so this regression really models the old database');

db.exec(forwardMigration);
db.exec(forwardMigration);
const tableNames=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>String(row.name)));
assert.ok(tableNames.has('onboarding_claims'));
assert.ok(tableNames.has('onboarding_claim_tombstones'));
const triggerNames=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all().map(row=>String(row.name)));
for(const name of ['trg_onboarding_claim_tombstone_on_delete','trg_onboarding_claim_replay_guard','trg_onboarding_revoke_active_claim_guard','trg_onboarding_expiry_active_claim_guard'])assert.ok(triggerNames.has(name),`missing repaired trigger ${name}`);

db.exec("INSERT INTO onboarding_claims(invitation_id,nonce,claimed_at) VALUES('obi_hist','claim-1','2026-08-27T00:00:00.000Z')");
db.exec("UPDATE onboarding_invitations SET status='completed',completed_at='2026-08-27T00:01:00.000Z' WHERE id='obi_hist'");
db.exec("DELETE FROM onboarding_claims WHERE invitation_id='obi_hist'");
assert.equal(db.prepare("SELECT completed_at FROM onboarding_claim_tombstones WHERE invitation_id='obi_hist'").get()?.completed_at,'2026-08-27T00:01:00.000Z','completed activation must leave a durable replay tombstone');
assert.throws(()=>db.exec("INSERT INTO onboarding_claims(invitation_id,nonce,claimed_at) VALUES('obi_hist','claim-2','2026-08-27T00:02:00.000Z')"),/ONBOARDING_ALREADY_USED/,'repaired historical database must reject replay after completion');
db.close();

// Current 0024 remains untouched. Production may have applied an older definition and therefore
// must be repaired only through 0090/runtime compatibility, never by editing this historical file again.
assert.match(original0024,/CREATE TABLE IF NOT EXISTS onboarding_invitations/);

console.log('Production-history onboarding recovery, executable forward repair and fail-closed rollback contract: OK');
