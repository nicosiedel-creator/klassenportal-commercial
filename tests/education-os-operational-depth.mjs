import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const guardMigration=await readFile('migrations/0077_education_os_precondition_guard.sql','utf8');
const recovery=await readFile('src/core/adaptive-recovery.ts','utf8');
const recoveryRouter=await readFile('src/core/adaptive-recovery-router.ts','utf8');
const roleInsights=await readFile('src/core/education-role-insights.ts','utf8');
const roleRouter=await readFile('src/core/education-role-insights-router.ts','utf8');
const guarded=await readFile('src/core/education-autopilot-guarded.ts','utf8');
const maintenance=await readFile('src/core/education-os-maintenance.ts','utf8');
const teacherHtml=await readFile('public/dozentenportal.html','utf8');
const teacherLazy=await readFile('public/teacher-lazy-modules.js','utf8');
const teacherUi=await readFile('public/teacher-operational-insights-ui.js','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const innovationUi=await readFile('public/education-os-innovation-ui.js','utf8');
const platform=await readFile('public/platform-admin.html','utf8');
const participantRouter=await readFile('src/core/participant-360-router.ts','utf8');

assert.match(guardMigration,/education_autopilot_precondition_guard/,'database precondition guard table missing');
assert.match(guardMigration,/CHECK\(id=1\)/,'precondition guard must have a deterministic failing value');

assert.match(guarded,/rollbackGuardedAutopilotExecution/,'guarded rollback missing');
assert.match(guarded,/status='stale'/,'rollback must invalidate old scenario approvals');
assert.match(guarded,/resimulation_required:true/,'rollback must explicitly require re-simulation');

for(const source of ['teacher_qualifications','teacher_unavailability','planning_blackouts','course_scheduling_rules','planning_resources'])assert.ok(recovery.includes(source),`adaptive recovery source ${source} missing`);
assert.match(recovery,/ROOM|roomFor|resource/,'adaptive recovery must consider rooms/resources');
assert.match(recovery,/participantCount|participants/,'adaptive recovery must consider room capacity');
assert.match(recovery,/max_daily_minutes/,'adaptive recovery must consider course daily load');
assert.match(recovery,/teacherFor/,'adaptive recovery must choose an available teacher');
assert.match(recovery,/sha256Text\(stableStringify\(planCore\)\)/,'adaptive recovery plan must be digest-bound');
assert.match(recoveryRouter,/RECOVERY_PLAN_DIGEST_CHANGED/,'recovery draft must be revalidated by digest');
assert.match(recoveryRouter,/requireAutopilotTenantAdminMfa/,'creating recovery draft must require tenant admin MFA');
assert.match(recoveryRouter,/status:'draft'/,'recovery must only create a draft timetable');
assert.match(recoveryRouter,/automatic:false/,'recovery must never publish automatically');
assert.match(recoveryRouter,/validateAdvancedTimetablePlan/,'recovery draft must run advanced validation');

assert.match(roleInsights,/teacherAttendanceAuth/,'teacher insights must require explicit teacher-course assignment');
assert.match(roleInsights,/participant_names:false/,'teacher operational insight must exclude participant names');
assert.match(roleInsights,/individual_attendance:false/,'teacher operational insight must exclude individual attendance');
assert.match(roleInsights,/grades:false/,'teacher operational insight must exclude grades');
assert.match(roleInsights,/private_notes:false/,'teacher operational insight must exclude private notes');
assert.match(roleInsights,/can_execute_autopilot:false/,'teacher must not execute tenant autopilot');
assert.match(roleRouter,/teacherOperationalInsights/,'teacher insights route missing');
assert.match(participantRouter,/handleEducationRoleInsightsApi/,'teacher insights must be routed before generic Education OS');
assert.match(participantRouter,/handleAdaptiveRecoveryApi/,'adaptive recovery must be routed before generic Education OS');
assert.match(teacherHtml,/teacher-lazy-modules\.js/,'teacher portal must use its bounded lazy runtime');
assert.match(teacherLazy,/teacher-operational-insights-ui/,'teacher workspace must lazy-load its privacy-safe operational radar');
assert.doesNotMatch(teacherHtml,/src="\/teacher-operational-insights-ui\.js/,'operational radar must stay out of teacher first paint');
assert.match(teacherUi,/Unterrichtsradar/,'teacher operational radar UI missing');
assert.match(teacherUi,/Keine Noten, privaten Notizen oder personenbezogenen Anwesenheitsdaten/,'teacher UI must state its privacy boundary');

assert.match(customer,/education-os-innovation-ui\.js/,'customer admin must expose innovation extension through its on-demand manifest');
assert.match(innovationUi,/Adaptive Recovery/,'Adaptive Recovery UI missing');
assert.match(innovationUi,/Stundenplan-Entwurf/,'Recovery UI must make draft-only behavior visible');
assert.match(innovationUi,/Kein Befund wird automatisch repariert/,'Self-Healing UI must be proposal-only');
assert.match(innovationUi,/Lösung simulieren/,'Self-Healing must be able to turn safe findings into simulations');
assert.ok(!platform.includes('education-os-innovation-ui.js'),'platform admin must remain visually untouched');
assert.ok(!platform.includes('teacher-operational-insights-ui.js'),'platform admin must not load teacher radar');

assert.match(maintenance,/expired_scenarios/,'expired scenarios must be invalidated automatically');
assert.match(maintenance,/expired_locks/,'expired autopilot locks must be cleaned');
assert.match(maintenance,/old_twin_snapshots/,'unused old twin snapshots must be cleaned with retention');
assert.match(maintenance,/old_readiness/,'readiness history retention missing');
assert.match(maintenance,/education_guardrail_evaluations/,'failed execution cleanup must preserve guardrail evidence');

console.log('Education OS operational depth regression ok');