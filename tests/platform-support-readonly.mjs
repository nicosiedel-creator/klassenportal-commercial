import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import worker from '../dist/index.js';
import { sha256Text } from '../dist/core/utils.js';

// Das Abnahmepaket eines Bildungsträgers verlangt es:
//
//   "Plattformadmin-Support darf Kundenkontext nicht unbemerkt verändern, wenn der Supportmodus
//    read-only ist."
//
// Die Sperre sitzt im Worker-Eingang und fragt die Adresstabelle, nicht die Schreibweise:
// /KUNDEN-admin ist dieselbe Kundenoberfläche wie /kunden-admin. Genau daran war sie einmal
// vorbeigelaufen - die frühere Fassung verglich Zeichenketten.
//
// Geprüft wurde das bisher nur, indem Prüfungen den Quelltext nach dem Wort "supportPlatformAdmin"
// durchsuchten. Ob eine ändernde Anfrage wirklich abgewiesen wird, hat nie jemand ausgeführt.
//
// Dieser Test schickt echte Anfragen durch den ausgelieferten Worker-Eingang.

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const TS=new Date().toISOString(),ABLAUF=new Date(Date.now()+3600_000).toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('ten_s','Hellersdorfer Bildungs gGmbH','hbg-s','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_platt','platt@example.invalid','Plattform','x',0,1,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_kunde','kunde@example.invalid','Kunde','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_k','ten_s',NULL,'usr_kunde','tenant_admin','${TS}');
-- Das Portal ist freigegeben. Ohne diese Zeile fängt die Freigabesperre jede Kundenanfrage schon
-- vorher ab (PRODUCTION_RELEASE_LOCKED) - dann liefe die Gegenprobe unten ins Leere und wäre aus
-- dem falschen Grund grün. Genau das war sie beim ersten Anlauf.
INSERT INTO production_release_approvals(version_id,version_tag,version_timestamp,app_origin,approved_by,approved_at,readiness_json)
  VALUES('v-test','test','${TS}','https://portal.example.invalid','usr_platt','${TS}','{}');
`);
const sitzung=async(userId,token)=>{
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)')
    .run(await sha256Text(token),userId,ABLAUF,TS,TS);
  return `kp_session=${token}`;
};
const PLATTFORM=await sitzung('usr_platt','token-plattform-support');
const KUNDE=await sitzung('usr_kunde','token-kundenadmin');

const env={DB:d1(db),APP_ORIGIN:'https://portal.example.invalid',CF_VERSION_METADATA:{id:'v-test',tag:'test',timestamp:TS},
  ASSETS:{fetch:async()=>new Response('nicht gefunden',{status:404})}};
const anfrage=(pfad,{methode='POST',cookie,referer}={})=>new Request('https://portal.example.invalid'+pfad,{
  method:methode,headers:{'content-type':'application/json',...(cookie?{cookie}:{}),...(referer?{referer}:{})},
  ...(methode==='GET'||methode==='HEAD'?{}:{body:'{}'})});
const antwort=async(...a)=>{const r=await worker.fetch(anfrage(...a),env);let j=null;try{j=await r.clone().json();}catch{}return{status:r.status,fehler:j?.error??null};};

// Jede Schreibweise derselben Kundenoberfläche - genau die, an denen die frühere Fassung
// vorbeilief.
const KUNDENSEITEN=['https://portal.example.invalid/kunden-admin',
  'https://portal.example.invalid/KUNDEN-admin',
  'https://portal.example.invalid/customer-admin',
  'https://portal.example.invalid/kunden-admin.html',
  'https://portal.example.invalid/kunden-admin?tab=klassen'];

// ---------------------------------------------------------------------------------------------
// 1. Der Plattformadmin schreibt aus der Kundenoberfläche heraus: abgewiesen, egal wie die
//    Adresse geschrieben ist.
// ---------------------------------------------------------------------------------------------
for(const referer of KUNDENSEITEN){
  for(const methode of ['POST','PUT','PATCH','DELETE']){
    const r=await antwort('/api/courses',{methode,cookie:PLATTFORM,referer});
    assert.equal(r.status,403,
      `${methode} von "${referer}" muss abgewiesen werden, war: ${r.status}`);
    assert.equal(r.fehler,'SUPPORT_READ_ONLY',
      `und zwar benannt, war: ${JSON.stringify(r.fehler)}`);
  }
}

// ---------------------------------------------------------------------------------------------
// 2. Lesen bleibt erlaubt - Support ohne Einblick wäre kein Support.
// ---------------------------------------------------------------------------------------------
for(const methode of ['GET','HEAD']){
  const r=await antwort('/api/courses?tenant_id=ten_s',{methode,cookie:PLATTFORM,referer:KUNDENSEITEN[0]});
  assert.notEqual(r.status,403,`${methode} muss lesend möglich bleiben, war: ${r.status}`);
}
// Und das Abmelden bleibt möglich, sonst käme man aus der Supportansicht nicht heraus.
const abmelden=await antwort('/api/auth/logout',{cookie:PLATTFORM,referer:KUNDENSEITEN[0]});
assert.notEqual(abmelden.status,403,`das Abmelden darf nicht gesperrt sein, war: ${abmelden.status}`);

// ---------------------------------------------------------------------------------------------
// 3. Die Sperre gilt der Supportansicht, nicht dem Plattformadmin überhaupt: aus der eigenen
//    Plattformoberfläche heraus darf er schreiben.
// ---------------------------------------------------------------------------------------------
const eigene=await antwort('/api/platform/offers',{cookie:PLATTFORM,referer:'https://portal.example.invalid/plattform-admin'});
assert.notEqual(eigene.fehler,'SUPPORT_READ_ONLY',
  `aus der eigenen Plattformoberfläche darf der Plattformadmin schreiben, war: ${JSON.stringify(eigene)}`);

// ---------------------------------------------------------------------------------------------
// 4. Und sie trifft nur den Plattformadmin: der Kunden-Admin arbeitet in seinem eigenen Portal
//    normal weiter.
// ---------------------------------------------------------------------------------------------
for(const referer of KUNDENSEITEN){
  const r=await antwort('/api/courses',{cookie:KUNDE,referer});
  assert.notEqual(r.fehler,'SUPPORT_READ_ONLY',
    `der Kunden-Admin darf in seinem eigenen Portal schreiben ("${referer}"), war: ${JSON.stringify(r)}`);
  // Und die Anfrage muss die Sperre wirklich erreicht haben. Wird sie vorher abgefangen - etwa
  // von der Freigabesperre -, ist die Behauptung oben aus dem falschen Grund grün.
  assert.notEqual(r.fehler,'PRODUCTION_RELEASE_LOCKED',
    `die Gegenprobe muss die Supportsperre erreichen und darf nicht vorher enden, war: ${JSON.stringify(r)}`);
}

// ---------------------------------------------------------------------------------------------
// 5. Ohne Sitzung greift die Sperre nicht - dort greift die Anmeldung, und die ist eine andere
//    Grenze. Ein 403 mit SUPPORT_READ_ONLY wäre hier eine irreführende Auskunft.
// ---------------------------------------------------------------------------------------------
const ohne=await antwort('/api/courses',{referer:KUNDENSEITEN[0]});
assert.notEqual(ohne.fehler,'SUPPORT_READ_ONLY',
  `ohne Sitzung ist nicht die Supportsperre zuständig, war: ${JSON.stringify(ohne)}`);

console.log('platform-support-readonly: ok');
