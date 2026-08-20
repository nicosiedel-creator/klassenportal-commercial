import fs from 'node:fs';
import assert from 'node:assert/strict';

const ui=fs.readFileSync(new URL('../public/teams-management-ui.js',import.meta.url),'utf8');
const customer=fs.readFileSync(new URL('../public/customer-admin.html',import.meta.url),'utf8');
const teacher=fs.readFileSync(new URL('../public/dozentenportal.html',import.meta.url),'utf8');
const participant=fs.readFileSync(new URL('../public/class-portal.html',import.meta.url),'utf8');
const graph=fs.readFileSync(new URL('../src/core/microsoft-graph.ts',import.meta.url),'utf8');

assert.match(customer,/teams-management-ui\.js/,'Kunden-Admin muss Teams-Verwaltung laden');
assert.match(teacher,/teams-management-ui\.js/,'Dozentenportal muss Teams-Verwaltung laden');
assert.match(participant,/portal-teams-ui\.js/,'Teilnehmerportal muss den Beitreten-Link laden');
assert.match(ui,/\/api\/integrations\/microsoft\/lessons/,'UI muss ausschließlich die Microsoft-Integrationsrouten verwenden');
assert.match(ui,/method:'POST'/,'Create/Sync muss verfügbar sein');
assert.match(ui,/method:'PUT'/,'sicherer manueller Teams-Link muss verfügbar sein');
assert.match(ui,/method:'DELETE'/,'Absage/Trennung muss verfügbar sein');
assert.match(ui,/rel="noopener noreferrer"/,'externe Beitreten-Links müssen Opener-Zugriff verhindern');
assert.doesNotMatch(ui,/platform-admin|plattform-admin/i,'Teams-Tenantsteuerung darf nicht im Plattform-Admin verdrahtet werden');
assert.match(graph,/FORBIDDEN_PLATFORM_ADMIN_TENANT_INTEGRATION/,'Backend muss Plattformadmin als Ersatz-Kundenadmin blockieren');
assert.match(graph,/teacherAttendanceAuth/,'Dozentenrechte müssen über explizite Kurszuordnung laufen');
assert.match(graph,/requireStrongAuth/,'Kundenadmin-Microsoft-Verbindung muss starke Authentisierung verlangen');

console.log('teams-management-ui checks ok');
