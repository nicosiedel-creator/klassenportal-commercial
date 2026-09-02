// "Erstell die Abschlusszeugnisse für Klasse ..." - fuer eine ganze Klasse auf einmal.
//
// Bisher konnte nur ein einzelnes Zeugnis vorbereitet werden. Ein Traeger schliesst aber
// Jahrgaenge ab, nicht einzelne Personen. Belegt wird hier ausgefuehrt: es wird nur
// vorbereitet, nie freigegeben und nie ausgestellt; wer die Kriterien der Vorlage nicht
// erfuellt, bekommt kein Zeugnis, sondern steht mit Grund in der Liste.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { prepareCertificatesForCourse } from '../dist/core/certificates.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_zeug',U='usr_admin',TS='2026-01-01T00:00:00.000Z';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Bildungswerk','bw','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,start_date,end_date,is_active,created_at,updated_at) VALUES('crs_z','${T}','Fachklasse Metall 3','FM3','2025-09-01','2026-07-15',1,'${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_a','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','${U}','active','manual','${TS}','${TS}');
INSERT INTO certificate_templates(id,tenant_id,name,document_type,title_template,body_template,min_attendance_percent,require_progress_complete,approval_mode,is_active,version,created_by,created_at,updated_by,updated_at)
  VALUES('ctm_1','${T}','Abschlusszeugnis','completion','Abschlusszeugnis','{{name}} hat {{course}} abgeschlossen.',80,0,'manual',1,1,'${U}','${TS}','${U}','${TS}');
`);
// Zehn Unterrichtstermine, an denen Anwesenheit erfasst wird.
for(let i=0;i<10;i++)db.exec(`INSERT INTO attendance_sessions(id,tenant_id,course_id,session_date,starts_at,ends_at,status,source,created_by,created_at,updated_at) VALUES('ses_${i}','${T}','crs_z','2026-03-${String(i+1).padStart(2,'0')}','2026-03-${String(i+1).padStart(2,'0')}T08:00:00.000Z','2026-03-${String(i+1).padStart(2,'0')}T09:30:00.000Z','held','manual','${U}','${TS}','${TS}');`);

// Drei Teilnehmende: eine erfüllt die Anwesenheit, eine nicht, eine hat gar keine Erfassung.
for(const [uid,name,anwesend,gesamt] of [['usr_a','Aylin Acar',9,10],['usr_b','Ben Braun',5,10],['usr_c','Cem Cetin',0,0]]){
  db.exec(`INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${uid}','${uid}@example.invalid','${name}','x',0,0,'active','${TS}','${TS}');
  INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_${uid}','${T}','crs_z','${uid}','participant','${TS}');
  INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','${uid}','active','manual','${TS}','${TS}');`);
  for(let i=0;i<gesamt;i++)db.exec(`INSERT INTO attendance_records(session_id,tenant_id,course_id,user_id,status,recorded_by,recorded_at,updated_at) VALUES('ses_${i}','${T}','crs_z','${uid}','${i<anwesend?'present':'unexcused_absent'}','${U}','${TS}','${TS}');`);
}
const env={DB:d1(db)};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const zahl=(sql,...a)=>Number(Object.values(db.prepare(sql).get(...a)??{0:0})[0]||0);

// ---------------------------------------------------------------------------
// 1. Ein Lauf über die ganze Klasse.
// ---------------------------------------------------------------------------
const r=await prepareCertificatesForCourse(env,auth,T,'crs_z','ctm_1');
assert.equal(r.participants,3,'alle Teilnehmenden der Klasse müssen betrachtet werden');
assert.equal(r.approved,0,'vorbereiten heißt nicht freigeben');
assert.equal(r.issued,0,'und erst recht nicht ausstellen');
assert.deepEqual(r.prepared.map(x=>x.user_id),['usr_a'],
  `nur wer die Kriterien erfüllt, bekommt ein Zeugnis vorbereitet: ${JSON.stringify(r.prepared)}`);
assert.deepEqual(r.open.map(x=>x.user_id).sort(),['usr_b','usr_c'],
  'die anderen stehen offen in der Liste, statt still zu verschwinden');
