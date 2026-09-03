import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { prepareHierarchyAwareTimetableRequest } from '../dist/core/timetable-hierarchy-targeting.js';

// Derselbe Fund wie beim Teilnehmer-Einzelimport (participant-hierarchy-targeting.ts), nur im
// eigenständigen Stundenplan-Massenupload: nannte eine Zeile weder Klassenname noch -code noch
// Standort/Organisation, verglich der Auflöser trotzdem gegen ALLE Klassen des Trägers - und
// meldete bei mehr als einer vorhandenen Klasse fälschlich "Mehrere Klassen/Kurse passen …",
// obwohl die Zeile gar keine Angabe machte, die mehr als eine Klasse hätte treffen können.

async function umgebungMitKlassen(slug, klassen) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec("CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);");
  for (const name of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) db.exec(await readFile(`migrations/${name}`, 'utf8'));
  const T = 'ten_tha', U = 'usr_tha', TS = new Date().toISOString();
  db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Realschule am Nordblick','${slug}','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_tha','${T}',NULL,'${U}','tenant_admin','${TS}');
`);
  for (const k of klassen) db.exec(`INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('${k.id}','${T}',NULL,'${k.name}','${k.code}','login',1,'${TS}','${TS}');`);
  const env = { DB: d1(db) };
  const auth = { userId: U, role: 'tenant_admin', tenantIds: [T], courseIds: [], orgUnitIds: [], permissions: [], isPlatformAdmin: false };
  return { db, T, env, auth };
}

function requestOf(csv) {
  const fd = new FormData();
  fd.set('file', new File([csv], 'stundenplan.csv', { type: 'text/csv' }));
  return new Request('https://portal.example.invalid/api/timetable/preview', { method: 'POST', body: fd });
}

// Zwei echte Klassen über den Klassennamen erkannt (Zeile 1/2), eine dritte Zeile ohne jede
// Angabe (Zeile 3) - die Datei gilt insgesamt als hierarchie-relevant, weil mehr als ein
// verschiedener Klassenname vorkommt.
const STUNDENPLAN = `datum,beginn,ende,klasse,fach,dozent
2026-09-07,08:00,09:30,Klasse 7a,Mathematik,Frau Nowak
2026-09-08,08:00,09:30,Klasse 7b,Mathematik,Frau Nowak
2026-09-09,08:00,09:30,,Deutsch,Herr Krug
`;

// ---------------------------------------------------------------------------------------------
// 1. Mehrere Klassen im Träger, eine Zeile ganz ohne Angabe: kein falsches "mehrere passende
//    Klassen" mehr.
// ---------------------------------------------------------------------------------------------
{
  const { env, auth, T } = await umgebungMitKlassen('ndb-tha-1', [
    { id: 'crs_a', name: 'Klasse 7a', code: 'K7A' },
    { id: 'crs_b', name: 'Klasse 7b', code: 'K7B' },
  ]);
  let error = null;
  try { await prepareHierarchyAwareTimetableRequest(env, auth, T, requestOf(STUNDENPLAN)); }
  catch (e) { error = e; }
  assert.ok(error, 'die Zeile ohne Angabe muss zur Prüfung anhalten, nicht still durchgehen');
  assert.equal(error.message, 'TIMETABLE_TARGET_REVIEW_REQUIRED');
  const zeile3 = error.targeting.decisions.find(d => d.row === 4);
  assert.ok(zeile3, `Zeile 3 (Datenzeile 4) muss in den Entscheidungen stehen, gefunden: ${JSON.stringify(error.targeting.decisions.map(d => d.row))}`);
  assert.ok(!/[Mm]ehrere Klassen\/Kurse passen/.test(zeile3.reason),
    `eine Zeile ohne jede Angabe darf nie "mehrere passende Klassen" melden - es gab nichts zum Vergleichen. Gefunden: ${zeile3.reason}`);
  assert.equal(zeile3.status, 'review');
  const zeile1 = error.targeting.decisions.find(d => d.row === 2), zeile2 = error.targeting.decisions.find(d => d.row === 3);
  assert.equal(zeile1.status, 'automatic', `Klasse 7a muss trotzdem eindeutig über ihren Namen aufgelöst werden, gefunden: ${JSON.stringify(zeile1)}`);
  assert.equal(zeile2.status, 'automatic', `Klasse 7b muss trotzdem eindeutig über ihren Namen aufgelöst werden, gefunden: ${JSON.stringify(zeile2)}`);
  console.log('timetable-hierarchy-targeting-ambiguity 1/2 (kein Widerspruch mehr bei fehlender Angabe, echte Namen bleiben eindeutig): ok');
}

// ---------------------------------------------------------------------------------------------
// 2. Regressions-Gegenprobe: führt der Träger nur EINE aktive Klasse, bleibt eine Zeile ganz ohne
//    Angabe weiterhin automatisch eindeutig zugeordnet.
// ---------------------------------------------------------------------------------------------
{
  const { env, auth, T } = await umgebungMitKlassen('ndb-tha-2', [{ id: 'crs_solo', name: 'Die eine Klasse', code: 'SOLO' }]);
  // Die Spalte "kurscode" macht die Datei hierarchie-relevant (COURSE_CODE_ALIASES), auch wenn
  // sie in keiner Zeile befuellt ist - genauso wie eine echte Datei mit teils leeren Spalten.
  const NUR_OHNE_ANGABE = `datum,beginn,ende,klasse,kurscode,fach,dozent
2026-09-07,08:00,09:30,,,Deutsch,Herr Krug
2026-09-08,08:00,09:30,Die eine Klasse,,Mathematik,Frau Nowak
`;
  const { targeting } = await prepareHierarchyAwareTimetableRequest(env, auth, T, requestOf(NUR_OHNE_ANGABE));
  assert.equal(targeting.automatic, 2, `bei genau einer Klasse im Träger müssen beide Zeilen automatisch zugeordnet werden, gefunden: ${JSON.stringify(targeting)}`);
  assert.equal(targeting.review, 0);
  for (const d of targeting.decisions) assert.equal(d.courseId, 'crs_solo');
  console.log('timetable-hierarchy-targeting-ambiguity 2/2 (Ein-Klassen-Träger bleibt ohne Angabe automatisch eindeutig): ok');
}

console.log('timetable-hierarchy-targeting-ambiguity: ok');
