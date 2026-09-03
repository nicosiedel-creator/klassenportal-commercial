import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { mapOrganizationRows } from '../dist/core/organization-import-file.js';
import { importRole, staffAccess, portalRole, previewOrganizationImport, applyOrganizationImport } from '../dist/core/organization-import.js';

// Eine Beschaeftigtenliste fuehrt Menschen, die keiner Klasse angehoeren: Standortleitung,
// Pruefungskoordination, Teilnehmendenservice, Qualitaetsmanagement, IT-Support. Bis hierher
// fielen sie in den Auffangfall "Teilnehmer" und blieben dort mit COURSE_REQUIRED liegen - fuer
// eine Verwaltungskraft ohne Kurs gab es schlicht keine Rolle. Gemessen am Abnahmepaket eines
// Kunden: zehn Personen, sieben Funktionen, keine einzige anlegbar.
//
// Das Portal hat dafuer laengst das richtige Werkzeug: eine Freigabe auf einer
// Organisationseinheit mit Profil und Vererbung (org_permission_grants) - dieselbe, die ein
// Kunden-Admin von Hand erteilt. Der Import vergibt jetzt genau die.
//
// Dieser Test liest nicht, er fuehrt aus: echtes SQLite mit dem echten Schema aller Migrationen,
// die echten Kopfzeilen und Funktionsbezeichnungen des Abnahmepakets, echter Entwurf, echtes
// Anlegen - und prueft die Rechte, die dabei tatsaechlich in der Datenbank stehen.

// Genau die Kopfzeile aus 04_Beschaeftigte_und_Dozenten.xlsx.
const KOPF = 'staff_id,external_id,parent_external_id,first_name,last_name,role,org_unit_external_id,email,phone,employment_status,portal_role,notes';
const zeile = (n, vorname, nachname, funktion, unit, portal) =>
  `ST-${n},EMP-${n},${unit},${vorname},${nachname},${funktion},${unit},${vorname.toLowerCase()}.${nachname.toLowerCase()}@example.invalid,+49 30 0000 ${n},aktiv,${portal},`;

// Die sieben Funktionen des Kunden, dazu eine unbekannte als Gegenprobe.
const FUNKTIONEN = [
  ['Standortleitung', 'responsible', true, ['access.manage']],
  ['Qualitätsmanagement', 'reporting', false, ['reports.view']],
  ['IT-Support', 'custom', false, []],
  ['Teilnehmendenservice', 'editor', false, ['content.manage']],
  ['Prüfungskoordination', 'editor', false, ['content.manage']],
  ['Praxisphasenkoordination', 'editor', false, ['content.manage']],
  ['Curriculumsmanagement', 'editor', false, ['content.manage']],
  ['Hausmeisterei', 'custom', false, []],
];

// ---------------------------------------------------------------------------------------------
// 1. Die Staffelung. Ausgefuehrt auf den echten Funktionsbezeichnungen.
// ---------------------------------------------------------------------------------------------
for (const [funktion, profil, bestaetigung, enthalten] of FUNKTIONEN) {
  const access = staffAccess({ role: funktion });
  assert.equal(access.profile, profil,
    `"${funktion}" muss das Profil "${profil}" bekommen, bekommen hat sie "${access.profile}"`);
  assert.equal(access.confirm, bestaetigung,
    `"${funktion}": Bestaetigung ${bestaetigung ? 'erforderlich' : 'nicht erforderlich'}`);
  for (const p of enthalten)
    assert.ok(access.permissions.includes(p), `"${funktion}" braucht ${p}`);
}

