import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const state=await readFile('src/core/production-release-state.ts','utf8');
const gate=await readFile('src/core/production-release-gate.ts','utf8');
const launch=await readFile('src/core/launch-readiness.ts','utf8');
const router=await readFile('src/core/launch-readiness-router.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const ui=await readFile('public/launch-readiness-ui.js','utf8');
const wrangler=await readFile('wrangler.jsonc','utf8');
const migration=await readFile('migrations/0042_production_release_gate.sql','utf8');

assert.match(wrangler,/"version_metadata"\s*:\s*\{[\s\S]*"binding"\s*:\s*"CF_VERSION_METADATA"/,'Cloudflare Worker version metadata must be bound');
assert.match(migration,/CREATE TABLE IF NOT EXISTS production_release_approvals/,'production release approval migration must exist');
assert.match(state,/version_id TEXT PRIMARY KEY/,'release approval must be bound to one Worker version');
assert.match(state,/revoked_at TEXT/,'release approval must support emergency revocation');
assert.match(state,/requestLooksLikePreview/,'preview URLs must remain independently usable for acceptance work');
assert.match(state,/Diese Worker-Version wurde noch nicht ausdrücklich für Produktion freigegeben/,'unknown production versions must fail closed');
assert.match(state,/Produktionsfreigabe-Speicher ist nicht verfügbar/,'release storage failures must fail closed');

assert.match(gate,/productionReadiness\(env,auth\)/,'approval must re-run complete production readiness');
assert.match(gate,/LIVE FREIGEBEN/,'live approval must require an exact confirmation phrase');
assert.match(gate,/PRODUKTION SPERREN/,'emergency lock must require an exact confirmation phrase');
assert.match(gate,/verifyPassword/,'live approval must require the current owner password');
assert.match(gate,/verifyMfaChallenge/,'live approval must require fresh MFA step-up');
assert.match(gate,/platform\.production_release_approved/,'live approval must be audited');
assert.match(gate,/platform\.production_release_revoked/,'emergency lock must be audited');

assert.match(launch,/production_release_approvals/,'release gate schema must be part of production readiness');
assert.match(launch,/Worker-Versionsmetadaten fehlen/,'readiness must block without version metadata');
assert.match(router,/\/api\/platform\/release-state\/approve/,'owner approval endpoint must exist');
assert.match(router,/\/api\/platform\/release-state\/revoke/,'owner emergency-lock endpoint must exist');
assert.match(index,/PRODUCTION_RELEASE_LOCKED/,'unapproved production traffic must receive a fail-closed response');
assert.match(index,/path==='\/api\/payments\/stripe\/webhook'/,'Stripe webhooks must remain reachable while customer traffic is locked');
assert.ok(index.indexOf('productionReleaseAccess(env,request)')<index.indexOf("const calendarFeed=url.pathname.match"),'production lock must run before tenant calendar/public content routes');
assert.match(ui,/Jede neue Worker-Version ist automatisch wieder gesperrt/,'owner UI must explain version-bound release behavior');
assert.match(ui,/current_password/,'owner UI must request current password for release step-up');
assert.match(ui,/mfa_code/,'owner UI must request MFA for release step-up');

console.log('Version-bound production release gate checks: OK');
