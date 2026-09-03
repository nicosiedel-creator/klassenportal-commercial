import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { mapParticipantRows } from '../dist/core/participant-import-file.js';
import { previewParticipantImport, applyParticipantImport } from '../dist/core/participant-document-import.js';

// Kundenmeldung: eine ganze Massenupload-Liste zeigte "Kein Kurs erkannt" UND "Mehrere passende
// Kurse" gleichzeitig auf jeder Zeile, bei stehengebliebenen 70% Vertrauen. Beides zusammen ist
// unmöglich: entweder wurde kein Kurs erkannt, oder mehrere passende gefunden - nie beides. Und
// eine echte "Mehrdeutigkeit" setzt voraus, dass die Zeile überhaupt etwas genannt hat, das mehr
// als einen Kurs treffen könnte.
//
// Ursache: fehlten in einer Zeile Kurscode, Kursname UND Standort/Bereich vollständig, verglich
// der Auflöser trotzdem gegen ALLE Kurse des Trägers (der Rückfall dient eigentlich nur dazu,
// dass ein Träger mit genau einem Kurs auch ohne Angabe eindeutig bleibt) - und meldete bei mehr
// als einem vorhandenen Kurs faelschlich "mehrere passende Kurse", obwohl nichts zum Vergleichen
// dastand. Die urspruengliche, korrekte Einschaetzung "Kein Kurs erkannt" wurde dabei nie entfernt
// UND die angezeigte Prozentzahl nie neu berechnet, nachdem der neue Befund dazukam.

async function umgebungMitKursen(slug, kurse) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec("CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);");
  for (const name of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) db.exec(await readFile(`migrations/${name}`, 'utf8'));
  const T = 'ten_ca', U = 'usr_ca', TS = new Date().toISOString();
  db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Realschule am Nordblick','${slug}','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_ca','${T}',NULL,'${U}','tenant_admin','${TS}');
