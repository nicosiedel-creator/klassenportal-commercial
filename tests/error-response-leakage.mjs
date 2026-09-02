import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import worker from '../dist/index.js';
import { sha256Text } from '../dist/core/utils.js';

// Vorgabe für dieses Portal: eine Fehlermeldung an den Kunden darf kein SQL enthalten, keinen
// Stacktrace, kein Geheimnis, keine unnötige interne Kennung, keine Cloudflare-Interna und keinen
// Token.
//
// Geprüft wurde das bisher fast nur durch Lesen: api-error-contract.mjs durchsucht den Quelltext
// der Router nach Mustern. Ausgeführt wird davon nichts. Ob eine kaputte Anfrage auf einer echten
// Route wirklich eine harmlose Auskunft zurückgibt, hat so niemand gemessen.
//
// Dieser Test provoziert echte Fehler durch den ausgelieferten Worker-Eingang und liest jede
// Antwort gegen. Er ist bewusst breit angelegt: er soll nicht eine Stelle belegen, sondern eine
// Zusage über die ganze Oberfläche.

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const TS=new Date().toISOString(),ABLAUF=new Date(Date.now()+3600_000).toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('ten_e','Hellersdorfer Bildungs gGmbH','hbg-e','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_e','kunde@example.invalid','Kunde','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_e','ten_e',NULL,'usr_e','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_e','ten_e',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
INSERT INTO production_release_approvals(version_id,version_tag,version_timestamp,app_origin,approved_by,approved_at,readiness_json)
  VALUES('v-test','test','${TS}','https://portal.example.invalid','usr_e','${TS}','{}');
`);
db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)')
  .run(await sha256Text('token-kunde'),'usr_e',ABLAUF,TS,TS);

const env={DB:d1(db),APP_ORIGIN:'https://portal.example.invalid',
  CF_VERSION_METADATA:{id:'v-test',tag:'test',timestamp:TS},
  STRIPE_SECRET_KEY:'sk_test_GEHEIMNIS_DARF_NIE_ERSCHEINEN',
  STRIPE_WEBHOOK_SECRET:'whsec_GEHEIMNIS_DARF_NIE_ERSCHEINEN',
  ASSETS:{fetch:async()=>new Response('nicht gefunden',{status:404})}};

// Was in keiner Antwort stehen darf. Jedes Muster steht für eine Auskunft, die den Kunden nichts
// angeht und einem Angreifer hilft.
const VERBOTEN=[
  [/\bSELECT\b\s+.*\bFROM\b/i,'SQL-Abfrage'],
  [/\b(INSERT INTO|UPDATE\s+\w+\s+SET|DELETE FROM|CREATE TABLE|ALTER TABLE)\b/i,'SQL-Anweisung'],
  [/D1_ERROR|SQLITE_[A-Z]+|no such (table|column)/i,'Datenbankmeldung'],
  [/\bat\s+\w+\s+\(.*:\d+:\d+\)|\bat\s+async\s+\w+|node:internal/i,'Stacktrace'],
  [/sk_test_|sk_live_|whsec_|GEHEIMNIS_DARF_NIE_ERSCHEINEN/,'Geheimnis'],
  [/\bcloudflare\b|\bworkerd\b|\bwrangler\b|\.workers\.dev/i,'Cloudflare-Interna'],
  [/token-kunde|kp_session=/,'Token'],
  [/\/home\/|\/usr\/local\/|file:\/\//,'Dateipfad des Servers'],
];

const antwort=async(pfad,{methode='GET',cookie,koerper,typ='application/json'}={})=>{
  const r=await worker.fetch(new Request('https://portal.example.invalid'+pfad,{
    method:methode,headers:{'content-type':typ,origin:'https://portal.example.invalid',
      referer:'https://portal.example.invalid/kunden-admin',...(cookie?{cookie}:{})},
    ...(methode==='GET'||methode==='HEAD'?{}:{body:koerper??'{}'})}),env);
  return{status:r.status,text:await r.text(),pfad,methode};
};
const KUNDE='kp_session=token-kunde';

// Kaputte, bösartige und unsinnige Anfragen auf echten Routen.
const VERSUCHE=[
  ['/api/courses',{methode:'POST',cookie:KUNDE,koerper:'{'}],
  ['/api/courses',{methode:'POST',cookie:KUNDE,koerper:'null'}],
  ['/api/courses',{methode:'POST',cookie:KUNDE,koerper:JSON.stringify({name:"'; DROP TABLE courses;--",code:"a'b"})}],
  ['/api/courses',{methode:'POST',cookie:KUNDE,koerper:JSON.stringify({tenant_id:'ten_fremd',name:'x'})}],
  ['/api/courses?tenant_id=ten_fremd',{cookie:KUNDE}],
  ['/api/courses?tenant_id=%27%20OR%201%3D1--',{cookie:KUNDE}],
  ['/api/users?tenant_id=ten_e&course_id=crs_gibtesnicht',{cookie:KUNDE}],
  ['/api/auth/login',{methode:'POST',koerper:'nicht mal json'}],
  ['/api/auth/login',{methode:'POST',koerper:JSON.stringify({email:{},password:[]})}],
  ['/api/auth/me',{cookie:'kp_session=voellig-erfunden'}],
  ['/api/platform/offers',{methode:'POST',cookie:KUNDE,koerper:'{}'}],
  ['/api/enterprise/intake/batches?tenant_id=ten_e',{cookie:KUNDE}],
  ['/api/gibtesnicht',{cookie:KUNDE}],
  ['/api/courses/../../etc/passwd',{cookie:KUNDE}],
  ['/api/payments/checkout-status?session_id=cs_test_x',{cookie:KUNDE}],
  ['/api/courses',{methode:'POST',cookie:KUNDE,koerper:'x'.repeat(200000)}],
  ['/api/courses',{methode:'POST',cookie:KUNDE,koerper:'{}',typ:'text/plain'}],
];

const antworten=[];
for(const [pfad,opt] of VERSUCHE)antworten.push(await antwort(pfad,opt));

// ---------------------------------------------------------------------------------------------
// 1. Keine Antwort verrät etwas, das den Kunden nichts angeht.
// ---------------------------------------------------------------------------------------------
for(const a of antworten)
  for(const [muster,was] of VERBOTEN)
    assert.ok(!muster.test(a.text),
      `${was} in der Antwort auf ${a.methode} ${a.pfad}: ${a.text.slice(0,240)}`);

// ---------------------------------------------------------------------------------------------
// 2. Und die Antworten sind trotzdem brauchbar: ein benannter Code statt eines leeren 500ers.
//    Eine Zusage "nichts steht drin" wäre wertlos, wenn schlicht nichts drinstünde.
// ---------------------------------------------------------------------------------------------
const mitCode=antworten.filter(a=>{try{const j=JSON.parse(a.text);return j&&j.ok===false&&typeof j.error==='string'&&/^[A-Z][A-Z0-9_]{2,80}$/.test(j.error);}catch{return false;}});
assert.ok(mitCode.length>=10,
  `die meisten Fehlerantworten müssen einen benannten Code tragen, gefunden: ${mitCode.length} von ${antworten.length}`);
const serverfehler=antworten.filter(a=>a.status>=500&&a.status!==503);
assert.equal(serverfehler.length,0,
  `keine dieser Anfragen darf einen Serverfehler auslösen: ${JSON.stringify(serverfehler.map(a=>[a.methode,a.pfad,a.status,a.text.slice(0,80)]))}`);

// ---------------------------------------------------------------------------------------------
// 2b. Der gefundene Fehler, ausdrücklich: ein kaputter Anfragekörper ist ein Fehler des
//     Aufrufers. Die Anmeldung antwortete darauf mit 500 - bei ungültigem JSON, bei leerem Körper
//     und bei "null" -, und das ohne jede Anmeldung, beliebig oft auslösbar.
// ---------------------------------------------------------------------------------------------
for(const [was,koerper] of [['ungültiges JSON','nicht mal json'],['leerer Körper',''],
                            ['null','null'],['Array','[]'],['falsche Typen','{"email":{},"password":[]}']]){
  const r=await antwort('/api/auth/login',{methode:'POST',koerper});
  assert.equal(r.status,400,
    `ein kaputter Anfragekörper (${was}) ist ein Fehler des Aufrufers, nicht des Portals - war: ${r.status} ${r.text.slice(0,120)}`);
  assert.equal(JSON.parse(r.text).error,'EMAIL_PASSWORD_REQUIRED',
    `und muss benannt beantwortet werden, war: ${r.text.slice(0,120)}`);
}
// Dasselbe für das Passwortändern - dieselbe Stelle, derselbe Rückfall.
const wechsel=await antwort('/api/auth/change-password',{methode:'POST',cookie:KUNDE,koerper:'kaputt'});
assert.notEqual(wechsel.status,500,
  `auch das Passwortändern darf an einem kaputten Körper nicht mit 500 antworten, war: ${wechsel.status} ${wechsel.text.slice(0,120)}`);

// ---------------------------------------------------------------------------------------------
// 3. Der Rückfall selbst: eine rohe Datenbankmeldung wird zu INTERNAL_ERROR, ein benannter Code
//    bleibt erhalten. Genau daran hing der Angebotsversand, der die CHECK-Bedingung durchreichte.
// ---------------------------------------------------------------------------------------------
const { safeErrorCode }=await import('../dist/core/utils.js');
const roh="D1_ERROR: CHECK constraint failed: event_type IN ('created','published') : SQLITE_CONSTRAINT";
assert.equal(safeErrorCode(new Error(roh)),'INTERNAL_ERROR','eine rohe Datenbankmeldung darf nicht durchgereicht werden');
assert.equal(safeErrorCode(new Error('COURSE_NOT_RESOLVED')),'COURSE_NOT_RESOLVED','ein benannter Code muss erhalten bleiben');
for(const gefaehrlich of ['SELECT * FROM users','at foo (/home/user/x.js:1:2)','sk_test_abc',
  'Error: connect ECONNREFUSED 10.0.0.1:5432','TypeError: Cannot read properties of undefined'])
  assert.equal(safeErrorCode(new Error(gefaehrlich)),'INTERNAL_ERROR',
    `"${gefaehrlich}" darf nicht als Code durchgehen`);
// Ein Code mit Kleinbuchstaben oder Leerzeichen ist kein Code, sondern ein Satz.
for(const kein of ['Nicht gefunden','course_not_found','A B C','X'])
  assert.equal(safeErrorCode(new Error(kein)),'INTERNAL_ERROR',
    `"${kein}" ist kein benannter Code und darf nicht durchgehen`);

console.log('error-response-leakage: ok');
