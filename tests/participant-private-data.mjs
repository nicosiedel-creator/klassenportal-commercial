import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { listPersonalGrades } from '../dist/core/data.js';
import { updatePersonalGrade, deletePersonalGrade } from '../dist/core/operational-data.js';
import { myAbsenceNotices } from '../dist/core/attendance-classbook.js';

// Das Abnahmepaket eines Bildungsträgers verlangt es wörtlich:
//   "Teilnehmer sehen nur eigene Noten und eigene persönliche Fehlzeiten."
//   "Klassenadmin bleibt in seiner persönlichen Sicht ein Teilnehmer mit Zusatzrechten; er darf
//    keine privaten Noten anderer Teilnehmer sehen."
//
// Beides hält der Code ein - jede Abfrage ist an auth.userId gebunden. Geschützt war es durch
// nichts: die vorhandenen Prüfungen für diesen Weg lesen nur Quelltext. Ein Umbau, der ein
// "AND user_id=?" verliert, gäbe jedem Klassenkameraden die privaten Noten aller anderen, und
// keine einzige Prüfung hätte angeschlagen.
//
// Dieser Test führt die ausgelieferten Abfragen aus.

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_priv',C='crs_priv',TS=new Date().toISOString();
const PERSONEN=[['usr_anna','Anna'],['usr_bruno','Bruno'],['usr_klara','Klara']];
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','hbg-priv','active','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('${C}','${T}',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
${PERSONEN.map(([id,n])=>`INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${id}','${n.toLowerCase()}@lernende.example.invalid','${n}','x',0,0,'active','${TS}','${TS}');`).join('\n')}
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('m_anna','${T}','${C}','usr_anna','participant','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('m_bruno','${T}','${C}','usr_bruno','participant','${TS}');
-- Klara ist Klassenadmin UND Teilnehmerin - genau die Doppelrolle aus dem Abnahmepaket.
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('m_klara_p','${T}','${C}','usr_klara','participant','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('m_klara_k','${T}','${C}','usr_klara','class_admin','${TS}');
-- Jede führt eigene private Noten.
${PERSONEN.map(([id,n])=>`INSERT INTO personal_grades(id,tenant_id,course_id,user_id,title,grade_value,weight,recorded_at,created_at,updated_at) VALUES('pg_${id}','${T}','${C}','${id}','Note ${n}','2',1,'${TS}','${TS}','${TS}');`).join('\n')}
-- Und eigene Fehlzeiten.
${PERSONEN.map(([id,n])=>`INSERT INTO absence_notices(id,tenant_id,course_id,user_id,starts_on,ends_on,status,submitted_at,created_at,updated_at) VALUES('an_${id}','${T}','${C}','${id}','2026-09-10','2026-09-10','submitted','${TS}','${TS}','${TS}');`).join('\n')}
`);

const env={DB:d1(db)};
const alsTeilnehmer=(userId,rolle='participant')=>({userId,role:rolle,tenantIds:[T],courseIds:[C],orgUnitIds:[],permissions:[],isPlatformAdmin:false});

// ---------------------------------------------------------------------------------------------
// 1. Noten: jede sieht genau ihre eigene - und keine fremde.
// ---------------------------------------------------------------------------------------------
for(const [id,n] of PERSONEN){
  const rolle=id==='usr_klara'?'class_admin':'participant';
  const noten=await listPersonalGrades(env,alsTeilnehmer(id,rolle),T,C);
  assert.equal(noten.length,1,`${n} darf genau eine Note sehen, gesehen: ${noten.length}`);
  assert.equal(noten[0].user_id,id,
    `${n} sieht eine fremde Note: ${JSON.stringify(noten[0])}`);
  assert.equal(noten[0].title,`Note ${n}`);
}
// Ausdrücklich für die Doppelrolle: Zusatzrechte ändern nichts an der persönlichen Sicht.
const klaraNoten=await listPersonalGrades(env,alsTeilnehmer('usr_klara','class_admin'),T,C);
assert.deepEqual(klaraNoten.map(g=>g.user_id),['usr_klara'],
  `die Klassenadmin darf keine privaten Noten anderer sehen, gesehen: ${JSON.stringify(klaraNoten.map(g=>g.user_id))}`);

// ---------------------------------------------------------------------------------------------
// 2. Fehlzeiten: dasselbe.
// ---------------------------------------------------------------------------------------------
for(const [id,n] of PERSONEN){
  const rolle=id==='usr_klara'?'class_admin':'participant';
  const zeiten=await myAbsenceNotices(env,alsTeilnehmer(id,rolle),T,C);
  assert.equal(zeiten.length,1,`${n} darf genau die eigene Fehlzeit sehen, gesehen: ${zeiten.length}`);
  assert.equal(zeiten[0].id,`an_${id}`,`${n} sieht eine fremde Fehlzeit: ${JSON.stringify(zeiten[0])}`);
}

// ---------------------------------------------------------------------------------------------
// 3. Ändern und Löschen greifen nicht auf fremde Noten durch - auch nicht mit deren Kennung.
// ---------------------------------------------------------------------------------------------
const fremd='pg_usr_bruno';
await assert.rejects(()=>updatePersonalGrade(env,alsTeilnehmer('usr_anna'),T,C,fremd,{title:'Übernommen',grade_value:'1'}),
  /./,'Anna darf Brunos Note nicht ändern');
assert.equal(db.prepare('SELECT title FROM personal_grades WHERE id=?').get(fremd).title,'Note Bruno',
  'Brunos Note darf unverändert bleiben');
await assert.rejects(()=>deletePersonalGrade(env,alsTeilnehmer('usr_anna'),T,C,fremd),
  /./,'Anna darf Brunos Note nicht löschen');
assert.equal(db.prepare('SELECT COUNT(*) n FROM personal_grades WHERE id=?').get(fremd).n,1,
  'Brunos Note darf nicht verschwinden');
// Auch die Klassenadmin nicht - Zusatzrechte gelten der Klasse, nicht den privaten Noten.
await assert.rejects(()=>updatePersonalGrade(env,alsTeilnehmer('usr_klara','class_admin'),T,C,fremd,{title:'Vom Klassenadmin',grade_value:'1'}),
  /./,'auch die Klassenadmin darf eine fremde private Note nicht ändern');
assert.equal(db.prepare('SELECT title FROM personal_grades WHERE id=?').get(fremd).title,'Note Bruno');

// Die eigene Note darf sie dagegen ändern - sonst wäre die Sperre keine Grenze, sondern eine Wand.
await updatePersonalGrade(env,alsTeilnehmer('usr_anna'),T,C,'pg_usr_anna',{title:'Meine Note',grade_value:'1'});
assert.equal(db.prepare("SELECT title FROM personal_grades WHERE id='pg_usr_anna'").get().title,'Meine Note',
  'die eigene Note muss änderbar bleiben');

// ---------------------------------------------------------------------------------------------
// 4. Ein Blick über die Klassengrenze: wer nicht in der Klasse ist, sieht dort gar nichts.
// ---------------------------------------------------------------------------------------------
await assert.rejects(()=>listPersonalGrades(env,{...alsTeilnehmer('usr_anna'),courseIds:['crs_fremd']},T,C),
  /./,'ohne Zugang zur Klasse gibt es dort auch keine eigenen Noten zu sehen');

console.log('participant-private-data: ok');
