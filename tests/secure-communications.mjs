import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0053_secure_audience_communications.sql','utf8');
const emailMigration=await readFile('migrations/0055_private_email_fanout.sql','utf8');
const comm=await readFile('src/core/secure-communications.ts','utf8');
const emailFanout=await readFile('src/core/communication-email.ts','utf8');
const mail=await readFile('src/core/mail.ts','utf8');
const router=await readFile('src/core/communications-router.ts','utf8');
const adminUi=await readFile('public/communication-admin-ui.js','utf8');
const participantUi=await readFile('public/portal-targeted-messages.js','utf8');
const customerHtml=await readFile('public/customer-admin.html','utf8');
const classAdminHtml=await readFile('public/class-admin.html','utf8');
const classPortalHtml=await readFile('public/class-portal.html','utf8');
const portalLazy=await readFile('public/portal-lazy-runtime.js','utf8');
const readiness=await readFile('src/core/launch-readiness.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const wrangler=await readFile('wrangler.jsonc','utf8');

for(const table of ['communication_messages','communication_targets','communication_recipients','communication_events'])assert.ok(migration.includes(`TABLE IF NOT EXISTS ${table}`),`communication migration missing ${table}`);
assert.match(migration,/target_type TEXT NOT NULL CHECK\(target_type IN \('tenant','org_unit','course','user'\)\)/,'audience model must support tenant, hierarchy, course and individual targets');
assert.match(migration,/PRIMARY KEY\(message_id,user_id\)/,'recipient snapshot must deduplicate users across overlapping audiences');
assert.match(migration,/read_at TEXT/);assert.match(migration,/acknowledged_at TEXT/);assert.match(migration,/reminder_count INTEGER/);
assert.match(emailMigration,/send_email INTEGER NOT NULL DEFAULT 0/,'email fanout must be explicit opt-in per communication');
assert.match(emailMigration,/communication_email_deliveries/,'email delivery state must be persisted per recipient');
assert.match(emailMigration,/UNIQUE\(message_id,user_id\)/,'one delivery row per message/user must prevent duplicate fanout state');
assert.match(emailMigration,/attempts INTEGER/);assert.match(emailMigration,/next_retry_at TEXT/,'failed sends must be retryable');

assert.match(comm,/resolveTargetRecipients/,'recipients must be resolved server-side');
assert.match(comm,/snapshotRecipients/,'publishing must materialise an immutable recipient snapshot');
assert.match(comm,/communication_recipients/,'participant visibility must come from recipient rows rather than client filtering');
assert.match(comm,/m\.role='participant'/,'personal messages must resolve actual participants only');
assert.doesNotMatch(comm,/m\.role IN \('participant','guest'\)/,'guest/public access must never receive personalised participant communications');
assert.match(comm,/canAdminSeeMessage/,'admin detail/list access must be scope checked server-side');
assert.match(comm,/FORBIDDEN_COMMUNICATION_SCOPE/);
assert.match(comm,/canManageOrgUnit/,'hierarchy targets must enforce delegated organisation permissions');
assert.match(comm,/requireCourseAccess/,'course targets must enforce class scope');
assert.match(comm,/target_type='user'.*role='participant'/s,'individual targets must be verified against participant membership');
assert.match(comm,/COMMUNICATION_TOO_MANY_TARGETS/,'audience explosion must be bounded');

assert.match(comm,/send_email/,'targeted communications must support optional email delivery');
assert.match(comm,/deliverCommunicationEmails/,'email fanout must use the same immutable recipient snapshot');
assert.match(comm,/COMMUNICATION_MAIL_NOT_CONFIGURED/,'email-enabled publishing must fail closed without transactional mail');
assert.match(comm,/retryFailedCommunicationEmails/,'scheduled automation must retry transient mail failures');
assert.match(emailFanout,/communication:\$\{message\.id\}:\$\{r\.id\}/,'each participant delivery must use its own idempotency key');
assert.match(emailFanout,/sendMail\(env,r\.email/,'fanout must send separately to each participant address');
assert.doesNotMatch(emailFanout,/\bcc\s*:/i,'fanout must never use CC');
assert.doesNotMatch(emailFanout,/\bbcc\s*:/i,'fanout must never use BCC');
assert.match(mail,/to:\[to\]/,'mail provider call must contain exactly the single requested recipient');
assert.match(emailFanout,/attempts>=3|nextAttempts>=3/,'mail retries must be bounded');
assert.match(emailFanout,/communication_email_delivery_failed/,'final mail failures must create an attention task');
assert.match(emailFanout,/JSON\.stringify\(\{failed\}\)/,'attention task payload must contain only the aggregate failure count');
assert.doesNotMatch(emailFanout,/JSON\.stringify\(\{failed\s*,\s*(?:email|user|recipient)/i,'attention task payload must not expose participant identity');

assert.match(comm,/require_ack/);assert.match(comm,/ack_due_at/);assert.match(comm,/COMMUNICATION_ACK_DUE_INVALID/);
assert.match(comm,/markCommunicationRead/);assert.match(comm,/acknowledgeCommunication/);
assert.match(comm,/runCommunicationAutomation/,'scheduled publish and acknowledgement escalation must run server-side');
assert.match(comm,/communication_ack_overdue/,'missing acknowledgements must create attention tasks');
assert.match(comm,/targeted_message_reminder/,'missing acknowledgements must create user reminders');
assert.match(comm,/last_reminded_at<=/,'reminders must be throttled');
assert.match(comm,/Im Klassenportal liegt eine neue, für Dich bestimmte Meldung vor/,'generic delivery notification must not expose message body');
assert.doesNotMatch(comm,/notifications\([^\n]+message\.body/i,'notification rows must not copy private message bodies');

for(const route of ['/api/communications/my','/read','/ack','/publish','/close'])assert.ok(router.includes(route),`communication route missing ${route}`);
assert.match(router,/assertSameOrigin/);assert.match(router,/assertTenantWriteAllowed/,'message mutation must respect trial/payment write state');

for(const marker of ['Meldungen & Zielgruppen','Einzelne Teilnehmer','Pflichtbestätigung verlangen','Standorte/Bereiche','Klassen/Kurse','Zusätzlich als persönliche E-Mail senden'])assert.ok(adminUi.includes(marker),`admin communication UX missing ${marker}`);
assert.match(adminUi,/multiple size="6"/,'audience selectors must support multiple recipients');
assert.match(adminUi,/type:'user'/,'admin UI must submit explicit individual participant targets');
assert.match(adminUi,/String\(x\.role\)==='participant'/,'personal recipient picker must show real participants only');
assert.doesNotMatch(adminUi,/\['participant','guest'\]/,'guest accounts must never be offered as personal communication recipients');
assert.match(adminUi,/Kein CC\/BCC/,'bulk email UX must explicitly describe private individual delivery');
assert.match(participantUi,/Für Dich/);assert.match(participantUi,/Gelesen & verbindlich bestätigen/);assert.match(participantUi,/Nur für die festgelegten Empfänger/);
assert.match(participantUi,/api\/communications\/my/);
assert.match(customerHtml,/communication-admin-ui\.js/,'customer admin must keep communication administration available');
assert.doesNotMatch(classAdminHtml,/communication-admin-ui\.js/,'class admin student entry must not load the separate communication admin workspace');
assert.match(classAdminHtml,/class-admin-entry\.js/,'class admin must enter through the normal class portal');
assert.doesNotMatch(classPortalHtml,/src="\/portal-targeted-messages\.js/,'targeted messages must not block student portal first paint');
assert.match(portalLazy,/portal-targeted-messages/,'class admin and classmates must receive targeted messages through the same lazy student portal');

for(const table of ['communication_messages','communication_targets','communication_recipients','communication_events','communication_email_deliveries'])assert.ok(readiness.includes(`'${table}'`),`live gate must require ${table}`);
assert.match(index,/runCommunicationAutomation/);
assert.match(index,/controller\?\.cron==='\*\/5 \* \* \* \*'/,'five-minute cron must return before heavy maintenance work');
assert.ok(wrangler.includes('"*/5 * * * *"')&&wrangler.includes('"17 */6 * * *"'),'Worker must use separate lightweight and heavy cron schedules');

console.log('Secure granular audiences, private email fanout, retries, lazy class-admin student delivery and communication automation checks: OK');
