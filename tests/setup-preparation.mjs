import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const ui=await readFile('public/setup-preparation-ui.js','utf8');
const onboarding=await readFile('public/onboarding.html','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const guide=await readFile('TESTER_END_TO_END.md','utf8');

assert.match(ui,/location\.pathname\.startsWith\('\/einrichtung\/'\)/,'setup preparation must target the actual onboarding route');
assert.doesNotMatch(ui,/startsWith\('\/einrichten\/'\)/,'stale onboarding route must not be used');
assert.match(ui,/external_id;parent_external_id;type;name;code;course_code;course_name;responsible_name;responsible_email;profile/,'organisation template must match supported import columns');
assert.match(ui,/Vorname;Nachname;E-Mail;Teilnehmernummer;Klasse;Klassencode;Beginn;Ende/,'participant template must expose recognised participant columns');
assert.match(ui,/Klasse;Datum;Beginn;Ende;Fach;Fachkürzel;Dozent;Raum;Unterricht;Hinweise/,'timetable template must expose recognised timetable columns');
assert.match(ui,/example\.invalid/,'test data guidance must use a reserved non-deliverable email domain');
assert.match(ui,/findNav\(view\)/,'setup actions must resolve dynamic module navigation safely');
assert.match(ui,/window\.KPCustomerModules\.loadGroup\('organization'\)/,'setup shortcuts must load organization features only when needed');
assert.match(ui,/enterprise-structure-nav/,'organisation shortcut must resolve the dynamically injected enterprise structure control');
assert.match(ui,/Teilnehmer importieren/,'participant shortcut must target the dedicated participant import area');
assert.match(ui,/action\('provider_import','Organigramm einlesen'\)/,'die Vorbereitungsliste muss den automatischen Organigramm-Import erreichbar machen');
assert.match(ui,/view==='provider_import'/,'ohne Auflösung fuehrt der Knopf ins Leere');
assert.match(onboarding,/setup-preparation-ui\.js/,'onboarding must load setup preparation guidance');
assert.match(customer,/setup-preparation-ui\.js\?v=20260822-5/,'customer admin must load the current event-driven setup guidance');
assert.match(ui,/const progress=content\.querySelector\('#kp-setup-progress'\);[\s\S]*if\(!progress\)\{content\.querySelector\('#kp-setup-preparation'\)\?\.remove\(\);return;\}/,'customer checklist must not appear until server setup status is available');
assert.match(ui,/if\(CUSTOMER_PATH\)\{window\.addEventListener\('kp:customer-view-changed'/,'customer setup refresh must follow deterministic render events');
const customerBlock=ui.slice(ui.indexOf('if(CUSTOMER_PATH){'));
assert.doesNotMatch(customerBlock,/MutationObserver/,'customer setup code must not install a mutation observer');

for(const required of ['Stammdaten & Ansprechpartner','Branding','Organisation / Organigramm','Klassen / Kurse','Personal & Zuständigkeiten','Teilnehmer / Schüler','Stundenplan','Erweiterte Automatisierung'])assert.ok(ui.includes(required),`setup checklist missing ${required}`);

assert.match(guide,/eigene KI/i,'tester guide must explicitly require each tester to use their own AI');
assert.match(guide,/alle Daten selbst erfinden/i,'tester AI must invent independent data rather than reuse fixed fixtures');
assert.match(guide,/20–60 fiktive Teilnehmer\/Schüler/,'tester scenario must be large enough to exercise real imports');
assert.match(guide,/Zahlungsfunktionen bleiben vollständig deaktiviert/,'acceptance guide must preserve the payment freeze');
assert.match(guide,/PAYMENT_DISABLED/,'acceptance guide must verify the disabled payment response');
assert.match(guide,/Keine echten Kredit-\/Debitkarten oder Bankdaten/,'tester guide must prohibit real payment credentials');
assert.match(guide,/Berechtigungsgrenzen/,'tester guide must cover role and tenant boundaries');
assert.match(guide,/Desktop und einmal Smartphone/,'tester guide must cover responsive UI behavior');
assert.match(guide,/Keine Passwörter, Zugangscodes, Test-API-Schlüssel/,'tester reports must not contain secrets');

console.log('Setup preparation checklist, event-driven customer status and E2E guide checks: OK');
