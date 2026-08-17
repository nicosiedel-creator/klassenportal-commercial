import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0054_attendance_classbook.sql','utf8');
const code=await readFile('src/core/attendance-classbook.ts','utf8');
const router=await readFile('src/core/attendance-router.ts','utf8');
const adminUi=await readFile('public/attendance-classbook-ui.js','utf8');
const participantUi=await readFile('public/portal-attendance-ui.js','utf8');
const customerHtml=await readFile('public/customer-admin.html','utf8');
const classAdminHtml=await readFile('public/class-admin.html','utf8');
const portalHtml=await readFile('public/class-portal.html','utf8');
const index=await readFile('src/index.ts','utf8');

for(const table of ['attendance_sessions','attendance_records','absence_notices','classbook_entries','attendance_policies','attendance_events'])assert.ok(migration.includes(`TABLE IF NOT EXISTS ${table}`),`attendance migration missing ${table}`);
for(const status of ['present','remote_present','late','excused_absent','unexcused_absent','not_recorded'])assert.ok(migration.includes(`'${status}'`),`attendance status missing ${status}`);
assert.doesNotMatch(migration,/diagnos|krankheitsgrund|medical_reason|health_reason/i,'attendance schema must not store diagnosis/health reason fields by default');
assert.match(migration,/starts_on TEXT NOT NULL/);assert.match(migration,/ends_on TEXT NOT NULL/);

assert.match(code,/m\.role='participant'/,'attendance roster and personalised summary must use actual participants only');
assert.match(code,/participantInCourse/,'recording must verify participant membership server-side');
assert.match(code,/requireCourseAccess/,'attendance access must remain course scoped');
assert.match(code,/suggested_status:!x\.status&&x\.absence_notice_id\?'excused_absent'/,'accepted absence notices may suggest but not silently write attendance');
assert.match(code,/saveAttendanceRecords/);assert.match(code,/saveClassbookEntry/);
assert.match(code,/submitAbsenceNotice/);assert.doesNotMatch(code,/input\.(?:reason|diagnosis|medical|health)/i,'participant absence submission must not ingest health reasons');
assert.match(code,/reviewAbsenceNotice/,'responsibles must explicitly accept/reject administrative absence status');
assert.match(code,/no_automatic_consequence:true/,'threshold alerts must explicitly record that there is no automatic consequence');
assert.match(code,/runAttendanceAttention/);assert.match(code,/automation_tasks/,'attendance thresholds must feed the attention cockpit');

for(const route of ['/api/attendance/sessions','/records','/classbook','/absence/my','/summary/course','/policy'])assert.ok(router.includes(route),`attendance route missing ${route}`);
assert.match(router,/assertSameOrigin/);assert.match(router,/assertTenantWriteAllowed/);
for(const marker of ['Anwesenheit & Klassenbuch','Digitales Klassenbuch ohne Gesundheitsdiagnosen','Abwesenheitsmeldungen zur Prüfung','keine automatische Sanktion'])assert.ok(adminUi.includes(marker),`attendance admin UX missing ${marker}`);
assert.match(participantUi,/Gesundheits-\/Diagnosedaten werden nicht abgefragt/);assert.match(participantUi,/Abwesenheit einreichen/);
assert.match(customerHtml,/attendance-classbook-ui\.js/);assert.match(classAdminHtml,/attendance-classbook-ui\.js/);assert.match(portalHtml,/portal-attendance-ui\.js/);
assert.match(index,/handleAttendanceApi/);assert.match(index,/runAttendanceAttention/);

console.log('Privacy-safe attendance, absence self-service, digital classbook and non-automated threshold attention checks: OK');
