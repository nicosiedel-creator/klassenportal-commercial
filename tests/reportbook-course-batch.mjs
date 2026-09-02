// Berichtshefte / Taetigkeitsnachweise fuer eine ganze Klasse.
//
// Bisher konnte einen Zeitraum nur die teilnehmende Person selbst eroeffnen. Ein Traeger, der
// einen Jahrgang fuehrt, konnte weder die Zeitraeume vorgeben noch sehen, wer noch nichts
// eingereicht hat: die Uebersicht des Lehrpersonals zeigt ausschliesslich bereits eingereichte
// Hefte. Wer gar nichts tut, war unsichtbar.
//
// Bewusst nicht automatisiert: das Schreiben und Einreichen. Ein Nachweis, den der Traeger
// selbst ausfuellt, ist keiner. Hier entstehen ausschliesslich leere Zeitraeume.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { openReportBookPeriodsForCourse, reportBookCoverageForCourse, ensureReportBookPeriod, saveReportBookEntry } from '../dist/core/learning-operations.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_heft',U='usr_leitung',TS='2026-01-01T00:00:00.000Z',VON='2026-09-01',BIS='2026-09-30';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Bildungswerk','bw','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','leitung@example.invalid','Leitung','x',0,0,'active','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_h','${T}','Fachklasse Metall 3','FM3',1,'${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_l','${T}',NULL,'${U}','tenant_admin','${TS}');
`);
for(const [uid,name] of [['usr_a','Aylin Acar'],['usr_b','Ben Braun'],['usr_c','Cem Cetin']])
  db.exec(`INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${uid}','${uid}@example.invalid','${name}','x',0,0,'active','${TS}','${TS}');
  INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_${uid}','${T}','crs_h','${uid}','participant','${TS}');`);

