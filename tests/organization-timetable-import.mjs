import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { routeRows } from '../dist/core/intake-classifier.js';
import { mapOrganizationRows } from '../dist/core/organization-import-file.js';
import { importRole, previewOrganizationImport, applyOrganizationImport } from '../dist/core/organization-import.js';

// Gemeldet: "Ich habe Stundenplaene hochgeladen und diese wurden nicht erkannt."
//
// Beim Wurf eines ganzen Ordners ("Bildungstraeger importieren") kannte die Weiche nur zwei
// Gleise: Organisation und Teilnehmer. Eine Stundenplanzeile nennt einen Kurscode, also erkannte
// importRole sie als "course" - und aus achtzehn Unterrichtsstunden wurde achtzehnmal derselbe,
// laengst vorhandene Kurs. Der Stundenplan verschwand stillschweigend: kein Fehler, keine
// Meldung, keine einzige Stunde im Portal.
//
// Was eine Zeile zur Unterrichtsstunde macht, ist ihr Zeitfenster: Datum, Beginn und Ende. Keine
// Kurs-, Fach-, Raum- oder Personenliste fuehrt das je Zeile.
//
// Dieser Test liest nicht, er fuehrt aus: echtes SQLite mit dem echten Schema aller Migrationen,
// die echte Kopfzeile aus 07_Stundenplan.csv des Abnahmepakets, echter Entwurf, echtes Anlegen.

// Genau die Kopfzeile und drei Zeilen aus 07_Stundenplan.csv.
const STUNDENPLAN=`event_id,external_id,parent_external_id,course_id,course_code,course_external_id,date,week,weekday,start_time,end_time,room_external_id,location_external_id,instructor_external_id,session_type,topic,status,change_version
EV-001-01-1,EXT-EV-001-01-1,EXT-ADM-26-01,CRS-001,ADM-26-01,EXT-ADM-26-01,2026-09-07,1,Monday,08:15,11:30,ROOM-BM-B201,LOC-BER-MITTE,EMP-001,Unterricht,Regelunterricht Verwaltungsgrundlagen A,geplant,1
EV-001-01-2,EXT-EV-001-01-2,EXT-ADM-26-01,CRS-001,ADM-26-01,EXT-ADM-26-01,2026-09-08,1,Tuesday,08:15,11:30,ROOM-BM-B201,LOC-BER-MITTE,EMP-001,Unterricht,Regelunterricht Verwaltungsgrundlagen A,geplant,1
EV-001-01-3,EXT-EV-001-01-3,EXT-ADM-26-01,CRS-001,ADM-26-01,EXT-ADM-26-01,2026-09-09,1,Wednesday,12:30,15:45,ROOM-BM-B201,LOC-BER-MITTE,EMP-001,Online,Vertiefung Verwaltungsrecht,geplant,1
`;
// Zum Vergleich: die Kursliste desselben Ordners. Sie darf keine Unterrichtsstunde werden.
const KURSE=`course_id,external_id,parent_external_id,course_code,course_name,org_unit_external_id,location_external_id,start_date,end_date,status
CRS-001,EXT-ADM-26-01,OU-VERW,ADM-26-01,Verwaltungsgrundlagen A,OU-VERW,LOC-BER-MITTE,2026-09-07,2027-06-30,aktiv
`;
const rowsOf = text => mapOrganizationRows(parseCsv(text).rows);

// ---------------------------------------------------------------------------------------------
// 1. Die Weiche. Ausgefuehrt auf den echten Zeilen.
// ---------------------------------------------------------------------------------------------
const planRows = rowsOf(STUNDENPLAN), courseRows = rowsOf(KURSE);
assert.equal(planRows.length, 3, 'alle drei Zeilen muessen gelesen werden');
for (const row of planRows)
  assert.equal(importRole(row), 'lesson', `eine Zeile mit Datum, Beginn und Ende ist eine Unterrichtsstunde, erkannt wurde: ${importRole(row)}`);