// Die Technik bekommt keine Teilnehmendendaten - das ist der Grund fuer das eigene Profil.
for (const funktion of ['IT-Support', 'EDV', 'Systemadministration', 'Hausmeisterei']) {
  const access = staffAccess({ role: funktion });
  assert.ok(!access.permissions.includes('participants.view'),
    `"${funktion}" darf keine Teilnehmendendaten sehen: ${access.permissions.join(', ')}`);
  assert.ok(!access.permissions.includes('content.view'),
    `"${funktion}" darf keine Kursinhalte sehen: ${access.permissions.join(', ')}`);
  assert.deepEqual(access.permissions, ['org.view', 'courses.view'],
    `"${funktion}" bekommt genau das Sichtbare und nichts weiter`);
}

// Eine unbekannte Funktion darf nicht grosszuegig gedeutet werden.
assert.equal(staffAccess({ role: 'Irgendwas Unbekanntes' }).profile, 'custom', 'unbekannt heisst sparsam');
assert.equal(staffAccess({}).permissions.length, 2, 'ohne Funktion erst recht');

// "Verantwortlich" schliesst das Vergeben weiterer Rechte ein - nur dieses Profil verlangt
// deshalb eine Bestaetigung.
for (const [funktion, , bestaetigung] of FUNKTIONEN)
  assert.equal(staffAccess({ role: funktion }).permissions.includes('access.manage'), bestaetigung,
    `nur "Verantwortlich" traegt access.manage - "${funktion}" ${bestaetigung ? 'muss' : 'darf nicht'}`);

// ---------------------------------------------------------------------------------------------
// 2. Die Erkennung. Die Datei nennt ihre Portalrolle selbst - das gilt.
// ---------------------------------------------------------------------------------------------
const rowsOf = text => mapOrganizationRows(parseCsv(text).rows);
const staffRows = rowsOf(`${KOPF}\n${FUNKTIONEN.map(([f], i) => zeile(String(100 + i), 'Vor', `Nach${i}`, f, 'OU-QM', 'staff')).join('\n')}\n`);
assert.equal(staffRows.length, FUNKTIONEN.length);
for (const row of staffRows)
  assert.equal(importRole(row), 'staff', `"${row.role}" muss als Beschäftigte/r erkannt werden, erkannt wurde: ${importRole(row)}`);

// Fuehrt eine Datei gar keine portal_role - die meisten tun das nicht -, entscheidet die
// Funktionsbezeichnung. Auch dann darf eine Verwaltungskraft kein Teilnehmer werden.
const OHNE_SPALTE = `first_name,last_name,role,email,org_unit_external_id
Nora,Weiss,Teilnehmendenservice,nora.weiss@example.invalid,OU-QM
Timo,Berg,Qualitätsmanagement,timo.berg@example.invalid,OU-QM
`;
for (const row of rowsOf(OHNE_SPALTE))
  assert.equal(importRole(row), 'staff',
    `"${row.role}" muss auch ohne portal_role als Beschäftigte/r erkannt werden, erkannt wurde: ${importRole(row)}`);

// Ohne Menschen ist eine Funktionsbezeichnung kein Mensch: eine Zeile, die nur eine Aufgabe und
// einen Bereich nennt, darf nicht zur beschäftigten Person werden.
assert.notEqual(importRole({ role: 'Prüfungskoordination', org_unit_external_id: 'OU-PRF' }), 'staff',
  'ohne Name und ohne E-Mail ist das keine Person');
assert.notEqual(importRole({ funktion: 'Teilnehmendenservice' }), 'staff', 'eine blosse Aufgabe ist keine Person');

assert.equal(portalRole({ portal_role: 'instructor' }), 'teacher', 'instructor ist Dozent/in');
assert.equal(portalRole({ portal_role: 'customer_admin' }), 'tenant_admin_review', 'customer_admin bleibt ein Fund, keine Vergabe');
assert.equal(portalRole({ portal_role: 'staff' }), 'staff');
assert.equal(portalRole({ portal_role: 'unbekannt' }), null, 'was die Spalte nicht kennt, entscheidet sie nicht');
assert.equal(portalRole({}), null);

