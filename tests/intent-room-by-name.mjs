import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { previewEducationIntent } from '../dist/core/education-intent.js';

// Gemeldet aus Produktion. Im Autopilot eingegeben:
//
//   "IT-Labor Nord 1 ist die nächsten 3 Monate gesperrt"
//
// Antwort: "Nicht eindeutig erkannt · 0 %" und "Vorgang konnte nicht eindeutig zugeordnet
// werden." Dabei führt der Mandant genau diesen Raum - er steht in derselben Oberfläche in der
// Liste der Räume.
//
// Ursache: die Szenarienerkennung verlangte wortwörtlich "raum" oder "ressource" im Satz. Ein
// Raum heißt beim Kunden aber "IT-Labor Nord 1" oder "Seminarraum B202". Wer den Raum bei seinem
// Namen nennt - also so, wie das Feld es ausdrücklich verlangt ("Verwende Namen statt technischer
// IDs") -, wurde nicht verstanden.

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_intent',U='usr_intent',TS=new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Träger','ti','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','a@example.invalid','A','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_i','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,status,created_by,created_at,updated_at) VALUES('res_it','${T}','room','IT-Labor Nord 1','ITN1','active','${U}','${TS}','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,status,created_by,created_at,updated_at) VALUES('res_b202','${T}','room','Seminarraum B202','B202','active','${U}','${TS}','${TS}');
`);
const env={DB:d1(db)};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const frage=text=>previewEducationIntent(env,auth,T,text);

// ---------------------------------------------------------------------------------------------
// 1. Der Satz des Kunden, wörtlich.
// ---------------------------------------------------------------------------------------------
const p=await frage('IT-Labor Nord 1 ist die nächsten 3 Monate gesperrt');
assert.equal(p.scenario_type,'room_outage',
  `der Satz muss als Raumsperrung erkannt werden, war: ${p.scenario_type} (${p.confidence} %)`);
assert.equal(p.resolved.resource_id,'res_it',
  `und zwar für genau diesen Raum, war: ${JSON.stringify(p.resolved)}`);
assert.ok(p.confidence>0,'eine erkannte Absicht darf nicht mit 0 % dastehen');

// Auch mit anderem Sperrwort und anderem Raum.
const p2=await frage('Seminarraum B202 ist am 10.09.2026 defekt');
assert.equal(p2.scenario_type,'room_outage');
assert.equal(p2.resolved.resource_id,'res_b202');

// ---------------------------------------------------------------------------------------------
// 2. Das Bisherige gilt weiter: wer "Raum" schreibt, wird wie immer verstanden.
// ---------------------------------------------------------------------------------------------
const p3=await frage('Der Raum ist morgen gesperrt');
assert.equal(p3.scenario_type,'room_outage','das ausdrückliche Wort "Raum" muss weiter genügen');

// ---------------------------------------------------------------------------------------------
// 3. Es wird nicht geraten. Ohne Sperrwort ist es keine Sperrung, auch wenn ein Raum vorkommt.
// ---------------------------------------------------------------------------------------------
const p4=await frage('IT-Labor Nord 1 bekommt neue Rechner');
assert.notEqual(p4.scenario_type,'room_outage',
  `ohne Sperrwort ist es keine Raumsperrung, war: ${p4.scenario_type}`);

// Und ein Sperrwort ohne bekannten Raum bleibt unerkannt, statt irgendetwas zu greifen.
const p5=await frage('Der Bahnhof ist gesperrt');
assert.notEqual(p5.scenario_type,'room_outage',
  `ein unbekannter Ort darf keine Raumsperrung auslösen, war: ${p5.scenario_type}`);

// Mehrdeutig heißt unerkannt: zwei Räume, deren Namen beide passen, werden nicht geraten.
db.prepare("INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,status,created_by,created_at,updated_at) VALUES('res_it2',?,'room','IT-Labor Nord 2','ITN2','active',?,?,?)")
  .run(T,U,TS,TS);
const p6=await frage('IT-Labor Nord ist gesperrt');
if(p6.scenario_type==='room_outage')
  assert.ok(!p6.resolved.resource_id,
    `bei zwei passenden Räumen darf keiner gewählt werden, gewählt: ${JSON.stringify(p6.resolved)}`);

// ---------------------------------------------------------------------------------------------
// 4. Eine Krankmeldung bleibt eine Krankmeldung - die neue Weiche darf nichts überschreiben.
// ---------------------------------------------------------------------------------------------
const p7=await frage('Frau Hoffmann ist morgen krank');
assert.equal(p7.scenario_type,'teacher_absence','die bestehende Erkennung darf nicht verdrängt werden');

// ---------------------------------------------------------------------------------------------
// 5. Personen und Klassen bei ihrem Namen - nicht nur Räume. Und zwei Vorgänge, die der Betrieb
//    wirklich braucht: Zeugnisse und Nachweise für eine Klasse.
// ---------------------------------------------------------------------------------------------
db.exec(`
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_vfa','${T}',NULL,'Umschulung Verwaltungsfachangestellte','VFA-26-A','login',1,'${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_lea','lea@example.invalid','Lea Becker','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_lea','${T}','crs_vfa','usr_lea','participant','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_h','${T}','Dr. Lena Hoffmann','lena@example.invalid','${TS}');
`);

// Eine Krankmeldung mit dem echten Namen der Dozentin.
const k1=await frage('Dr. Lena Hoffmann ist am 10.09.2026 krank');
assert.equal(k1.scenario_type,'teacher_absence');
assert.equal(k1.resolved.teacher_id,'tch_h',`die Dozentin muss über ihren Namen aufgelöst werden: ${JSON.stringify(k1.resolved)}`);

// Abschlusszeugnisse für eine Klasse.
const z=await frage('Erstelle die Abschlusszeugnisse für Umschulung Verwaltungsfachangestellte');
assert.equal(z.scenario_type,'certificate_batch',`Zeugnisse müssen als eigener Vorgang erkannt werden, war: ${z.scenario_type}`);
assert.equal(z.resolved.course_id,'crs_vfa','die Klasse muss über ihren Namen aufgelöst werden');
assert.equal(z.resolved.participant_count,1,'die Betroffenen müssen aus den echten Mitgliedschaften gezählt werden');
assert.ok(z.warnings.some(x=>/nur vorbereitet/i.test(x)),
  `es muss ausdrücklich stehen, dass nichts ausgestellt wird: ${JSON.stringify(z.warnings)}`);

// Berichtshefte / Tätigkeitsnachweise.
const b=await frage('Fordere die Berichtshefte für Umschulung Verwaltungsfachangestellte an');
assert.equal(b.scenario_type,'reportbook_batch',`Nachweise müssen erkannt werden, war: ${b.scenario_type}`);
assert.equal(b.resolved.document_kind,'reportbook');
assert.equal(b.resolved.course_id,'crs_vfa');
// "Tätigkeitsnachweis" ist dasselbe.
assert.equal((await frage('Tätigkeitsnachweise für Umschulung Verwaltungsfachangestellte')).scenario_type,'reportbook_batch');

// Ohne Klasse bleibt es unvollständig, statt irgendeine zu nehmen.
const ohne=await frage('Erstelle die Abschlusszeugnisse');
assert.equal(ohne.scenario_type,'certificate_batch');
assert.ok(ohne.missing.includes('course_id')||ohne.ambiguities.length,
  `ohne benannte Klasse darf keine gewählt werden: ${JSON.stringify(ohne.resolved)}`);

// ---------------------------------------------------------------------------------------------
// 6. Die Planungsvorschläge sind übernehmbar - und übernehmen in einen Entwurf, nicht in den
//    laufenden Betrieb.
// ---------------------------------------------------------------------------------------------
const ui=await readFile('public/planning-resource-ui.js','utf8');
assert.ok(/<button[^>]*data-apply-suggestion/.test(ui),'es muss eine Schaltfläche zum Übernehmen geben, nicht nur einen Selektor darauf');
assert.ok(/data-pick="teacher"[\s\S]{0,400}data-pick="room"/.test(ui),'Dozent/in und Raum müssen wählbar sein');
assert.ok(/timetable-plans\/\$\{encodeURIComponent\(planId\)\}\/entries/.test(ui),'die Auswahl muss als Planeintrag entstehen');
assert.ok(/\/validate/.test(ui),'der Entwurf muss anschließend geprüft werden');
// Veröffentlichen gibt es in dieser Oberfläche - aber nur als ausdrückliche Freigabe des Kunden,
// nie als Nebenwirkung der Übernahme eines Vorschlags. Deshalb wird nicht mehr die ganze Datei
// geprüft, sondern der Übernahmeweg selbst; ausgeführt bewiesen in tests/planning-apply-suggestion.mjs.
const rumpfVon=name=>{const a=ui.indexOf(`function ${name}(`);assert.ok(a>=0,`Funktion ${name} nicht gefunden`);
  let auf=ui.indexOf('{',a),tiefe=0,i=auf;
  for(;i<ui.length;i++){const c=ui[i];if(c==='{')tiefe++;else if(c==='}'){tiefe--;if(!tiefe)break;}}
  return ui.slice(a,i+1);};
const uebernahme=rumpfVon('bindeUebernahme');
assert.ok(uebernahme.includes('data-apply-suggestion'),'der Übernahmeweg muss auffindbar bleiben');
assert.ok(!/\/publish/.test(uebernahme),'die Übernahme eines Vorschlags darf niemals veröffentlichen');
for(const stelle of ui.split('/publish').slice(0,-1))
  assert.ok(/confirm\([\s\S]{0,400}$/.test(stelle),'veröffentlicht wird nur nach ausdrücklicher Rückfrage beim Kunden');
assert.ok(/status:'draft'/.test(ui),'ein neuer Plan entsteht als Entwurf');

// ---------------------------------------------------------------------------------------------
// Stundenplan erstellen lassen: der Kunde will planen lassen, nicht umplanen.
// ---------------------------------------------------------------------------------------------
db.exec(`
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_zeug','${T}',NULL,'Fachklasse Metall 3','FM3','login',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_elektro','${T}',NULL,'Fachklasse Elektro 1','FE1','login',1,'${TS}','${TS}');
`);
db.exec(`INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T}','crs_zeug','08:00','16:00',90,0,0,'${U}','${TS}');`);
const sp=await frage('Erstell den Stundenplan für Fachklasse Metall 3 vom 07.09.2026 bis 30.09.2026');
assert.equal(sp.scenario_type,'timetable_draft',
  `"Erstell den Stundenplan …" muss als Entwurfsauftrag erkannt werden, war: ${sp.scenario_type}`);
