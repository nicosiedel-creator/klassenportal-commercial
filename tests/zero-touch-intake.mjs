import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0051_zero_touch_intake_automation.sql','utf8');
const actorMigration=await readFile('migrations/0052_intake_service_actor.sql','utf8');
const intake=await readFile('src/core/intake-center.ts','utf8');
const cloudflareInbound=await readFile('src/core/cloudflare-inbound.ts','utf8');
const extract=await readFile('src/core/intake-document-extract.ts','utf8');
const router=await readFile('src/core/intake-router.ts','utf8');
const enterprise=await readFile('src/core/enterprise-router.ts','utf8');
const participant=await readFile('src/core/participant-document-import.ts','utf8');
const ui=await readFile('public/intake-center-ui.js','utf8');
const quickUi=await readFile('public/intake-quick-upload-ui.js','utf8');
const customerHtml=await readFile('public/customer-admin.html','utf8');
const readiness=await readFile('src/core/launch-readiness.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const wrangler=await readFile('wrangler.jsonc','utf8');

for(const table of ['tenant_intake_settings','intake_channels','intake_submitters','intake_upload_links','intake_public_rate_limits','intake_batches','intake_documents','intake_webhook_events','automation_tasks','automation_events'])assert.ok(migration.includes(`TABLE IF NOT EXISTS ${table}`),`intake migration missing ${table}`);
assert.match(migration,/token_hash TEXT NOT NULL UNIQUE/,'public upload links must persist hashes, not raw bearer tokens');
assert.match(migration,/processing_mode TEXT NOT NULL DEFAULT 'safe_auto'/,'safe automation must be an explicit tenant setting');
assert.match(migration,/default_retention_days.*BETWEEN 1 AND 30/,'temporary originals must have bounded retention');
assert.match(actorMigration,/BEFORE INSERT ON participant_import_batches/,'automatic intake must use FK-valid disabled audit actors');
assert.match(actorMigration,/status.*'disabled'/s,'automatic intake actor must never be an active login account');

assert.match(cloudflareInbound,/PostalMime/,'native Cloudflare email must parse RFC822 content locally');
assert.match(cloudflareInbound,/message\.raw/,'Cloudflare email worker must consume the native raw message stream');
assert.match(cloudflareInbound,/MAX_RAW_BYTES=55\*1024\*1024/,'raw email size must be bounded before parsing');
assert.match(cloudflareInbound,/setReject/,'unsafe or unknown native email deliveries must fail closed');
assert.match(cloudflareInbound,/dmarc=pass/);assert.match(cloudflareInbound,/dkim=pass/);assert.match(cloudflareInbound,/spf=pass/);
assert.match(cloudflareInbound,/allowedSender/,'incoming email sender must be allowlisted or an active tenant user');
const unauthorized=cloudflareInbound.indexOf("if(!senderAllowed){"),attachmentLoop=cloudflareInbound.indexOf('parsed.attachments');assert.ok(unauthorized>=0&&attachmentLoop>unauthorized,'unauthorised email must be quarantined before attachment processing');
assert.match(cloudflareInbound,/INBOUND_MAIL_DOMAIN/);
assert.match(cloudflareInbound,/intake\.cloudflare_received/,'native inbound processing must leave a Cloudflare-specific event trail');

assert.match(intake,/PUBLIC_UPLOADS_PER_HOUR=20/,'anonymous submit-only links must be rate limited');
assert.match(intake,/intake_public_rate_limits/);
assert.match(intake,/MAX_DOCUMENT_BYTES=15\*1024\*1024/);assert.match(intake,/MAX_BATCH_BYTES=50\*1024\*1024/);assert.match(intake,/MAX_BATCH_FILES=100/);
assert.match(intake,/sha256Text\(raw\)/,'public upload bearer tokens must be looked up by hash');
assert.match(intake,/x-robots-tag.*noindex, nofollow/s,'submit-only pages must not be indexed');
assert.match(intake,/niemals das Lesen vorhandener Teilnehmerdaten/,'submit-only UX must explain that the link grants no read access');
// Die oeffentliche Upload-Seite fuehrt ihr Skript nicht mehr im Worker-HTML mit, sondern laedt
// public/intake-public-upload.js. Die lokale PDF-Extraktion wird deshalb dort geprueft - im
// Seiten-HTML haette diese Zusicherung nichts mehr ueber das Verhalten des Kunden ausgesagt.
const publicUpload=await readFile('public/intake-public-upload.js','utf8');
assert.match(publicUpload,/vendor\/pdfjs\/pdf\.mjs/,'browser upload must locally extract text PDFs before sending the safe preview text');
assert.match(intake,/src="\/intake-public-upload\.js"/,'the public upload page must load exactly that audited script');
assert.match(intake,/client_text_/,'public PDF upload must attach only locally extracted text as an automation aid');

for(const ext of ["endsWith('.csv')","endsWith('.xlsx')","endsWith('.json')","endsWith('.docx')","endsWith('.odt')","endsWith('.rtf')","endsWith('.html')","endsWith('.pdf')"])assert.ok(extract.includes(ext),`common document extractor missing ${ext}`);
assert.match(extract,/ocr_required/,'image/scanned documents must fail into OCR/review instead of being guessed');
assert.doesNotMatch(intake,/INSERT[^\n]+extracted_text/i,'raw extracted contract text must not be persisted as a normal participant record');
assert.match(intake,/r2_key=NULL,extracted_text=NULL,extraction_state='purged'/,'temporary originals/text caches must be purged');
assert.match(intake,/FILES\.delete/,'temporary R2 originals must be physically deleted');

for(const blocked of ['MULTIPLE_EMAILS','COURSE_AMBIGUOUS','DUPLICATE_IN_IMPORT','SPECIAL_CATEGORY_DATA_DETECTED_NOT_IMPORTED','BANK_DATA_DETECTED_NOT_IMPORTED'])assert.ok(intake.includes(`'${blocked}'`)||cloudflareInbound.includes(`'${blocked}'`),`safe-auto guard missing ${blocked}`);
assert.match(intake,/source_kind:'api'/,'intake must call the participant importer with a source kind allowed by its existing schema');
assert.match(cloudflareInbound,/source_kind:'api'/,'native email intake must call the participant importer with a constrained source kind');
assert.match(participant,/const storedKind=\['contract_text','pdf_text','pasted_text','api'\]\.includes\(kind\)\?kind:'structured'/,'participant importer must normalize every source kind to its constrained database enum');
assert.match(participant,/detected_not_imported/,'contract extraction must distinguish detected sensitive data from persisted participant data');
assert.match(participant,/SPECIAL_CATEGORY_DATA_DETECTED_NOT_IMPORTED/);assert.match(participant,/BANK_DATA_DETECTED_NOT_IMPORTED/);

assert.match(intake,/responsibility_assignments/,'review notifications should include assigned course responsibles');
assert.match(intake,/keine Teilnehmer- oder Vertragsdaten per E-Mail/,'review notification emails must avoid participant/contract data');
assert.match(intake,/applyParticipantImport/,'deterministic intake must reuse the existing secure account/invitation pipeline');
assert.match(intake,/intake\.auto_applied/,'successful submit-only automation must leave an event trail');
assert.match(cloudflareInbound,/applyParticipantImport/,'native email intake must reuse the secure participant pipeline');
assert.match(intake,/automation_tasks/,'exceptions must feed the attention cockpit');
assert.match(cloudflareInbound,/automation_tasks/,'native email exceptions must feed the attention cockpit');

assert.match(router,/\^\\\/api\\\/intake\\\/upload\\\/\(\[\^\/\]\+\)\$/,'public submit-only upload route missing');
for(const path of ['/api/enterprise/intake/overview','/api/enterprise/intake/upload-links'])assert.ok(router.includes(path)||enterprise.includes(path),`intake route missing ${path}`);
assert.match(router,/RATE_LIMITED.*429/s,'intake throttle must return HTTP 429');
assert.match(index,/handlePublicIntakeRoute/);assert.match(index,/handleCloudflareInboundEmail/);assert.match(index,/async email\(/,'worker must expose the native Cloudflare email handler');assert.match(index,/cleanupIntake/);
assert.ok(wrangler.includes('"/eingang/*"'),'secure submit-only page must always run through the Worker');
assert.match(customerHtml,/intake-center-ui\.js/,'customer admin must load intake cockpit');
assert.match(customerHtml,/intake-quick-upload-ui\.js/,'customer admin must load one-click internal intake upload');
for(const marker of ['Heute braucht Deine Aufmerksamkeit','Einfach per E-Mail einreichen','Verkäufer / Sekretariat freigeben','Sicherer Upload-Link','Sichere Automatik'])assert.ok(ui.includes(marker),`intake cockpit missing ${marker}`);
assert.match(ui,/vendor\/pdfjs\/pdf\.mjs/,'reviewer must be able to extract email PDFs locally in the browser');
assert.match(ui,/Markierte übernehmen & automatisch einladen/,
  'wo Personen uebernommen werden, muss der Knopf selbst sagen, dass dabei Konten eingeladen werden');
assert.match(ui,/Markierte Struktur übernehmen/,
  'ein Stapel aus reiner Struktur laedt niemanden ein und darf das auch nicht behaupten');
assert.match(quickUi,/Unterlagen jetzt einwerfen/,'customer admin must expose a direct intake action');
assert.match(quickUi,/valid_days:1,max_uploads:1/,'internal quick upload must use a short-lived one-use submit token');
assert.match(quickUi,/api\/intake\/upload/,'internal quick upload must reuse the hardened submit-only intake route');
assert.match(quickUi,/vendor\/pdfjs\/pdf\.mjs/,'internal quick PDF upload must perform local text extraction');
assert.match(quickUi,/files\.length>100/,'internal quick upload must enforce the same batch file bound client-side');
assert.match(quickUi,/50\*1024\*1024/,'internal quick upload must enforce the same batch size bound client-side');

for(const table of ['tenant_intake_settings','intake_channels','intake_upload_links','intake_batches','intake_documents','automation_tasks'])assert.ok(readiness.includes(`'${table}'`),`live readiness must require ${table}`);
assert.match(readiness,/INBOUND_MAIL_DOMAIN/);assert.match(readiness,/cloudflare_email/);

console.log('Zero-touch Cloudflare email intake, one-click internal upload, safe automation, submit-only upload and attention cockpit checks: OK');
