import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { scanTenantConsistency } from '../dist/core/education-consistency.js';

// Das Abnahmepaket eines Bildungsträgers bringt drei Widersprüche mit, die den Betrieb ändern:
// dieselbe Dozentin am 10.09. gleichzeitig in zwei Klassen, derselbe Raum A-301 gleichzeitig für
// zwei Klassen, und eine Mail, die genau diesen Raum für genau diese Zeit sperrt.
//
// Keiner davon wurde je gemeldet. Die Überschneidungsprüfung des Portals sitzt in
// validateTimetablePlan und arbeitet auf timetable_plan_entries - also in einem Stundenplan-
// ENTWURF. Ein eingeworfener Stundenplan schreibt aber direkt nach lessons und kommt dort nie
// vorbei. Auf dem wirklich veröffentlichten Unterricht prüfte niemand.

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_konf',U='usr_konf',TS=new Date().toISOString();
// Alles liegt in der Zukunft - vergangener Unterricht ist kein offener Betriebskonflikt mehr.
const j=new Date(Date.now()+90*86400000).toISOString().slice(0,10);
const v=new Date(Date.now()-90*86400000).toISOString().slice(0,10);
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','hbg2','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_a','${T}',NULL,'VFA','VFA-26-A','login',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_b','${T}',NULL,'KFM','KFM-26-B','login',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_c','${T}',NULL,'DVG','DVG-26-C','login',1,'${TS}','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,external_id,created_at) VALUES('tch_d001','${T}','Dr. Lena Hoffmann','lena@example.invalid','D001','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,external_id,created_at) VALUES('tch_d002','${T}','Michael Brandt','michael@example.invalid','D002','${TS}');
-- Konflikt 1: D001 steht am selben Vormittag vor zwei Klassen.
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_1','${T}','crs_a',NULL,'tch_d001','${j}T08:15:00','${j}T11:30:00','A-204','${TS}');
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_2','${T}','crs_b',NULL,'tch_d001','${j}T08:15:00','${j}T11:30:00','B-101','${TS}');
-- Konflikt 2: Raum A-301 ist am Nachmittag doppelt belegt.
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_3','${T}','crs_a',NULL,'tch_d002','${j}T12:15:00','${j}T15:30:00','A-301','${TS}');
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_4','${T}','crs_c',NULL,NULL,'${j}T12:15:00','${j}T15:30:00','a-301','${TS}');
-- Kein Konflikt: andere Dozentin, anderer Raum, andere Zeit.
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_5','${T}','crs_b',NULL,'tch_d002','${j}T16:00:00','${j}T17:30:00','C-001','${TS}');
-- Kein Konflikt: nahtlos anschließend. Wer um 15:30 endet und um 15:30 beginnt, ist nicht
-- gleichzeitig an zwei Orten - weder die Dozentin noch der Raum.
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_naht','${T}','crs_c',NULL,'tch_d002','${j}T15:30:00','${j}T16:00:00','C-001','${TS}');
-- Kein Konflikt: ohne Dozent/in und ohne Raum ist nichts doppelt belegt.
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_6','${T}','crs_a',NULL,NULL,'${j}T08:15:00','${j}T11:30:00',NULL,'${TS}');
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_7','${T}','crs_b',NULL,NULL,'${j}T08:15:00','${j}T11:30:00','','${TS}');
-- Vergangenheit: dieselbe Doppelbelegung, aber vorbei.
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_alt1','${T}','crs_a',NULL,'tch_d002','${v}T08:15:00','${v}T11:30:00','Z-9','${TS}');
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_alt2','${T}','crs_b',NULL,'tch_d002','${v}T08:15:00','${v}T11:30:00','Z-9','${TS}');
-- Konflikt 3: der Raum A-301 ist für genau diese Zeit gesperrt (Mail des Kunden).
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,status,created_by,created_at,updated_at) VALUES('res_a301','${T}','room','A-301','A-301','active','${U}','${TS}','${TS}');
INSERT INTO planning_resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES('rblk_1','${T}','res_a301','${j}T12:00:00','${j}T16:00:00','Wartung Elektrik','external','${U}','${TS}','${TS}');
-- Kein Konflikt: der Unterricht beginnt genau, wenn die Sperrung endet.
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_danach','${T}','crs_c',NULL,NULL,'${j}T16:00:00','${j}T17:30:00','A-301','${TS}');
-- Derselbe Raum, im Stundenplan aber unter seinem Kürzel geschrieben: die Sperrung muss ihn
-- trotzdem finden.
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,status,created_by,created_at,updated_at) VALUES('res_b204','${T}','room','Seminarraum B-204','B-204','active','${U}','${TS}','${TS}');
INSERT INTO planning_resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES('rblk_2','${T}','res_b204','${j}T08:00:00','${j}T12:00:00','Bauarbeiten','external','${U}','${TS}','${TS}');
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_kuerzel','${T}','crs_c',NULL,NULL,'${j}T08:15:00','${j}T11:30:00','B-204','${TS}');
-- Ein Raum ohne Sperrung darf nichts auslösen.
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,status,created_by,created_at,updated_at) VALUES('res_c001','${T}','room','C-001','C-001','active','${U}','${TS}','${TS}');
`);

const env={DB:d1(db)};
await scanTenantConsistency(env,T);
const funde=db.prepare('SELECT finding_key,severity,category,title,actual_json FROM education_consistency_findings WHERE tenant_id=? ORDER BY finding_key').all(T);
const mit=p=>funde.filter(f=>f.finding_key.startsWith(p));

// ---------------------------------------------------------------------------------------------
// 1. Dozent/in doppelt verplant.
// ---------------------------------------------------------------------------------------------
const doz=mit('lesson-teacher-overlap:');
assert.equal(doz.length,1,`genau eine Doppelverplanung von D001 erwartet, gefunden: ${JSON.stringify(doz.map(f=>f.finding_key))}`);
assert.equal(doz[0].finding_key,'lesson-teacher-overlap:les_1:les_2');
assert.equal(doz[0].severity,'high','eine doppelt verplante Dozentin ist kein Randhinweis');
const dozDaten=JSON.parse(doz[0].actual_json);
assert.equal(dozDaten.teacher_name,'Dr. Lena Hoffmann','der Befund muss die Person benennen, nicht nur eine Kennung');
assert.equal(dozDaten.other_course_id,'crs_b','der Befund muss die zweite Klasse benennen');

// ---------------------------------------------------------------------------------------------
// 2. Raum doppelt belegt - auch bei abweichender Schreibweise.
// ---------------------------------------------------------------------------------------------
const raum=mit('lesson-room-overlap:');
assert.equal(raum.length,1,`genau eine Doppelbelegung von A-301 erwartet, gefunden: ${JSON.stringify(raum.map(f=>f.finding_key))}`);
assert.equal(raum[0].finding_key,'lesson-room-overlap:les_3:les_4',
  '"A-301" und "a-301" sind derselbe Raum');
assert.equal(raum[0].severity,'high');
assert.equal(JSON.parse(raum[0].actual_json).room,'A-301');

// ---------------------------------------------------------------------------------------------
// 3. Unterricht in einem gesperrten Raum.
// ---------------------------------------------------------------------------------------------
const gesperrt=mit('lesson-room-blocked:');
assert.equal(gesperrt.length,3,
  `beide Belegungen des gesperrten Raums und die über das Kürzel müssen auffallen, gefunden: ${JSON.stringify(gesperrt.map(f=>f.finding_key))}`);
assert.deepEqual(gesperrt.map(f=>f.finding_key).sort(),
  ['lesson-room-blocked:les_3:rblk_1','lesson-room-blocked:les_4:rblk_1','lesson-room-blocked:les_kuerzel:rblk_2'],
  'ein Raum wird über seinen Namen wie über sein Kürzel gefunden');
assert.equal(JSON.parse(gesperrt[0].actual_json).reason,'Wartung Elektrik',
  'der Grund der Sperrung gehört in den Befund');

// ---------------------------------------------------------------------------------------------
// 4. Und nichts darüber hinaus: keine Meldung ohne Anlass.
// ---------------------------------------------------------------------------------------------
// Gemeint sind die drei neuen Prüfungen. Dass vergangener Unterricht ohne Klassenbuchsitzung
// weiterhin als "missing-session" auffällt, ist eine andere, bereits vorhandene Prüfung und
// bleibt richtig - sie darf hier nicht mitgezählt werden.
const NEU=/^lesson-(teacher-overlap|room-overlap|room-blocked):/;
const neueFunde=funde.filter(f=>NEU.test(f.finding_key));
assert.equal(neueFunde.length,5,
  `genau fünf Befunde aus den drei neuen Prüfungen, gefunden: ${JSON.stringify(neueFunde.map(f=>f.finding_key))}`);
for(const [was,schluessel] of [['les_5',/les_5/],['les_6',/les_6/],['les_7',/les_7/],['nahtloser Anschluss',/les_naht/],['Beginn genau bei Sperrungsende',/les_danach/],['Vergangenheit',/les_alt/]])
  assert.ok(!neueFunde.some(f=>schluessel.test(f.finding_key)),
    `${was} ist kein Belegungskonflikt und darf nicht so gemeldet werden, gefunden: ${JSON.stringify(neueFunde.map(f=>f.finding_key))}`);

// ---------------------------------------------------------------------------------------------
// 5. Ein zweiter Lauf meldet dasselbe, nicht doppelt - und behebt Behobenes.
// ---------------------------------------------------------------------------------------------
await scanTenantConsistency(env,T);
assert.equal(db.prepare("SELECT COUNT(*) n FROM education_consistency_findings WHERE tenant_id=?").get(T).n,funde.length,
  'ein zweiter Lauf darf denselben Konflikt nicht ein zweites Mal anlegen');
// Die Doppelbelegung wird aufgelöst: die zweite Stunde zieht in einen freien Raum.
db.prepare("UPDATE lessons SET room='C-001' WHERE id='les_4'").run();
await scanTenantConsistency(env,T);
const offen=db.prepare("SELECT finding_key FROM education_consistency_findings WHERE tenant_id=? AND status='open'").all(T).map(f=>f.finding_key);
assert.ok(!offen.includes('lesson-room-overlap:les_3:les_4'),
  `ein behobener Raumkonflikt muss geschlossen werden, offen: ${JSON.stringify(offen)}`);
assert.ok(!offen.includes('lesson-room-blocked:les_4:rblk_1'),
  'die Stunde steht nicht mehr im gesperrten Raum');
assert.ok(offen.includes('lesson-room-blocked:les_3:rblk_1'),
  'die andere Stunde steht weiterhin im gesperrten Raum und bleibt offen');
assert.ok(offen.includes('lesson-teacher-overlap:les_1:les_2'),
  'die Doppelverplanung der Dozentin ist davon unberührt');

// ---------------------------------------------------------------------------------------------
// Der fuenfte Sollkonflikt des Abnahmepakets: "Dozent krank". Bisher war nur belegt, dass die
// Zeichenkette lesson-absent-teacher im Quelltext vorkommt - ausgefuehrt wurde der Befund nie.
// ---------------------------------------------------------------------------------------------
db.exec(`
INSERT INTO teacher_unavailability(id,tenant_id,teacher_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES('tun_1','${T}','tch_d001','${j}T00:00:00','${j}T23:59:00','Krankmeldung','sickness','${U}','${TS}','${TS}');
`);
await scanTenantConsistency(env,T);
const krank=db.prepare("SELECT finding_key,severity,actual_json FROM education_consistency_findings WHERE tenant_id=? AND status='open' AND finding_key LIKE 'lesson-absent-teacher:%'").all(T);
assert.equal(krank.length,2,
  `beide Stunden der krankgemeldeten Dozentin müssen auffallen, gefunden: ${JSON.stringify(krank.map(f=>f.finding_key))}`);
assert.deepEqual(krank.map(f=>f.finding_key).sort(),['lesson-absent-teacher:les_1:tun_1','lesson-absent-teacher:les_2:tun_1']);
const krankDaten=JSON.parse(krank[0].actual_json);
assert.equal(krankDaten.teacher_name,'Dr. Lena Hoffmann','der Befund muss die Person benennen, nicht nur eine Kennung');
assert.equal(krankDaten.absence_source,'sickness','die Art der Abwesenheit gehört in den Befund');
assert.ok(!('reason' in krankDaten),
  'der Freitextgrund gehört nicht in den Befund - bei Krankheit minimiert ihn die Datenbank ohnehin, sonst kann er Gesundheitsangaben enthalten');
assert.ok(!JSON.stringify(krankDaten).includes('Krankmeldung'),'kein eingegebener Grundtext im Befund');
assert.ok(String(krankDaten.block_start).startsWith(j),'der Befund muss den Zeitraum der Abwesenheit nennen');
assert.ok(String(krankDaten.block_end).startsWith(j));

// Eine Abwesenheit muss auch dann auffallen, wenn sie die Stunde nur teilweise überdeckt -
// eine halbe Stunde ohne Aufsicht ist genauso ein Betriebsproblem wie ein ganzer Tag.
db.exec(`
INSERT INTO teacher_unavailability(id,tenant_id,teacher_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES('tun_2','${T}','tch_d002','${j}T15:00:00','${j}T15:20:00','Arzttermin','manual','${U}','${TS}','${TS}');
`);
await scanTenantConsistency(env,T);
const teil=db.prepare("SELECT finding_key FROM education_consistency_findings WHERE tenant_id=? AND status='open' AND finding_key LIKE 'lesson-absent-teacher:%:tun_2'").all(T).map(f=>f.finding_key);
assert.deepEqual(teil,['lesson-absent-teacher:les_3:tun_2'],
  `eine teilweise Überdeckung muss genauso auffallen, gefunden: ${JSON.stringify(teil)}`);
const teilDaten=JSON.parse(db.prepare("SELECT actual_json FROM education_consistency_findings WHERE tenant_id=? AND finding_key='lesson-absent-teacher:les_3:tun_2'").get(T).actual_json);
assert.equal(teilDaten.absence_source,'manual');
assert.ok(!JSON.stringify(teilDaten).includes('Arzttermin'),
  'auch bei einer manuell erfassten Abwesenheit gehört der eingegebene Grund nicht in den Befund');

// Wird die Krankmeldung zurückgenommen, schließt sich der Befund von selbst.
db.exec(`DELETE FROM teacher_unavailability WHERE id IN ('tun_1','tun_2');`);
await scanTenantConsistency(env,T);
const nachher=db.prepare("SELECT finding_key FROM education_consistency_findings WHERE tenant_id=? AND status='open'").all(T).map(f=>f.finding_key);
assert.ok(!nachher.some(k=>k.startsWith('lesson-absent-teacher:')),
  `eine zurückgenommene Krankmeldung darf keinen offenen Befund hinterlassen: ${JSON.stringify(nachher)}`);

console.log('lesson-conflict-findings: ok');
