import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const state=await readFile('src/core/production-release-state.ts','utf8');
const gate=await readFile('src/core/production-release-gate.ts','utf8');
const launch=await readFile('src/core/launch-readiness.ts','utf8');
const router=await readFile('src/core/launch-readiness-router.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const ui=await readFile('public/launch-readiness-ui.js','utf8');
const platformDirect=await readFile('public/platform-direct-login.js','utf8');
const platformHtml=await readFile('public/platform-admin.html','utf8');
const wrangler=await readFile('wrangler.jsonc','utf8');
const migration=await readFile('migrations/0042_production_release_gate.sql','utf8');

assert.match(wrangler,/"version_metadata"\s*:\s*\{[\s\S]*"binding"\s*:\s*"CF_VERSION_METADATA"/,'Cloudflare Worker version metadata must be bound');
assert.match(migration,/CREATE TABLE IF NOT EXISTS production_release_approvals/,'production release approval migration must exist');
assert.match(state,/version_id TEXT PRIMARY KEY/,'release approval must be bound to one Worker version');
assert.match(state,/revoked_at TEXT/,'release approval must support emergency revocation');
assert.match(state,/requestLooksLikePreview/,'preview URLs must remain independently usable for acceptance work');
assert.match(state,/Diese Worker-Version wurde noch nicht ausdrücklich für Produktion freigegeben/,'unknown production versions must fail closed');
assert.match(state,/Produktionsfreigabe-Speicher ist nicht verfügbar/,'release storage failures must fail closed');

const readinessCalls=[...gate.matchAll(/productionReadiness\(env,auth\)/g)].map(x=>x.index??-1),stepUpIndex=gate.indexOf('await ownerStepUp(env,auth,input.current_password,input.mfa_code)'),approvalInsert=gate.indexOf('INSERT INTO production_release_approvals');
assert.ok(readinessCalls.length>=2,'approval must run readiness before and after owner step-up');
assert.ok(readinessCalls[0]<stepUpIndex,'preflight readiness must reject known blockers before consuming fresh MFA');
assert.ok(readinessCalls.at(-1)>stepUpIndex&&readinessCalls.at(-1)<approvalInsert,'final readiness must run after fresh MFA and immediately before approval persistence');
assert.match(gate,/PRODUCTION_NOT_READY_AFTER_STEP_UP/,'a blocker appearing during owner step-up must abort release');
assert.match(gate,/PRODUCTION_RELEASE_STATE_CHANGED/,'origin/version changes during step-up must abort release');
assert.match(gate,/LIVE FREIGEBEN/,'live approval must require an exact confirmation phrase');
assert.match(gate,/PRODUKTION SPERREN/,'emergency lock must require an exact confirmation phrase');
assert.match(gate,/verifyPassword/,'live approval must require the current owner password');
assert.match(gate,/verifyMfaChallenge/,'live approval must require fresh MFA step-up');
assert.match(gate,/platform\.production_release_approved/,'live approval must be audited');
assert.match(gate,/platform\.production_release_revoked/,'emergency lock must be audited');

assert.match(launch,/production_release_approvals/,'release gate schema must be part of production readiness');
assert.match(launch,/Worker-Versionsmetadaten fehlen/,'readiness must block without version metadata');
assert.match(launch,/paymentProviderFailures24h:paymentEventsQueryOk&&providerFailures===0/,'payment provider check must use true=healthy semantics');
assert.match(launch,/paymentProviderFailureCount24h:paymentEventsQueryOk\?providerFailures:null/,'payment failure count must remain separately observable without corrupting boolean check semantics');
for(const marker of ['SSO-Sicherheitsstatus konnte nicht geprüft werden','Status der Eingangskanäle konnte nicht geprüft werden','Angebotsstatus für eigene Domains konnte nicht geprüft werden','Zahlungsprovider-Ereignisse der letzten 24 Stunden konnten nicht geprüft werden'])assert.ok(launch.includes(marker),`blocking readiness query must fail closed: ${marker}`);
assert.doesNotMatch(launch,/tenant_sso_configs WHERE enabled=1'\)\.first<number>\('n'\)\.catch\(\(\)=>0\)/,'SSO blocker query must not fail open to zero');
assert.doesNotMatch(launch,/payment_provider_events WHERE status='failed'[\s\S]{0,250}\.catch\(\(\)=>0\)/,'payment failure query must not fail open to zero');

assert.match(router,/\/api\/platform\/release-state\/approve/,'owner approval endpoint must exist');
assert.match(router,/\/api\/platform\/release-state\/revoke/,'owner emergency-lock endpoint must exist');
assert.match(router,/code\.includes\('STATE_CHANGED'\)\?409/,'release state races must return HTTP 409 rather than an internal server error');
assert.match(index,/PRODUCTION_RELEASE_LOCKED/,'unapproved production traffic must receive a fail-closed response');
assert.match(index,/normalized=path==='\/'\?'\/':path\.replace\(\/\\\/\+\$\/,'\'\'\)/,'release-gate bypass paths must normalize trailing slashes before matching');
assert.match(index,/normalized==='\/plattform-admin'/,'platform admin must remain reachable while production is locked');
assert.match(index,/normalized==='\/api\/platform'/,'platform release/readiness APIs must remain reachable while production is locked');
assert.match(index,/normalized==='\/api\/auth'/,'owner authentication APIs must remain reachable while production is locked');
assert.match(index,/normalized==='\/api\/payments\/stripe\/webhook'/,'Stripe webhooks must remain reachable while customer traffic is locked');
assert.ok(index.indexOf('productionReleaseAccess(env,request)')<index.indexOf("const calendarFeed=url.pathname.match"),'production lock must run before tenant calendar/public content routes');

assert.match(ui,/Jede neue Worker-Version ist automatisch wieder gesperrt/,'owner UI must explain version-bound release behavior');
assert.match(ui,/current_password/,'owner UI must request current password for release step-up');
assert.match(ui,/mfa_code/,'owner UI must request MFA for release step-up');
for(const label of ['EU-Datenhaltung','SSO-Geheimnisse verschlüsselt','Sicherer E-Mail-Eingang','Keine Zahlungsproviderfehler (24 h)'])assert.ok(ui.includes(label),`owner UI must display blocking readiness check: ${label}`);
for(const label of ['EU-Worker-Verarbeitung / Regional Services','EU Customer Metadata Boundary'])assert.ok(ui.includes(label),`owner UI must display advisory check: ${label}`);
assert.match(ui,/Unmittelbar nach dem MFA-Schritt prüft der Server alle Freigabebedingungen erneut/,'owner UI must explain final server-side recheck');
assert.match(ui,/PRODUCTION_NOT_READY_AFTER_STEP_UP:'Während der Bestätigung hat sich eine Freigabebedingung geändert/,'owner UI must explain a post-step-up readiness race in plain German');
assert.match(ui,/PRODUCTION_RELEASE_STATE_CHANGED:'Worker-Version oder Produktionsdomain haben sich während der Bestätigung geändert/,'owner UI must explain a version/origin race in plain German');
assert.ok(platformDirect.includes("/launch-readiness-ui.js?v=20260818-2"),'platform loader must bust cache for hardened readiness UI');
assert.ok(platformHtml.includes('/platform-direct-login.js?v=20260818-2'),'platform page must bust cache for the updated loader');

console.log('Version-bound, fail-closed and post-MFA production release gate checks: OK');
