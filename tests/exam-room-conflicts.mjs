// Pruefungen waren in der Konsistenzpruefung nicht enthalten.
//
// Eine Klausur in einem gesperrten Raum, oder in einem Raum, in dem zur selben Zeit
// Unterricht stattfindet, fiel niemandem auf: die drei bestehenden Pruefungen sahen nur
// in die Tabelle lessons. Fuer den Kunden ist das der Tag, an dem zwei Gruppen vor
// derselben Tuer stehen. Dieser Test fuehrt die Pruefung gegen eine echte Datenbank aus.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { scanTenantConsistency } from '../dist/core/education-consistency.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_pruef',U='usr_pruef',TS='2026-01-01T00:00:00.000Z';
// Alles liegt in der Zukunft - vergangene Termine prueft der Scan bewusst nicht mehr.
const J=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Träger','tp','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','p@example.invalid','P','x',0,0,'active','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_1','${T}','Klasse 1','K1',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_2','${T}','Klasse 2','K2',1,'${TS}','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,status,created_by,created_at,updated_at) VALUES('res_a','${T}','room','Prüfungsraum A','PA','active','${U}','${TS}','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,status,created_by,created_at,updated_at) VALUES('res_b','${T}','room','Prüfungsraum B','PB','active','${U}','${TS}','${TS}');
INSERT INTO planning_resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES('pru_1','${T}','res_a','${J}T07:00:00.000Z','${J}T18:00:00.000Z','Umbau','maintenance','${U}','${TS}','${TS}');
-- 1. Klausur im gesperrten Raum
INSERT INTO exams(id,tenant_id,course_id,title,starts_at,ends_at,room,visible_to_students,created_at,updated_at) VALUES('exm_gesperrt','${T}','crs_1','Abschlussklausur','${J}T09:00:00.000Z','${J}T11:00:00.000Z','Prüfungsraum A',1,'${TS}','${TS}');
-- 2. Klausur ohne Endzeit im gesperrten Raum - es wird keine Dauer erfunden
INSERT INTO exams(id,tenant_id,course_id,title,starts_at,ends_at,room,visible_to_students,created_at,updated_at) VALUES('exm_offen','${T}','crs_2','Nachschreibtermin','${J}T13:00:00.000Z',NULL,'PA',1,'${TS}','${TS}');
-- 3. Klausur und Unterricht im selben Raum zur selben Zeit
INSERT INTO exams(id,tenant_id,course_id,title,starts_at,ends_at,room,visible_to_students,created_at,updated_at) VALUES('exm_kollision','${T}','crs_1','Zwischenprüfung','${J}T09:00:00.000Z','${J}T11:00:00.000Z','Prüfungsraum B',1,'${TS}','${TS}');
INSERT INTO lessons(id,tenant_id,course_id,starts_at,ends_at,room,created_at) VALUES('les_1','${T}','crs_2','${J}T10:00:00.000Z','${J}T12:00:00.000Z','Prüfungsraum B','${TS}');
-- 4. Vergangene Prüfung im gesperrten Raum: der Scan sieht bewusst nur nach vorn
INSERT INTO planning_resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES('pru_alt','${T}','res_a','2020-05-04T07:00:00.000Z','2020-05-04T18:00:00.000Z','Altsperre','maintenance','${U}','${TS}','${TS}');
INSERT INTO exams(id,tenant_id,course_id,title,starts_at,ends_at,room,visible_to_students,created_at,updated_at) VALUES('exm_vergangen','${T}','crs_1','Klausur von damals','2020-05-04T09:00:00.000Z','2020-05-04T11:00:00.000Z','Prüfungsraum A',1,'${TS}','${TS}');
INSERT INTO lessons(id,tenant_id,course_id,starts_at,ends_at,room,created_at) VALUES('les_alt','${T}','crs_2','2020-05-04T10:00:00.000Z','2020-05-04T12:00:00.000Z','Prüfungsraum A','${TS}');
-- 5. Sauberer Fall: anderer Tag, kein Befund
INSERT INTO exams(id,tenant_id,course_id,title,starts_at,ends_at,room,visible_to_students,created_at,updated_at) VALUES('exm_sauber','${T}','crs_1','Test sauber','2099-01-05T09:00:00.000Z','2099-01-05T11:00:00.000Z','Prüfungsraum B',1,'${TS}','${TS}');
`);
const env={DB:d1(db)};
await scanTenantConsistency(env,T);
const befunde=db.prepare(`SELECT finding_key,severity,title,actual_json FROM education_consistency_findings WHERE tenant_id='${T}' AND status='open'`).all();
const schluessel=befunde.map(b=>b.finding_key);

assert.ok(schluessel.includes('exam-room-blocked:exm_gesperrt:pru_1'),
  `eine Klausur im gesperrten Raum muss auffallen: ${JSON.stringify(schluessel)}`);
assert.ok(schluessel.includes('exam-room-blocked:exm_offen:pru_1'),
  'auch eine Klausur ohne hinterlegte Endzeit muss auffallen - über das Kürzel des Raums');
assert.ok(schluessel.includes('exam-room-overlap:exm_kollision:les_1'),
  'Klausur und Unterricht im selben Raum zur selben Zeit müssen auffallen');
assert.ok(!schluessel.some(k=>k.includes('exm_sauber')),
  'ein sauberer Prüfungstermin darf keinen Befund erzeugen');
assert.ok(!schluessel.some(k=>k.includes('exm_vergangen')),
  'ein längst vergangener Termin darf nicht als offener Befund auftauchen - sonst rauscht die Liste voll');

const gesperrt=befunde.find(b=>b.finding_key==='exam-room-blocked:exm_gesperrt:pru_1');
assert.equal(gesperrt.severity,'high','ein Raumkonflikt bei einer Prüfung ist kein Randthema');
const inhalt=JSON.parse(gesperrt.actual_json);
assert.equal(inhalt.exam_title,'Abschlussklausur','der Befund muss die Prüfung benennen, nicht nur eine Kennung');
assert.equal(inhalt.room,'Prüfungsraum A');
assert.equal(inhalt.reason,'Umbau','der Grund der Sperrung gehört in den Befund');

// Der bestehende Befundtyp für Unterricht bleibt unberührt.
const kollision=JSON.parse(befunde.find(b=>b.finding_key==='exam-room-overlap:exm_kollision:les_1').actual_json);
assert.equal(kollision.lesson_id,'les_1');
assert.equal(kollision.lesson_course_id,'crs_2','die andere betroffene Klasse muss genannt sein');

console.log('exam-room-conflicts: ok');
