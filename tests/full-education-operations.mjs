import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration70=await readFile('migrations/0070_education_operations_suite.sql','utf8');
const migration71=await readFile('migrations/0071_learning_modes_planner_signatures_legacy.sql','utf8');
const migration72=await readFile('migrations/0072_signature_workflow_guards.sql','utf8');
const operations=await readFile('src/core/education-operations.ts','utf8');
const learning=await readFile('src/core/learning-operations.ts','utf8');
const router=await readFile('src/core/education-operations-router.ts','utf8');
const bridge=await readFile('src/core/participant-360-router.ts','utf8');
const signatureAccess=await readFile('src/core/signature-request-access.ts','utf8');
const courseSignatures=await readFile('src/core/course-signatures.ts','utf8');
const automation=await readFile('src/core/education-automation-safe.ts','utf8');
const cycle=await readFile('src/core/automation-cycle.ts','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const extended=await readFile('public/education-operations-extended-ui.js','utf8');
const signatureComposer=await readFile('public/education-signature-compose-ui.js','utf8');
const participant=await readFile('public/class-portal.html','utf8');
const reportbook=await readFile('public/portal-report-book-ui.js','utf8');
const participantModes=await readFile('public/portal-learning-mode-ui.js','utf8');
const teacher=await readFile('public/dozentenportal.html','utf8');
const teacherLearning=await readFile('public/teacher-learning-operations-ui.js','utf8');
const teacherModes=await readFile('public/teacher-learning-mode-display.js','utf8');
const platform=await readFile('public/platform-admin.html','utf8');

for(const table of ['curriculum_frameworks','curriculum_items','practice_phases','exam_workflows','operational_deadlines','teacher_qualifications','substitution_cases','quality_actions','course_lifecycle','education_document_registry'])assert.match(migration70,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),`${table} data model missing`);
for(const table of ['instruction_activity_details','excursion_events','timetable_plan_versions','timetable_plan_entries','signature_documents','signature_requests','digital_signatures','report_book_periods','report_book_entries','legacy_import_batches','legacy_import_rows'])assert.match(migration71,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),`${table} data model missing`);
for(const mode of ['self_study_home','self_study_school','self_study_other','excursion','project','practice'])assert.ok(migration71.includes(`'${mode}'`),`activity mode ${mode} missing`);
assert.match(migration72,/trg_signature_superseded_cleanup/,'repeated report-book revision snapshots must not collide');
assert.match(migration72,/trg_digital_signature_order/,'signature ordering must be enforced at the database boundary');
assert.match(migration72,/SIGNATURE_ORDER_PENDING/,'later signers must be blocked until earlier signatures exist');
assert.match(migration72,/REPORT_BOOK_APPROVAL_REQUIRED/,'teacher countersignature must require explicit report-book approval');
assert.match(migration72,/trg_report_book_signature_complete/,'completed signatures must finalize the report book');
assert.match(migration72,/SET status='signed'/,'report book status must become signed automatically');

assert.match(operations,/curriculum_session_links/,'curriculum coverage must link classbook sessions to framework items');
assert.match(operations,/practice_phases/,'practice workflow missing');
assert.match(operations,/exam_workflows/,'exam workflow missing');
assert.match(operations,/operational_deadlines/,'deadline workflow missing');
assert.match(operations,/teacher_qualifications/,'teacher qualification workflow missing');
assert.match(operations,/course_lifecycle/,'course lifecycle missing');

