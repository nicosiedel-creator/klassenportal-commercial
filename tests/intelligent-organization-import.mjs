import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0065_intelligent_organization_import.sql','utf8');
const service=await readFile('src/core/organization-import.ts','utf8');
const fileImport=await readFile('src/core/organization-import-file.ts','utf8');
const router=await readFile('src/core/enterprise-router.ts','utf8');
const ui=await readFile('public/organization-import-ui.js','utf8');
const customer=await readFile('public/customer-admin.html','utf8');

for(const table of ['organization_import_batches','organization_import_results'])assert.ok(migration.includes(`TABLE IF NOT EXISTS ${table}`),`missing ${table}`);
assert.match(migration,/preview_digest TEXT NOT NULL/,'organization import preview must be immutable');
assert.match(migration,/expires_at TEXT NOT NULL/,'organization previews must expire');
assert.match(service,/OrganizationCandidateType='course'\|'subject'\|'participant'\|'class_admin'\|'guest'\|'teacher'\|'tenant_admin_review'/,'all safe organization entity types must be recognized');
assert.match(service,/TENANT_ADMIN_CONFIRMATION_REQUIRED/,'tenant admin rights must never be silently imported');
assert.match(service,/type==='class_admin'/,'class admin candidates must have a dedicated import path');
assert.match(service,/baseRole=type==='guest'\?'guest':'participant'/,'class admin must inherit the participant baseline rather than a teacher or guest baseline');
assert.match(service,/role:'class_admin'/,'class admin capability must be added after the participant baseline');
assert.match(service,/type==='guest'/,'guest memberships must be importable as an explicit safe role');
assert.match(service,/createTeacherPortalTeacher/,'teacher master data must be created through the teacher service');
assert.match(service,/saveTeacherPortalAssignment/,'teacher course access must use explicit teacher portal assignments');
assert.match(service,/TEACHER_PORTAL_EMAIL_MISSING/,'teacher rows without email must not invent portal identities');
assert.match(service,/enforceCourseEntitlement/,'automatic course creation must respect purchased course limits');
assert.match(service,/ORGANIZATION_IMPORT_PREVIEW_CHANGED/,'apply must reject modified previews');
assert.match(service,/selected_indexes/,'only selected safe candidates may be applied');
assert.match(fileImport,/parseCsv/);assert.match(fileImport,/parseXlsx/);assert.match(fileImport,/application\/json/);assert.match(fileImport,/PDF_CLIENT_EXTRACTION_REQUIRED/);
assert.match(router,/organization\/import\/file-preview/);assert.match(router,/organization\/import\/apply/);
assert.match(ui,/Organisation automatisch einlesen/,'customer admin must expose universal organization import');
assert.match(ui,/Klassenadmins bleiben Schüler mit Zusatzrecht/,'UI must explain class-admin student model');
assert.match(ui,/Kundenadmin-Recht wird aus Sicherheitsgründen nie automatisch vergeben/,'UI must explain protected tenant-admin assignment');
assert.match(ui,/vendor\/pdfjs\/pdf\.mjs/,'text PDFs must use bundled client PDF extraction');
assert.match(customer,/organization-import-ui\.js/,'customer admin must load intelligent organization import UI');

console.log('Intelligent organization import safety and automation checks: OK');
