// Ein Schuljahresplan muss sich pruefen UND veroeffentlichen lassen.
//
// Die erweiterte Pruefung stellte frueher elf Abfragen je Termin, das Veroeffentlichen noch einmal
// fuenf. Ein Jahresplan mit 250 Terminen kam damit auf mehrere tausend Unteranfragen - die
// Plattform laesst 1000 je Aufruf zu. Der Kunde konnte einen Jahresplan also erzeugen, aber weder
// pruefen noch veroeffentlichen; das Veroeffentlichen waere sogar mitten im Schreiben
// stehengeblieben und haette halb veroeffentlichten Unterricht hinterlassen.
//
// Jetzt wird jeder Datenbestand einmal geladen und im Speicher zugeordnet. Ein Kostenmass allein
// waere aber wertlos: eine Pruefung, die nichts mehr findet, ist billig. Darum steht hier zuerst
// die Fachlichkeit - jede einzelne Regel, die aus der Datenbank in den Speicher gewandert ist,
// wird mit einem Fall geprueft, der sie ausloest, UND mit einem Nachbarfall, der sie nicht
// ausloesen darf. Erst danach wird gemessen.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1, d1MitZaehler } from './helpers/d1.mjs';
import { autofillTimetablePlan, validateAdvancedTimetablePlan, publishAdvancedTimetablePlan,
  saveTeacherAvailability } from '../dist/core/planning-constraints.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const TS='2026-01-01T00:00:00.000Z';
const zeilen=(sql,...args)=>db.prepare(sql).all(...args);
const zahl=(sql,...args)=>Number(Object.values(db.prepare(sql).get(...args)??{0:0})[0]||0);
const env={DB:d1(db)};
const leitung=(t,u)=>({userId:u,role:'tenant_admin',tenantIds:[t],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false});

