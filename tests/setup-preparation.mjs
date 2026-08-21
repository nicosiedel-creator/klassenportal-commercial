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
assert.match(ui,/enterprise-structure-nav/,'organisation shortcut must resolve the dynamically injected enterprise structure control');
assert.match(ui,/Teilnehmer importieren/,'participant shortcut must target the dedicated participant import area');
assert.ok(onboarding.includes('/setup-preparation-ui.js?v=20260819-1'),'onboarding must load setup preparation guidance');
assert.ok(customer.includes('/setup-preparation-ui.js?v=20260821-2'),'customer admin must use the deterministic setup-status version');
assert.match(ui,/const progress=content\.querySelector\('#kp-setup-progress'\);[\s\S]*if\(!progress\)\{content\.querySelector\('#kp-setup-preparation'\)\?\.remove\(\);return;\}/,'customer checklist must not appear until the server setup status is explicitly available');

for(const required of ['Stammdaten & Ansprechpartner','Branding','Organisation / Organigramm','Klassen / Kurse','Personal & Zuständigkeiten','Teilnehmer / Schüler','Stundenplan','Optional für erweiterte Automatisierung']){
  assert.ok(ui.includes(required),`setup checklist missing ${required}`);
}

assert.match(guide,/eigene KI/i,'tester guide must explicitly require each tester to use their own AI');
assert.match(guide,/alle Daten selbst erfinden/i,'tester AI must invent independent data rather than reuse fixed fixtures');
assert.match(guide,/20–60 fiktive Teilnehmer\/Schüler/,'tester scenario must be large enough to exercise real imports');
assert.match(guide,/Stripe-Testmodus/,'payment testing must be limited to Stripe test mode');
assert.match(guide,/Keine echten Kredit-\/Debitkarten oder Bankdaten/,'tester guide must prohibit real payment credentials');
assert.match(guide,/Berechtigungsgrenzen/,'tester guide must cover role and tenant boundaries');
assert.match(guide,/Desktop und einmal Smartphone/,'tester guide must cover responsive UI behavior');
assert.match(guide,/Keine Passwörter, MFA-Codes, Test-API-Schlüssel/,'tester reports must not contain secrets');

console.log('Setup preparation checklist and independent E2E tester guide checks: OK');