assert.equal(sp.resolved.course_id,'crs_zeug','die Klasse muss beim Namen erkannt werden');
assert.equal(sp.resolved.starts_on,'2026-09-07','der Zeitraum muss übernommen werden');
assert.equal(sp.resolved.ends_on,'2026-09-30');
assert.equal(sp.resolved.planned_courses,1,'es muss gezählt werden, wofür überhaupt Kursregeln hinterlegt sind');
assert.ok(sp.warnings.some(w=>/nur|ausschließlich/i.test(w)&&/Entwurf/i.test(w)),
  `es muss ausdrücklich stehen, dass nur ein Entwurf entsteht: ${JSON.stringify(sp.warnings)}`);
assert.ok(sp.warnings.some(w=>/Bestätigung/i.test(w)),'und dass erst eine Bestätigung veröffentlicht');

// Ohne hinterlegte Kursregeln wird das gesagt statt geraten.
const sp2=await frage('Erstell den Stundenplan für Fachklasse Elektro 1 vom 07.09.2026 bis 30.09.2026');
assert.equal(sp2.scenario_type,'timetable_draft');
assert.equal(sp2.resolved.course_id,'crs_elektro');
assert.equal(sp2.resolved.planned_courses,0);
assert.ok(sp2.warnings.some(w=>/Kursregeln/i.test(w)),
  `fehlende Kursregeln müssen benannt werden: ${JSON.stringify(sp2.warnings)}`);

