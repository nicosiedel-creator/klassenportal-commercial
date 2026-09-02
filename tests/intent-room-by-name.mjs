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

console.log('intent-room-by-name: ok');