// Die echte Dozentenzeile bleibt Dozentenzeile - die Beschaeftigtenerkennung darf sie nicht holen.
const dozent = rowsOf(`${KOPF}\n${zeile('001', 'Dario', 'Falkenau', 'Dozent/in', 'OU-VERW', 'instructor')}\n`)[0];
assert.equal(importRole(dozent), 'teacher', 'eine Dozentin bleibt eine Dozentin');

// Kunden nennen dieselbe Rolle mit unterschiedlichen Worten: "Lehrer" ist im deutschen
// Bildungswesen mindestens so gebräuchlich wie "Dozent" - und in der freien Weiterbildung sind
// "Ausbilder/in", "Referent/in" und "Kursleiter/in" ebenso üblich. Vorher fielen all diese Zeilen
// mangels Erkennung auf den Auffangfall "Teilnehmer" zurück.
for(const bezeichnung of ['Lehrer','Lehrerin','Ausbilder','Ausbilderin','Referent','Referentin','Kursleiter','Kursleiterin'])
  assert.equal(importRole({ role: bezeichnung, display_name: 'Test Person' }), 'teacher',
    `"${bezeichnung}" muss als Dozent/in erkannt werden, erkannt wurde: ${importRole({ role: bezeichnung, display_name: 'Test Person' })}`);
// Auch ohne ausdrückliche Rollenspalte: eine Zeile mit einer Spalte "Lehrer" (Name der
// unterrichtenden Person) muss über das Strukturmerkmal erkannt werden, nicht erst über den Text.
assert.equal(importRole({ lehrer: 'Frau Nowak', display_name: 'Frau Nowak' }), 'teacher',
  'eine Spalte "Lehrer" muss als Dozentenmerkmal erkannt werden');
assert.equal(importRole({ ausbilder: 'Herr Krug', display_name: 'Herr Krug' }), 'teacher',
  'eine Spalte "Ausbilder" muss als Dozentenmerkmal erkannt werden');
// Und eine Organisationseinheit ohne Menschen wird keine Person, nur weil sie "Leitung" heisst.
assert.notEqual(importRole({ node_type: 'org_unit', name: 'Geschäftsführung', type: 'Leitung' }), 'staff',
  'ohne Menschen ist "Leitung" ein Bereich, keine beschäftigte Person');

// ---------------------------------------------------------------------------------------------
// 3. Echtes Schema, echter Entwurf, echtes Anlegen - und die Rechte in der Datenbank.
// ---------------------------------------------------------------------------------------------
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for (const name of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) db.exec(await readFile(`migrations/${name}`, 'utf8'));

