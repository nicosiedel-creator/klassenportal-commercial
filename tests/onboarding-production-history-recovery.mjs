import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const onboarding=await readFile('src/core/onboarding.ts','utf8');
const runtimeRouter=await readFile('src/core/runtime-schema-router.ts','utf8');
const runtimeSchema=await readFile('src/core/onboarding-schema.ts','utf8');
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

// Current 0024 remains untouched. Production may have applied an older definition and therefore
// must be repaired only through 0090/runtime compatibility, never by editing this historical file again.
assert.match(original0024,/CREATE TABLE IF NOT EXISTS onboarding_invitations/);

console.log('Production-history onboarding recovery, forward-only schema repair and fail-closed rollback contract: OK');