// ---------------------------------------------------------------------------------------------
// Teil 1: Fachlichkeit. Jede in den Speicher verlagerte Regel an einem echten Fall.
// ---------------------------------------------------------------------------------------------
const T='ten_jahr',U='usr_jahr';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Jahresschule','jahr','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','leitung@example.invalid','Leitung','x',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_s1','s1@example.invalid','S1','x',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_s2','s2@example.invalid','S2','x',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_s3','s3@example.invalid','S3','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_l','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_a','${T}','Klasse A','A',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_b','${T}','Klasse B','B',1,'${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_1','${T}','crs_a','usr_s1','participant','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_2','${T}','crs_a','usr_s2','participant','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_3','${T}','crs_a','usr_s3','participant','${TS}');
INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T}','crs_a','08:00','16:00',90,0,0,'${U}','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_zeit','${T}','Frau Zeit','zeit@example.invalid','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_krank','${T}','Herr Krank','krank@example.invalid','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_klein','${T}','room','Raum Klein','RK',2,'active','${U}','${TS}','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_gross','${T}','room','Raum Groß','RG',50,'active','${U}','${TS}','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_alt','${T}','room','Altbau','ALT',50,'inactive','${U}','${TS}','${TS}');
INSERT INTO planning_blackouts(id,tenant_id,course_id,title,starts_at,ends_at,blackout_type,blocks_teaching,created_by,created_at,updated_at) VALUES('blk_alle','${T}',NULL,'Betriebsversammlung','2026-09-08T09:30:00.000Z','2026-09-08T11:00:00.000Z','closure',1,'${U}','${TS}','${TS}');
INSERT INTO planning_blackouts(id,tenant_id,course_id,title,starts_at,ends_at,blackout_type,blocks_teaching,created_by,created_at,updated_at) VALUES('blk_b','${T}','crs_b','Praxisblock B','2026-09-09T09:00:00.000Z','2026-09-09T12:00:00.000Z','practice_block',1,'${U}','${TS}','${TS}');
INSERT INTO planning_blackouts(id,tenant_id,course_id,title,starts_at,ends_at,blackout_type,blocks_teaching,created_by,created_at,updated_at) VALUES('blk_offen','${T}',NULL,'Tag der offenen Tür','2026-09-18T20:00:00.000Z','2026-09-19T02:00:00.000Z','closure',1,'${U}','${TS}','${TS}');
INSERT INTO planning_blackouts(id,tenant_id,course_id,title,starts_at,ends_at,blackout_type,blocks_teaching,created_by,created_at,updated_at) VALUES('blk_nacht','${T}',NULL,'Nachtarbeiten','2026-09-20T22:00:00.000Z','2026-09-21T06:00:00.000Z','maintenance',1,'${U}','${TS}','${TS}');
INSERT INTO planning_blackouts(id,tenant_id,course_id,title,starts_at,ends_at,blackout_type,blocks_teaching,created_by,created_at,updated_at) VALUES('blk_offen_ohne','${T}',NULL,'Reinigung ohne Unterrichtssperre','2026-09-08T09:30:00.000Z','2026-09-08T11:00:00.000Z','maintenance',0,'${U}','${TS}','${TS}');
INSERT INTO teacher_unavailability(id,tenant_id,teacher_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES('tblk_1','${T}','tch_krank','2026-09-10T08:00:00.000Z','2026-09-10T10:00:00.000Z','Fortbildung','training','${U}','${TS}','${TS}');
INSERT INTO planning_resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES('rblk_1','${T}','res_gross','2026-09-11T12:30:00.000Z','2026-09-11T14:00:00.000Z','Wartung','maintenance','${U}','${TS}','${TS}');
INSERT INTO planning_resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES('rblk_2','${T}','res_klein','2026-09-16T14:00:00.000Z','2026-09-16T15:00:00.000Z','Wartung am Nachmittag','maintenance','${U}','${TS}','${TS}');
INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_a','${T}','Prüfplan','2026-09-07','2026-09-30','draft','${U}','${TS}','${TS}');
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,notes,created_at) VALUES('les_alt','${T}','crs_b',NULL,NULL,'2026-09-15T08:30:00.000Z','2026-09-15T09:30:00.000Z','Raum Groß',NULL,'${TS}');
INSERT INTO lesson_resource_reservations(tenant_id,lesson_id,resource_id,quantity,source_plan_id,created_at) VALUES('${T}','les_alt','res_gross',1,NULL,'${TS}');
`);
// Frau Zeit sagt Montags 08:00-12:00 zu - mehr nicht.
await saveTeacherAvailability(env,leitung(T,U),T,{teacher_id:'tch_zeit',weekday:1,starts_time:'08:00',ends_time:'12:00'});

const eintrag=(id,course,start,ende,extra={})=>db.prepare(`INSERT INTO timetable_plan_entries(id,tenant_id,plan_id,course_id,subject_id,subject_text,teacher_id,teacher_text,starts_at,ends_at,room,activity_type,location_label,supervision_mode,attendance_expected,task_text,notes,source,recurrence_group,published_lesson_id,created_by,created_at,updated_at) VALUES(?,?,?,?,NULL,?,?,NULL,?,?,?,'classroom',NULL,'instructor',1,NULL,NULL,'manual',NULL,NULL,?,?,?)`)
  .run(id,T,'tpv_a',course,extra.fach??'Fach',extra.teacher??null,start,ende,extra.room??null,U,TS,TS);
const mittel=(entryId,resourceId)=>db.prepare('INSERT INTO timetable_plan_entry_resources(tenant_id,plan_id,entry_id,resource_id,quantity,created_by,created_at) VALUES(?,?,?,?,1,?,?)').run(T,'tpv_a',entryId,resourceId,U,TS);

eintrag('e_ok','crs_a','2026-09-07T08:00:00.000Z','2026-09-07T09:30:00.000Z',{teacher:'tch_zeit'});
eintrag('e_spaet','crs_a','2026-09-07T17:00:00.000Z','2026-09-07T18:00:00.000Z',{teacher:'tch_zeit'});
eintrag('e_sperre','crs_a','2026-09-08T10:00:00.000Z','2026-09-08T10:45:00.000Z');
eintrag('e_sperre_frei','crs_a','2026-09-08T12:00:00.000Z','2026-09-08T12:45:00.000Z');
eintrag('e_sperre_b','crs_b','2026-09-09T10:00:00.000Z','2026-09-09T10:45:00.000Z');
eintrag('e_sperre_a','crs_a','2026-09-09T10:00:00.000Z','2026-09-09T10:45:00.000Z');
eintrag('e_krank','crs_a','2026-09-10T09:00:00.000Z','2026-09-10T09:45:00.000Z',{teacher:'tch_krank'});
eintrag('e_krank_frei','crs_a','2026-09-10T10:00:00.000Z','2026-09-10T10:45:00.000Z',{teacher:'tch_krank'});
eintrag('e_klein','crs_a','2026-09-11T08:00:00.000Z','2026-09-11T09:00:00.000Z');mittel('e_klein','res_klein');
eintrag('e_inaktiv','crs_a','2026-09-11T10:00:00.000Z','2026-09-11T11:00:00.000Z');mittel('e_inaktiv','res_alt');
eintrag('e_wartung','crs_a','2026-09-11T12:00:00.000Z','2026-09-11T13:00:00.000Z');mittel('e_wartung','res_gross');
eintrag('e_doppel_1','crs_a','2026-09-14T08:00:00.000Z','2026-09-14T09:00:00.000Z');mittel('e_doppel_1','res_gross');
eintrag('e_doppel_2','crs_b','2026-09-14T08:30:00.000Z','2026-09-14T09:30:00.000Z');mittel('e_doppel_2','res_gross');
eintrag('e_veroeffentlicht','crs_a','2026-09-15T09:00:00.000Z','2026-09-15T10:00:00.000Z');mittel('e_veroeffentlicht','res_gross');
eintrag('e_raum_code','crs_a','2026-09-16T08:00:00.000Z','2026-09-16T09:00:00.000Z',{room:'rk'});
eintrag('e_raum_name','crs_a','2026-09-17T08:00:00.000Z','2026-09-17T09:00:00.000Z',{room:'raum klein'});
eintrag('e_nacht','crs_a','2026-09-18T23:00:00.000Z','2026-09-19T01:00:00.000Z');
eintrag('e_samstag','crs_a','2026-09-19T08:00:00.000Z','2026-09-19T09:00:00.000Z');
eintrag('e_gleichzeitig','crs_b','2026-09-15T09:00:00.000Z','2026-09-15T09:45:00.000Z');
eintrag('e_danach','crs_b','2026-09-15T10:30:00.000Z','2026-09-15T11:30:00.000Z');
eintrag('e_koll_1','crs_b','2026-09-21T08:00:00.000Z','2026-09-21T09:00:00.000Z');
eintrag('e_koll_2','crs_b','2026-09-21T08:30:00.000Z','2026-09-21T09:30:00.000Z');
eintrag('e_koll_3','crs_b','2026-09-21T10:00:00.000Z','2026-09-21T11:00:00.000Z');
eintrag('e_frueh','crs_a','2026-09-21T05:00:00.000Z','2026-09-21T06:30:00.000Z');

const ergebnis=await validateAdvancedTimetablePlan(env,leitung(T,U),T,'tpv_a');
const proEintrag=new Map();
for(const x of ergebnis.issues){const k=String(x.entry_id??x.entry?.id??'');if(!proEintrag.has(k))proEintrag.set(k,new Set());proEintrag.get(k).add(x.type);}
const hat=(entryId,type)=>proEintrag.get(entryId)?.has(type)===true;
const pruefe=(entryId,type,erwartet,warum)=>assert.equal(hat(entryId,type),erwartet,warum);

pruefe('e_ok','course_time_window',false,'ein Termin im Kursfenster darf keine Zeitfenster-Meldung erzeugen');
pruefe('e_ok','teacher_outside_availability',false,'Montag 08:00-09:30 liegt in der Zusage von Frau Zeit');
pruefe('e_spaet','course_time_window',true,'ein Termin nach der gewünschten Endzeit muss gemeldet werden');
pruefe('e_spaet','teacher_outside_availability',true,'17:00 liegt außerhalb der zugesagten Arbeitszeit');
pruefe('e_sperre','planning_blackout',true,'ein Termin in einer mandantenweiten Sperrzeit muss gemeldet werden');
pruefe('e_sperre_frei','planning_blackout',false,'ein Termin am selben Tag ohne Überschneidung ist keine Sperrzeitverletzung');
pruefe('e_sperre_b','planning_blackout',true,'die auf Klasse B begrenzte Sperrzeit gilt für Klasse B');
pruefe('e_sperre_a','planning_blackout',false,'die auf Klasse B begrenzte Sperrzeit darf Klasse A nicht treffen');
pruefe('e_krank','teacher_unavailable',true,'eine überschneidende Abwesenheit muss gemeldet werden');
pruefe('e_krank_frei','teacher_unavailable',false,'ein Termin nach dem Ende der Abwesenheit ist zulässig');
pruefe('e_klein','resource_capacity',true,'3 Teilnehmende in einem Raum für 2 muss gemeldet werden');
pruefe('e_inaktiv','resource_inactive',true,'ein inaktiver Raum muss gemeldet werden');
pruefe('e_wartung','resource_unavailable',true,'eine Raumsperre muss gemeldet werden');
pruefe('e_doppel_1','resource_overlap',true,'zwei Termine im selben Raum zur selben Zeit müssen gemeldet werden');
pruefe('e_doppel_2','resource_overlap',true,'die Doppelbelegung muss an beiden Terminen hängen');
pruefe('e_veroeffentlicht','resource_overlap',true,'eine Kollision mit veröffentlichtem Unterricht muss gemeldet werden');
pruefe('e_raum_code','resource_capacity',true,'ein Raum darf auch über sein Kürzel erkannt werden');
pruefe('e_raum_name','resource_capacity',true,'ein Raum darf auch über seinen Namen erkannt werden - unabhängig von Groß-/Kleinschreibung');
pruefe('e_nacht','planning_blackout',true,'eine Sperrzeit über Mitternacht muss auch einen Termin am Vorabend treffen');
pruefe('e_frueh','planning_blackout',true,'eine Sperrzeit, die am Vortag beginnt, muss den frühen Termin am Folgetag treffen');
pruefe('e_koll_3','planning_blackout',false,'dieselbe Nachtsperre darf den Vormittagstermin nicht treffen');
pruefe('e_raum_code','resource_unavailable',false,'eine Raumsperre am Nachmittag darf einen Vormittagstermin nicht sperren');
pruefe('e_samstag','weekend_not_allowed',true,'Samstagsunterricht ohne Freigabe muss gemeldet werden');
pruefe('e_wartung','resource_capacity',false,'ein Raum mit ausreichend Plätzen darf keine Kapazitätsmeldung erzeugen');
pruefe('e_ok','planning_blackout',false,'ein Termin ohne Sperrzeit darf keine Sperrzeitmeldung erzeugen');
pruefe('e_wartung','resource_overlap',false,'ein Termin darf sich nicht selbst als Doppelbelegung melden');
pruefe('e_gleichzeitig','course_overlap',true,'eine Kollision mit bereits veröffentlichtem Unterricht derselben Klasse muss gemeldet werden');
pruefe('e_danach','course_overlap',false,'ein Termin nach dem veröffentlichten Unterricht ist keine Kollision');
pruefe('e_koll_1','course_overlap',true,'zwei überschneidende Termine derselben Klasse müssen gemeldet werden');
pruefe('e_koll_3','course_overlap',false,'ein Termin am selben Tag ohne Überschneidung ist keine Doppelplanung');
assert.equal(zahl(`SELECT COUNT(*) FROM timetable_plan_conflicts WHERE tenant_id=? AND plan_id='tpv_a' AND entry_id='e_sperre' AND conflict_type='planning_blackout'`,T),1,
  'eine Sperrzeit darf genau einen Konflikt erzeugen, nicht mehrere gleiche');
assert.equal(zahl(`SELECT COUNT(*) FROM timetable_plan_conflicts WHERE tenant_id=? AND plan_id='tpv_a' AND entry_id='e_nacht' AND conflict_type='planning_blackout'`,T),1,
  'eine Sperrzeit über mehrere Tage darf denselben Konflikt nicht mehrfach melden');

// Der Konflikt muss die Gegenseite benennen, sonst kann die Oberfläche nicht dorthin springen.
const gegenseite=zeilen(`SELECT conflicting_entry_id FROM timetable_plan_conflicts WHERE tenant_id=? AND entry_id='e_doppel_1' AND conflict_type='resource_overlap'`,T);
assert.ok(gegenseite.some(r=>r.conflicting_entry_id==='e_doppel_2'),'die Doppelbelegung muss den kollidierenden Termin benennen');
// Und die Konflikte muessen wirklich gespeichert sein - nicht nur zurueckgegeben.
assert.ok(zahl(`SELECT COUNT(*) FROM timetable_plan_conflicts WHERE tenant_id=? AND plan_id='tpv_a' AND conflict_type='planning_blackout'`,T)>=3,
  'die erkannten Sperrzeit-Konflikte müssen gespeichert werden');
assert.deepEqual(zeilen(`SELECT conflict_type FROM timetable_plan_conflicts WHERE tenant_id=? AND plan_id='tpv_a' AND entry_id='e_sperre_frei' ORDER BY conflict_type`,T).map(r=>r.conflict_type),['missing_teacher'],
  'ein Termin ohne Überschneidung darf nur das offene Feld melden, keinen erfundenen Konflikt');
assert.ok(ergebnis.errors>0,'ein Plan mit Sperrzeitverletzungen darf nicht fehlerfrei gelten');
await assert.rejects(()=>publishAdvancedTimetablePlan(env,leitung(T,U),T,'tpv_a'),/TIMETABLE_PLAN_HAS_CONFLICTS/,
  'ein Plan mit Fehlern darf nicht veröffentlicht werden');

// ---------------------------------------------------------------------------------------------
// Teil 2: Veroeffentlichen. Stammdaten aus Freitext duerfen sich nicht vervielfachen, und die
// Raumreservierung muss den veroeffentlichten Unterricht wirklich erreichen.
// ---------------------------------------------------------------------------------------------
const T2='ten_pub',U2='usr_pub';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T2}','Publikationsschule','pub','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U2}','pub@example.invalid','Leitung P','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_p','${T2}',NULL,'${U2}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_p','${T2}','Klasse P','P',1,'${TS}','${TS}');
INSERT INTO subjects(id,tenant_id,name,short_name,created_at) VALUES('sub_bestand','${T2}','Mathematik','M','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_p','${T2}','room','Werkstatt','W1',50,'active','${U2}','${TS}','${TS}');
INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_p','${T2}','Freigabeplan','2026-10-05','2026-10-09','draft','${U2}','${TS}','${TS}');
INSERT INTO timetable_plan_entries(id,tenant_id,plan_id,course_id,subject_id,subject_text,teacher_id,teacher_text,starts_at,ends_at,room,activity_type,location_label,supervision_mode,attendance_expected,task_text,notes,source,recurrence_group,published_lesson_id,created_by,created_at,updated_at) VALUES('p_1','${T2}','tpv_p','crs_p',NULL,'Deutsch',NULL,'Neue Kraft','2026-10-05T08:00:00.000Z','2026-10-05T09:00:00.000Z','Werkstatt','classroom',NULL,'instructor',1,NULL,NULL,'manual',NULL,NULL,'${U2}','${TS}','${TS}');
INSERT INTO timetable_plan_entries(id,tenant_id,plan_id,course_id,subject_id,subject_text,teacher_id,teacher_text,starts_at,ends_at,room,activity_type,location_label,supervision_mode,attendance_expected,task_text,notes,source,recurrence_group,published_lesson_id,created_by,created_at,updated_at) VALUES('p_2','${T2}','tpv_p','crs_p',NULL,'deutsch',NULL,'Neue Kraft','2026-10-06T08:00:00.000Z','2026-10-06T09:00:00.000Z',NULL,'classroom',NULL,'instructor',1,NULL,NULL,'manual',NULL,NULL,'${U2}','${TS}','${TS}');
INSERT INTO timetable_plan_entries(id,tenant_id,plan_id,course_id,subject_id,subject_text,teacher_id,teacher_text,starts_at,ends_at,room,activity_type,location_label,supervision_mode,attendance_expected,task_text,notes,source,recurrence_group,published_lesson_id,created_by,created_at,updated_at) VALUES('p_3','${T2}','tpv_p','crs_p','sub_bestand',NULL,NULL,NULL,'2026-10-07T08:00:00.000Z','2026-10-07T09:00:00.000Z',NULL,'classroom',NULL,'instructor',1,NULL,NULL,'manual',NULL,NULL,'${U2}','${TS}','${TS}');
`);
const freigabe=await publishAdvancedTimetablePlan(env,leitung(T2,U2),T2,'tpv_p');
assert.equal(freigabe.published,3,'alle drei Termine müssen veröffentlicht werden');
assert.equal(zahl(`SELECT COUNT(*) FROM subjects WHERE tenant_id=? AND name='Deutsch' COLLATE NOCASE`,T2),1,
  'derselbe Freitext darf nicht zwei Fächer erzeugen');
