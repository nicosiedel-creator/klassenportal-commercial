import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile('migrations/0075_education_twin_autopilot.sql','utf8');
const twin=await readFile('src/core/education-twin.ts','utf8');
const scenarios=await readFile('src/core/education-scenarios.ts','utf8');
const security=await readFile('src/core/autopilot-security.ts','utf8');
const autopilot=await readFile('src/core/education-autopilot.ts','utf8');
const radar=await readFile('src/core/education-radar.ts','utf8');
const consistency=await readFile('src/core/education-consistency.ts','utf8');
const proof=await readFile('src/core/education-proof-graph.ts','utf8');
const intent=await readFile('src/core/education-intent.ts','utf8');
const router=await readFile('src/core/education-os-router.ts','utf8');
const bridge=await readFile('src/core/participant-360-router.ts','utf8');
const cycle=await readFile('src/core/automation-cycle.ts','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const customerLazy=await readFile('public/customer-admin-lazy-modules.js','utf8');
const platform=await readFile('public/platform-admin.html','utf8');
const ui=await readFile('public/education-os-ui.js','utf8');
const product=await readFile('PRODUCT_5000X.md','utf8');

for(const table of ['education_twin_snapshots','education_scenarios','education_scenario_options','education_scenario_approvals','education_autopilot_executions','education_autopilot_execution_steps','education_autopilot_locks','education_autopilot_policies','education_risks','education_consistency_findings','education_proof_packages','education_twin_events'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),`${table} missing`);
for(const trigger of ['trg_twin_snapshot_immutable','trg_scenario_option_immutable','trg_scenario_approval_immutable_update','trg_scenario_approval_immutable_delete','trg_proof_package_immutable','trg_twin_event_immutable_update','trg_twin_event_immutable_delete'])assert.match(migration,new RegExp(trigger),`${trigger} missing`);
assert.match(migration,/mode TEXT NOT NULL DEFAULT 'recommend_only'/,'autopilot must default fail-closed');
assert.match(migration,/max_auto_risk TEXT NOT NULL DEFAULT 'low'/,'automatic risk ceiling must default to low');
assert.match(migration,/UNIQUE\(tenant_id,idempotency_key\)/,'autopilot execution must be idempotent');
assert.match(migration,/snapshot_sha256 TEXT NOT NULL/,'approvals must bind to twin snapshot');
assert.match(migration,/plan_sha256 TEXT NOT NULL/,'approvals/executions must bind to plan digest');

assert.match(twin,/contains_private_participant_notes:false/,'twin must explicitly exclude private participant notes');
assert.match(twin,/contains_personal_grades:false/,'twin must explicitly exclude grades');
assert.match(twin,/contains_individual_attendance:false/,'twin must explicitly exclude individual attendance');
assert.match(twin,/aggregated_counts_only/,'participant identities must not enter the operational twin');
assert.ok(!twin.includes('attendance_records'),'twin must not query individual attendance records');
assert.ok(!twin.includes('assignment_participant'),'twin must not query private assignment state/notes');
assert.match(twin,/sha256Text\(stableStringify\(payload\)\)/,'twin snapshot must be cryptographically digestible');

for(const type of ['teacher_absence','room_outage','exam_shift','curriculum_recovery','midyear_takeover','qualification_expiry','schedule_rebalance','excursion_change','self_study_need'])assert.ok(scenarios.includes(`'${type}'`)||scenarios.includes(`${type}:`),`scenario ${type} missing`);
assert.match(scenarios,/captureEducationTwinSnapshot/,'every scenario must be bound to an immutable twin snapshot');
assert.match(scenarios,/plan_sha256/,'scenario plans must be hashed');
assert.match(scenarios,/requires_dual_approval/,'high-risk scenario options must support dual approval');
assert.match(scenarios,/allow_self_study/,'self-study recovery must require explicit authorization');
assert.match(scenarios,/allow_remote/,'remote conversion must require explicit authorization');

assert.match(security,/auth\.isPlatformAdmin\)throw new Error\('AUTOPILOT_TENANT_ADMIN_REQUIRED'\)/,'platform admin must not execute tenant autopilot');
assert.match(security,/auth\.role!=='tenant_admin'/,'autopilot execution must require a tenant admin session');
for(const forbidden of ['role','membership','permission','billing','payment','grade','attendance','signature\\.sign'])assert.match(security,new RegExp(forbidden),`forbidden autopilot namespace ${forbidden} missing`);
assert.ok(!security.includes("'role.assign'"),'role changes must not appear in safe action whitelist');
assert.ok(!security.includes("'grade.update'"),'grade changes must not appear in safe action whitelist');
assert.ok(!security.includes("'attendance.record'"),'attendance writes must not appear in safe action whitelist');

