// Der automatische Stundenplanentwurf, ausgefuehrt gegen eine echte Datenbank.
//
// Der Kunde soll den Betrieb nicht mehr von Hand planen, sondern nur noch pruefen und
// bestaetigen. Genau deshalb muss belegt sein, was der Entwurf NICHT tut: er
// veroeffentlicht nichts, er doppelt keine Person und keinen Raum, er erfindet keinen
// Termin, wenn nichts frei ist, und er laeuft ein zweites Mal, ohne alles zu verdoppeln.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { autofillTimetablePlan, planningSuggestions } from '../dist/core/planning-constraints.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_auto',U='usr_auto',TS='2026-01-01T00:00:00.000Z';
// Montag 2026-09-07 bis Sonntag 2026-09-13 - das Wochenende liegt bewusst im Zeitraum,
// damit belegt ist, dass ohne Freigabe samstags und sonntags nichts geplant wird.
const VON='2026-09-07',BIS='2026-09-13';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Träger','ta','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','plan@example.invalid','Planung','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_a','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_a','${T}','Klasse A','A',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_b','${T}','Klasse B','B',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_ohne','${T}','Klasse ohne Regeln','O',1,'${TS}','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_1','${T}','Frau Alt','a@example.invalid','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_2','${T}','Herr Neu','b@example.invalid','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_1','${T}','room','Raum 101','R101',30,'active','${U}','${TS}','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_2','${T}','room','Raum 102','R102',30,'active','${U}','${TS}','${TS}');
INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T}','crs_a','08:00','16:00',90,0,0,'${U}','${TS}');
INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T}','crs_b','08:00','16:00',90,0,0,'${U}','${TS}');
INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_1','${T}','Woche 37','${VON}','${BIS}','draft','${U}','${TS}','${TS}');
`);
const env={DB:d1(db)};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const zeilen=(sql,...args)=>db.prepare(sql).all(...args);
const zahl=(sql,...args)=>Number(Object.values(db.prepare(sql).get(...args)??{0:0})[0]||0);

// ---------------------------------------------------------------------------
// 1. Der Lauf legt einen Entwurf an - und nichts sonst.
// ---------------------------------------------------------------------------
const r=await autofillTimetablePlan(env,auth,T,'tpv_1',{});
assert.equal(r.published,false,'ein Entwurf darf niemals als veröffentlicht gelten');
assert.equal(zahl(`SELECT COUNT(*) FROM lessons WHERE tenant_id='${T}'`),0,
  'der Entwurf darf keine einzige Stunde in den laufenden Betrieb schreiben');
assert.equal(db.prepare(`SELECT status FROM timetable_plan_versions WHERE id='tpv_1'`).get().status,'draft',
  'der Plan muss Entwurf bleiben');

// Montag bis Freitag, zwei Kurse mit Regeln = 10 Termine. Der Kurs ohne Kursregeln wird nicht geplant.
assert.equal(r.created,10,`fünf Werktage mal zwei Kurse mit Regeln - das Wochenende zählt nicht mit, war: ${r.created}`);
assert.equal(zahl(`SELECT COUNT(*) FROM timetable_plan_entries WHERE tenant_id='${T}' AND plan_id='tpv_1'`),10);
assert.ok(!r.courses.some(c=>c.course_id==='crs_ohne'),'ohne hinterlegte Kursregeln wird nicht geraten');
assert.equal(zahl(`SELECT COUNT(*) FROM timetable_plan_entries WHERE tenant_id='${T}' AND course_id='crs_ohne'`),0);

// Kein Wochenende: Samstag 2026-09-12 liegt ohnehin ausserhalb, aber es darf auch kein Sonntag auftauchen.
for(const e of zeilen(`SELECT starts_at FROM timetable_plan_entries WHERE tenant_id='${T}'`)){
  const tag=new Date(e.starts_at).getUTCDay();
  assert.ok(tag>=1&&tag<=5,`ohne Freigabe darf kein Wochenendtermin entstehen: ${e.starts_at}`);
}

// ---------------------------------------------------------------------------
// 2. Der Kern: zwei Kurse zur selben Zeit bekommen nicht dieselbe Person und nicht denselben Raum.
// ---------------------------------------------------------------------------
for(const tag of ['2026-09-07','2026-09-08','2026-09-09','2026-09-10','2026-09-11']){
  const e=zeilen(`SELECT course_id,teacher_id,room FROM timetable_plan_entries WHERE tenant_id='${T}' AND substr(starts_at,1,10)=? ORDER BY course_id`,tag);
  assert.equal(e.length,2,`am ${tag} müssen beide Kurse geplant sein`);
  assert.notEqual(e[0].teacher_id,e[1].teacher_id,`am ${tag} wurde dieselbe Person doppelt verplant`);
  assert.notEqual(e[0].room,e[1].room,`am ${tag} wurde derselbe Raum doppelt belegt`);
}
// Der Raum ist als echte Buchung verknüpft, nicht nur als Text.
assert.equal(zahl(`SELECT COUNT(*) FROM timetable_plan_entry_resources WHERE tenant_id='${T}' AND plan_id='tpv_1'`),10,
  'jeder Termin muss den Raum als echte Ressourcenbuchung führen');

// ---------------------------------------------------------------------------
// 3. Ein zweiter Lauf verdoppelt nichts.
// ---------------------------------------------------------------------------
const r2=await autofillTimetablePlan(env,auth,T,'tpv_1',{});
assert.equal(r2.created,0,'ein zweiter Lauf darf keine Termine verdoppeln');
assert.equal(zahl(`SELECT COUNT(*) FROM timetable_plan_entries WHERE tenant_id='${T}' AND plan_id='tpv_1'`),10);

// ---------------------------------------------------------------------------
// 4. Vorschläge kennen jetzt auch belegte Entwurfstermine.
// ---------------------------------------------------------------------------
const v=await planningSuggestions(env,auth,T,{course_id:'crs_ohne',starts_at:'2026-09-07T08:00:00.000Z',ends_at:'2026-09-07T09:30:00.000Z'});
assert.equal(v.teachers.length,0,'beide Personen sind im Entwurf belegt und dürfen nicht erneut vorgeschlagen werden');
assert.equal(v.rooms.length,0,'beide Räume sind im Entwurf belegt und dürfen nicht erneut vorgeschlagen werden');
// Ausserhalb der Entwurfszeit ist alles wieder frei.
const frei=await planningSuggestions(env,auth,T,{course_id:'crs_ohne',starts_at:'2026-09-07T14:00:00.000Z',ends_at:'2026-09-07T15:30:00.000Z'});
assert.equal(frei.teachers.length,2,'ausserhalb der belegten Zeit müssen beide Personen wieder frei sein');
assert.equal(frei.rooms.length,2,'ausserhalb der belegten Zeit müssen beide Räume wieder frei sein');
// Der eigene Termin blockiert seinen eigenen Austausch nicht.
const eigen=await planningSuggestions(env,auth,T,{course_id:'crs_a',starts_at:'2026-09-07T08:00:00.000Z',ends_at:'2026-09-07T09:30:00.000Z'});
assert.ok(eigen.teachers.length>0,'wer denselben Termin umbesetzen will, darf nicht von sich selbst blockiert werden');

// ---------------------------------------------------------------------------
// 5. Wo nichts frei ist, entsteht kein Termin - die Lücke wird benannt.
// ---------------------------------------------------------------------------
db.exec(`
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_c','${T}','Klasse C','C',1,'${TS}','${TS}');
INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T}','crs_c','08:00','16:00',90,0,0,'${U}','${TS}');
INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_2','${T}','Woche 37 C','${VON}','${BIS}','draft','${U}','${TS}','${TS}');
`);
const r3=await autofillTimetablePlan(env,auth,T,'tpv_2',{course_ids:['crs_c']});
assert.equal(r3.created,0,'wenn niemand frei ist, darf kein Termin erfunden werden');
assert.equal(r3.gap_count,5,`für jeden Werktag muss die Lücke benannt sein, war: ${r3.gap_count}`);
assert.ok(r3.gaps.every(g=>g.reason==='NO_TEACHER_AVAILABLE'),
  `der Grund muss benannt sein, war: ${JSON.stringify(r3.gaps[0])}`);
assert.ok(r3.gaps.every(g=>g.course_name==='Klasse C'),'die Lücke muss die Klasse im Klartext nennen');

// ---------------------------------------------------------------------------
// 6. Sperrzeiten werden respektiert, ohne als Lücke zu erschrecken.
// ---------------------------------------------------------------------------
db.exec(`
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_d','${T}','Klasse D','D',1,'${TS}','${TS}');
INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T}','crs_d','12:00','16:00',90,0,0,'${U}','${TS}');
INSERT INTO planning_blackouts(id,tenant_id,course_id,title,blackout_type,starts_at,ends_at,blocks_teaching,created_by,created_at,updated_at) VALUES('blk_1','${T}','crs_d','Betriebsausflug','closure','2026-09-09T00:00:00.000Z','2026-09-10T00:00:00.000Z',1,'${U}','${TS}','${TS}');
INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_3','${T}','Woche 37 D','${VON}','${BIS}','draft','${U}','${TS}','${TS}');
`);
const r4=await autofillTimetablePlan(env,auth,T,'tpv_3',{course_ids:['crs_d']});
assert.equal(r4.created,4,`der gesperrte Mittwoch darf nicht geplant werden, war: ${r4.created}`);
assert.equal(r4.gap_count,0,'eine bewusste Sperrzeit ist keine offene Lücke');
assert.equal(zahl(`SELECT COUNT(*) FROM timetable_plan_entries WHERE tenant_id='${T}' AND course_id='crs_d' AND substr(starts_at,1,10)='2026-09-09'`),0);

// ---------------------------------------------------------------------------
// 7. Ein veröffentlichter Plan wird nicht mehr angefasst.
// ---------------------------------------------------------------------------
db.exec(`UPDATE timetable_plan_versions SET status='published' WHERE id='tpv_3';`);
// Bewusst nur Klasse D: für sie ist in diesem Plan bereits jeder planbare Tag belegt.
// Es gäbe also gar nichts zu schreiben - abgewiesen werden muss der Lauf trotzdem,
// und zwar von der Sperre am Anfang, nicht erst zufällig beim ersten Schreibversuch.
await assert.rejects(()=>autofillTimetablePlan(env,auth,T,'tpv_3',{course_ids:['crs_d']}),/TIMETABLE_PLAN_LOCKED/,
  'ein veröffentlichter Plan muss sofort abgewiesen werden, auch wenn nichts zu tun wäre');
await assert.rejects(()=>autofillTimetablePlan(env,auth,T,'tpv_3',{}),/TIMETABLE_PLAN_LOCKED/,
  'ein veröffentlichter Plan darf nicht nachträglich befüllt werden');
await assert.rejects(()=>autofillTimetablePlan(env,auth,T,'gibtsnicht',{}),/TIMETABLE_PLAN_NOT_FOUND/);

// ---------------------------------------------------------------------------
// 8. Ohne Planungsrecht geht gar nichts.
// ---------------------------------------------------------------------------
const gast={userId:U,role:'participant',tenantIds:[T],courseIds:['crs_a'],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
await assert.rejects(()=>autofillTimetablePlan(env,gast,T,'tpv_1',{}),/FORBIDDEN_PLANNING_MANAGE/,
  'wer nicht planen darf, darf auch nicht automatisch planen lassen');

// ---------------------------------------------------------------------------------------------
// 9. Ohne ausdrückliche Liste plant der Lauf nur, was die aufrufende Person verantwortet.
// ---------------------------------------------------------------------------------------------
db.exec(`INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_4','${T}','Nur Klasse B','${VON}','${BIS}','draft','${U}','${TS}','${TS}');`);
const planer={userId:U,role:'class_admin',tenantIds:[T],courseIds:['crs_b'],orgUnitIds:[],permissions:['courses.manage'],isPlatformAdmin:false};
const r5=await autofillTimetablePlan(env,planer,T,'tpv_4',{});
assert.deepEqual(r5.courses.map(c=>c.course_id),['crs_b'],
  `ohne Liste darf nur die verantwortete Klasse geplant werden, war: ${JSON.stringify(r5.courses)}`);
