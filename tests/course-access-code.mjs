import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { createCourse } from '../dist/core/data.js';
import { updateCourse } from '../dist/core/operational-data.js';
import { PASSWORD_MIN_LENGTH } from '../dist/core/auth.js';

// Beim Durchklicken der Kundenverwaltung gefunden: eine Klasse anlegen, Zugriffscode "VW-02"
// eingetragen - und das Portal antwortete
//
//   POST /api/courses → 400 {"error":"PASSWORD_LENGTH_INVALID"}
//   sichtbar: "Das Passwort muss zwischen 10 und 256 Zeichen lang sein."
//
// Ein Passwort hatte der Kunde nie eingegeben; das Feld heisst "Zugriffscode bei Link/Hybrid".
//
// Gegen echtes SQLite mit dem echten Schema nachgemessen, vor der Aenderung:
//
//   3, 5 Zeichen  -> ACCESS_CODE_REQUIRED   (die eigene Regel: mindestens 6)
//   6, 7, 8, 9    -> PASSWORD_LENGTH_INVALID (der Hasher darunter: mindestens 10)
//   10            -> angelegt
//
// Vier Zeichenlaengen breit erlaubte die eine Regel, was die andere ablehnte - mit einer Meldung
// ueber ein Passwort. Dazu wurde der Code in jeder Zugangsart gehasht, auch bei "Login" und
// "Oeffentlich", wo es gar keinen gibt: ein versehentlich getippter kurzer Code liess das Anlegen
// der ganzen Klasse scheitern.
//
// Dieser Test liest nicht, er fuehrt aus.

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for (const name of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort())
  db.exec(await readFile(`migrations/${name}`, 'utf8'));
const env = { DB: d1(db) };
const tenant = 'ten_zugriffscode';
db.prepare("INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES(?,?,?,'active',datetime('now'),datetime('now'))")
  .run(tenant, 'Prüfträger', 'pruef-traeger');
const auth = { userId: 'usr_1', isPlatformAdmin: true, role: 'tenant_admin', tenantIds: [tenant], courseIds: [], permissions: [] };

assert.equal(PASSWORD_MIN_LENGTH, 10, 'die gemeinsame Untergrenze muss benannt und bekannt sein');

let lauf = 0;
const anlegen = async (modus, code) => {
  lauf++;
  const eingabe = { name: `Klasse ${lauf}`, code: `K-${lauf}`, access_mode: modus };
  if (code !== undefined) eingabe.access_code = code;
  try { return { ok: true, kurs: await createCourse(env, auth, tenant, eingabe) }; }
  catch (e) { return { ok: false, fehler: String(e.message) }; }
};

// 1. Es gilt genau eine Regel, und sie ist die, die wirklich speicherbar ist.
for (const modus of ['link_code', 'hybrid']) {
  for (let laenge = 1; laenge < PASSWORD_MIN_LENGTH; laenge++) {
    const r = await anlegen(modus, 'a'.repeat(laenge));
    assert.equal(r.ok, false, `${modus}: ein ${laenge} Zeichen langer Zugriffscode darf nicht durchgehen`);
    assert.equal(r.fehler, 'ACCESS_CODE_REQUIRED',
      `${modus}: bei ${laenge} Zeichen muss die Meldung vom Zugriffscode handeln, gemeldet wurde "${r.fehler}"`);
    assert.notEqual(r.fehler, 'PASSWORD_LENGTH_INVALID',
      `${modus}: ein Zugriffscode ist kein Passwort - bei ${laenge} Zeichen darf keine Passwortmeldung erscheinen`);
  }
  const gut = await anlegen(modus, 'a'.repeat(PASSWORD_MIN_LENGTH));
  assert.equal(gut.ok, true, `${modus}: ein ${PASSWORD_MIN_LENGTH} Zeichen langer Zugriffscode muss angenommen werden`);
  const gespeichert = db.prepare('SELECT access_code_hash FROM courses WHERE id=?').get(gut.kurs.id ?? gut.kurs.course?.id ?? '');
  if (gespeichert) assert.ok(gespeichert.access_code_hash, `${modus}: der Zugriffscode muss gespeichert werden`);
}