assert.match(learning,/generateTimetablePlanEntries/,'recurring timetable generation missing');
assert.match(learning,/course_overlap/,'course conflict detection missing');
assert.match(learning,/teacher_overlap/,'teacher conflict detection missing');
assert.match(learning,/room_overlap/,'room conflict detection missing');
assert.match(learning,/publishTimetablePlan/,'timetable publication missing');
assert.match(learning,/self_study_home/,'home-office self-study support missing');
assert.match(learning,/excursion_events/,'excursion support missing');
assert.match(learning,/snapshot_sha256/,'signature document digest missing');
assert.match(learning,/crypto\.subtle\.digest\('SHA-256'/,'SHA-256 hashing missing');
assert.match(learning,/generateReportBookFromSchedule/,'report book schedule automation missing');
assert.match(learning,/LEGACY_STRUCTURED_FILE_UNSUPPORTED/,'legacy structured import guard missing');
assert.match(learning,/parseXlsx/,'legacy XLSX import missing');
assert.match(learning,/source='import'/,'legacy classbook must be identifiable as imported');
assert.match(learning,/started_mid_course/,'mid-course rollout marker missing');

assert.match(router,/\/api\/education\/timetable-plans/,'timetable planning routes missing');
assert.match(router,/\/api\/education\/legacy-imports/,'legacy import routes missing');
assert.match(router,/\/report-book\/periods/,'report book routes missing');
assert.match(router,/\/api\/education\/signatures/,'signature routes missing');
assert.match(bridge,/handleSecureSignatureMine/,'signature request list must go through secure course-scoped route');
assert.match(bridge,/handleCourseSignatureApi/,'course-wide confirmation route must be isolated before the generic education router');
assert.match(signatureAccess,/teacher_portal_assignments/,'unassigned teacher signatures must be course-scoped');
assert.match(signatureAccess,/r\.signer_user_id=\?/,'own assigned signature requests missing');
assert.match(courseSignatures,/role IN \('participant','class_admin'\)/,'course confirmation audience must be the students of exactly one course');
assert.match(courseSignatures,/snapshot_sha256/,'course confirmations need an immutable digest');
assert.match(courseSignatures,/external_qualified/,'course confirmations must support an external QES level without mislabelling portal confirmation');

assert.match(automation,/memberships WHERE tenant_id=\? AND role='tenant_admin'/,'education automation must use a real tenant actor');
assert.ok(!automation.includes("created_by,'system'"),'education automation must not write invalid system user foreign keys');
assert.match(cycle,/runSafeEducationAutomation/,'safe education automation must run');
assert.match(cycle,/runLearningOperationsAutomation/,'signature/learning automation must run');

assert.match(customer,/education-operations-admin-ui\.js/,'customer admin education operations workspace missing');
assert.match(customer,/education-operations-extended-ui\.js/,'customer admin extended operations workspace missing');
assert.match(customer,/education-signature-compose-ui\.js/,'customer admin course-confirmation composer missing');
for(const text of ['Stundenplanplanung','Lernformen & Exkursionen','Berichtshefte','Unterschriften','Datenübernahme'])assert.ok(extended.includes(text),`customer admin tab ${text} missing`);
assert.match(extended,/Homeoffice/,'customer admin must expose home-office self-study planning');
assert.match(extended,/Schule/,'customer admin must expose school self-study planning');
assert.match(extended,/Kollidiert|Konflikte/,'planning UI must expose conflict validation');
assert.match(extended,/\.csv,\.xlsx,\.pdf/,'legacy migration UI must accept structured and archived history');
assert.match(signatureComposer,/An alle Teilnehmer senden/,'customer admin must be able to create course-wide confirmation requests');
assert.match(signatureComposer,/Portal-authentifizierte Bestätigung/,'built-in confirmation must be clearly distinguished from QES');

assert.match(participant,/portal-curriculum-ui\.js/,'participant curriculum progress missing');
assert.match(participant,/portal-report-book-ui\.js/,'participant digital report book missing');
assert.match(participant,/portal-learning-mode-ui\.js/,'participant timetable must expose structured learning modes');
assert.match(reportbook,/Selbstlernphase · Homeoffice/,'participant report book must support home-office self-study');
assert.match(reportbook,/Aus Stundenplan ergänzen/,'report book must support automated schedule prefill');
assert.match(reportbook,/digital bestätigen/,'participant digital confirmation UI missing');
assert.ok(!reportbook.includes('participant_name'),'participant report book UI must not render peer identities');
assert.match(participantModes,/Self|self_study_home|Selbstlernphase/,'participant timetable learning-mode decoration missing');

assert.match(teacher,/teacher-learning-operations-ui\.js/,'teacher learning operations workspace missing');
assert.match(teacher,/teacher-learning-mode-display\.js/,'teacher calendar learning-mode display missing');
assert.match(teacherLearning,/Lernform/,'teacher must be able to classify learning activity');
assert.match(teacherLearning,/Berichtshefte prüfen/,'teacher report book review missing');
assert.match(teacherLearning,/Gegenzeichnen/,'teacher digital countersignature missing');
assert.match(teacherLearning,/self_study_home/,'teacher self-study home mode missing');
assert.match(teacherModes,/self_study_home/,'teacher calendar must visibly identify self-study home periods');

assert.ok(!platform.includes('education-operations-admin-ui.js'),'platform admin must remain visually untouched');
assert.ok(!platform.includes('education-operations-extended-ui.js'),'platform admin must not load customer education workspace');
assert.ok(!platform.includes('portal-report-book-ui.js'),'platform admin must not load participant report book UI');
assert.ok(!platform.includes('education-signature-compose-ui.js'),'platform admin must not load customer signature composer');

console.log('full education operations regression ok');
