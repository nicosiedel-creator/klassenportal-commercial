import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile('migrations/0083_eu_training_moat.sql','utf8');
const hardeningMigration=await readFile('migrations/0084_moat_security_hardening.sql','utf8');
const core=await readFile('src/core/training-moat.ts','utf8');
const hardening=await readFile('src/core/training-moat-hardening.ts','utf8');
const router=await readFile('src/core/training-moat-router.ts','utf8');
const bridge=await readFile('src/core/participant-360-router.ts','utf8');
const cycle=await readFile('src/core/automation-cycle.ts','utf8');
const participant=await readFile('public/participant-moat-ui.js','utf8');
const customer=await readFile('public/customer-moat-ui.js','utf8');
const customerLazy=await readFile('public/customer-admin-lazy-modules.js','utf8');
const customerHtml=await readFile('public/customer-admin.html','utf8');
const partner=await readFile('public/partner-portal.js','utf8');
const partnerHtml=await readFile('public/partner.html','utf8');
const pwa=await readFile('public/pwa-client.js','utf8');

for(const table of ['tenant_compliance_programs','compliance_requirements','compliance_evidence','compliance_findings','compliance_evidence_packages','portal_language_preferences','learner_twin_snapshots','learner_coach_plans','partner_access_grants','migration_quality_runs'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),`${table} missing`);
assert.match(migration,/LEARNER_TWIN_SNAPSHOT_IMMUTABLE/,'learner twin snapshots must be immutable');
assert.match(migration,/token_hash TEXT NOT NULL UNIQUE/,'partner grants must store only hashed bearer tokens');
assert.match(hardeningMigration,/CREATE TABLE IF NOT EXISTS compliance_automation_state/,'bounded compliance automation cursor missing');
for(const trigger of ['trg_compliance_evidence_immutable_update','trg_compliance_evidence_immutable_delete','trg_compliance_package_immutable_update','trg_compliance_package_immutable_delete'])assert.match(hardeningMigration,new RegExp(trigger),`${trigger} missing`);

for(const locale of ["'de'","'en'","'tr'","'ar'","'uk'","'ru'","'pl'","'ro'","'bg'","'fa'","'prs'","'ps'","'fr'","'es'","'vi'"])assert.ok(core.includes(locale),`locale ${locale} missing`);
assert.match(core,/RTL_SET/,'RTL support missing');
assert.match(core,/own_data_only:true/,'learner twin must be self-scoped');
assert.match(core,/peer_comparison:false/,'learner twin must not compare peers');
assert.match(core,/emotion_recognition:false/,'emotion recognition must stay disabled');
assert.match(core,/biometrics:false/,'biometric learner scoring must stay disabled');
assert.match(core,/automated_high_stakes_decision:false/,'high-stakes automated learner decisions must stay disabled');
assert.match(core,/official_grade_data_used:false/,'initial learner twin must not silently ingest official grades');
assert.match(core,/requireAutopilotTenantAdminMfa/,'sensitive moat mutations require tenant-admin MFA');
assert.match(core,/verification_confirmed/,'regulatory packs must require explicit verification');
assert.match(core,/legal_determination:false/,'compliance engine must not claim legal determination');
assert.match(core,/silent_data_loss_allowed:false/,'migration quality gate must explicitly forbid silent data loss');

for(const forbidden of ['grades','attendance','health','private_notes','billing','roles','permissions'])assert.ok(core.includes(`'${forbidden}'`),`partner forbidden capability ${forbidden} must be explicit`);
assert.match(core,/tokenHash=await sha256Text\(token\)/,'partner bearer token must be hashed before storage');
assert.match(core,/token_shown_once:true/,'partner token must be one-time display');
assert.doesNotMatch(core,/SELECT .*grade.*FROM/i,'partner/learner moat must not query grades directly');
assert.match(core,/individual_attendance:false/,'partner output must explicitly exclude individual attendance');

assert.match(hardening,/COMPLIANCE_RULE_VERSION_REQUIRED/,'active compliance packs require an explicit rule version');
assert.match(hardening,/COMPLIANCE_OFFICIAL_SOURCE_REQUIRED/,'active compliance packs require an HTTPS official source');
assert.match(hardening,/PARTNER_PARTICIPANT_SCOPE_INVALID/,'partner participant scope must fail closed');
assert.match(hardening,/JOIN memberships m ON m\.user_id=u\.id/,'partner identity lookup must be tenant/course membership scoped');
assert.match(hardening,/SAFE_PARTNER_CAPABILITIES/,'partner hardening must use a positive capability whitelist');
assert.doesNotMatch(hardening,/practice_period/,'unimplemented partner capability must not be exposed');
assert.match(hardening,/runComplianceRadarBounded/,'bounded compliance automation missing');
assert.match(hardening,/LIMIT \?/,'compliance automation must be bounded per cycle');

for(const route of ['/api/moat/language','/api/moat/learner-twin','/api/moat/learning-coach/plan','/api/moat/compliance/overview','/api/moat/compliance/evidence-package','/api/moat/migration/preflight','/api/moat/partners/grants','/api/moat/integrations/capabilities','/api/moat/copilot/preview','/api/moat/partner-access'])assert.ok(router.includes(route),`route ${route} missing`);
assert.doesNotMatch(router,/partner-access\\\/\(\[\^\/\]\+\)/,'partner bearer tokens must never be placed in URL path');
assert.match(router,/authorization/,'partner access must accept Authorization bearer token');
assert.match(router,/publicPartnerContextHardened/,'partner access must use the membership-scoped hardened reader');
assert.match(router,/createPartnerGrantHardened/,'partner grants must use hardened scope validation');
assert.match(router,/upsertComplianceProgramHardened/,'compliance activation must use hardened verification');
assert.match(bridge,/handleTrainingMoatApi/,'moat router must be connected to the main education API bridge');
assert.match(bridge,/handlePersonalCompassApi/,'existing personal compass must be connected');
assert.match(cycle,/runComplianceRadarBounded/,'compliance radar must use bounded Worker-safe automation');

assert.match(pwa,/participant-moat-ui\.js/,'participant portal must load multilingual learner UI');
assert.doesNotMatch(pwa,/customer-moat-ui\.js/,'customer moat must not be smuggled into the PWA critical path');
assert.match(customerLazy,/customer-moat-ui/,'customer moat workspace must remain available through on-demand customer modules');
assert.doesNotMatch(customerHtml,/src="\/customer-moat-ui\.js/,'customer moat implementation must not execute during first paint');
assert.match(participant,/KP_LANGUAGES/);
assert.match(participant,/rtlSet/);
assert.match(participant,/\/api\/moat\/learning-coach\/plan/);
assert.match(customer,/Compliance Readiness/);
assert.match(customer,/Zero-Touch Migration 2\.0/);
assert.match(customer,/Partnerportal-Freigabe/);
assert.match(customer,/Action Copilot/);
assert.match(customer,/supportPlatformAdmin/,'customer moat must retain explicit support read-only behavior');
assert.match(partnerHtml,/partner-portal\.js/,'partner portal shell must load secure client');
assert.match(partner,/Authorization|authorization/,'partner client must send token in an Authorization header');
assert.match(partner,/history\.replaceState/,'partner client must remove fragment token before rendering');
assert.doesNotMatch(partner,/partner-access\/\$\{/,'partner client must never put token in request URL');

console.log('EIN360 moat architecture/security and on-demand customer-runtime regression: OK');
