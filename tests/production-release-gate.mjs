import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const state=await readFile('src/core/production-release-state.ts','utf8');
const gate=await readFile('src/core/production-release-gate.ts','utf8');
const launch=await readFile('src/core/launch-readiness.ts','utf8');
const router=await readFile('src/core/launch-readiness-router.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const ui=await readFile('public/launch-readiness-ui.js','utf8');
const platformDirect=await readFile('public/platform-direct-login.js','utf8');
const platformLazy=await readFile('public/platform-admin-lazy-modules.js','utf8');
const platformHtml=await readFile('public/platform-admin.html','utf8');
const wrangler=await readFile('wrangler.jsonc','utf8');
const migration=await readFile('migrations/0042_production_release_gate.sql','utf8');

assert.match(wrangler,/"version_metadata"\s*:\s*\{[\s\S]*"binding"\s*:\s*"CF_VERSION_METADATA"/);
assert.match(migration,/CREATE TABLE IF NOT EXISTS production_release_approvals/);
assert.match(state,/version_id TEXT PRIMARY KEY/);
assert.match(state,/revoked_at TEXT/);
assert.match(state,/requestLooksLikePreview/);
assert.match(state,/Diese Worker-Version wurde noch nicht ausdrücklich für Produktion freigegeben/);
assert.match(state,/Produktionsfreigabe-Speicher ist nicht verfügbar/);

const readinessCalls=[...gate.matchAll(/productionReadiness\(env,auth\)/g)].map(x=>x.index??-1);
const stepUpIndex=gate.indexOf('await ownerStepUp(env,auth,input.current_password)');
const approvalInsert=gate.indexOf('INSERT INTO production_release_approvals');
assert.ok(readinessCalls.length>=2);
assert.ok(readinessCalls[0]<stepUpIndex);
assert.ok(readinessCalls.at(-1)>stepUpIndex&&readinessCalls.at(-1)<approvalInsert);
assert.match(gate,/PRODUCTION_NOT_READY_AFTER_STEP_UP/);
assert.match(gate,/PRODUCTION_RELEASE_STATE_CHANGED/);
assert.match(gate,/LIVE FREIGEBEN/);
assert.match(gate,/PRODUKTION SPERREN/);
assert.match(gate,/verifyPassword/);
assert.match(gate,/CURRENT_PASSWORD_REQUIRED/);
assert.match(gate,/CURRENT_PASSWORD_INVALID/);
assert.doesNotMatch(gate,/verifyMfaChallenge|ownerMfaEnabled|MFA_/);
assert.match(gate,/platform\.production_release_approved/);
assert.match(gate,/platform\.production_release_revoked/);

assert.match(launch,/production_release_approvals/);
assert.match(launch,/Worker-Versionsmetadaten fehlen/);
assert.match(launch,/paymentProviderFailures24h:!payment\.enabled\|\|\(paymentEventsQueryOk&&providerFailures===0\)/);
assert.match(launch,/paymentProviderFailureCount24h:payment\.enabled&&paymentEventsQueryOk\?providerFailures:null/);
for(const marker of ['SSO-Sicherheitsstatus konnte nicht geprüft werden','Status der Eingangskanäle konnte nicht geprüft werden','Angebotsstatus für eigene Domains konnte nicht geprüft werden'])assert.ok(launch.includes(marker),marker);
assert.match(launch,/Zahlungsprovider-Ereignisse der letzten 24 Stunden konnten nicht geprüft werden/);

assert.match(router,/\/api\/platform\/release-state\/approve/);
assert.match(router,/\/api\/platform\/release-state\/revoke/);
assert.match(router,/code\.includes\('STATE_CHANGED'\)\?409/);
assert.match(index,/PRODUCTION_RELEASE_LOCKED/);
assert.match(index,/normalized==='\/plattform-admin'/);
assert.match(index,/normalized==='\/api\/platform'/);
assert.match(index,/normalized==='\/api\/auth'/);
assert.match(index,/normalized==='\/api\/payments\/stripe\/webhook'/);
assert.match(index,/async function releaseGateAllowsLockedRequest/);
assert.match(index,/await getSession\(env,request\)/);
assert.match(index,/\.isPlatformAdmin/);
assert.ok(!index.includes("normalized==='/api/courses'"));
assert.ok(index.indexOf('productionReleaseAccess(env,request)')<index.indexOf("const calendarFeed=url.pathname.match"));

assert.match(ui,/Jede neue Worker-Version ist automatisch wieder gesperrt/);
assert.match(ui,/current_password/);
assert.doesNotMatch(ui,/mfa_code|Eigentümer-MFA|MFA-Code|MFA-Schritt/);
for(const label of ['EU-Datenhaltung','SSO-Geheimnisse verschlüsselt','Sicherer E-Mail-Eingang','Keine Zahlungsproviderfehler (24 h)'])assert.ok(ui.includes(label),label);
for(const label of ['EU-Worker-Verarbeitung / Regional Services','EU Customer Metadata Boundary'])assert.ok(ui.includes(label),label);
assert.match(ui,/Unmittelbar nach der Passwortbestätigung prüft der Server alle Freigabebedingungen erneut/);
assert.match(platformDirect,/platform-admin-lazy-modules\.js/);
assert.match(platformLazy,/release:\['launch-readiness-ui'\]/);
assert.doesNotMatch(platformDirect,/import\('\/launch-readiness-ui\.js/);
assert.match(platformHtml,/\/platform-direct-login\.js\?v=20260824-sales-ready/);

console.log('Version-bound, fail-closed production release gate with password reauthentication: OK');
