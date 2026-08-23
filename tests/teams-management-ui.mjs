import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync(new URL('../public/teams-management-ui.js',import.meta.url),'utf8');
const customer=fs.readFileSync(new URL('../public/customer-admin.html',import.meta.url),'utf8');
const customerLazy=fs.readFileSync(new URL('../public/customer-admin-lazy-modules.js',import.meta.url),'utf8');
const teacher=fs.readFileSync(new URL('../public/dozentenportal.html',import.meta.url),'utf8');
const teacherLazy=fs.readFileSync(new URL('../public/teacher-lazy-modules.js',import.meta.url),'utf8');
const participant=fs.readFileSync(new URL('../public/class-portal.html',import.meta.url),'utf8');
const participantLazy=fs.readFileSync(new URL('../public/portal-lazy-runtime.js',import.meta.url),'utf8');
const graph=fs.readFileSync(new URL('../src/core/microsoft-graph.ts',import.meta.url),'utf8');
const graphRouter=fs.readFileSync(new URL('../src/core/microsoft-graph-router.ts',import.meta.url),'utf8');
const invitations=fs.readFileSync(new URL('../src/core/microsoft-course-invitations.ts',import.meta.url),'utf8');

assert.match(customer,/kp-lazy-module-manifest/,'Kunden-Admin muss einen prüfbaren Lazy-Modul-Manifest besitzen');
assert.match(customerLazy,/teams-management-ui/,'Kunden-Admin muss Teams-Verwaltung bei Bedarf laden können');
assert.doesNotMatch(customer,/src="\/teams-management-ui\.js/,'Teams-Verwaltung darf den Kunden-Admin-Start nicht mehr blockieren');
assert.match(teacher,/teacher-lazy-modules\.js/,'Dozentenportal muss den Lazy-Modul-Controller laden');
assert.match(teacherLazy,/teams-management-ui/,'Dozentenportal muss Teams-Verwaltung bei Bedarf laden können');
assert.match(teacherLazy,/teacher-calendar-ui/,'Dozentenportal muss den persönlichen Unterrichtskalender als Primärfunktion laden');
assert.doesNotMatch(teacher,/src="\/teams-management-ui\.js/,'Teams-Verwaltung darf den Dozentenportal-Start nicht mehr blockieren');
assert.match(participant,/portal-lazy-runtime\.js/,'Teilnehmerportal muss den schlanken Lazy-Runtime-Controller laden');
assert.match(participantLazy,/portal-teams-ui/,'Teilnehmerportal muss den Teams-Beitreten-Link über die Lazy-Runtime bereitstellen');
assert.doesNotMatch(participant,/src="\/portal-teams-ui\.js/,'Teams-Beitreten darf den Teilnehmerportal-Start nicht blockieren');
assert.match(ui,/\/api\/integrations\/microsoft\/lessons/,'UI muss ausschließlich die Microsoft-Integrationsrouten verwenden');
assert.match(ui,/method:'POST'/,'Create/Sync muss verfügbar sein');
assert.match(ui,/method:'PUT'/,'sicherer manueller Teams-Link muss verfügbar sein');
assert.match(ui,/method:'DELETE'/,'Absage/Trennung muss verfügbar sein');
assert.match(ui,/rel="noopener noreferrer"/,'externe Beitreten-Links müssen Opener-Zugriff verhindern');
assert.doesNotMatch(ui,/platform-admin|plattform-admin/i,'Teams-Tenantsteuerung darf nicht im Plattform-Admin verdrahtet werden');
assert.match(graph,/FORBIDDEN_PLATFORM_ADMIN_TENANT_INTEGRATION/,'Backend muss Plattformadmin als Ersatz-Kundenadmin blockieren');
assert.match(graph,/teacherAttendanceAuth/,'Dozentenrechte müssen über explizite Kurszuordnung laufen');
assert.match(graph,/requireStrongAuth/,'Kundenadmin-Microsoft-Verbindung muss starke Authentisierung verlangen');

assert.match(graphRouter,/createMeetingWithClassInvites/,'Graph meeting creation must synchronize class invitations in the same protected flow');
assert.match(graphRouter,/syncCourseMeetingAttendees/,'Graph router must invoke the privacy-safe attendee synchronizer');
assert.match(invitations,/m\.role IN \('participant','class_admin'\)/,'automatic invites must be limited to students and class admins of the same course');
assert.match(invitations,/JOIN tenant_users tu/,'automatic invites must exclude suspended tenant users');
assert.match(invitations,/u\.status='active'/,'automatic invites must exclude inactive users');
assert.match(invitations,/hideAttendees:true/,'class email addresses must be hidden from other invitees');
assert.match(invitations,/LIMIT 501/,'invitation fanout must detect the Microsoft event attendee ceiling');
assert.match(invitations,/MICROSOFT_EVENT_ATTENDEE_LIMIT/,'oversized classes must fail safely instead of silently dropping invitees');
assert.match(invitations,/meeting\.organizer_user_id/,'only the stored Microsoft event organizer may synchronize invitations');
assert.match(invitations,/attendeeCount:attendees\.length/,'audit trail must record invitation count without recording participant email addresses');
assert.doesNotMatch(invitations,/attendeeCount:attendees\.length[^\n]*email/i,'audit trail must never include participant email addresses');

console.log('teams-management-ui, teacher calendar and privacy-safe class invitation checks ok');
