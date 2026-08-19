import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const code=await readFile('src/core/participant-360.ts','utf8');
const router=await readFile('src/core/participant-360-router.ts','utf8');
const ui=await readFile('public/participant-360-ui.js','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const classAdmin=await readFile('public/class-admin.html','utf8');
const index=await readFile('src/index.ts','utf8');

assert.match(code,/requireRole\(auth,'class_admin'\)/,'participant 360 must require a responsible/admin role internally');
assert.match(code,/m\.role='participant'/,'participant 360 must include real participants only');
assert.match(code,/allowedCourses/,'participant 360 must intersect the person with the caller course scope');
assert.match(code,/auth\.courseIds/,'scoped administrators must stay course scoped');
assert.match(code,/FORBIDDEN_PARTICIPANT_SCOPE/,'out-of-scope participants must fail closed');
for(const source of ['attendance_records','absence_notices','personal_grades','learning_progress','communication_recipients'])assert.ok(code.includes(source),`participant 360 missing aggregate source ${source}`);
assert.match(code,/contract_text_included:false/);assert.match(code,/health_data_included:false/);assert.match(code,/bank_data_included:false/);
assert.doesNotMatch(code,/intake_documents.*extracted_text|participant_import_batches.*source_text|contract_text\s*,/s,'360 must never pull raw contract/intake text into the profile');
assert.doesNotMatch(code,/diagnos|medical_reason|health_reason/i,'360 must not introduce medical/diagnosis fields');

assert.match(router,/assertSameOrigin/);assert.match(router,/request\.method!=='GET'/,'participant 360 API must be read-only');
assert.match(router,/resolveCoreAuth/);assert.match(router,/forbidClassAdminStudentData\(auth\)/,'class admins must be rejected before participant 360 data is returned');assert.match(router,/participant360Candidates/);assert.match(router,/participant360\(/);
assert.match(index,/handleParticipant360Api/,'Worker must route participant 360 API');

for(const marker of ['Teilnehmer 360°','Anwesenheit & Abwesenheiten','Noten & Leistungen','Kommunikation','Vertragsrohtexte, Gesundheits- und Bankdaten'])assert.ok(ui.includes(marker),`participant 360 UI missing ${marker}`);
assert.match(customer,/participant-360-ui\.js/,'customer admin may load participant 360');
assert.doesNotMatch(classAdmin,/participant-360-ui\.js/,'class admin must never load participant 360');
assert.match(classAdmin,/class-admin-entry\.js/,'class admin must use student portal entry');

console.log('Privacy-scoped participant 360 with explicit class-admin denial checks: OK');