// 2. Wo es keinen Zugriffscode gibt, darf ein getippter auch nichts kaputtmachen.
for (const modus of ['login', 'public']) {
  const r = await anlegen(modus, 'kurz');
  assert.equal(r.ok, true,
    `${modus}: ein versehentlich getippter kurzer Code darf das Anlegen der Klasse nicht verhindern (gemeldet: ${r.fehler})`);
  const id = r.kurs.id ?? r.kurs.course?.id;
  if (id) {
    const zeile = db.prepare('SELECT access_code_hash FROM courses WHERE id=?').get(id);
    assert.equal(zeile.access_code_hash, null,
      `${modus}: für diese Zugangsart darf kein Zugriffscode gespeichert werden`);
  }
  assert.equal((await anlegen(modus, undefined)).ok, true, `${modus}: ohne Code muss es ohnehin gehen`);
}

// 3. Anlegen und Ändern müssen dieselbe Grenze kennen - sonst driften sie wieder auseinander.
const basis = await anlegen('link_code', 'a'.repeat(PASSWORD_MIN_LENGTH));
const kursId = basis.kurs.id ?? basis.kurs.course?.id;
assert.ok(kursId, 'für die Änderungsprüfung wird eine angelegte Klasse gebraucht');
const aendern = async (modus, code) => {
  try { await updateCourse(env, auth, tenant, kursId, { access_mode: modus, access_code: code }); return { ok: true }; }
  catch (e) { return { ok: false, fehler: String(e.message) }; }
};
for (let laenge = 1; laenge < PASSWORD_MIN_LENGTH; laenge++) {
  const r = await aendern('link_code', 'b'.repeat(laenge));
  assert.equal(r.fehler, 'ACCESS_CODE_REQUIRED',
    `beim Ändern muss bei ${laenge} Zeichen dieselbe Meldung kommen wie beim Anlegen, gemeldet wurde "${r.fehler}"`);
}
assert.equal((await aendern('link_code', 'b'.repeat(PASSWORD_MIN_LENGTH))).ok, true,
  'beim Ändern muss dieselbe Länge angenommen werden wie beim Anlegen');

// 4. Und die Oberfläche nennt dieselbe Zahl - Meldung, Eingabefeld und Server dürfen nicht driften.
const wortschatz = await readFile('public/kp-error-text.js', 'utf8');
const satz = (wortschatz.match(/ACCESS_CODE_REQUIRED:'([^']*)'/) || [])[1] || '';
assert.ok(satz, 'die Meldung zum Zugriffscode muss auffindbar bleiben');
assert.ok(satz.includes(`${PASSWORD_MIN_LENGTH} Zeichen`),
  `die Meldung muss dieselbe Zahl nennen wie der Server (${PASSWORD_MIN_LENGTH}), sie lautet: "${satz}"`);
assert.doesNotMatch(satz, /Passwort/i, 'die Meldung zum Zugriffscode darf nicht von einem Passwort sprechen');

for (const [datei, muster] of [['public/operational-crud-ui.js', /access_code" minlength="(\d+)"/],
                               ['public/class-portal.js', /access_code"[^>]*minlength="(\d+)"/]]) {
  const inhalt = await readFile(datei, 'utf8');
  const treffer = inhalt.match(muster);
  assert.ok(treffer, `${datei}: das Eingabefeld für den Zugriffscode muss auffindbar bleiben`);
  assert.equal(Number(treffer[1]), PASSWORD_MIN_LENGTH,
    `${datei}: das Eingabefeld verlangt ${treffer[1]} Zeichen, der Server ${PASSWORD_MIN_LENGTH}`);
}

console.log(`Zugriffscode einer Klasse: eine Regel statt zweier (mindestens ${PASSWORD_MIN_LENGTH} Zeichen), dieselbe beim Anlegen wie beim Ändern, keine Passwortmeldung mehr, und ohne Zugangsart kein Code: OK`);
