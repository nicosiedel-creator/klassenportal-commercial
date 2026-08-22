import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0058_assignments_gradebook.sql','utf8');
const personalMigration=await readFile('migrations/0066_assignment_participant_workspace.sql','utf8');
const schema=await readFile('src/core/assignments-schema.ts','utf8');
const core=await readFile('src/core/assignments-gradebook.ts','utf8');
const personalState=await readFile('src/core/assignment-participant-state.ts','utf8');
const router=await readFile('src/core/assignments-router.ts','utf8');
const attendanceRouter=await readFile('src/core/attendance-router.ts','utf8');
const participantUi=await readFile('public/portal-assignments-ui.js','utf8');
const dashboard=await readFile('public/student-dashboard-ui.js','utf8');
const adminUi=await readFile('public/assignment-gradebook-ui.js','utf8');
const portal=await readFile('public/class-portal.html','utf8');
const portalLazy=await readFile('public/portal-lazy-runtime.js','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const classAdmin=await readFile('public/class-admin.html','utf8');
const studentRole=await readFile('src/core/student-role.ts','utf8');

for(const table of ['assignment_submissions','assignment_submission_files','gradebook_items','gradebook_scores','gradebook_events'])assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS ${table}`),`missing ${table}`);
for(const state of ['draft','submitted','returned','graded','withdrawn'])assert.ok(migration.includes(`'${state}'`),`missing submission state ${state}`);
assert.match(schema,/ensureAssignmentsGradebookSchema/,'runtime schema guard required');
assert.match(core,/requireParticipant\(auth,courseId\)/,'participant writes must be scoped to the authenticated participant');
assert.match(core,/requireManager\(auth,courseId\)/,'manager actions must require course-scoped management access');
assert.match(core,/MAX_FILE_BYTES=15\*1024\*1024/,'submission file cap required');
assert.match(core,/BLOCKED_TYPES/,'active file types must be blocked');
assert.match(core,/magicOk/,'known binary file signatures must be checked');
assert.match(core,/content-disposition.*attachment/s,'submitted files must only be served as attachments');
assert.match(core,/row\.user_id!==auth\.userId/,'participant file download must be restricted to own submission');
assert.match(core,/gs\.user_id=\? AND gs\.status='published'/,'participant must only receive own published official scores');
assert.match(core,/SUBMISSION_GRADED_LOCKED/,'published grading must lock participant changes until explicit return');
assert.match(core,/allow_resubmission/,'resubmission policy required');
assert.match(core,/ASSIGNMENT_DEADLINE_PASSED/,'deadline policy required');

assert.ok(personalMigration.includes('CREATE TABLE IF NOT EXISTS assignment_participant_state'),'personal assignment state table required');
for(const progress of ['open','in_progress','completed'])assert.ok(personalMigration.includes(`'${progress}'`),`missing personal progress ${progress}`);
assert.ok(personalMigration.includes('private_note TEXT'),'private assignment notes must be persisted');
assert.ok(personalState.includes('requireParticipant(auth,courseId)'),'personal state must be participant scoped');
assert.ok(personalState.includes("mode!=='info'&&progress==='completed'"),'digital work must not be manually bypassed as completed');
assert.ok(personalState.includes('safeString(input.private_note,6000)'),'private notes need a bounded length');
assert.ok(personalState.includes('hasPrivateNote:!!note'),'audit must record note presence, not private note content');

assert.match(router,/assertTenantWriteAllowed/,'commercial read-only/payment lock must apply to assignment writes');
assert.match(router,/asStudentView\(auth\)/,'class admin own assignment operations must run as participant');
assert.match(router,/forbidClassAdminStudentData\(auth\)/,'class admin must be blocked from foreign submissions and course gradebook');
assert.match(router,/auth\.role==='class_admin'\?studentAuth:auth/,'class admin assignment list/download must use own student view');
assert.match(studentRole,/FORBIDDEN_CLASS_ADMIN_STUDENT_DATA/);
assert.ok(router.includes("path==='/api/gradebook/my'"),'private participant gradebook endpoint required');
assert.ok(router.includes('/api/assignments/files')||router.includes('api\\/assignments\\/files'),'authenticated file download endpoint required');
assert.ok(router.includes("path==='/api/assignments/my-state'"),'own progress and note read endpoint required');
assert.ok(router.includes('my-state$/'),'own progress and note update route required');
assert.match(attendanceRouter,/handleAssignmentsApi/,'assignment router must be reachable before core API fallback');

assert.ok(participantUi.includes('Veröffentlichte Bewertungen'));
assert.ok(participantUi.includes('Verbindlich einreichen'));
assert.ok(participantUi.includes('Lese-/Arbeitsaufgabe'),'reading/info assignments must remain visible and actionable');
assert.ok(participantUi.includes('Meine private Notiz'),'participant needs a private assignment note editor');
assert.ok(participantUi.includes('Nur für dich sichtbar'),'note privacy must be explicit in participant UI');
assert.ok(participantUi.includes('Gespeicherter Text oder ein Upload zählt als'),'draft uploads must not be presented as completed');
assert.ok(participantUi.includes('data-toggle-done'),'info tasks need direct done/reopen control');
assert.ok(participantUi.includes('Offen (${openCount})'),'task workspace needs open filter/count');
assert.ok(dashboard.includes('function taskDone(x)'),'dashboard must derive personal task completion');
assert.ok(dashboard.includes('_personalAssignments'),'dashboard must use participant-specific assignment state');
assert.ok(dashboard.includes('Überfällig'),'open overdue tasks must stay visible in the dashboard');

assert.match(adminUi,/Offizielle Bewertungen sind getrennt von privaten Teilnehmernotizen/);
assert.match(adminUi,/Sofort für diesen Teilnehmer veröffentlichen/);
assert.doesNotMatch(portal,/src="\/portal-assignments-ui\.js/,'student portal must not execute assignment workspace on first paint');
assert.match(portalLazy,/portal-assignments-ui/,'student portal must retain own assignment/grade UI through the lazy runtime');
assert.match(customer,/assignment-gradebook-ui\.js/,'customer admin may retain administrative gradebook');
assert.doesNotMatch(classAdmin,/assignment-gradebook-ui\.js/,'class admin must never load other-student gradebook UI');
assert.match(classAdmin,/class-admin-entry\.js/,'class admin must enter through the student portal');

console.log('Secure submissions plus personal progress, reading-task completion, private notes, lazy student runtime, and dashboard integration checks: OK');
