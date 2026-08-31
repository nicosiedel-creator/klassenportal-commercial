import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { previewTimetable } from '../dist/core/timetable.js';

// Ein Bildungstraeger laedt seinen Stundenplan hoch, wie sein Vorsystem ihn exportiert. Die
// Datei nennt ihren Kurs dreifach: course_id (die eigene Kennung des Kunden), course_code und
// course_external_id. Die Spaltenerkennung nahm die erste passende Spalte - und das war
// course_id. Dem Portal sagt "CRS-001" nichts, also scheiterte jede einzelne Zeile an
// "Klasse/Kurs konnte nicht eindeutig zugeordnet werden". Fuer den Kunden sah das aus, als
// werde sein Stundenplan gar nicht erkannt.
//
// Genau die Kopfzeile und zwei Zeilen aus 07_Stundenplan.csv des Abnahmepakets.
const STUNDENPLAN=`event_id,external_id,parent_external_id,course_id,course_code,course_external_id,date,week,weekday,start_time,end_time,room_external_id,location_external_id,instructor_external_id,session_type,topic,status,change_version
EV-001-01-1,EXT-EV-001-01-1,EXT-ADM-26-01,CRS-001,ADM-26-01,EXT-ADM-26-01,2026-09-07,1,Monday,08:15,11:30,ROOM-BM-B201,LOC-BER-MITTE,EMP-001,Unterricht,Regelunterricht Verwaltungsgrundlagen A,geplant,1
EV-001-01-2,EXT-EV-001-01-2,EXT-ADM-26-01,CRS-001,ADM-26-01,EXT-ADM-26-01,2026-09-08,1,Tuesday,08:15,11:30,ROOM-BM-B201,LOC-BER-MITTE,EMP-001,Unterricht,Regelunterricht Verwaltungsgrundlagen A,geplant,1
`;

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_plan',U='usr_plan',TS=new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','MBA','mba','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_plan','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_adm','${T}',NULL,'Verwaltungsgrundlagen A','ADM-26-01','login',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_pfl','${T}',NULL,'Pflegehelfer Abendkurs','PFL-26-02','login',1,'${TS}','${TS}');
`);
const env={DB:d1(db)};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};

// Der Weg ist derselbe wie in der Oberflaeche: eine hochgeladene Datei.
const upload=async text=>{const form=new FormData();form.append('file',new Blob([text],{type:'text/csv'}),'07_Stundenplan.csv');
  return previewTimetable(env,auth,T,new Request('https://portal.example.invalid/api/timetable/preview',{method:'POST',body:form}));};
const preview=await upload(STUNDENPLAN);
const issues=preview.issues||[];
assert.equal(preview.rowsSeen,2,'beide Zeilen muessen gelesen werden');
assert.equal(preview.rowsValid,2,
  `beide Zeilen muessen der Klasse zugeordnet werden, gemeldet: ${JSON.stringify(issues.slice(0,3))}`);
assert.equal(issues.filter(x=>x.field==='course').length,0,'keine Zeile darf an der Klassenzuordnung scheitern');
assert.deepEqual([...new Set((preview.sample||[]).map(x=>x.klasse))],['Verwaltungsgrundlagen A'],
  'beide Zeilen muessen bei der Klasse landen, die ihr Kurscode nennt');

// Die entscheidende Stelle: nicht course_id des Kunden, sondern der Kurscode entscheidet.
assert.notEqual(preview.mapping?.course,'course_id',
  'die eigene Kennung des Kunden darf nicht die Kursspalte sein - sie sagt dem Portal nichts');
assert.equal(preview.mapping?.course,'course_code');
for(const key of ['date','start','end'])assert.ok(preview.mapping?.[key],`${key} muss erkannt werden`);

// Und der zweite Fall: die Datei fuehrt keinen Kurscode, sondern eine externe Kennung, die dem
// Portal nichts sagt - daneben aber den Klassennamen. Die Spaltenzuordnung faellt dann auf die
// externe Kennung, und nur der Rueckfall je Zeile rettet den Import.
const MIT_NAMEN=`course_external_id,klasse,date,start_time,end_time
EXT-ADM-26-01,Verwaltungsgrundlagen A,2026-09-07,08:15,11:30
EXT-ADM-26-01,Verwaltungsgrundlagen A,2026-09-08,08:15,11:30
`;
const zweite=await upload(MIT_NAMEN);
assert.equal(zweite.mapping?.course,'course_external_id',
  'die Zuordnung faellt hier auf die externe Kennung - genau dann muss der Rueckfall greifen');
assert.equal(zweite.rowsValid,2,
  `der Klassenname derselben Zeile muss die Zuordnung retten, gemeldet: ${JSON.stringify((zweite.issues||[]).slice(0,2))}`);
assert.deepEqual([...new Set((zweite.sample||[]).map(x=>x.klasse))],['Verwaltungsgrundlagen A'],
  'der Rueckfall darf nicht irgendeine, sondern nur die genannte Klasse treffen');

// Und der dritte Fall: eine Zeile nennt mehrere Kursspalten, und die unbrauchbarste steht zuerst.
// Hier traegt kurs_id ausgerechnet den Code der falschen Klasse. Entschiede die Spaltenfolge der
// Datei, landete der Stundenplan stillschweigend beim Pflegekurs. Es entscheidet die Rangfolge.
const VERWECHSLUNGSGEFAHR=`course_external_id,kurs_id,klasse,date,start_time,end_time
EXT-ADM-26-01,PFL-26-02,Verwaltungsgrundlagen A,2026-09-07,08:15,11:30
`;
const dritte=await upload(VERWECHSLUNGSGEFAHR);
assert.equal(dritte.mapping?.course,'course_external_id','die Zuordnung faellt auch hier auf die externe Kennung');
assert.equal(dritte.rowsValid,1,`die Zeile muss zugeordnet werden, gemeldet: ${JSON.stringify((dritte.issues||[]).slice(0,2))}`);
assert.equal(dritte.sample?.[0]?.klasse,'Verwaltungsgrundlagen A',
  `der Klassenname der Zeile muss die falsch benannte Kennung schlagen, zugeordnet wurde: ${dritte.sample?.[0]?.klasse}`);

// Vierter Fall: keine Spalte heisst exakt wie eine bekannte Bezeichnung, es greift also die
// unscharfe Erkennung. Auch sie muss der Rangfolge folgen. "kurs_id_intern" steht zuerst und
// passt unscharf auf "kurs_id"; "kurscode_extern" passt unscharf auf "kurscode" und ist die
// brauchbare Spalte. Der zeilenweise Rueckfall traegt hier nicht - er verlangt einen exakten
// Spaltennamen -, also entscheidet allein die Rangfolge der Erkennung.
const NUR_UNSCHARF=`kurs_id_intern,kurscode_extern,date,start_time,end_time
CRS-001,ADM-26-01,2026-09-07,08:15,11:30
`;
const vierte=await upload(NUR_UNSCHARF);
assert.equal(vierte.mapping?.course,'kurscode_extern',
  `die unscharfe Erkennung muss der Rangfolge folgen, gewaehlt wurde: ${vierte.mapping?.course}`);
assert.equal(vierte.rowsValid,1,
  `die Zeile muss zugeordnet werden, gemeldet: ${JSON.stringify((vierte.issues||[]).slice(0,2))}`);
assert.equal(vierte.sample?.[0]?.klasse,'Verwaltungsgrundlagen A','und zwar der Klasse ihres Kurscodes');

console.log(`Ein exportierter Stundenplan mit drei Kursspalten wird der richtigen Klasse zugeordnet: ${preview.rowsValid} von ${preview.rowsSeen} Zeilen: OK`);
