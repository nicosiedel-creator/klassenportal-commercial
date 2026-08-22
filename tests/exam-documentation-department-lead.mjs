import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0069_exam_documentation_profiles.sql','utf8');
const core=await readFile('src/core/exam-documentation.ts','utf8');
const quality=await readFile('src/core/department-quality.ts','utf8');
const delegated=await readFile('src/core/delegated-privilege.ts','utf8');
const router=await readFile('src/core/collaboration-reporting-router.ts','utf8');
const teacherUi=await readFile('public/teacher-classbook-export-ui.js','utf8');
const adminUi=await readFile('public/exam-documentation-admin-ui.js','utf8');
const leadAdmin=await readFile('public/department-lead-admin-ui.js','utf8');
const leadUi=await readFile('public/department-lead.js','utf8');
const teacherHtml=await readFile('public/dozentenportal.html','utf8');
const teacherLazy=await readFile('public/teacher-lazy-modules.js','utf8');
const customerHtml=await readFile('public/customer-admin.html','utf8');
const customerLazy=await readFile('public/customer-admin-lazy-modules.js','utf8');

assert.match(migration,/CREATE TABLE IF NOT EXISTS exam_authority_profiles/,'custom authority requirements need persistence');
assert.match(migration,/CREATE TABLE IF NOT EXISTS course_exam_authority_profiles/,'courses need a selectable documentation profile');
assert.match(migration,/CREATE TABLE IF NOT EXISTS classbook_export_runs/,'exports need an audit trail');
assert.match(migration,/profile_snapshot_json TEXT NOT NULL/,'export audit must retain the exact authority/profile rules used');
assert.match(migration,/CREATE TABLE IF NOT EXISTS classbook_entry_reviews/,'Fachbereich review state needs persistence');
assert.match(migration,/authority_type IN \('ihk','hwk','vak','internal','custom','other'\)/,'authority types must be constrained');

assert.match(core,/builtin:ihk-berlin-umschulung/,'IHK Berlin documentation template must exist');
assert.match(core,/builtin:hwk-berlin/,'HWK Berlin documentation template must exist');
assert.match(core,/builtin:vak-berlin-vfa/,'VAk Berlin documentation template must exist');
assert.match(core,/builtin:topics/,'neutral topics-only profile must exist');
assert.match(core,/teacherAttendanceAuth/,'teachers may export only through explicit teacher assignment auth');
assert.match(core,/hasPermission\(auth,'reports.view'\)/,'delegated quality roles require reporting permission');
assert.ok(!core.includes('attendance_records'),'topics-only export core must not query individual attendance records');
assert.ok(!core.includes('gradebook_scores'),'topics-only export core must not query grades');
assert.ok(!core.includes('JOIN users'),'topics-only export core must not join participant users');
assert.match(core,/keine Teilnehmernamen, Anwesenheiten, Fehlzeiten oder Noten/,'printed evidence must state the privacy boundary');
assert.match(core,/profileSnapshot=JSON\.stringify\(data\.profile\)/,'export audit must snapshot profile settings');
assert.match(core,/digest\(\{profile:data\.profile,period:data\.period,rows:data\.rows\}\)/,'integrity digest must cover the actual profile rules as well as rows');
assert.match(core,/grouping==='subject'/,'custom profile grouping must affect output ordering');

assert.match(quality,/SELECT COUNT\(\*\) FROM attendance_sessions/,'Fachbereich summary must aggregate sessions independently');
assert.ok(!quality.includes('LEFT JOIN exams'),'exam rows must not multiply classbook session counts');
assert.match(quality,/SELECT MIN\(e.starts_at\) FROM exams/,'next exam must be a correlated aggregate');
assert.match(quality,/hasPermission\(auth,'reports.view'\)/,'Fachbereich overview requires reporting access');

assert.match(delegated,/MFA_ENROLLMENT_REQUIRED/,'delegated quality roles must enroll MFA');
assert.match(delegated,/MFA_REQUIRED/,'delegated quality roles must use an MFA-authenticated session');
assert.match(delegated,/method==='oidc'/,'tenant OIDC sessions may satisfy delegated strong authentication');
assert.match(router,/forbidClassAdminStudentData\(auth\)/,'student class-admin must remain blocked from reporting APIs');
assert.match(router,/requireDelegatedPrivilegeMfa\(env,auth\)/,'reporting APIs must enforce strong authentication for delegated roles');
assert.match(router,/\/api\/reports\/classbook\/export\.csv/,'CSV classbook evidence route must exist');
assert.match(router,/\/api\/reports\/classbook\/export\.html/,'print/PDF classbook evidence route must exist');
assert.match(router,/\/api\/reports\/department\/overview/,'Fachbereich quality route must exist');
assert.match(router,/departmentQualityOverviewSafe/,'router must use non-multiplying quality aggregation');

assert.match(teacherUi,/Unterrichtsnachweis exportieren/,'teacher calendar needs direct evidence export');
assert.match(teacherUi,/keine Teilnehmernamen, Anwesenheiten, Fehlzeiten oder Noten/,'teacher export UI must communicate privacy boundary');
assert.match(adminUi,/Bildungsträger ist selbst Prüfungsorganisation/,'customer can define its own examination organisation requirements');
assert.match(adminUi,/Personenbezogene Teilnehmerdaten, Anwesenheiten und Noten sind in diesem Exporttyp technisch nicht auswählbar/,'custom profiles must remain privacy-safe');

assert.match(leadAdmin,/const LEAD_PERMS=\['org.view','courses.view','content.view','reports.view'\]/,'Fachbereich role must use exact narrow read/report permissions');
assert.ok(!leadAdmin.match(/LEAD_PERMS[^\n]+participants\.manage/),'Fachbereich role must not manage participants');
assert.ok(!leadAdmin.match(/LEAD_PERMS[^\n]+access\.manage/),'Fachbereich role must not manage access');
assert.match(leadUi,/fehlende Themen/,'Fachbereich dashboard must surface documentation gaps');
assert.match(leadUi,/Korrektur anfordern/,'Fachbereich needs a review/correction workflow');
assert.match(leadUi,/Unterrichtsnachweis/,'Fachbereich needs authority-ready topic exports');
assert.match(leadUi,/Individuelle Schülernoten, Anwesenheiten und Fehlzeiten sind nicht Bestandteil/,'Fachbereich portal must state its privacy boundary');

assert.match(teacherHtml,/teacher-lazy-modules\.js\?v=20260822-1/,'teacher portal must load its bounded module controller');
assert.ok(teacherLazy.includes("'teacher-classbook-export-ui'"),'teacher classbook evidence export must remain available on demand');
assert.doesNotMatch(teacherHtml,/src="\/teacher-classbook-export-ui\.js/,'teacher evidence export must not execute on first paint');
assert.match(customerHtml,/kp-lazy-module-manifest/,'customer admin must expose an auditable lazy-module manifest');
assert.match(customerLazy,/exam-documentation-admin-ui/,'customer admin must make exam documentation management available on demand');
assert.match(customerLazy,/department-lead-admin-ui/,'customer admin must make Fachbereich assignment management available on demand');
assert.doesNotMatch(customerHtml,/src="\/exam-documentation-admin-ui\.js/,'exam documentation must not regress to eager loading');
assert.doesNotMatch(customerHtml,/src="\/department-lead-admin-ui\.js/,'Fachbereich management must not regress to eager loading');

console.log('Examination documentation and Fachbereich privacy/lazy-loading checks: OK');