assert.equal(importRole(courseRows[0]), 'course',
  'eine Kursliste mit Start- und Enddatum bleibt eine Kursliste - sie fuehrt keine Uhrzeiten');
// Und die Gegenprobe zum Merkmal: ein Datum allein macht keine Unterrichtsstunde. Eine
// Teilnehmerliste mit Eintrittsdatum bleibt eine Teilnehmerliste, eine Kursliste eine Kursliste.
const MIT_DATUM=`name,email,course_code,datum
Anna Beispiel,anna@example.invalid,ADM-26-01,2026-09-07
`;
assert.equal(importRole(rowsOf(MIT_DATUM)[0]), 'participant',
  'ein Datum ohne Uhrzeiten macht aus einer Person keine Unterrichtsstunde');
const KURS_MIT_DATUM=`course_code,course_name,datum
ADM-26-01,Verwaltungsgrundlagen A,2026-09-07
`;
assert.equal(importRole(rowsOf(KURS_MIT_DATUM)[0]), 'course',
  'ein Datum ohne Uhrzeiten macht aus einer Klasse keine Unterrichtsstunde');
assert.equal(routeRows(planRows).route, 'organization',
  'der Stundenplan gehoert weiterhin auf das Organisationsgleis, nicht zu den Teilnehmern');

// Die ausdrueckliche Angabe des Pruefenden schlaegt das Zeitfenster - so wie bei allen Typen.
assert.equal(importRole({ ...planRows[0], role: 'course' }), 'course',
  'stellt der Pruefende die Zeile auf "Kurs", bleibt es dabei');

// ---------------------------------------------------------------------------------------------
// 2. Echtes Schema, echter Entwurf, echtes Anlegen.
// ---------------------------------------------------------------------------------------------
const db = new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for (const name of (await readdir('migrations')).filter(f => f.endsWith('.sql')).sort()) db.exec(await readFile(`migrations/${name}`, 'utf8'));

