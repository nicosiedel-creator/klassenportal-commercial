import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';

// Beim Anlegen eines Angebots über die Plattformverwaltung stand im Hinweisfenster wörtlich:
//
//   "Angebot erstellt, aber der E-Mailversand ist fehlgeschlagen (D1_ERROR: CHECK constraint
//    failed: event_type IN ('created','published','viewed','accepted','cancelled','expired',
//    'onboa... SQLITE_CONSTRAINT). Der gültige Link wurde zum Kopieren bereitgestellt."
//
// Zwei Fehler in einem Satz:
//  1. platform-offer-mail.ts schreibt ein Ereignis vom Typ 'email_sent' bzw. 'email_failed';
//     die Bedingung der Tabelle kannte beide nicht. Jeder Angebotsversand scheiterte damit an
//     der Datenbank - der erste Schritt mit jedem neuen Kunden.
//  2. Die rohe Datenbankmeldung stand in der Oberfläche.
//
// Aufgefallen war es nie, weil offer-schema.ts dieselbe Tabelle als Rückfallebene ohne Bedingung
// anlegt: wo die Rückfallebene griff, ging es gut. Auf einer migrierten Datenbank - also in
// Produktion - nicht.

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for (const name of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort())
  db.exec(await readFile(`migrations/${name}`, 'utf8'));

// Ein Angebot, an dem die Ereignisse hängen können.
db.prepare(`INSERT INTO commercial_quotes(id,quote_number,plan_id,requested_courses,recurring_monthly_cents,
    setup_cents,first_total_cents,status,valid_until,pricing_snapshot_json,customer_name,customer_email,created_at,updated_at)
  VALUES('q_1','ANG-TEST-1','provider',3,11900,0,11900,'offered','2099-12-31','{}','Prüfträger','pruef@example.invalid',
    datetime('now'),datetime('now'))`).run();

// 1. Genau die Ereignistypen, die der ausgelieferte Code schreibt, müssen speicherbar sein.
const quelle = await readFile('src/core/platform-offer-mail.ts', 'utf8');
const geschrieben = [...quelle.matchAll(/mailId\?'([a-z_]+)':'([a-z_]+)'/g)].flatMap(m => [m[1], m[2]]);
assert.ok(geschrieben.includes('email_sent') && geschrieben.includes('email_failed'),
  `der Versand muss seine Ereignistypen erkennbar schreiben, gefunden: ${geschrieben.join(', ')}`);
for (const typ of [...new Set(geschrieben)]) {
  db.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)')
    .run(`ofe_${typ}`, 'q_1', typ, '{}', new Date().toISOString());
}
// Und die bisherigen bleiben erlaubt - die Tabelle wurde neu gebaut, nichts darf verloren gehen.
for (const typ of ['created', 'published', 'viewed', 'accepted', 'cancelled', 'expired', 'onboarding_created'])
  db.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)')
    .run(`ofe_alt_${typ}`, 'q_1', typ, '{}', new Date().toISOString());
assert.equal(db.prepare('SELECT COUNT(*) n FROM commercial_offer_events').get().n, geschrieben.length ? new Set(geschrieben).size + 7 : 7);

// Ein erfundener Typ bleibt abgewiesen - die Bedingung ist nicht einfach weggefallen.
assert.throws(() => db.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)')
  .run('ofe_x', 'q_1', 'irgendwas', '{}', new Date().toISOString()),
  /constraint/i, 'die Bedingung muss weiterhin unbekannte Ereignistypen abweisen');

// 2. Die Rückfallebene legt dieselbe Bedingung an - sonst hängt das Verhalten davon ab, wer die
//    Tabelle zuerst gebaut hat, und der Fehler bliebe in Produktion unsichtbar.
const rueckfall = await readFile('src/core/offer-schema.ts', 'utf8');
for (const typ of ['email_sent', 'email_failed', 'onboarding_created'])
  assert.ok(new RegExp(`CHECK\\(event_type IN \\([^)]*'${typ}'`).test(rueckfall),
    `die Rückfallebene muss "${typ}" ebenso erlauben wie die Migration`);

// 3. Und keine rohe Datenbankmeldung mehr in der Oberfläche.
const router = await readFile('src/core/platform-offer-router.ts', 'utf8');
const zeile = router.split('\n').find(z => z.startsWith('function deliveryError(')) || '';
assert.ok(zeile, 'deliveryError muss auffindbar bleiben');
assert.ok(zeile.includes('safeErrorCode'),
  `die Meldung an die Oberfläche muss über safeErrorCode gehen, gefunden: ${zeile}`);
assert.ok(!/\(e as Error\)\?\.message/.test(zeile),
  `die rohe Ausnahme darf nicht weitergereicht werden, gefunden: ${zeile}`);