`);
  for (const k of kurse) db.exec(`INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('${k.id}','${T}',NULL,'${k.name}','${k.code}','login',1,'${TS}','${TS}');`);
  const versandt = [];
  const env = { DB: d1(db), MAIL_FROM: 'kein-versand@example.invalid', APP_ORIGIN: 'https://portal.example.invalid',
    EMAIL: { send: async m => { versandt.push(m); return { messageId: `test-${versandt.length}` }; } } };
  const auth = { userId: U, role: 'tenant_admin', tenantIds: [T], courseIds: [], orgUnitIds: [], permissions: [], isPlatformAdmin: false };
  return { db, T, U, env, auth, versandt };
}

const KOPF = 'Teilnehmer_ID;Vorname;Nachname;E-Mail;Status';
const ZEILEN_OHNE_KURS = ['Elif Nordblick', 'Henry Testmann', 'Leonie Nordblick', 'Lina Testmann'].map((n, i) => {
  const [vor, nach] = n.split(' '), id = String(1486 + i);
  return `stu-${id};${vor};${nach};stu-${id}@example.invalid;aktiv`;
});
const DATEI_OHNE_KURS = [KOPF, ...ZEILEN_OHNE_KURS].join('\n') + '\n';

// ---------------------------------------------------------------------------------------------
// 1. Der zentrale Fund: ein Träger mit mehreren Kursen, eine Liste ganz ohne Kursspalte. Vorher
//    stand "Kein Kurs erkannt" UND "Mehrere passende Kurse" nebeneinander - beides zugleich kann
//    nie stimmen.
// ---------------------------------------------------------------------------------------------
{
  const { env, auth, T } = await umgebungMitKursen('ndb-ambig-1', [
    { id: 'crs_a', name: 'Klasse 7a', code: 'K7A' },
    { id: 'crs_b', name: 'Klasse 7b', code: 'K7B' },
    { id: 'crs_c', name: 'Klasse 8a', code: 'K8A' },
  ]);
  const zeilen = mapParticipantRows(parseCsv(DATEI_OHNE_KURS).rows);
  assert.equal(zeilen.length, 4, 'die Testliste muss 4 Zeilen liefern');
  const entwurf = await previewParticipantImport(env, auth, T, { source_name: 'ohne_kurs.csv', rows: zeilen });
  assert.equal(entwurf.candidates.length, 4);
  for (const c of entwurf.candidates) {
    assert.ok(!c.warnings.includes('COURSE_AMBIGUOUS'),
      `eine Zeile ohne jede Kursangabe darf nie "mehrere passende Kurse" melden - es gab nichts zum Vergleichen. Gefunden bei ${c.display_name}: ${JSON.stringify(c.warnings)}`);
    assert.ok(c.warnings.includes('COURSE_NOT_DETECTED'),
      `"Kein Kurs erkannt" muss stehen bleiben, da die Zeile wirklich keinen Kurs nennt. Gefunden bei ${c.display_name}: ${JSON.stringify(c.warnings)}`);
    // Die Prozentzahl muss den tatsächlichen, fertigen Befund widerspiegeln - nicht den Stand vor
    // der Kurszuordnung.
    const erwartet = Math.max(0, 100 - new Set(c.warnings).size * 30);
    assert.equal(c.confidence, erwartet,
      `die angezeigte Prozentzahl muss zum tatsächlichen Befund passen (${JSON.stringify(c.warnings)}), erwartet ${erwartet}, gefunden ${c.confidence} bei ${c.display_name}`);
  }
  console.log('participant-import-course-ambiguity 1/4 (kein Widerspruch mehr bei fehlender Kursangabe, Prozentzahl stimmt): ok');
}

// ---------------------------------------------------------------------------------------------
// 2. Regressions-Gegenprobe: führt der Träger nur EINEN Kurs, bleibt die Zuordnung ohne jede
//    Angabe weiterhin automatisch eindeutig - diese Bequemlichkeit darf durch die Korrektur nicht
//    verloren gehen.
// ---------------------------------------------------------------------------------------------
{
  const { env, auth, T, db } = await umgebungMitKursen('ndb-ambig-2', [{ id: 'crs_solo', name: 'Die eine Klasse', code: 'SOLO' }]);
  const zeilen = mapParticipantRows(parseCsv(DATEI_OHNE_KURS).rows);
  const entwurf = await previewParticipantImport(env, auth, T, { source_name: 'ohne_kurs.csv', rows: zeilen });
  for (const c of entwurf.candidates) {
    assert.equal(c.course_id, 'crs_solo', `bei genau einem Kurs im Träger muss die Zuordnung weiterhin automatisch gelingen, gefunden: ${c.course_id}`);
    assert.equal(c.confidence, 100, `ohne jede Warnung muss die Zeile 100% zeigen, gefunden: ${c.confidence}`);
  }
  const ergebnis = await applyParticipantImport(env, auth, T, { batch_id: entwurf.batch_id, digest: entwurf.digest });
  assert.equal(ergebnis.results.filter(r => r.action === 'skipped').length, 0, 'bei eindeutigem einzigen Kurs darf keine Zeile übersprungen werden');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM memberships WHERE tenant_id=? AND role='participant'").get(T).n, 4);
  console.log('participant-import-course-ambiguity 2/4 (Ein-Kurs-Träger bleibt automatisch eindeutig): ok');
}

// ---------------------------------------------------------------------------------------------
// 3. Mit einem vorgegebenen Fallback-Kurs (die Oberfläche bietet genau das für Verträge/PDF an)
//    muss eine Zeile ohne jede Kursangabe trotz mehrerer Kurse im Träger automatisch dem Fallback
//    zugeordnet werden - das darf die Korrektur nicht verhindern.
// ---------------------------------------------------------------------------------------------
{
  const { env, auth, T, db } = await umgebungMitKursen('ndb-ambig-3', [
    { id: 'crs_a', name: 'Klasse 7a', code: 'K7A' },
    { id: 'crs_b', name: 'Klasse 7b', code: 'K7B' },
  ]);
  const zeilen = mapParticipantRows(parseCsv(DATEI_OHNE_KURS).rows);
  const entwurf = await previewParticipantImport(env, auth, T, { source_name: 'ohne_kurs.csv', rows: zeilen, default_course_id: 'crs_a' });
  for (const c of entwurf.candidates) {
    assert.equal(c.course_id, 'crs_a', `mit vorgegebenem Fallback-Kurs muss trotz mehrerer Kurse im Träger automatisch zugeordnet werden, gefunden: ${c.course_id}`);
    assert.ok(!c.warnings.includes('COURSE_AMBIGUOUS'), `auch mit Fallback darf keine falsche Mehrdeutigkeit gemeldet werden, gefunden: ${JSON.stringify(c.warnings)}`);
  }
  const ergebnis = await applyParticipantImport(env, auth, T, { batch_id: entwurf.batch_id, digest: entwurf.digest });
  assert.equal(ergebnis.results.filter(r => r.action === 'skipped').length, 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM memberships WHERE tenant_id=? AND course_id='crs_a'").get(T).n, 4);
  console.log('participant-import-course-ambiguity 3/4 (Fallback-Kurs löst trotz mehrerer Kurse im Träger automatisch auf): ok');
}

// ---------------------------------------------------------------------------------------------
// 4. Eine echte Mehrdeutigkeit - der Kurscode einer Zeile passt tatsächlich auf mehr als einen
//    vorhandenen Kurs - muss weiterhin als "mehrere passende Kurse" erkannt werden. Die Korrektur
//    darf die echte Erkennung nicht mit wegnehmen.
// ---------------------------------------------------------------------------------------------
{
  const { env, auth, T } = await umgebungMitKursen('ndb-ambig-4', [
    { id: 'crs_x1', name: 'Mathe Grundkurs', code: 'MA-GK' },
    { id: 'crs_x2', name: 'Mathe Grundkurs', code: 'MA-GK-2' },
  ]);
  const zeile = 'stu-9001;Test;Person;test.person@example.invalid;Mathe Grundkurs;aktiv';
  const zeilen = mapParticipantRows(parseCsv(`Teilnehmer_ID;Vorname;Nachname;E-Mail;Kurs;Status\n${zeile}\n`).rows);
  const entwurf = await previewParticipantImport(env, auth, T, { source_name: 'echte_mehrdeutigkeit.csv', rows: zeilen });
  assert.equal(entwurf.candidates.length, 1);
  assert.ok(entwurf.candidates[0].warnings.includes('COURSE_AMBIGUOUS'),
    `ein tatsächlich mehrdeutiger Kursname muss weiterhin erkannt werden, gefunden: ${JSON.stringify(entwurf.candidates[0].warnings)}`);
  assert.ok(!entwurf.candidates[0].warnings.includes('COURSE_NOT_DETECTED'),
    'bei einer echten Namensangabe darf "Kein Kurs erkannt" nicht danebenstehen');
  console.log('participant-import-course-ambiguity 4/4 (echte Mehrdeutigkeit bleibt erkannt): ok');
}

console.log('participant-import-course-ambiguity: ok');