assert.equal(zahl('SELECT COUNT(*) FROM teachers WHERE tenant_id=?',T2),1,
  'derselbe Freitext darf nicht zwei Dozentensätze erzeugen');
assert.equal(zahl(`SELECT COUNT(DISTINCT subject_id) FROM lessons WHERE tenant_id=?`,T2),2,
  'zwei Freitext-Termine teilen ein Fach, der dritte behält sein bestehendes');
assert.equal(zahl(`SELECT COUNT(*) FROM lessons l JOIN timetable_plan_entries e ON e.published_lesson_id=l.id WHERE l.tenant_id=? AND e.id='p_3' AND l.subject_id='sub_bestand'`,T2),1,
  'ein bereits gewähltes Fach muss erhalten bleiben');
assert.equal(zahl('SELECT COUNT(*) FROM timetable_plan_entries WHERE tenant_id=? AND published_lesson_id IS NULL',T2),0,
  'jeder Termin muss mit seinem Unterricht verknüpft sein');
assert.equal(zahl('SELECT COUNT(*) FROM instruction_activity_details WHERE tenant_id=?',T2),3,
  'zu jedem veröffentlichten Termin muss die Lernform festgehalten sein');
assert.equal(zahl(`SELECT COUNT(*) FROM lesson_resource_reservations WHERE tenant_id=? AND resource_id='res_p'`,T2),1,
  'der über den Raumnamen erkannte Raum muss für den veröffentlichten Unterricht reserviert werden');