// Umplanen bleibt Umplanen - das bestehende Szenario wird nicht verdrängt.
const sp3=await frage('Der Stundenplan für Fachklasse Metall 3 muss neu gemacht werden');
assert.equal(sp3.scenario_type,'schedule_rebalance','"neu" bleibt eine Umplanung, kein Neuentwurf');

// ---------------------------------------------------------------------------------------------
// Der Autopilot sagt, wohin es weitergeht - und verschweigt seine Warnungen nicht mehr.
// ---------------------------------------------------------------------------------------------
assert.deepEqual(sp.next_step,{key:'timetable_autofill',label:'Stundenplan automatisch entwerfen',where:'Ressourcen & Regeln'},
  `ein erkannter Vorgang muss den nächsten Schritt nennen: ${JSON.stringify(sp.next_step)}`);
const zg=await frage('Erstell die Abschlusszeugnisse für Fachklasse Metall 3');
assert.equal(zg.scenario_type,'certificate_batch');
assert.equal(zg.next_step.key,'certificate_course','Zeugnisse führen zur Vorbereitung für die ganze Klasse');
const bh=await frage('Berichtshefte für Fachklasse Metall 3 anfordern');
assert.equal(bh.scenario_type,'reportbook_batch');
assert.equal(bh.next_step.key,'reportbook_periods');
const unklar=await frage('Hallo, wie geht es dir?');
assert.equal(unklar.scenario_type,null);
assert.equal(unklar.next_step,null,'was nicht erkannt wurde, bekommt auch keinen nächsten Schritt');

// Der Absichtsweg bleibt schreibfrei - das ist die Bauart, auf der die Zusage ruht.
const intentQuelle=await readFile('src/core/education-intent.ts','utf8');
assert.deepEqual(intentQuelle.match(/\b(INSERT INTO|UPDATE\s+[a-z_]+\s+SET|DELETE FROM)\b/gi)||[],[],
  'der Absichtsweg darf weiterhin nichts schreiben');

// Die Oberfläche zeigt jetzt, was der Server sagt - vorher wurde beides verworfen.
const eoUi=await readFile('public/education-os-ui.js','utf8');
assert.match(eoUi,/\(p\.warnings\|\|\[\]\)\.map/,'die Warnungen des Servers müssen angezeigt werden');
assert.match(eoUi,/p\.next_step\?/,'der nächste Schritt muss angezeigt werden');
for(const [code,wort] of [['timetable_draft','Stundenplan entwerfen'],['certificate_batch','Zeugnisse'],['reportbook_batch','Berichtshefte']])
  assert.ok(eoUi.includes(`${code}:'`)&&eoUi.includes(wort),`das Szenario ${code} muss im Klartext stehen, nicht als Code`);
assert.match(eoUi,/FEHLT_LABEL=\{course_id:'Klasse/,'fehlende Angaben müssen im Klartext benannt werden, nicht als Feldname');

console.log('intent-room-by-name: ok');
