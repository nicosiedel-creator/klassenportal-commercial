import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile('migrations/0076_education_os_readiness_guardrails.sql','utf8');
const readiness=await readFile('src/core/education-readiness.ts','utf8');
const guardrails=await readFile('src/core/education-guardrails.ts','utf8');
const guarded=await readFile('src/core/education-autopilot-guarded.ts','utf8');
const router=await readFile('src/core/education-os-router.ts','utf8');
const cycle=await readFile('src/core/automation-cycle.ts','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const readinessUi=await readFile('public/education-os-readiness-ui.js','utf8');
const platform=await readFile('public/platform-admin.html','utf8');
const twin=await readFile('src/core/education-twin.ts','utf8');
const intent=await readFile('src/core/education-intent.ts','utf8');

for(const table of ['education_readiness_snapshots','education_guardrail_evaluations'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),`${table} missing`);
for(const trigger of ['trg_readiness_snapshot_immutable_update','trg_readiness_snapshot_immutable_delete','trg_guardrail_evaluation_immutable_update','trg_guardrail_evaluation_immutable_delete'])assert.match(migration,new RegExp(trigger),`${trigger} missing`);
assert.match(migration,/phase TEXT NOT NULL CHECK\(phase IN \('pre_approval','pre_execution','post_execution','manual_check'\)\)/,'guardrail phases missing');
assert.match(migration,/evidence_sha256 TEXT NOT NULL/,'guardrail evidence must be hashed');

for(const dimension of ['curriculum','documentation','exam_readiness','operations','data_integrity','evidence_chain','staffing'])assert.ok(readiness.includes(`${dimension}:`),`readiness dimension ${dimension} missing`);
assert.match(readiness,/participant_names:false/,'readiness must exclude participant identities');
assert.match(readiness,/individual_attendance:false/,'readiness must exclude individual attendance');
assert.match(readiness,/grades:false/,'readiness must exclude grades');
assert.match(readiness,/private_notes:false/,'readiness must exclude private notes');
assert.match(readiness,/education_readiness_snapshots/,'readiness trend must be persisted');

for(const blocker of ['TEACHER_UNAVAILABLE','TEACHER_DOUBLE_BOOKED','TEACHER_QUALIFICATION_MISSING','ROOM_UNAVAILABLE','ROOM_BLOCKED','ROOM_DOUBLE_BOOKED','ROOM_CAPACITY_TOO_SMALL','EXAM_LESSON_CONFLICT','EXAM_EXAM_CONFLICT','SELF_STUDY_ATTENDANCE_CONTRADICTION','SELF_STUDY_TASK_REQUIRED'])assert.ok(guardrails.includes(blocker),`guardrail ${blocker} missing`);
assert.match(guardrails,/evaluateAutopilotGuardrails/,'guardrail evaluator missing');
assert.match(guardrails,/sha256Text\(stableStringify\(immutableEvidence\)\)/,'guardrail evidence must be cryptographically bound');
assert.match(guarded,/pre_approval/,'approval must pass deterministic guardrails');
assert.match(guarded,/pre_execution/,'execution must re-run deterministic guardrails');
assert.match(guarded,/AUTOPILOT_GUARDRAIL_BLOCKED/,'guardrail blockers must fail closed');
assert.match(router,/approveGuardedScenarioOption/,'router must not bypass approval guardrails');
assert.match(router,/executeGuardedScenarioOption/,'router must not bypass execution guardrails');
for(const route of ['/api/education-os/readiness','/api/education-os/readiness/snapshot','/api/education-os/readiness/trend'])assert.ok(router.includes(route),`readiness route ${route} missing`);
assert.match(cycle,/runReadinessSnapshots/,'readiness trends must be captured by automation cycle');

assert.match(customer,/education-os-readiness-ui\.js/,'customer admin must load readiness extension');
assert.match(readinessUi,/Operational Readiness/,'readiness cockpit card missing');
assert.match(readinessUi,/ohne individuelle Schülerdaten/,'readiness UI must state privacy boundary');
assert.ok(!platform.includes('education-os-readiness-ui.js'),'platform admin UI must remain untouched');

assert.match(twin,/least_privilege_scope/,'twin must record least-privilege scope');
assert.match(twin,/FORBIDDEN_TENANT_SNAPSHOT/,'delegated users must not fetch tenant-wide snapshots');
assert.match(twin,/teacher_qualifications q WHERE q\.tenant_id=\?/,'teacher qualification source must be explicitly scoped');
assert.match(intent,/tenantTimezone/,'intent dates must use tenant timezone');
assert.match(intent,/INTENT_LOCAL_TIME_AMBIGUOUS_DST/,'ambiguous DST times must fail closed');
assert.match(intent,/INTENT_LOCAL_TIME_INVALID_DST/,'nonexistent DST times must fail closed');

console.log('Education OS readiness/guardrail regression ok');
