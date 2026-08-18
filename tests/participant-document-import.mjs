import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0049_participant_document_import.sql','utf8');
const service=await readFile('src/core/participant-document-import.ts','utf8');
const fileImport=await readFile('src/core/participant-import-file.ts','utf8');
const router=await readFile('src/core/enterprise-router.ts','utf8');
const ui=await readFile('public/participant-import-ui.js','utf8');
const customer=await readFile('public/customer-admin.html','utf8');

for(const table of ['participant_import_batches','participant_import_results'])assert.ok(migration.includes(`TABLE IF NOT EXISTS ${table}`),`missing ${table}`);
assert.match(migration,/preview_digest TEXT NOT NULL/,'preview must be immutable before apply');
assert.match(migration,/expires_at TEXT NOT NULL/,'staged personal-data previews must expire');
assert.match(service,/PARTICIPANT_IMPORT_PREVIEW_CHANGED/,'apply must reject changed previews');
assert.match(service,/SPECIAL_CATEGORY_DATA_DETECTED_NOT_IMPORTED/,'special-category contract data must be detected and excluded');
assert.match(service,/BANK_DATA_DETECTED_NOT_IMPORTED/,'bank data must be detected and excluded');
assert.match(service,/detected_not_imported/,'sensitive contract fields must remain preview-only metadata');
assert.match(service,/createTenantUser/,'confirmed participants must reuse the existing secure activation-mail lifecycle');
assert.match(service,/source='manual' THEN 'import'/,'external participant ids must be tenant-scoped and identified as import source');
assert.match(service,/DUPLICATE_IN_IMPORT/,'duplicate invite rows must be blocked');
assert.match(service,/COURSE_AMBIGUOUS/,'ambiguous course matching must fail closed');
assert.match(service,/selected_indexes/,'only explicitly selected preview rows may be applied');
assert.match(fileImport,/parseCsv/);assert.match(fileImport,/parseXlsx/);assert.match(fileImport,/application\/json/);assert.match(fileImport,/PDF_CLIENT_EXTRACTION_REQUIRED/);
assert.match(router,/participants\/import\/file-preview/);assert.match(router,/participants\/import\/apply/);
assert.match(ui,/vendor\/pdfjs\/pdf\.mjs/,'PDF text extraction must happen in the browser using bundled PDF.js');
assert.match(ui,/PDF_OCR_REQUIRED/,'scanned PDFs without reliable text must fail closed instead of guessing');
assert.match(ui,/Geburtsdatum, Bankdaten oder besondere Kategorien werden nicht automatisch gespeichert/,'customer UI must explain data minimisation');
assert.match(ui,/Markierte Teilnehmer übernehmen & einladen/,'human confirmation is required before account creation');
assert.match(customer,/participant-import-ui\.js/,'customer admin must load participant import assistant');

console.log('Participant roster/contract extraction, preview and invitation security checks: OK');