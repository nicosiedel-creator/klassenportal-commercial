import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { previewEducationIntent, simulateEducationIntent } from '../dist/core/education-intent.js';
import { simulateEducationScenario } from '../dist/core/education-scenarios.js';

// Das Abnahmepaket eines Bildungsträgers verlangt es als Sicherheitszusage:
//
//   "keine automatische irreversible Umbuchung ohne Bestätigung"
//   "Schlage eine sichere Neuplanung vor, ohne selbst endgültige Änderungen vorzunehmen."
//
// Der ausgelieferte Code hält das ein: education-intent.ts enthält keine einzige Schreib-
// anweisung, und die Szenariensimulation schreibt ausschließlich in ihre eigenen Vorschlags-
// tabellen. Geschützt war es durch nichts - drei der vier Education-OS-Prüfungen lesen nur
// Quelltext. Eine Simulation, die eines Tages doch den Stundenplan anfasst, wäre durch keine
// Prüfung aufgefallen.
//
// Dieser Test führt Vorschau und Simulation aus und vergleicht den gesamten Betriebsbestand
// Zeile für Zeile davor und danach.

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_os',U='usr_os',C='crs_os',TS=new Date().toISOString();
const tag=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','hbg-os','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_tn','lea@lernende.example.invalid','Lea','x',0,0,'active','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('${C}','${T}',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_os','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_tn','${T}','${C}','usr_tn','participant','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,external_id,created_at) VALUES('tch_d001','${T}','Dr. Lena Hoffmann','lena@example.invalid','D001','${TS}');
INSERT INTO subjects(id,tenant_id,name,short_name,created_at) VALUES('sub_1','${T}','Verwaltungsrecht','VR','${TS}');
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_1','${T}','${C}','sub_1','tch_d001','${tag}T08:15:00','${tag}T11:30:00','A-204','${TS}');
INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,created_at) VALUES('les_2','${T}','${C}','sub_1','tch_d001','${tag}T12:15:00','${tag}T15:30:00','A-301','${TS}');
INSERT INTO exams(id,tenant_id,course_id,subject_id,title,starts_at,ends_at,room,external_id,created_at,updated_at) VALUES('exm_1','${T}','${C}','sub_1','BGB-Klausur 1','${tag}T09:00:00','${tag}T10:30:00','A-204','P001','${TS}','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,status,created_by,created_at,updated_at) VALUES('res_a301','${T}','room','A-301','A-301','active','${U}','${TS}','${TS}');
`);

// Der Betriebsbestand: alles, was ein Kunde als "seine Daten" versteht. Die Vorschlags- und
// Protokolltabellen des Education OS gehören ausdrücklich nicht dazu - dort darf ein Vorschlag
// entstehen, das ist ja der Zweck.
const BETRIEB=['lessons','exams','memberships','tenant_users','users','teachers','subjects','courses',
  'personal_grades','absence_notices','planning_resources','planning_resource_unavailability',
  'teacher_unavailability','timetable_plan_entries','lesson_resource_reservations','attendance_sessions'];
const bestand=()=>Object.fromEntries(BETRIEB.map(t=>{
  try{return[t,JSON.stringify(db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all())];}
  catch{return[t,'(Tabelle fehlt)'];}
}));

const env={DB:d1(db)};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[C],orgUnitIds:[],permissions:['*'],isPlatformAdmin:false};
const vorher=bestand();

// ---------------------------------------------------------------------------------------------
// 1. Die Vorschau. Sie liest nur - und sie muss etwas zu sagen haben.
// ---------------------------------------------------------------------------------------------
const vorschau=await previewEducationIntent(env,auth,T,
  `Dozentin D001 fällt am ${tag} aus, bitte sichere Neuplanung vorschlagen`);
assert.ok(vorschau&&typeof vorschau==='object','die Vorschau muss eine Antwort liefern');
assert.deepEqual(bestand(),vorher,'die Vorschau darf nichts am Betriebsbestand ändern');

// ---------------------------------------------------------------------------------------------
// 2. Die Simulation eines Dozentenausfalls - genau der Vorgang aus dem Abnahmepaket.
// ---------------------------------------------------------------------------------------------
const ausfall=await simulateEducationScenario(env,auth,T,'teacher_absence',
  {teacher_id:'tch_d001',starts_at:`${tag}T08:00:00`,ends_at:`${tag}T16:00:00`,course_id:C});
assert.ok(ausfall&&typeof ausfall==='object','die Simulation muss ein Ergebnis liefern');
assert.deepEqual(bestand(),vorher,
  'die Simulation eines Dozentenausfalls darf keine einzige Zeile des Betriebs verändern');

// ---------------------------------------------------------------------------------------------
// 3. Die Simulation eines Raumausfalls - der zweite Vorgang aus dem Abnahmepaket.
// ---------------------------------------------------------------------------------------------
const raum=await simulateEducationScenario(env,auth,T,'room_outage',
  {resource_id:'res_a301',starts_at:`${tag}T12:00:00`,ends_at:`${tag}T16:00:00`,course_id:C});
assert.ok(raum&&typeof raum==='object','die Simulation muss ein Ergebnis liefern');
assert.deepEqual(bestand(),vorher,
  'die Simulation eines Raumausfalls darf keine einzige Zeile des Betriebs verändern');

// ---------------------------------------------------------------------------------------------
// 4. Und der Vorschlag ist wirklich entstanden - sonst wäre die Unverändertheit wertlos, weil
//    schlicht nichts passiert wäre.
// ---------------------------------------------------------------------------------------------
const vorschlaege=db.prepare('SELECT id,scenario_type FROM education_scenarios WHERE tenant_id=?').all(T);
assert.equal(vorschlaege.length,2,
  `beide Simulationen müssen als Vorschlag festgehalten werden, festgehalten: ${JSON.stringify(vorschlaege)}`);
assert.deepEqual(vorschlaege.map(v=>v.scenario_type).sort(),['room_outage','teacher_absence']);

// ---------------------------------------------------------------------------------------------
// 5. Der Quelltext des Absichtsweges enthält überhaupt keine Schreibanweisung. Das ist die
//    Bauart, auf der die Zusage ruht - sie darf nicht unbemerkt verloren gehen.
// ---------------------------------------------------------------------------------------------
const intentQuelle=await readFile('src/core/education-intent.ts','utf8');
const schreibend=intentQuelle.match(/\b(INSERT INTO|UPDATE\s+[a-z_]+\s+SET|DELETE FROM)\b/gi)||[];
assert.equal(schreibend.length,0,
  `der Absichtsweg darf nichts schreiben, gefunden: ${JSON.stringify(schreibend)}`);

// Und die Szenariensimulation schreibt ausschließlich in ihre eigenen Vorschlagstabellen.
const szenarioQuelle=await readFile('src/core/education-scenarios.ts','utf8');
const ziele=[...szenarioQuelle.matchAll(/(?:INSERT INTO|UPDATE)\s+([a-z_]+)/gi)].map(m=>m[1].toLowerCase());
const fremd=ziele.filter(t=>!t.startsWith('education_'));
assert.deepEqual(fremd,[],
  `die Simulation darf nur in ihre eigenen Vorschlagstabellen schreiben, gefunden: ${JSON.stringify(fremd)}`);

console.log('education-os-proposes-never-applies: ok');