const env={DB:d1(db)};
const leitung={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const teilnehmer=uid=>({userId:uid,role:'participant',tenantIds:[T],courseIds:['crs_h'],orgUnitIds:[],permissions:[],isPlatformAdmin:false});
const zahl=(sql,...a)=>Number(Object.values(db.prepare(sql).get(...a)??{0:0})[0]||0);

// ---------------------------------------------------------------------------
// 1. Der Träger eröffnet die Zeiträume - und nur die.
// ---------------------------------------------------------------------------
const r=await openReportBookPeriodsForCourse(env,leitung,T,'crs_h',{period_start:VON,period_end:BIS,title:'September'});
assert.equal(r.participants,3);
assert.equal(r.created,3,'für jede teilnehmende Person muss ein Zeitraum entstehen');
assert.equal(r.entries_created,0,'es darf kein einziger Eintrag entstehen - den schreibt die Person selbst');
assert.equal(zahl(`SELECT COUNT(*) FROM report_book_entries WHERE tenant_id='${T}'`),0);
assert.equal(zahl(`SELECT COUNT(*) FROM report_book_periods WHERE tenant_id='${T}' AND status<>'draft'`),0,
  'nichts darf als eingereicht oder geprüft gelten');
assert.ok(r.periods.every(p=>p.display_name),'die Rückmeldung muss Namen nennen, nicht nur Kennungen');

// Ein zweiter Lauf legt nichts doppelt an.
const r2=await openReportBookPeriodsForCourse(env,leitung,T,'crs_h',{period_start:VON,period_end:BIS});
assert.equal(r2.created,0,'ein zweiter Lauf darf keine zweiten Zeiträume anlegen');
assert.equal(r2.existing,3);
assert.equal(zahl(`SELECT COUNT(*) FROM report_book_periods WHERE tenant_id='${T}'`),3);

// Und er kollidiert nicht mit einem Zeitraum, den jemand selbst angelegt hat.
await ensureReportBookPeriod(env,teilnehmer('usr_a'),T,'crs_h',{period_start:'2026-10-01',period_end:'2026-10-31'});
const r3=await openReportBookPeriodsForCourse(env,leitung,T,'crs_h',{period_start:'2026-10-01',period_end:'2026-10-31'});
assert.equal(r3.created,2,'der selbst angelegte Zeitraum wird übernommen, die fehlenden ergänzt');
assert.equal(r3.existing,1);

// ---------------------------------------------------------------------------
// 2. Die Übersicht zeigt auch die, die noch nichts getan haben.
// ---------------------------------------------------------------------------
const u1=await reportBookCoverageForCourse(env,leitung,T,'crs_h',{period_start:VON,period_end:BIS});
assert.equal(u1.participants,3);
assert.equal(u1.open,3,'zu Beginn ist bei allen dreien noch etwas offen');
assert.ok(u1.rows.every(x=>x.state==='draft'&&x.entry_count===0));
assert.ok(u1.rows.every(x=>x.display_name),'jede Zeile muss die Person benennen');

// Eine Person trägt etwas ein - die Übersicht zeigt den Umfang, nicht den Inhalt.
const eigener=u1.rows.find(x=>x.user_id==='usr_a').period_id;
await saveReportBookEntry(env,teilnehmer('usr_a'),T,'crs_h',eigener,{entry_date:'2026-09-07',minutes:480,activity_text:'Drehen und Fräsen an der CNC'});
const u2=await reportBookCoverageForCourse(env,leitung,T,'crs_h',{period_start:VON,period_end:BIS});
const zeileA=u2.rows.find(x=>x.user_id==='usr_a');
assert.equal(zeileA.entry_count,1,'die Zahl der Einträge muss sichtbar sein');
assert.equal(zeileA.total_minutes,480,'und der erfasste Umfang');
assert.ok(!JSON.stringify(u2).includes('CNC'),
  'der geschriebene Inhalt des Nachweises gehört nicht in die Übersicht des Trägers');
assert.equal(u2.open,3,'ein begonnener Entwurf ist noch nicht eingereicht und bleibt offen');

// ---------------------------------------------------------------------------
// 3. Wer keine Klassenverwaltung hat, eröffnet nichts und sieht die Übersicht nicht.
// ---------------------------------------------------------------------------
await assert.rejects(()=>openReportBookPeriodsForCourse(env,teilnehmer('usr_a'),T,'crs_h',{period_start:VON,period_end:BIS}),
  /FORBIDDEN_EDUCATION_MANAGE/,'eine teilnehmende Person darf keine Zeiträume für andere eröffnen');
await assert.rejects(()=>reportBookCoverageForCourse(env,teilnehmer('usr_a'),T,'crs_h',{}),
  /FORBIDDEN_EDUCATION_MANAGE/,'und die Übersicht über alle anderen nicht sehen');

// ---------------------------------------------------------------------------
// 4. Ein unmöglicher Zeitraum wird abgewiesen, nicht zurechtgebogen.
// ---------------------------------------------------------------------------
await assert.rejects(()=>openReportBookPeriodsForCourse(env,leitung,T,'crs_h',{period_start:BIS,period_end:VON}),
  /REPORT_BOOK_PERIOD_INVALID/,'ein Ende vor dem Beginn muss abgewiesen werden');
await assert.rejects(()=>openReportBookPeriodsForCourse(env,leitung,T,'crs_h',{period_start:'',period_end:BIS}),
  /REPORT_BOOK_PERIOD_INVALID/);

// ---------------------------------------------------------------------------
// 5. Die Oberfläche bietet es an - und verspricht dabei nichts Falsches.
// ---------------------------------------------------------------------------
const ui=await readFile('public/education-operations-extended-ui.js','utf8');
assert.match(ui,/report-book\/periods\/open-course/,'die Oberfläche muss den Sammellauf aufrufen');
assert.match(ui,/report-book\/coverage/,'und anschließend die Übersicht zeigen');
assert.match(ui,/nur leere Zeiträume/i,'dem Kunden muss gesagt werden, dass keine Einträge entstehen');
// Scheitert die Klassenliste, muss das dastehen. Ein leeres Auswahlfeld ohne Erklärung ist
// genau das Bild, das schon einmal für "da ist nichts" gehalten wurde.
assert.match(ui,/Klassenliste konnte nicht geladen werden/,'ein Fehler beim Laden der Klassen muss sichtbar sein');
assert.match(ui,/noch keine Klassen angelegt/,'und eine leere Liste muss als solche benannt werden');
// Der Grund muss wirklich aus dem Fehler kommen - eine leere Zuweisung im catch wäre
// dasselbe Verschlucken mit mehr Zeilen.
const holen=ui.slice(ui.indexOf('async function ensureCourses('),ui.indexOf('async function openExt('));
assert.ok(holen,'die gemeinsame Klassenliste muss auffindbar bleiben');
assert.match(holen,/catch\([a-z]+\)\{[^}]*kursFehler=\([^}]*(KP_ERROR_TEXT|\.message)/,
  'der Grund des Fehlers muss festgehalten werden, nicht nur eine leere Zeichenkette');
assert.ok(!/\/api\/courses',t\)\)?\.catch\(\(\)=>/.test(ui),'keine Stelle darf den Fehler der Klassenliste wegwerfen');
const karte=ui.slice(ui.indexOf('async function eroeffneZeitraeume('),ui.indexOf('async function renderReportbooks('));
assert.ok(!/\/submit|\/review|\/entries/.test(karte),
  'aus dem Sammellauf heraus darf weder geschrieben noch eingereicht noch geprüft werden');
for(const stand of ['missing','draft','submitted','approved'])
  assert.match(ui,new RegExp(`${stand}:'[^']+'`),`der Zustand ${stand} muss im Klartext erklärt werden`);

console.log('reportbook-course-batch: ok');
