import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0053_secure_audience_communications.sql','utf8');
const comm=await readFile('src/core/secure-communications.ts','utf8');
const router=await readFile('src/core/communications-router.ts','utf8');
const adminUi=await readFile('public/communication-admin-ui.js','utf8');
const participantUi=await readFile('public/portal-targeted-messages.js','utf8');
const customerHtml=await readFile('public/customer-admin.html','utf8');
const classAdminHtml=await readFile('public/class-admin.html','utf8');
const classPortalHtml=await readFile('public/class-portal.html','utf8');
const readiness=await readFile('src/core/launch-readiness.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const wrangler=await readFile('wrangler.jsonc','utf8');

for(const table of ['communication_messages','communication_targets','communication_recipients','communication_events'])assert.ok(migration.includes(`TABLE IF NOT EXISTS ${table}`),`communication migration missing ${table}`);
assert.match(migration,/target_type TEXT NOT NULL CHECK\(target_type IN \('tenant','org_unit','course','user'\)\)/,'audience model must support tenant, hierarchy, course and individual targets');
assert.match(migration,/PRIMARY KEY\(message_id,user_id\)/,'recipient snapshot must deduplicate users across overlapping audiences');
assert.match(migration,/read_at TEXT/);assert.match(migration,/acknowledged_at TEXT/);assert.match(migration,/reminder_count INTEGER/);

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

for(const marker of ['Meldungen & Zielgruppen','Einzelne Teilnehmer','Pflichtbestätigung verlangen','Standorte/Bereiche','Klassen/Kurse'])assert.ok(adminUi.includes(marker),`admin communication UX missing ${marker}`);
assert.match(adminUi,/multiple size="6"/,'audience selectors must support multiple recipients');
assert.match(adminUi,/type:'user'/,'admin UI must submit explicit individual participant targets');
assert.match(participantUi,/Für Dich/);assert.match(participantUi,/Gelesen & verbindlich bestätigen/);assert.match(participantUi,/Nur für die festgelegten Empfänger/);
assert.match(participantUi,/api\/communications\/my/);
assert.match(customerHtml,/communication-admin-ui\.js/);assert.match(classAdminHtml,/communication-admin-ui\.js/);assert.match(classPortalHtml,/portal-targeted-messages\.js/);

for(const table of ['communication_messages','communication_targets','communication_recipients','communication_events'])assert.ok(readiness.includes(`'${table}'`),`live gate must require ${table}`);
assert.match(index,/runCommunicationAutomation/);
assert.match(index,/controller\?\.cron==='\*\/5 \* \* \* \*'/,'five-minute cron must return before heavy maintenance work');
assert.ok(wrangler.includes('"*/5 * * * *"')&&wrangler.includes('"17 */6 * * *"'),'Worker must use separate lightweight and heavy cron schedules');

console.log('Secure granular audiences, recipient snapshots, read/ack tracking and communication automation checks: OK');
