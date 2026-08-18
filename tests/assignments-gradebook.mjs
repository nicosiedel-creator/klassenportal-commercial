import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0058_assignments_gradebook.sql','utf8');
const schema=await readFile('src/core/assignments-schema.ts','utf8');
const core=await readFile('src/core/assignments-gradebook.ts','utf8');
const router=await readFile('src/core/assignments-router.ts','utf8');
const attendanceRouter=await readFile('src/core/attendance-router.ts','utf8');
const participantUi=await readFile('public/portal-assignments-ui.js','utf8');
const adminUi=await readFile('public/assignment-gradebook-ui.js','utf8');
const portal=await readFile('public/class-portal.html','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const classAdmin=await readFile('public/class-admin.html','utf8');

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
assert.match(router,/assertTenantWriteAllowed/,'commercial read-only/payment lock must apply to assignment writes');
assert.match(router,/\/api\/gradebook\/my/,'private participant gradebook endpoint required');
assert.ok(router.includes('api\\/assignments\\/files')||router.includes('/api/assignments/files'),'authenticated file download endpoint required');
assert.match(attendanceRouter,/handleAssignmentsApi/,'assignment router must be reachable before core API fallback');
assert.match(participantUi,/Veröffentlichte Bewertungen/);
assert.match(participantUi,/Verbindlich einreichen/);
assert.match(adminUi,/Offizielle Bewertungen sind getrennt von privaten Teilnehmernotizen/);
assert.match(adminUi,/Sofort für diesen Teilnehmer veröffentlichen/);
for(const html of [portal,customer,classAdmin])assert.match(html,/assignment(?:-gradebook|s)-ui\.js/,'assignment UI must be loaded in relevant portal');

console.log('Secure assignment submissions and official gradebook checks: OK');
