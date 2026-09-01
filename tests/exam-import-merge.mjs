import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { icsRows } from '../dist/core/intake-document-extract.js';
import { mapOrganizationRows } from '../dist/core/organization-import-file.js';
import { importRole, previewOrganizationImport, applyOrganizationImport } from '../dist/core/organization-import.js';

// Ein Bildungsträger liefert seine Prüfungen in ZWEI Dateien: eine Prüfungsliste
// (Pruefung_ID: P001) und einen Prüfungskalender, dessen Termin dieselbe Kennung trägt
// (UID: P001@...). Bis hierher gab es überhaupt keinen Prüfungsimport - gemessen im echten
// Kundenlauf: 0 Prüfungen. Der Kalender wurde zu Unterrichtsstunden, die Liste zu nichts.
//
// Verlangt ist: gleiche Entitäten aus mehreren Dateien werden zusammengeführt statt dupliziert,
// und eine verschobene Prüfung ändert die bestehende, statt eine zweite anzulegen.

// Kopfzeile und Zeilen wörtlich aus 07_Pruefungen.csv des Kunden.
const PRUEFUNGEN=`Pruefung_ID;Kurscode;Fach_ID;Titel;Datum;Beginn;Ende;Raum;Dauer_Min;Hilfsmittel
P001;VFA-26-A;F003;BGB-Klausur 1;18.09.2026;09:00;10:30;A-204;90;Hilfsmittel: BGB
P002;VFA-26-A;F001;Verwaltungsrecht Leistungskontrolle;25.09.2026;09:00;10:30;A-204;90;VSV
P003;KFM-26-B;F008;Rechnungswesen Test;18.09.2026;09:00;10:30;B-105;90;Taschenrechner
`;
// Derselbe Kalender wie im Abnahmepaket - durch den ausgelieferten ICS-Leser, nicht nachgebaut.
const KALENDER=`BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:P001@hellersdorfer-bildungs.example.invalid
DTSTART:20260918T090000
DTEND:20260918T103000
SUMMARY:BGB-Klausur 1 (VFA-26-A)
LOCATION:A-204
DESCRIPTION:Hilfsmittel: BGB
END:VEVENT
BEGIN:VEVENT
UID:P002@hellersdorfer-bildungs.example.invalid
DTSTART:20260925T090000
DTEND:20260925T103000
SUMMARY:Verwaltungsrecht Leistungskontrolle (VFA-26-A)
LOCATION:A-204
DESCRIPTION:VSV
END:VEVENT
END:VCALENDAR`;

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_exam',U='usr_exam',TS=new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','hbg-exam','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_exam','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_vfa','${T}',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_kfm','${T}',NULL,'Kaufleute','KFM-26-B','login',1,'${TS}','${TS}');
`);
const env={DB:d1(db)};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const lauf=async(name,rows)=>{
  const p=await previewOrganizationImport(env,auth,T,{source_name:name,rows});
  return applyOrganizationImport(env,auth,T,{batch_id:p.batch_id,digest:p.digest});
};
const csvRows=text=>mapOrganizationRows(parseCsv(text).rows);
const alle=()=>db.prepare('SELECT external_id,title,starts_at,ends_at,room,allowed_aids,course_id FROM exams WHERE tenant_id=? ORDER BY external_id').all(T);

// ---------------------------------------------------------------------------------------------
// 1. Die Prüfungsliste. Eine Zeile mit einer Prüfungskennung ist eine Prüfung, keine Stunde.
// ---------------------------------------------------------------------------------------------
const listenZeilen=csvRows(PRUEFUNGEN);
assert.deepEqual(listenZeilen.map(importRole),['exam','exam','exam'],
  'jede Zeile der Prüfungsliste muss als Prüfung erkannt werden');
await lauf('07_Pruefungen.csv',listenZeilen);
let stand=alle();
assert.equal(stand.length,3,`aus drei Zeilen müssen drei Prüfungen werden, gefunden: ${JSON.stringify(stand)}`);
assert.deepEqual(stand.map(x=>x.external_id),['P001','P002','P003'],'die Kennung des Kunden muss an der Prüfung stehen');
assert.equal(stand[0].title,'BGB-Klausur 1');
assert.equal(stand[0].starts_at,'2026-09-18T09:00:00');
assert.equal(stand[0].ends_at,'2026-09-18T10:30:00');
assert.equal(stand[0].room,'A-204');
assert.equal(stand[0].allowed_aids,'Hilfsmittel: BGB','die Hilfsmittel gehören zur Prüfung');
assert.equal(stand[2].course_id,'crs_kfm','P003 gehört zur anderen Klasse');

// ---------------------------------------------------------------------------------------------
// 2. Der Prüfungskalender. Dieselben Prüfungen - es dürfen keine zweiten entstehen.
// ---------------------------------------------------------------------------------------------
const kalenderZeilen=mapOrganizationRows(icsRows(KALENDER));
assert.equal(kalenderZeilen.length,2,'der Kalender muss zwei Termine liefern');
assert.deepEqual(kalenderZeilen.map(importRole),['exam','exam'],
  'ein Kalendertermin, dessen Titel eine Klausur nennt, ist eine Prüfung');
await lauf('12_Pruefungskalender.ics',kalenderZeilen);
stand=alle();
assert.equal(stand.length,3,
  `dieselbe Prüfung aus zwei Dateien darf nur einmal entstehen, gefunden: ${JSON.stringify(stand.map(x=>x.external_id))}`);

// ---------------------------------------------------------------------------------------------
// 3. Die Verschiebung. P001 zieht vom 18.09. auf den 21.09. - die bestehende Prüfung ändert sich.
// ---------------------------------------------------------------------------------------------
await lauf('verschiebung.csv',csvRows(`Pruefung_ID;Kurscode;Titel;Datum;Beginn;Ende;Raum
P001;VFA-26-A;BGB-Klausur 1;21.09.2026;09:00;10:30;A-204
`));
stand=alle();
assert.equal(stand.length,3,
  `eine verschobene Prüfung darf keine zweite anlegen, gefunden: ${JSON.stringify(stand.map(x=>[x.external_id,x.starts_at]))}`);
assert.equal(stand[0].starts_at,'2026-09-21T09:00:00','die bestehende Prüfung muss auf den neuen Termin ziehen');
assert.equal(stand[0].allowed_aids,'Hilfsmittel: BGB',
  'eine Datei ohne Hilfsmittelspalte darf die bekannten Hilfsmittel nicht löschen');

// ---------------------------------------------------------------------------------------------
// 4. Es wird nicht geraten: ein gewöhnlicher Kalendertermin bleibt kein Prüfungstermin.
// ---------------------------------------------------------------------------------------------
const gewoehnlich=mapOrganizationRows(icsRows(`BEGIN:VCALENDAR
BEGIN:VEVENT
UID:T900@example.invalid
DTSTART:20260922T090000
DTEND:20260922T103000
SUMMARY:Teamsitzung (VFA-26-A)
LOCATION:A-204
END:VEVENT
END:VCALENDAR`));
assert.notEqual(importRole(gewoehnlich[0]),'exam',
  'ein Termin ohne Prüfungswort im Titel darf nicht zur Prüfung erklärt werden');

// Und eine Unterrichtszeile bleibt Unterricht, obwohl sie dieselben Zeitfelder trägt.
const stunde=csvRows(`Datum;Beginn;Ende;Kurscode;Fach_ID;Dozenten_ID;Raum;Typ
10.09.2026;08:15;11:30;VFA-26-A;F001;D001;A-204;Unterricht
`);
assert.equal(importRole(stunde[0]),'lesson','eine Stundenplanzeile bleibt eine Unterrichtsstunde');

// ---------------------------------------------------------------------------------------------
// 5. Ohne Kennung: dieselbe Prüfung derselben Klasse zur selben Zeit bleibt trotzdem eine.
// ---------------------------------------------------------------------------------------------
const ohneKennung=`role;Kurscode;Titel;Datum;Beginn;Ende;Raum
Klausur;VFA-26-A;Freie Klausur;30.09.2026;09:00;10:30;A-204
`;
await lauf('ohne-kennung.csv',csvRows(ohneKennung));
await lauf('ohne-kennung-nochmal.csv',csvRows(ohneKennung));
assert.equal(db.prepare("SELECT COUNT(*) n FROM exams WHERE tenant_id=? AND title='Freie Klausur'").get(T).n,1,
  'ein zweiter Einwurf derselben Prüfung ohne Kennung darf sie nicht verdoppeln');

// Die Kennung bleibt eindeutig je Träger.
assert.throws(()=>db.prepare('INSERT INTO exams(id,tenant_id,course_id,title,starts_at,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
  .run('exm_x',T,'crs_vfa','Doppelte Kennung','2026-10-01T09:00:00','P001',TS,TS),/constraint|UNIQUE/i,
  'dieselbe Prüfungskennung darf am selben Träger nicht zweimal vergeben werden');

console.log('exam-import-merge: ok');
