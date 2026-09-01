import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import worker from '../dist/index.js';
import { hashPassword } from '../dist/core/auth.js';

// Der Schutz gegen das Durchprobieren von Passwörtern: fünf Fehlversuche je IP und E-Mail
// innerhalb von 15 Minuten, danach ist zu.
//
// Geprüft wurde das bisher nur, indem eine Prüfung den Quelltext des Routers nach
// "LOGIN_RATE_LIMITED'?429" durchsuchte. Ob nach fünf Fehlversuchen wirklich gesperrt wird - und
// vor allem, ob dann auch das RICHTIGE Passwort abgewiesen wird -, hat nie jemand ausgeführt.
// Liefe die Drosselung erst nach der Passwortprüfung, wäre sie wertlos: der Treffer beim sechsten
// Versuch käme durch.
//
// Dieser Test schickt echte Anmeldeversuche durch den ausgelieferten Worker-Eingang.

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const TS=new Date().toISOString();
const RICHTIG='Hellersdorf!Portal-2026';
const hash=await hashPassword(RICHTIG);
db.exec(`INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('ten_r','Hellersdorfer Bildungs gGmbH','hbg-r','active','${TS}','${TS}');`);
for(const [id,mail] of [['usr_a','sarah@example.invalid'],['usr_b','thomas@example.invalid']]){
  db.prepare(`INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES(?,?,?,?,0,0,'active',?,?)`)
    .run(id,mail,'Person',hash,TS,TS);
  db.prepare(`INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES(?,'ten_r',NULL,?,'tenant_admin',?)`)
    .run('mem_'+id,id,TS);
}

const env={DB:d1(db),APP_ORIGIN:'https://portal.example.invalid',
  ASSETS:{fetch:async()=>new Response('x',{status:404})}};
const anmelden=async(email,passwort,ip='203.0.113.7')=>{
  const r=await worker.fetch(new Request('https://portal.example.invalid/api/auth/login',{
    method:'POST',headers:{'content-type':'application/json','CF-Connecting-IP':ip,
      origin:'https://portal.example.invalid'},body:JSON.stringify({email,password:passwort})}),env);
  let j=null;try{j=await r.clone().json();}catch{}
  return{status:r.status,fehler:j?.error??null,ok:j?.ok===true};
};

// ---------------------------------------------------------------------------------------------
// 1. Fünf Fehlversuche sind erlaubt, der sechste nicht mehr.
// ---------------------------------------------------------------------------------------------
for(let i=1;i<=5;i++){
  const r=await anmelden('sarah@example.invalid','falsch-'+i);
  assert.equal(r.fehler,'LOGIN_FAILED',
    `Versuch ${i} muss als falsches Passwort abgewiesen werden, war: ${JSON.stringify(r)}`);
}
const sechster=await anmelden('sarah@example.invalid','falsch-6');
assert.equal(sechster.fehler,'LOGIN_RATE_LIMITED',
  `der sechste Versuch muss gedrosselt werden, war: ${JSON.stringify(sechster)}`);
assert.equal(sechster.status,429,
  `und mit 429 antworten, nicht mit einem Serverfehler, war: ${sechster.status}`);

// ---------------------------------------------------------------------------------------------
// 2. Der entscheidende Punkt: auch das RICHTIGE Passwort kommt jetzt nicht mehr durch. Sonst
//    wäre die Drosselung wertlos - der Treffer beim sechsten Versuch käme durch.
// ---------------------------------------------------------------------------------------------
const treffer=await anmelden('sarah@example.invalid',RICHTIG);
assert.equal(treffer.fehler,'LOGIN_RATE_LIMITED',
  `während der Sperre darf auch das richtige Passwort nicht durchkommen, war: ${JSON.stringify(treffer)}`);
assert.equal(treffer.ok,false,'und es darf keine Sitzung entstehen');
assert.equal(db.prepare('SELECT COUNT(*) n FROM sessions').get().n,0,
  'während der Sperre darf keine Sitzung angelegt werden');

// ---------------------------------------------------------------------------------------------
// 3. Die Sperre trifft genau dieses Paar aus IP und E-Mail - nicht das halbe Haus.
// ---------------------------------------------------------------------------------------------
const andereMail=await anmelden('thomas@example.invalid',RICHTIG);
assert.equal(andereMail.ok,true,
  `eine andere Person von derselben Leitung muss sich anmelden können, war: ${JSON.stringify(andereMail)}`);
const andereLeitung=await anmelden('sarah@example.invalid',RICHTIG,'198.51.100.4');
assert.equal(andereLeitung.ok,true,
  `dieselbe Person von einer anderen Leitung muss sich anmelden können, war: ${JSON.stringify(andereLeitung)}`);

// ---------------------------------------------------------------------------------------------
// 4. Eine gelungene Anmeldung setzt den Zähler zurück - sonst sperrte sich aus, wer sich
//    fünfmal vertippt und dann richtig anmeldet.
// ---------------------------------------------------------------------------------------------
db.exec("DELETE FROM login_attempts");
for(let i=1;i<=4;i++)await anmelden('sarah@example.invalid','falsch-'+i);
assert.equal((await anmelden('sarah@example.invalid',RICHTIG)).ok,true,
  'vier Fehlversuche dürfen die richtige Anmeldung nicht verhindern');
assert.equal(db.prepare('SELECT COUNT(*) n FROM login_attempts').get().n,0,
  'eine gelungene Anmeldung muss den Zähler löschen');
for(let i=1;i<=5;i++)await anmelden('sarah@example.invalid','falsch-neu-'+i);
assert.equal((await anmelden('sarah@example.invalid',RICHTIG)).fehler,'LOGIN_RATE_LIMITED',
  'nach dem Zurücksetzen zählt die Drosselung wieder von vorn und greift erneut');

// ---------------------------------------------------------------------------------------------
// 5. Nach dem Zeitfenster ist wieder geöffnet. Eine Sperre ohne Ende wäre eine Falle.
// ---------------------------------------------------------------------------------------------
const laengstVorbei=new Date(Date.now()-16*60_000).toISOString();
db.prepare('UPDATE login_attempts SET window_started_at=?').run(laengstVorbei);
const danach=await anmelden('sarah@example.invalid',RICHTIG);
assert.equal(danach.ok,true,
  `nach 15 Minuten muss die Anmeldung wieder möglich sein, war: ${JSON.stringify(danach)}`);

// ---------------------------------------------------------------------------------------------
// 6. Und die Auskunft verrät nichts: ein unbekanntes Konto sieht aus wie ein falsches Passwort.
// ---------------------------------------------------------------------------------------------
const unbekannt=await anmelden('gibtesnicht@example.invalid','irgendwas',  '192.0.2.55');
assert.equal(unbekannt.fehler,'LOGIN_FAILED',
  `ein unbekanntes Konto darf sich nicht verraten, war: ${JSON.stringify(unbekannt)}`);

console.log('login-rate-limit: ok');
