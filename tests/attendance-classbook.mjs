import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0054_attendance_classbook.sql','utf8');
const roleMigration=await readFile('migrations/0064_class_admin_student_teacher_portal.sql','utf8');
const code=await readFile('src/core/attendance-classbook.ts','utf8');
const router=await readFile('src/core/attendance-router.ts','utf8');
const studentRole=await readFile('src/core/student-role.ts','utf8');
const teacherCore=await readFile('src/core/teacher-portal.ts','utf8');
const participantUi=await readFile('public/portal-attendance-ui.js','utf8');
const teacherUi=await readFile('public/teacher-portal.js','utf8');
const teacherHtml=await readFile('public/dozentenportal.html','utf8');
const teacherAssignUi=await readFile('public/teacher-assignment-ui.js','utf8');
const customerHtml=await readFile('public/customer-admin.html','utf8');
const classAdminHtml=await readFile('public/class-admin.html','utf8');
const portalHtml=await readFile('public/class-portal.html','utf8');
const portalLazy=await readFile('public/portal-lazy-runtime.js','utf8');
const readiness=await readFile('src/core/launch-readiness.ts','utf8');
const index=await readFile('src/index.ts','utf8');

for(const table of ['attendance_sessions','attendance_records','absence_notices','classbook_entries','attendance_policies','attendance_events'])assert.ok(migration.includes(`TABLE IF NOT EXISTS ${table}`),`attendance migration missing ${table}`);
for(const status of ['present','remote_present','late','excused_absent','unexcused_absent','not_recorded'])assert.ok(migration.includes(`'${status}'`),`attendance status missing ${status}`);
assert.doesNotMatch(migration,/diagnos|krankheitsgrund|medical_reason|health_reason/i,'attendance schema must not store diagnosis/health reason fields by default');
assert.match(migration,/starts_on TEXT NOT NULL/);assert.match(migration,/ends_on TEXT NOT NULL/);

assert.match(roleMigration,/SELECT 'mem_student_'.*role='class_admin'/s,'existing class admins must receive participant membership');
assert.match(roleMigration,/trg_class_admin_student_membership_insert/,'future class admins must automatically remain students');
assert.match(roleMigration,/CREATE TABLE IF NOT EXISTS teacher_portal_assignments/,'teacher portal must use an explicit assignment table');
assert.match(roleMigration,/UNIQUE\(tenant_id,user_id,course_id\)/,'one portal user must have exactly one teacher identity per course');
assert.match(roleMigration,/auth_membership_id TEXT/,'technical teacher course access must be tracked for safe revocation');
assert.match(studentRole,/auth\.role==='class_admin'\?\{\.\.\.auth,role:'participant'\}/,'class admin self-service must run as participant');
assert.match(studentRole,/FORBIDDEN_CLASS_ADMIN_STUDENT_DATA/,'foreign student data must fail closed for class admins');
assert.match(teacherCore,/TEACHER_STUDENT_ROLE_CONFLICT/,'same-course student/class-admin accounts must never become teachers');
assert.match(teacherCore,/teacher_portal_assignments WHERE tenant_id=\? AND course_id=\? AND user_id=\?/,'teacher access must be based on explicit user/course assignment');
assert.match(teacherCore,/DELETE FROM memberships[\s\S]*role='guest'/,'revocation must remove only technical teacher memberships');
assert.match(teacherCore,/FORBIDDEN_TEACHER_COURSE/,'teacher access must fail closed without an explicit assignment');
assert.doesNotMatch(teacherCore,/MFA_|platform_mfa|authMethod!=='mfa'/,'teacher attendance/classbook access must not retain removed MFA dependencies');

assert.match(code,/m\.role='participant'/,'attendance roster and personalised summary must use actual participants only');
assert.match(code,/participantInCourse/,'recording must verify participant membership server-side');
assert.match(code,/requireCourseAccess/,'attendance access must remain course scoped');
assert.match(code,/suggested_status:!x\.status&&x\.absence_notice_id\?'excused_absent'/,'accepted absence notices may suggest but not silently write attendance');
assert.match(code,/saveAttendanceRecords/);assert.match(code,/saveClassbookEntry/);
assert.match(code,/submitAbsenceNotice/);assert.doesNotMatch(code,/input\.(?:reason|diagnosis|medical|health)/i,'participant absence submission must not ingest health reasons');
assert.match(code,/reviewAbsenceNotice/,'teachers must explicitly accept/reject administrative absence status');
assert.match(code,/no_automatic_consequence:true/,'threshold alerts must explicitly record that there is no automatic consequence');
assert.match(code,/runAttendanceAttention/);assert.match(code,/automation_tasks/,'attendance thresholds must feed the attention cockpit');

for(const route of ['/api/attendance/sessions','/records','/classbook','/absence/my','/summary/course','/policy'])assert.ok(router.includes(route),`attendance route missing ${route}`);
for(const route of ['/api/attendance/teacher/courses','/api/attendance/teacher/options','/api/attendance/teacher/master','/api/attendance/teacher/assignments'])assert.ok(router.includes(route),`teacher portal route missing ${route}`);
assert.match(router,/asStudentView\(auth\)/,'class admin own attendance must use participant context');
assert.match(router,/forbidClassAdminStudentData\(auth\)/,'class admin must be blocked before manager attendance routes');
assert.match(router,/teacherAttendanceAuth/,'attendance management must use explicit teacher authorization');
assert.match(router,/assertSameOrigin/);assert.match(router,/assertTenantWriteAllowed/);
assert.match(participantUi,/Gesundheits-\/Diagnosedaten werden nicht abgefragt/);assert.match(participantUi,/Abwesenheit einreichen/);
for(const marker of ['Dozentenportal','Unterrichtsklassen','Anwesenheitsübersicht','Digitales Klassenbuch'])assert.ok(teacherUi.includes(marker)||teacherHtml.includes(marker),`teacher portal UX missing ${marker}`);
assert.doesNotMatch(teacherHtml,/auth-mfa-ui\.js|admin-mfa-enrollment-ui\.js|MFA|TOTP/i,'teacher portal must not load removed MFA UI');
assert.match(teacherAssignUi,/TEACHER_STUDENT_ROLE_CONFLICT/,'tenant admin assignment UI must explain student/teacher conflicts');
assert.doesNotMatch(customerHtml,/attendance-classbook-ui\.js/,'operational attendance/classbook UI must not remain in customer admin');
assert.match(customerHtml,/teacher-assignment-ui\.js/,'customer admin must configure teacher portal assignments');
assert.doesNotMatch(classAdminHtml,/attendance-classbook-ui\.js/,'class admin must never load class attendance/classbook management');
assert.match(classAdminHtml,/class-admin-entry\.js/,'class admin entry must redirect into student portal');
assert.doesNotMatch(portalHtml,/src="\/portal-attendance-ui\.js/,'student attendance UI must not block first paint');
assert.match(portalLazy,/portal-attendance-ui/,'student portal must retain own attendance UI through the lazy runtime');
assert.match(portalLazy,/class-admin-student-tools/,'class admin extras must live inside the same lazy student portal');
assert.match(index,/handleAttendanceApi/);assert.match(index,/runAttendanceAttention/);
for(const table of ['attendance_sessions','attendance_records','absence_notices','classbook_entries','attendance_policies','attendance_events','teacher_portal_assignments'])assert.ok(readiness.includes(`'${table}'`),`live gate must require ${table}`);

console.log('Class-admin-as-student privacy, assignment-protected teacher portal, lazy attendance self-service and classbook separation checks: OK');