assert.equal(zahl(`SELECT COUNT(*) FROM timetable_plan_versions WHERE tenant_id=? AND id='tpv_p' AND status='published'`,T2),1,
  'der Plan muss danach als veröffentlicht gelten');

// ---------------------------------------------------------------------------------------------
// Teil 3: Das Kostenmass. Ein echter Jahresplan, gemessen wie die Plattform zaehlt: jede einzeln
// ausgefuehrte Anweisung eine Unteranfrage, ein Stapel genau eine.
// ---------------------------------------------------------------------------------------------
const T3='ten_mass',U3='usr_mass';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T3}','Messschule','mess','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U3}','mess@example.invalid','Leitung M','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_m','${T3}',NULL,'${U3}','tenant_admin','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_m','${T3}','Frau Messe','messe@example.invalid','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_m2','${T3}','Herr Messe','messe2@example.invalid','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_m','${T3}','room','Saal','S1',60,'active','${U3}','${TS}','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_m2','${T3}','room','Aula','S2',60,'active','${U3}','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_m1','${T3}','Jahrgang 1','J1',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_m2','${T3}','Jahrgang 2','J2',1,'${TS}','${TS}');
INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T3}','crs_m1','08:00','16:00',90,0,0,'${U3}','${TS}');
INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T3}','crs_m2','08:00','16:00',90,0,0,'${U3}','${TS}');
INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_m','${T3}','Schuljahr','2026-09-07','2027-08-30','draft','${U3}','${TS}','${TS}');
`);
const {DB,stand}=d1MitZaehler(db);
const gemessen={DB},messAuth=leitung(T3,U3);
// Ein Lauf muss unter der Abfragegrenze bleiben - und die Läufe müssen ein Ende finden. Genau das
// war nicht der Fall: das Budget ging fürs blosse Durchgehen des Kalenders drauf, der Lauf blieb im
// ersten Kurs stecken und meldete "Obergrenze erreicht" auch dann noch, wenn er nichts mehr
// schaffte. Wer weiterklickte, kam nie an einen fertigen Jahresplan.
const GRENZE=1000;
let termine=0,laeufe=0,fertig=false,teuerster=0,marker={},luecken=0;
const gesehen=new Set();
while(laeufe<40){
  stand.abfragen=0;
  const r=await autofillTimetablePlan(gemessen,messAuth,T3,'tpv_m',{...marker});
  laeufe++;termine+=r.created;luecken+=r.gap_count;teuerster=Math.max(teuerster,stand.abfragen);
  assert.ok(stand.abfragen<GRENZE,`ein einzelner Lauf muss unter der Plattformgrenze bleiben, war: ${stand.abfragen} Abfragen`);
  if(!r.limit_reached){fertig=true;assert.equal(r.resume_course_id,null,'ein abgeschlossener Lauf hat keine Fortsetzung');break;}
  assert.ok(r.resume_course_id&&r.resume_date,'ein angehaltener Lauf muss sagen, wo er fortsetzt');
  const stelle=`${r.resume_course_id}|${r.resume_date}`;
  assert.ok(!gesehen.has(stelle),`jeder Lauf muss ein Stück weiterkommen - ${stelle} war schon einmal die Fortsetzungsstelle`);
  gesehen.add(stelle);
  marker={resume_course_id:r.resume_course_id,resume_date:r.resume_date};
}
assert.ok(fertig,`die Läufe müssen ein Ende finden, waren nach ${laeufe} Läufen bei ${termine} Terminen`);
assert.ok(termine>=400,`der Messplan muss die Größe eines Schuljahres für beide Klassen haben, war: ${termine} Termine`);
assert.equal(luecken,0,'bei zwei Klassen mit je eigener Kraft und eigenem Raum darf keine Lücke bleiben');
assert.ok(laeufe<=20,`ein Schuljahr für zwei Klassen darf nicht beliebig viele Läufe brauchen, waren: ${laeufe}`);

stand.abfragen=0;
const jahr=await validateAdvancedTimetablePlan(gemessen,messAuth,T3,'tpv_m');
const pruefkosten=stand.abfragen;
assert.ok(pruefkosten<200,`die Prüfung eines Jahresplans muss deutlich unter der Plattformgrenze von 1000 Unteranfragen bleiben, war: ${pruefkosten}`);
assert.ok(pruefkosten<termine,`die Prüfkosten dürfen nicht mit der Zahl der Termine wachsen (${termine} Termine, ${pruefkosten} Abfragen)`);
assert.equal(jahr.errors,0,'der erzeugte Jahresplan muss fehlerfrei sein, sonst misst der nächste Schritt nichts');

stand.abfragen=0;
const jahrFreigabe=await publishAdvancedTimetablePlan(gemessen,messAuth,T3,'tpv_m');
const freigabekosten=stand.abfragen;
assert.equal(jahrFreigabe.published,termine,'beim Veröffentlichen darf kein Termin liegenbleiben');
assert.ok(freigabekosten<300,`das Veröffentlichen eines Jahresplans muss unter der Plattformgrenze von 1000 Unteranfragen bleiben, war: ${freigabekosten}`);
assert.equal(zahl('SELECT COUNT(*) FROM timetable_plan_entries WHERE tenant_id=? AND published_lesson_id IS NULL',T3),0,
  'nach dem Veröffentlichen darf kein Termin ohne Unterricht dastehen');
assert.equal(zahl('SELECT COUNT(*) FROM lessons WHERE tenant_id=?',T3),termine,'jeder Termin muss genau einen Unterricht erzeugen');

console.log(`timetable-year-plan: ok (${termine} Termine in ${laeufe} Läufen, teuerster Lauf ${teuerster} Abfragen, Prüfung ${pruefkosten}, Veröffentlichen ${freigabekosten})`);