for(const x of r.open)assert.equal(x.reason,'ATTENDANCE_BELOW_MINIMUM','mit benanntem Grund');
assert.ok(r.open.every(x=>x.display_name),'und mit Namen, nicht nur einer Kennung');

// Kein Datensatz steht auf freigegeben oder ausgestellt.
assert.equal(zahl(`SELECT COUNT(*) FROM certificate_records WHERE tenant_id='${T}' AND status<>'prepared'`),0,
  'kein Zeugnis darf aus dem Sammellauf heraus freigegeben oder ausgestellt sein');
assert.equal(zahl(`SELECT COUNT(*) FROM certificate_records WHERE tenant_id='${T}'`),3,
  'für alle wird ein prüfbarer Datensatz angelegt - auch für die noch offenen');

// ---------------------------------------------------------------------------
// 2. Ein zweiter Lauf verdoppelt nichts.
// ---------------------------------------------------------------------------
const r2=await prepareCertificatesForCourse(env,auth,T,'crs_z','ctm_1');
assert.deepEqual(r2.prepared.map(x=>x.certificate_id),r.prepared.map(x=>x.certificate_id),
  'ein zweiter Lauf muss dieselben Zeugnisse liefern, keine neuen');
assert.equal(zahl(`SELECT COUNT(*) FROM certificate_records WHERE tenant_id='${T}'`),3);

// ---------------------------------------------------------------------------
// 3. Holt jemand die Anwesenheit nach, rutscht er beim nächsten Lauf hinüber.
// ---------------------------------------------------------------------------
db.exec(`UPDATE attendance_records SET status='present' WHERE tenant_id='${T}' AND user_id='usr_b';`);
const r3=await prepareCertificatesForCourse(env,auth,T,'crs_z','ctm_1');
assert.deepEqual(r3.prepared.map(x=>x.user_id).sort(),['usr_a','usr_b'],
  'wer die Kriterien nachträglich erfüllt, muss beim nächsten Lauf dabei sein');
assert.deepEqual(r3.open.map(x=>x.user_id),['usr_c']);