assert.match(autopilot,/AUTOPILOT_CRITICAL_MANUAL_ONLY/,'critical plans must never auto-execute');
assert.match(autopilot,/AUTOPILOT_SECOND_ADMIN_REQUIRED/,'high-risk dual control must fail closed when second admin is unavailable');
assert.match(autopilot,/AUTOPILOT_TWIN_CHANGED_RESIMULATE/,'stale twin must invalidate execution');
assert.match(autopilot,/Idempotency|IDEMPOTENCY_KEY/,'execution needs idempotency');
assert.match(autopilot,/education_autopilot_locks/,'concurrent tenant executions must be locked');
assert.match(autopilot,/safeAutopilotActionType/,'execution must enforce a positive action whitelist');
assert.match(autopilot,/forbiddenAutopilotNamespace/,'execution must enforce negative security namespaces');
assert.match(autopilot,/guardExists/,'execution steps need optimistic precondition guards');
assert.match(autopilot,/json_extract\('AUTOPILOT_PRECONDITION_FAILED'/,'precondition failure must abort the D1 batch');
assert.match(autopilot,/AUTOPILOT_ROLLBACK_WINDOW_EXPIRED/,'rollback must have a bounded safety window');
assert.match(autopilot,/non_reversible_actions/,'rollback must disclose non-reversible side effects');
assert.ok(!autopilot.includes('statemen ts'),'known broken statement typo must never reappear');

for(const risk of ['curriculum-gap','classbook-gap','teacher-unavailable','qualification-expiry','room-capacity','signature-overdue','reportbook-overdue','substitution-open','exam-readiness','practice-visit'])assert.ok(radar.includes(risk),`future radar rule ${risk} missing`);
assert.match(radar,/education_alert_runs/,'Future Radar notifications must be deduplicated');
assert.match(radar,/tenant_admin/,'high risk Future Radar alerts must target customer admins');
assert.match(cycle,/runFutureRadarAllTenants/,'Future Radar must run in platform automation');
assert.match(cycle,/runConsistencyAllTenants/,'consistency scan must run in platform automation');

for(const finding of ['lesson-absent-teacher','selfstudy-attendance','missing-session','classbook-no-curriculum','reportbook-broken-lesson','lesson-outside-course','room-reservation-mismatch','possible-import-duplicate'])assert.ok(consistency.includes(finding),`self-healing finding ${finding} missing`);
assert.ok(!consistency.includes('DELETE FROM attendance_sessions'),'self-healing must not silently delete teaching evidence');
assert.match(consistency,/never_auto_delete:true/,'legacy duplicate detection must be proposal-only');

assert.match(proof,/individual_attendance:false/,'proof graph must omit individual attendance');
assert.match(proof,/participant_names:false/,'proof graph must omit participant names');
assert.match(proof,/grades:false/,'proof graph must omit grades');
assert.match(proof,/private_notes:false/,'proof graph must omit private notes');
assert.match(proof,/graph_sha256/,'proof package must be cryptographically bound');
assert.match(proof,/classbook_documentation_percent/,'proof graph must measure documentation completeness');
assert.match(proof,/curriculum_link_percent/,'proof graph must measure curriculum provenance');

assert.match(intent,/Mehrdeutige|ambiguities|candidates/,'intent parser must surface ambiguity instead of guessing');
assert.match(intent,/Es wurden keine Produktivdaten verändert/,'intent preview must explain its read-only nature');
assert.match(intent,/INTENT_NOT_SAFE_TO_SIMULATE/,'ambiguous intent must fail closed');
assert.ok(!intent.includes('fetch("https://'),'intent parser must remain deterministic and independent of external LLM writes');
assert.match(intent,/teacher_absence/,'intent parser must recognize teacher absence');
assert.match(intent,/room_outage/,'intent parser must recognize room outage');
assert.match(intent,/curriculum_recovery/,'intent parser must recognize curriculum recovery');

for(const route of ['/api/education-os/twin','/api/education-os/scenarios','/api/education-os/intent/preview','/api/education-os/risks','/api/education-os/consistency','/api/education-os/proof'])assert.ok(router.includes(route),`Education OS route ${route} missing`);
assert.match(router,/AUTOPILOT_TENANT_ADMIN_REQUIRED|requireAutopilotTenantAdmin/,'manual security-sensitive scans/status changes must remain tenant-admin gated');
assert.match(bridge,/handleEducationOsApi/,'Education OS router must be connected before generic education routes');

assert.match(customer,/kp-lazy-module-manifest/,'customer admin must expose an auditable on-demand module manifest');
assert.match(customerLazy,/education-os\.css/,'customer admin must make Education OS styles available on demand');
assert.match(customerLazy,/education-os-ui/,'customer admin must make Education OS workspace available on demand');
assert.doesNotMatch(customer,/<link[^>]+education-os\.css/,'Education OS styles must not regress to eager first-paint loading');
assert.doesNotMatch(customer,/src="\/education-os-ui\.js/,'Education OS workspace must not regress to eager first-paint loading');
assert.ok(!platform.includes('education-os-ui.js'),'platform admin UI must remain untouched');
for(const label of ['Future Radar','Scenario Lab','Self-Healing','Proof Graph','Autopilot-Sicherheitskern'])assert.ok(ui.includes(label),`Education OS UI ${label} missing`);
assert.match(ui,/Keine direkten Schreibrechte|keine direkten Schreibrechte/i,'UI must explain that language/AI has no direct write access');
assert.match(ui,/Vier-Augen-Prinzip/,'UI must surface dual control');
assert.match(ui,/AUTOPILOT_TWIN_CHANGED_RESIMULATE/,'UI must explain stale-snapshot safety');

for(const concept of ['Live Education Twin','Education Autopilot','Scenario Lab','Proof Graph','Future Radar','Self-healing Data'])assert.ok(product.includes(concept),`product law ${concept} missing`);
assert.match(product,/Regelwerk vor KI/,'product strategy must keep deterministic rules before AI');
assert.match(product,/Erst simulieren, dann verändern/,'product strategy must require simulation before mutation');

console.log('Education Operating System architecture/security/lazy-runtime regression ok');