const { safeErrorCode } = await import('../dist/core/utils.js');
const roh = "D1_ERROR: CHECK constraint failed: event_type IN ('created','published') : SQLITE_CONSTRAINT";
const gezeigt = safeErrorCode(new Error(roh));
assert.doesNotMatch(gezeigt, /D1_ERROR|SQLITE|CHECK constraint|event_type/i,
  `aus der Datenbankmeldung darf nichts durchkommen, gezeigt würde: ${gezeigt}`);

// 4. Und die Umstellung selbst: SQLite kann eine CHECK-Bedingung nicht ändern, die Tabelle wird
//    deshalb neu gebaut. Auf einer leeren Datenbank ist das folgenlos - auf einer mit Bestand
//    nicht. Geprüft wird an einer Datenbank, die vor der Umstellung schon Ereignisse führt.
{
  const alt = new DatabaseSync(':memory:');
  alt.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
  const alle = (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort();
  const umstellung = alle.find(f => f.startsWith('0092_'));
  assert.ok(umstellung, 'die Umstellung muss auffindbar bleiben');
  for (const name of alle.filter(f => f !== umstellung)) alt.exec(await readFile(`migrations/${name}`, 'utf8'));

  alt.prepare(`INSERT INTO commercial_quotes(id,quote_number,plan_id,requested_courses,recurring_monthly_cents,
      setup_cents,first_total_cents,status,valid_until,pricing_snapshot_json,customer_name,customer_email,created_at,updated_at)
    VALUES('q_alt','ANG-ALT-1','provider',5,11900,0,11900,'accepted','2099-12-31','{"a":1}','Bestandsträger','bestand@example.invalid',
      '2026-01-01T10:00:00.000Z','2026-01-02T10:00:00.000Z')`).run();
  const bestand = [['created', '{"quelle":"alt"}'], ['published', '{"n":2}'], ['viewed', null],
                   ['accepted', '{"wer":"Kundin"}'], ['onboarding_created', '{"token":"abc"}']];
  for (const [typ, detail] of bestand)
    alt.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)')
      .run(`ofe_bestand_${typ}`, 'q_alt', typ, detail, `2026-02-0${bestand.findIndex(b => b[0] === typ) + 1}T09:00:00.000Z`);
  const vorher = alt.prepare('SELECT id,quote_id,event_type,detail_json,created_at FROM commercial_offer_events ORDER BY id').all();
  assert.equal(vorher.length, bestand.length, 'der Bestand muss vor der Umstellung stehen');

  alt.exec(await readFile(`migrations/${umstellung}`, 'utf8'));

  const nachher = alt.prepare('SELECT id,quote_id,event_type,detail_json,created_at FROM commercial_offer_events ORDER BY id').all();
  assert.deepEqual(nachher, vorher,
    `die Umstellung darf keine Zeile verändern oder verlieren:\nvorher ${JSON.stringify(vorher)}\nnachher ${JSON.stringify(nachher)}`);
  // Der neue Typ geht jetzt, der erfundene weiterhin nicht.
  alt.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)')
    .run('ofe_neu', 'q_alt', 'email_sent', '{}', '2026-03-01T09:00:00.000Z');
  assert.throws(() => alt.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)')
    .run('ofe_boese', 'q_alt', 'irgendwas', '{}', '2026-03-01T09:00:00.000Z'), /constraint/i);
  // Der Index und der Fremdschlüssel überleben den Neubau - sonst wird die Liste langsam bzw.
  // bleiben Ereignisse gelöschter Angebote liegen.
  const indizes = alt.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='commercial_offer_events'").all().map(r => r.name);
  assert.ok(indizes.includes('idx_offer_events_quote'), `der Index muss erhalten bleiben, gefunden: ${indizes.join(', ')}`);
  const fk = alt.prepare('PRAGMA foreign_key_list(commercial_offer_events)').all();
  assert.equal(fk.length, 1, 'der Fremdschlüssel auf das Angebot muss erhalten bleiben');
  assert.equal(fk[0].table, 'commercial_quotes');
  // Und die Hilfstabelle des Neubaus bleibt nicht zurück.
  const tabellen = alt.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'commercial_offer_events%'").all().map(r => r.name);
  assert.deepEqual(tabellen, ['commercial_offer_events'],
    `nach der Umstellung darf nur die eine Tabelle übrig sein, gefunden: ${tabellen.join(', ')}`);
}

console.log('Angebotsversand: die Ereignistypen des Versands sind speicherbar, die alten bleiben erlaubt, unbekannte weiterhin nicht, der Umbau der Tabelle verliert keine Bestandszeile - und keine Datenbankmeldung erreicht mehr die Oberfläche: OK');