const T = 'ten_staff', U = 'usr_staff', TS = new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Märkische Bildungsakademie','mba','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_staff','${T}',NULL,'${U}','tenant_admin','${TS}');
`);
// Der Aktivierungsversand gehoert zum Anlegen eines neuen Kontos. Hier wird er gestellt, damit
// der Lauf nicht am fehlenden Postausgang haengt - geprueft werden die Rechte, nicht die Mail.
const env = { DB: d1(db), EMAIL: { send: async () => ({ messageId: `test-${Math.random().toString(36).slice(2)}` }) }, MAIL_FROM: 'noreply@example.invalid', APP_ORIGIN: 'https://example.invalid' };
const auth = { userId: U, role: 'tenant_admin', tenantIds: [T], courseIds: [], orgUnitIds: [], permissions: [], isPlatformAdmin: false };
const apply = async preview => applyOrganizationImport(env, auth, T, { batch_id: preview.batch_id, digest: preview.digest });
const grants = () => db.prepare(`SELECT g.profile,g.permissions_json,g.status,g.source,g.inherit_descendants,o.external_id AS unit,u.email
  FROM org_permission_grants g JOIN org_units o ON o.id=g.org_unit_id JOIN users u ON u.id=g.user_id
  WHERE g.tenant_id=? ORDER BY u.email`).all(T);

// Erst das Organigramm, dann die Beschaeftigten - genau die Reihenfolge eines Ordnerwurfs.
const ORGANIGRAMM = `node_type,external_id,parent_external_id,name,type
org_unit,OU-GF,,Geschäftsführung,Leitung
org_unit,OU-QM,OU-GF,Qualitätsmanagement,Fachbereich
org_unit,OU-ITOPS,OU-GF,IT-Betrieb,Service
`;
await apply(await previewOrganizationImport(env, auth, T, { source_name: '02_Organigramm.csv', rows: rowsOf(ORGANIGRAMM) }));
assert.equal(db.prepare('SELECT COUNT(*) n FROM org_units WHERE tenant_id=?').get(T).n, 3, 'die drei Bereiche müssen stehen');

const BESCHAEFTIGTE = `${KOPF}
${zeile('021', 'Zora', 'Kastner', 'Standortleitung', 'OU-GF', 'staff')}
${zeile('022', 'Levin', 'Grell', 'Qualitätsmanagement', 'OU-QM', 'staff')}
${zeile('023', 'Sami', 'Falkenau', 'IT-Support', 'OU-ITOPS', 'staff')}
${zeile('024', 'Ida', 'Brink', 'Teilnehmendenservice', 'OU-QM', 'staff')}
`;
const preview = await previewOrganizationImport(env, auth, T, { source_name: '04_Beschaeftigte.xlsx', rows: rowsOf(BESCHAEFTIGTE) });
assert.equal(preview.summary.counts.staff, 4, `vier Beschäftigte, gezählt: ${JSON.stringify(preview.summary.counts)}`);
assert.equal(preview.summary.counts.participant, undefined, 'keine davon ist ein Teilnehmer');

const leitung = preview.candidates.find(c => c.email.startsWith('zora'));
assert.ok(leitung.warnings.includes('ACCESS_RESPONSIBLE_CONFIRMATION_REQUIRED'),
  `die Standortleitung muss zur Bestätigung vorgelegt werden: ${JSON.stringify(leitung.warnings)}`);
assert.equal(leitung.access_profile, 'responsible', 'mit dem vorgeschlagenen Profil');
for (const c of preview.candidates.filter(x => !x.email.startsWith('zora')))
  assert.deepEqual(c.warnings, [], `${c.email} darf keinen Hinweis tragen: ${JSON.stringify(c.warnings)}`);

const applied = await apply(preview);
const angelegt = applied.results.filter(r => r.type === 'staff');
assert.equal(angelegt.filter(r => r.action === 'created_invited').length, 3,
  `drei Freigaben müssen entstehen: ${JSON.stringify(angelegt)}`);
assert.equal(angelegt.filter(r => r.action === 'skipped' && r.reason === 'REVIEW_REQUIRED').length, 1,
  'und die Standortleitung wird nicht vergeben');

const nachher = grants();
assert.equal(nachher.length, 3, 'genau drei Freigaben in der Datenbank');
assert.equal(nachher.filter(g => g.profile === 'responsible').length, 0,
  'aus diesem Import darf niemals eine Verantwortlichen-Freigabe entstehen');
const byMail = Object.fromEntries(nachher.map(g => [g.email.split('.')[0], g]));
assert.equal(byMail.levin.profile, 'reporting');
assert.equal(byMail.levin.unit, 'OU-QM', 'die Freigabe gilt für den Bereich der Zeile');
assert.equal(byMail.sami.profile, 'custom');
assert.deepEqual(JSON.parse(byMail.sami.permissions_json), ['org.view', 'courses.view'],
  'der IT-Support bekommt keine Teilnehmendendaten');
assert.equal(byMail.sami.unit, 'OU-ITOPS');
assert.equal(byMail.ida.profile, 'editor');
assert.ok(JSON.parse(byMail.ida.permissions_json).includes('content.manage'), 'der Service darf Inhalte pflegen');
assert.ok(!JSON.parse(byMail.ida.permissions_json).includes('access.manage'), 'aber keine Rechte vergeben');
for (const g of nachher) {
  assert.equal(g.status, 'active');
  assert.equal(g.source, 'import', 'die Herkunft muss nachvollziehbar sein');
  assert.equal(Number(g.inherit_descendants), 1, 'eine Bereichsfreigabe gilt auch für die Unterbereiche');
}
// Die Konten selbst müssen mit Aktivierungspflicht entstehen, nicht mit einem nutzbaren Passwort.
const konto = db.prepare("SELECT force_password_change,status FROM users WHERE email='ida.brink@example.invalid'").get();
assert.equal(Number(konto.force_password_change), 1, 'ein neu angelegtes Konto verlangt ein eigenes Passwort');

// Derselbe Ordner ein zweites Mal: keine zweite Freigabe.
const zweiter = await apply(await previewOrganizationImport(env, auth, T, { source_name: '04_Beschaeftigte.xlsx', rows: rowsOf(BESCHAEFTIGTE) }));
assert.equal(zweiter.results.filter(r => r.type === 'staff' && r.action === 'existing').length, 3,
  'beim zweiten Wurf muss jede Freigabe als vorhanden erkannt werden');
assert.equal(grants().length, 3, 'und es entstehen keine weiteren');

// Was der Kunden-Admin von Hand geändert hat, bleibt stehen.
db.prepare("UPDATE org_permission_grants SET profile='viewer',permissions_json=? WHERE user_id=(SELECT id FROM users WHERE email='ida.brink@example.invalid')")
  .run(JSON.stringify(['org.view']));
await apply(await previewOrganizationImport(env, auth, T, { source_name: '04_Beschaeftigte.xlsx', rows: rowsOf(BESCHAEFTIGTE) }));
const vonHand = grants().find(g => g.email.startsWith('ida'));
assert.equal(vonHand.profile, 'viewer', 'eine von Hand geänderte Freigabe darf der Import nicht zurücksetzen');

// Ohne Bereich lässt sich keine Freigabe erteilen - das muss vorher dastehen.
const OHNE_BEREICH = `first_name,last_name,role,email,portal_role
Nora,Weiss,Teilnehmendenservice,nora.weiss@example.invalid,staff
`;
const ohne = await previewOrganizationImport(env, auth, T, { source_name: 'ohne-bereich.csv', rows: rowsOf(OHNE_BEREICH) });
assert.equal(ohne.candidates[0].type, 'staff');
assert.ok(ohne.candidates[0].warnings.includes('STAFF_ORG_UNIT_REQUIRED'),
  `ohne Bereich muss das gesagt werden: ${JSON.stringify(ohne.candidates[0].warnings)}`);
const ohneAngewendet = await apply(ohne);
assert.equal(ohneAngewendet.results[0].action, 'skipped', 'und es entsteht keine Freigabe');
assert.equal(grants().length, 3);

// Ein Bereich, den es im Portal nicht gibt, darf nicht auf gut Glück irgendwo landen.
const FREMDER_BEREICH = `first_name,last_name,role,email,portal_role,org_unit_external_id
Timo,Berg,Teilnehmendenservice,timo.berg@example.invalid,staff,OU-GIBTESNICHT
`;
const fremd = await apply(await previewOrganizationImport(env, auth, T, { source_name: 'fremd.csv', rows: rowsOf(FREMDER_BEREICH) }));
assert.equal(fremd.results[0].action, 'skipped', 'ein unbekannter Bereich hält den Import an');
assert.equal(String(fremd.results[0].reason), 'STAFF_ORG_UNIT_NOT_FOUND', `benannt mit: ${fremd.results[0].reason}`);
assert.equal(grants().length, 3, 'und es entsteht keine Freigabe irgendwo');

console.log(`Portalrollen für Beschäftigte: ${FUNKTIONEN.length} Funktionen gestaffelt, Freigaben auf dem richtigen Bereich, "Verantwortlich" nur zur Bestätigung, IT ohne Teilnehmendendaten, zweiter Wurf ohne Dopplung: OK`);