// ---------------------------------------------------------------------------
// 4. Ohne Klassenverwaltungsrecht geht nichts.
// ---------------------------------------------------------------------------
const gast={userId:'usr_a',role:'participant',tenantIds:[T],courseIds:['crs_z'],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
await assert.rejects(()=>prepareCertificatesForCourse(env,gast,T,'crs_z','ctm_1'),/FORBIDDEN/,
  'ein Teilnehmer darf keine Zeugnisse für seine Klasse vorbereiten');

// ---------------------------------------------------------------------------
// 5. Eine fremde Klasse bleibt fremd.
// ---------------------------------------------------------------------------
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('ten_fremd','Fremd','tf','active','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_fremd','ten_fremd','Fremde Klasse','FK',1,'${TS}','${TS}');`);
await assert.rejects(()=>prepareCertificatesForCourse(env,auth,T,'crs_fremd','ctm_1'),/COURSE_NOT_FOUND/,
  'eine Klasse eines anderen Mandanten darf hier nicht auftauchen');

// ---------------------------------------------------------------------------
// 6. Die Oberfläche bietet den Sammellauf an - und verspricht dabei nichts Falsches.
// ---------------------------------------------------------------------------
const ui=await readFile('public/certificate-workflow-ui.js','utf8');
assert.match(ui,/<button[^>]*data-prepare-course/,'es muss eine Schaltfläche für die ganze Klasse geben');
assert.match(ui,/\/api\/certificates\/prepare-course/,'sie muss den Sammellauf aufrufen');
const dialog=ui.slice(ui.indexOf('async function prepareCourse('),ui.indexOf('async function action('));
assert.ok(!/\/approve|\/issue/.test(dialog),
  'aus dem Sammellauf heraus darf weder freigegeben noch ausgestellt werden');
assert.match(dialog,/nur vorbereitet/i,'und dem Kunden muss das ausdrücklich gesagt werden');
assert.match(ui,/ATTENDANCE_BELOW_MINIMUM:'[^']+'/,'die offenen Fälle müssen im Klartext erklärt werden, nicht als Fehlercode');
assert.match(ui,/PROGRESS_INCOMPLETE:'[^']+'/);

// ---------------------------------------------------------------------------
// 7. Ein Sammellauf sprengt nicht die Grenze der Plattform.
//
//    Cloudflare begrenzt die Zahl der Unteranfragen je Aufruf; jede Datenbankabfrage zählt dazu.
//    Gemessen kostet eine vorbereitete Bescheinigung rund elf Abfragen. Ein Lauf über eine große
//    Klasse wäre mitten im Schreiben abgebrochen worden - ein Teil hätte eine Bescheinigung, der
//    Rest nicht, und niemand könnte sagen, wo die Grenze lag.
// ---------------------------------------------------------------------------
db.exec(`INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_gross','${T}','Große Klasse','G',1,'${TS}','${TS}');`);
for(let i=0;i<40;i++)db.exec(`
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_g${i}','g${i}@example.invalid','Person ${i}','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_g${i}','${T}','crs_gross','usr_g${i}','participant','${TS}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','usr_g${i}','active','manual','${TS}','${TS}');`);
const roh=d1(db);let abfragen=0;
const gezaehlt={DB:{...roh,prepare(sql){abfragen++;return roh.prepare(sql);},batch(...a){abfragen++;return roh.batch(...a);}}};
const gross=await prepareCertificatesForCourse(gezaehlt,auth,T,'crs_gross','ctm_1');
assert.equal(gross.participants,40);
assert.ok(abfragen<800,`ein Sammellauf muss deutlich unter der Plattformgrenze bleiben, war: ${abfragen} Abfragen`);

// Eine zu große Klasse wird abgewiesen, statt halb bearbeitet zu werden.
db.exec(`INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_riesig','${T}','Riesige Klasse','R',1,'${TS}','${TS}');`);
for(let i=0;i<80;i++)db.exec(`
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_r${i}','r${i}@example.invalid','Riese ${i}','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_r${i}','${T}','crs_riesig','usr_r${i}','participant','${TS}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','usr_r${i}','active','manual','${TS}','${TS}');`);
await assert.rejects(()=>prepareCertificatesForCourse(env,auth,T,'crs_riesig','ctm_1'),/CERTIFICATE_BATCH_TOO_LARGE/,
  'eine zu große Klasse muss vorher abgewiesen werden, nicht halb bearbeitet');
assert.equal(zahl(`SELECT COUNT(*) FROM certificate_records WHERE tenant_id='${T}' AND course_id='crs_riesig'`),0,
  'und dabei darf nicht eine einzige Bescheinigung entstanden sein');

// Aber es gibt einen Weg: in Gruppen vorbereiten.
const ersteHaelfte=Array.from({length:40},(_,i)=>`usr_r${i}`);
const g1=await prepareCertificatesForCourse(env,auth,T,'crs_riesig','ctm_1',ersteHaelfte);
assert.equal(g1.participants,40,'die gewählte Gruppe wird bearbeitet');
assert.equal(g1.course_participants,80,'und die Größe der ganzen Klasse bleibt sichtbar');
assert.equal(zahl(`SELECT COUNT(*) FROM certificate_records WHERE tenant_id='${T}' AND course_id='crs_riesig'`),40);
const g2=await prepareCertificatesForCourse(env,auth,T,'crs_riesig','ctm_1',Array.from({length:40},(_,i)=>`usr_r${i+40}`));
assert.equal(g2.participants,40);
assert.equal(zahl(`SELECT COUNT(*) FROM certificate_records WHERE tenant_id='${T}' AND course_id='crs_riesig'`),80,
  'nach beiden Gruppen ist die ganze Klasse vorbereitet');

// Und die Meldung sagt, wie es geht.
const texte=await readFile('public/kp-error-text.js','utf8');
assert.match(texte,/CERTIFICATE_BATCH_TOO_LARGE:'[^']*Gruppen[^']*'/,
  'die Meldung muss den Weg über Gruppen nennen, nicht nur das Scheitern');

console.log('certificate-batch: ok');