assert.equal(zahl(`SELECT COUNT(*) FROM timetable_plan_entries WHERE tenant_id='${T}' AND plan_id='tpv_4' AND course_id<>'crs_b'`),0,
  'keine fremde Klasse darf in den Entwurf geraten');

// Nennt sie eine fremde Klasse ausdrücklich, bricht der Lauf ab - still übergangen wird nichts.
await assert.rejects(()=>autofillTimetablePlan(env,planer,T,'tpv_4',{course_ids:['crs_a']}),/FORBIDDEN_COURSE_SCOPE/,
  'eine ausdrücklich genannte fremde Klasse muss abgewiesen werden');
// Und zwar sofort, nicht erst zufällig beim ersten Schreibversuch: dieser Zeitraum umfasst nur
// das Wochenende, es gäbe also gar nichts zu schreiben. Abgewiesen werden muss es trotzdem.
db.exec(`INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_we','${T}','Nur Wochenende','2026-09-12','2026-09-13','draft','${U}','${TS}','${TS}');`);
await assert.rejects(()=>autofillTimetablePlan(env,planer,T,'tpv_we',{course_ids:['crs_a']}),/FORBIDDEN_COURSE_SCOPE/,
  'die fehlende Berechtigung muss vorab auffallen, nicht erst wenn zufällig etwas zu schreiben wäre');

// ---------------------------------------------------------------------------------------------
// 10. Eine genannte Klasse ohne Kursregeln wird benannt, nicht stillschweigend weggelassen.
// ---------------------------------------------------------------------------------------------
db.exec(`INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_5','${T}','Gemischt','${VON}','${BIS}','draft','${U}','${TS}','${TS}');`);
const r6=await autofillTimetablePlan(env,auth,T,'tpv_5',{course_ids:['crs_b','crs_ohne']});
assert.ok(r6.gaps.some(g=>g.course_id==='crs_ohne'&&g.reason==='NO_COURSE_RULES'),
  `die Klasse ohne Kursregeln muss als Lücke benannt sein: ${JSON.stringify(r6.gaps)}`);
assert.ok(r6.gaps.some(g=>g.course_name==='Klasse ohne Regeln'),'und zwar im Klartext');
assert.ok(r6.created>0,'die andere Klasse wird trotzdem geplant');

console.log('timetable-autofill: ok');