const T = 'ten_plan_org', U = 'usr_plan_org', TS = new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Märkische Bildungsakademie','mba','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_plan_org','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_adm','${T}',NULL,'Verwaltungsgrundlagen A','ADM-26-01','login',1,'${TS}','${TS}');
`);
const env = { DB: d1(db) };
const auth = { userId: U, role: 'tenant_admin', tenantIds: [T], courseIds: [], orgUnitIds: [], permissions: [], isPlatformAdmin: false };
const apply = async preview => applyOrganizationImport(env, auth, T, { batch_id: preview.batch_id, digest: preview.digest });
const lessons = () => db.prepare('SELECT id,course_id,subject_id,starts_at,ends_at,room,notes FROM lessons WHERE tenant_id=? ORDER BY starts_at').all(T);

const preview = await previewOrganizationImport(env, auth, T, { source_name: '07_Stundenplan.csv', rows: planRows });
assert.equal(preview.summary.counts.lesson, 3,
  `aus drei Zeilen muessen drei Unterrichtsstunden werden, gezaehlt wurde: ${JSON.stringify(preview.summary.counts)}`);
assert.equal(preview.summary.counts.course, undefined,
  'aus dem Stundenplan darf kein einziger zusaetzlicher Kurs entstehen - der Kurs steht schon');
assert.equal(preview.summary.needs_review, 0, 'an diesem Stundenplan ist nichts unklar');
for (const c of preview.candidates) {
  assert.equal(c.course_id, 'crs_adm', 'jede Stunde muss der Klasse ihres Kurscodes zugeordnet werden');
  assert.deepEqual(c.warnings, [], `keine Stunde darf einen Hinweis tragen: ${JSON.stringify(c.warnings)}`);
}

const applied = await apply(preview);
const created = applied.results.filter(r => r.type === 'lesson' && r.action === 'created');
assert.equal(created.length, 3,
  `alle drei Stunden muessen entstehen, entstanden sind ${created.length}: ${JSON.stringify(applied.results)}`);

const rows = lessons();
assert.equal(rows.length, 3, 'im Portal muessen drei Unterrichtsstunden stehen');
assert.equal(rows[0].starts_at, '2026-09-07T08:15:00', 'Datum und Beginn muessen zusammengefuehrt werden');
assert.equal(rows[0].ends_at, '2026-09-07T11:30:00');
assert.equal(rows[0].course_id, 'crs_adm', 'und zwar an der Klasse, die der Kurscode nennt');
assert.equal(rows[0].room, 'ROOM-BM-B201', 'der Raum der Zeile gehoert an die Stunde');
assert.match(rows[0].notes || '', /Unterrichtsart: Unterricht/, 'die Unterrichtsart gehoert in den Hinweis');
assert.match(rows[0].notes || '', /Regelunterricht Verwaltungsgrundlagen A/, 'das Thema der Stunde ebenso');
assert.equal(rows[2].starts_at, '2026-09-09T12:30:00', 'auch die dritte Stunde muss stimmen');
assert.match(rows[2].notes || '', /Unterrichtsart: Online/, 'eine Online-Stunde bleibt als solche erkennbar');
assert.doesNotMatch(rows[0].notes || '', /EMP-001/,
  'eine Dozentenkennung ist kein Dozentenname - sie gehoert nicht als Auskunft in den Hinweis');


// Derselbe Ordner ein zweites Mal geworfen darf den Stundenplan nicht verdoppeln.
const zweiter = await previewOrganizationImport(env, auth, T, { source_name: '07_Stundenplan.csv', rows: planRows });
const zweiteAnwendung = await apply(zweiter);
assert.equal(zweiteAnwendung.results.filter(r => r.type === 'lesson' && r.action === 'existing').length, 3,
  'beim zweiten Wurf muss jede Stunde als vorhanden erkannt werden');
assert.equal(lessons().length, 3, 'und es duerfen keine weiteren Stunden entstehen');

// Nennt die Datei die Lehrkraft beim Namen, steht sie im Hinweis.
const MIT_DOZENT = `course_code,date,start_time,end_time,dozent
ADM-26-01,2026-09-21,08:15,11:30,Dario Falkenau
`;
const mitDozent = await previewOrganizationImport(env, auth, T, { source_name: 'dozent.csv', rows: rowsOf(MIT_DOZENT) });
assert.equal(mitDozent.candidates[0].type, 'lesson', 'eine Dozentenspalte macht daraus keine Personenzeile');
await apply(mitDozent);
const mitName = lessons().find(l => String(l.starts_at).startsWith('2026-09-21'));
assert.ok(mitName, 'die Stunde muss entstehen');
assert.match(mitName.notes || '', /Dozent\/in: Dario Falkenau/, 'der Name der Lehrkraft gehoert in den Hinweis');

// Der Fall, der am echten Abnahmepaket alle 509 Stunden liegen liess: die Klasse gibt es beim
// Hochladen noch nicht, und die Zeile nennt neben dem Kurscode auch die Kennung, unter der der
// Kunde die Klasse fuehrt ("CRS-777"). Wird beim Anlegen nach dieser Kennung gesucht, findet der
// Import die eben erst angelegte Klasse nicht - COURSE_NOT_RESOLVED fuer jede einzelne Stunde.
const EIGENE_KENNUNG = `course_id,course_code,course_name,date,start_time,end_time
CRS-777,BUE-27-03,Bürokommunikation 2027,2026-12-01,09:00,12:15
CRS-777,BUE-27-03,,2026-12-02,09:00,12:15
`;
const eigene = await previewOrganizationImport(env, auth, T, { source_name: 'eigene-kennung.csv', rows: rowsOf(EIGENE_KENNUNG) });
assert.equal(eigene.summary.counts.lesson, 2, 'beide Stunden bleiben Stunden');
for (const c of eigene.candidates)
  assert.notEqual(c.course_ref, 'crs_777',
    `das Merkmal, mit dem die Klasse gesucht wird, darf nicht die Kundenkennung sein: ${c.type} -> ${c.course_ref}`);
assert.equal(eigene.candidates.find(c => c.type === 'lesson').course_ref, 'bue_27_03',
  'gesucht wird mit dem Kurscode');
assert.equal(eigene.summary.counts.course, 1, 'und ihre Klasse wird einmal mit angelegt');
const eigeneAngewendet = await apply(eigene);
const eigeneStunden = eigeneAngewendet.results.filter(r => r.type === 'lesson');
assert.deepEqual(eigeneStunden.map(r => r.action), ['created', 'created'],
  `beide Stunden muessen an der neuen Klasse entstehen, bekommen: ${JSON.stringify(eigeneStunden)}`);
const buero = db.prepare("SELECT id,name FROM courses WHERE tenant_id=? AND code='BUE-27-03' COLLATE NOCASE").get(T);
assert.ok(buero, 'die Klasse muss unter ihrem Kurscode angelegt sein, nicht unter der Kundenkennung');
assert.equal(buero.name, 'Bürokommunikation 2027', 'und unter ihrem Namen');
assert.equal(lessons().filter(l => l.course_id === buero.id).length, 2, 'beide Stunden haengen an ihr');
assert.equal(db.prepare("SELECT COUNT(*) n FROM courses WHERE tenant_id=? AND code='CRS-777' COLLATE NOCASE").get(T).n, 0,
  'unter der Kundenkennung darf keine zweite Klasse entstehen');

// Kursliste und Stundenplan im selben Ordner: die Kursliste nennt die Klasse beim Namen, der
// Stundenplan nur ueber ihren Code. Beides muss dieselbe Klasse sein - sonst legt der aus dem
// Stundenplan ergaenzte Platzhalter die Klasse unter ihrem Code an, und sie heisst danach
// "PFL-A-26" statt "Pflege Vormittag".
const GEMISCHT = `course_code,course_name,date,start_time,end_time
PFL-A-26,Pflege Vormittag,,,
PFL-A-26,,2026-10-05,08:00,11:15
PFL-A-26,,2026-10-06,08:00,11:15
`;
const gemischt = await previewOrganizationImport(env, auth, T, { source_name: 'gemischt.csv', rows: rowsOf(GEMISCHT) });
assert.equal(gemischt.summary.counts.course, 1,
  `dieselbe Klasse darf nur einmal im Entwurf stehen, gezaehlt: ${JSON.stringify(gemischt.summary.counts)}`);
assert.equal(gemischt.summary.counts.lesson, 2, 'und beide Stunden bleiben erhalten');
const kursKandidat = gemischt.candidates.find(c => c.type === 'course');
assert.equal(kursKandidat.course_name, 'Pflege Vormittag',
  `die Klasse muss ihren Namen aus der Kursliste behalten, bekommen hat sie: ${kursKandidat.course_name}`);
assert.ok(!kursKandidat.synthesized, 'die echte Zeile muss den ergaenzten Platzhalter schlagen');
const gemischtAngewendet = await apply(gemischt);
assert.equal(gemischtAngewendet.results.filter(r => r.type === 'course').length, 1, 'und nur einmal angelegt werden');
const pflegeVormittag = db.prepare("SELECT id,name FROM courses WHERE tenant_id=? AND code='PFL-A-26' COLLATE NOCASE").all(T);
assert.equal(pflegeVormittag.length, 1, 'im Portal darf sie nur einmal stehen');
assert.equal(pflegeVormittag[0].name, 'Pflege Vormittag', 'und unter ihrem Namen, nicht unter ihrem Code');
assert.equal(lessons().filter(l => l.course_id === pflegeVormittag[0].id).length, 2,
  'beide Stunden muessen an dieser einen Klasse haengen');

// ---------------------------------------------------------------------------------------------
// 3. Unbrauchbare Zeitangaben halten den Import an, statt eine falsche Stunde anzulegen.
// ---------------------------------------------------------------------------------------------
const KAPUTT = `course_code,date,start_time,end_time,room
ADM-26-01,2026-09-10,11:30,08:15,B 201
`;
const vorher = lessons().length;
const kaputt = await previewOrganizationImport(env, auth, T, { source_name: 'kaputt.csv', rows: rowsOf(KAPUTT) });
assert.equal(kaputt.candidates[0].type, 'lesson', 'auch diese Zeile ist eine Unterrichtsstunde');
assert.ok(kaputt.candidates[0].warnings.includes('LESSON_END_BEFORE_START'),
  `ein Ende vor dem Beginn muss benannt werden: ${JSON.stringify(kaputt.candidates[0].warnings)}`);
assert.equal(kaputt.summary.needs_review, 1, 'und die Zeile muss zur Pruefung stehen');
const kaputtAngewendet = await apply(kaputt);
assert.equal(kaputtAngewendet.results[0].action, 'skipped', 'eine unklare Stunde wird nicht angelegt');
assert.equal(lessons().length, vorher, 'und es entsteht keine weitere Stunde');

// Eine Stunde, die ihre Klasse gar nicht nennt, darf nicht irgendwo landen.
const OHNE_KLASSE = `date,start_time,end_time,room
2026-09-15,08:00,11:15,B 105
`;
const ohneKlasse = await previewOrganizationImport(env, auth, T, { source_name: 'ohne-klasse.csv', rows: rowsOf(OHNE_KLASSE) });
assert.equal(ohneKlasse.candidates[0].type, 'lesson', 'auch ohne Klasse ist die Zeile eine Unterrichtsstunde');
assert.ok(ohneKlasse.candidates[0].warnings.includes('COURSE_REQUIRED'),
  `eine Stunde ohne Klasse muss das sagen: ${JSON.stringify(ohneKlasse.candidates[0].warnings)}`);
assert.equal(ohneKlasse.summary.needs_review, 1, 'und zur Pruefung stehen');
const ohneKlasseAngewendet = await apply(ohneKlasse);
assert.equal(ohneKlasseAngewendet.results[0].action, 'skipped', 'sie darf nicht angelegt werden');
assert.equal(lessons().length, vorher, 'und keiner fremden Klasse zugeschlagen werden');

// Eine Stunde ohne auffindbare Klasse: der Kurs wird angelegt, die Stunde haengt an ihm.
const NEUE_KLASSE = `course_code,course_name,date,start_time,end_time
PFL-26-02,Pflegehelfer Abendkurs,2026-09-14,17:00,20:15
`;
const neu = await previewOrganizationImport(env, auth, T, { source_name: 'neu.csv', rows: rowsOf(NEUE_KLASSE) });
assert.equal(neu.summary.counts.lesson, 1, 'die Zeile bleibt eine Unterrichtsstunde');
assert.equal(neu.summary.counts.course, 1, 'und ihre noch fehlende Klasse wird mit angelegt');
const neuAngewendet = await apply(neu);
assert.equal(neuAngewendet.results.filter(r => r.type === 'lesson' && r.action === 'created').length, 1,
  `die Stunde muss nach ihrer Klasse entstehen: ${JSON.stringify(neuAngewendet.results)}`);
// createCourse normalisiert den Code - deshalb hier ohne Ruecksicht auf Gross- und Kleinschreibung.
const pflege = db.prepare("SELECT id FROM courses WHERE tenant_id=? AND code='PFL-26-02' COLLATE NOCASE").get(T);
assert.ok(pflege, 'die Klasse muss angelegt worden sein');
assert.equal(lessons().filter(l => l.course_id === pflege.id).length, 1,
  'und die Stunde muss an genau dieser Klasse haengen - nicht an der ersten besten');

console.log(`Ein ganzer Ordner mit Stundenplan: ${rows.length} Unterrichtsstunden landen an der richtigen Klasse, ein zweiter Wurf verdoppelt nichts, unklare Zeiten werden angehalten: OK`);
