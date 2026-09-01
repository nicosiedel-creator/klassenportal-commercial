import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { mapParticipantRows } from '../dist/core/participant-import-file.js';
import { previewParticipantImport, applyParticipantImport } from '../dist/core/participant-document-import.js';

// Gemessen im vollständigen Kundenlauf: 34 Teilnehmende im Abnahmepaket, 34 Kandidaten ohne eine
// einzige Warnung, Kurs zugeordnet, Vertrauen 100 - und am Ende 0 angelegte Personen.
//
// Der Grund ist kein Fehler, sondern Absicht: createTenantUser legt niemanden an, den es nicht
// einladen kann, und macht bei fehlgeschlagener Aktivierung alles rückgängig. Ein Konto, das
// niemand aktivieren kann, wäre schlimmer als keines.
//
// Nachweisbar war das bisher nirgends: die vorhandene Prüfung für diesen Weg liest nur Quelltext
// und führt das Anlegen nie aus. Dieser Test führt es aus - mit einem Mailweg, der die Einladung
// entgegennimmt und zählt, statt sie zu verschicken. Aus einem Testlauf geht keine Mail hinaus.

// Kopfzeile wörtlich aus 04_Teilnehmende.csv des Kunden.
const KOPF='Teilnehmer_ID;Vorname;Nachname;E-Mail;Kurscode;Status';
const ZEILEN=Array.from({length:34},(_,i)=>{
  const n=String(i+1).padStart(3,'0');
  return `T${n};Vorname${n};Nachname${n};teilnehmer.${n}@lernende.example.invalid;VFA-26-A;aktiv`;
});
// Dazu drei lückenhafte Zeilen. Zwei dürfen nicht durchgehen: ohne E-Mail gibt es keinen Zugang,
// ohne Namen keine Person. Beide gehören zur Prüfung vorgelegt, nicht angelegt.
// Die dritte - ohne Kursangabe - geht zu Recht durch: der Träger führt genau eine Klasse, die
// Zuordnung ist damit eindeutig. Gemessen, nicht angenommen.
const BEANSTANDET=[
  'T900;Ohne;Mail;;VFA-26-A;aktiv',
  'T901;;;keine.person@lernende.example.invalid;VFA-26-A;aktiv',
  'T902;Ohne;Klasse;ohne.klasse@lernende.example.invalid;;aktiv',
];
const TEILNEHMENDE=[KOPF,...ZEILEN].join('\n')+'\n';
const TEILNEHMENDE_GEMISCHT=[KOPF,...ZEILEN,...BEANSTANDET].join('\n')+'\n';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_tn',U='usr_tn',TS=new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','hbg-tn','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_tn','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_vfa','${T}',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
`);

// Der Mailweg nimmt entgegen und zählt. Nichts verlässt den Testlauf.
const versandt=[];
const mailEnv={DB:d1(db),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',
  EMAIL:{send:async m=>{versandt.push(m);return{messageId:`test-${versandt.length}`};}}};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const zeilen=mapParticipantRows(parseCsv(TEILNEHMENDE).rows);
assert.equal(zeilen.length,34,'die Datei muss 34 Zeilen liefern');

// ---------------------------------------------------------------------------------------------
// 1. Der Entwurf. 34 Personen, jede eindeutig, keine einzige Warnung.
// ---------------------------------------------------------------------------------------------
const entwurf=await previewParticipantImport(mailEnv,auth,T,{source_name:'04_Teilnehmende.csv',rows:zeilen});
assert.equal(entwurf.candidates.length,34,`34 Kandidaten erwartet, gefunden: ${entwurf.candidates.length}`);
const mitWarnung=entwurf.candidates.filter(c=>(c.warnings||[]).length);
assert.equal(mitWarnung.length,0,
  `keine dieser Zeilen darf beanstandet werden, beanstandet: ${JSON.stringify(mitWarnung.map(c=>[c.display_name,c.warnings]))}`);
assert.ok(entwurf.candidates.every(c=>c.course_id==='crs_vfa'),'jede Zeile muss ihrer Klasse zugeordnet sein');
assert.equal(entwurf.candidates[0].external_id,'T001','die Kennung des Kunden muss erhalten bleiben');

// ---------------------------------------------------------------------------------------------
// 2. Die Übernahme. Aus 34 Kandidaten müssen 34 Personen werden.
// ---------------------------------------------------------------------------------------------
const ergebnis=await applyParticipantImport(mailEnv,auth,T,{batch_id:entwurf.batch_id,digest:entwurf.digest});
const uebersprungen=ergebnis.results.filter(r=>r.action==='skipped');
assert.equal(uebersprungen.length,0,
  `keine Zeile darf übersprungen werden, übersprungen: ${JSON.stringify(uebersprungen.slice(0,3))}`);
assert.equal(db.prepare("SELECT COUNT(*) n FROM memberships WHERE tenant_id=? AND role='participant'").get(T).n,34,
  'aus 34 Zeilen müssen 34 Teilnehmende werden');
assert.equal(db.prepare('SELECT COUNT(*) n FROM tenant_users WHERE tenant_id=?').get(T).n,34,
  'jede Person muss am Träger geführt werden');
assert.equal(db.prepare("SELECT COUNT(*) n FROM tenant_users WHERE tenant_id=? AND source='import'").get(T).n,34,
  'die Herkunft "Import" muss erkennbar bleiben');
assert.equal(db.prepare("SELECT external_id FROM tenant_users WHERE tenant_id=? AND external_id='T001'").get(T)?.external_id,'T001',
  'die Teilnehmerkennung des Kunden muss an der Person stehen');
assert.equal(versandt.length,34,`jede neue Person muss eine Einladung bekommen, gezählt: ${versandt.length}`);
const empfaenger=new Set(versandt.map(m=>String(m?.to||m?.To||m?.recipient||'')).filter(Boolean));
assert.equal(empfaenger.size,34,`jede Einladung muss an genau eine eigene Adresse gehen, gefunden: ${empfaenger.size}`);
assert.ok([...empfaenger].every(a=>a.endsWith('@lernende.example.invalid')),
  'und ausschließlich an die Adressen aus der Datei - aus einem Testlauf geht nichts nach außen');

// ---------------------------------------------------------------------------------------------
// 3. Ein zweiter Einwurf derselben Datei legt niemanden doppelt an.
// ---------------------------------------------------------------------------------------------
const zweiter=await previewParticipantImport(mailEnv,auth,T,{source_name:'04_Teilnehmende.csv',rows:zeilen});
await applyParticipantImport(mailEnv,auth,T,{batch_id:zweiter.batch_id,digest:zweiter.digest});
assert.equal(db.prepare("SELECT COUNT(*) n FROM memberships WHERE tenant_id=? AND role='participant'").get(T).n,34,
  'ein zweiter Einwurf derselben Liste darf niemanden doppelt anlegen');
assert.equal(versandt.length,34,'und niemanden ein zweites Mal einladen');

// ---------------------------------------------------------------------------------------------
// 4. Fail closed: ohne Mailweg entsteht keine Person - lieber keine als eine, die niemand
//    aktivieren kann. Genau dieses Verhalten war im Browser-Prüfstand zu sehen.
// ---------------------------------------------------------------------------------------------
const db2=new DatabaseSync(':memory:');
db2.exec('PRAGMA foreign_keys=ON;');
db2.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db2.exec(await readFile(`migrations/${name}`,'utf8'));
db2.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','hbg-tn2','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_tn2','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_vfa','${T}',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
`);
const ohneMail={DB:d1(db2),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid'};
const e2=await previewParticipantImport(ohneMail,auth,T,{source_name:'04_Teilnehmende.csv',rows:zeilen});
const r2=await applyParticipantImport(ohneMail,auth,T,{batch_id:e2.batch_id,digest:e2.digest});
const abgewiesen=r2.results.filter(r=>r.action==='skipped');
assert.equal(abgewiesen.length,34,'ohne Mailweg darf keine einzige Person angelegt werden');
assert.ok(abgewiesen.every(r=>r.reason==='MAIL_PROVIDER_NOT_CONFIGURED'),
  `der Grund muss benannt sein, gefunden: ${JSON.stringify([...new Set(abgewiesen.map(r=>r.reason))])}`);
// Und es bleibt kein halbes Konto zurück. Gezählt werden Menschen - die abgeschalteten
// Dienstkonten aus den Migrationen gehören nicht dazu.
assert.equal(db2.prepare("SELECT COUNT(*) n FROM users WHERE status='active' AND email NOT LIKE '%@localhost.invalid'").get().n,1,
  'nur der Admin von vorher darf übrig bleiben');
assert.equal(db2.prepare("SELECT COUNT(*) n FROM memberships WHERE role='participant'").get().n,0,
  'auch keine Mitgliedschaft ohne Person');
assert.equal(db2.prepare('SELECT COUNT(*) n FROM tenant_users').get().n,0,
  'und niemand bleibt am Träger geführt, den es nicht gibt');

// ---------------------------------------------------------------------------------------------
// 5. Gemischte Datei: die sauberen Zeilen gehen durch, die beanstandeten werden vorgelegt.
//    Eine Datei mit drei Lücken darf nicht 34 gute Zeilen mitreißen - und die drei dürfen nicht
//    stillschweigend als Konto ohne Zugang entstehen.
// ---------------------------------------------------------------------------------------------
const db3=new DatabaseSync(':memory:');
db3.exec('PRAGMA foreign_keys=ON;');
db3.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db3.exec(await readFile(`migrations/${name}`,'utf8'));
db3.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','hbg-tn3','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_tn3','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_vfa','${T}',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
`);
const versandt3=[];
const env3={DB:d1(db3),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',
  EMAIL:{send:async m=>{versandt3.push(m);return{messageId:`t3-${versandt3.length}`};}}};
const gemischt=mapParticipantRows(parseCsv(TEILNEHMENDE_GEMISCHT).rows);
assert.equal(gemischt.length,37,'die gemischte Datei muss 37 Zeilen liefern');
const e3=await previewParticipantImport(env3,auth,T,{source_name:'gemischt.csv',rows:gemischt});
const r3=await applyParticipantImport(env3,auth,T,{batch_id:e3.batch_id,digest:e3.digest});
const durch=r3.results.filter(r=>r.action!=='skipped'),vorgelegt=r3.results.filter(r=>r.action==='skipped');
assert.equal(durch.length,35,
  `die 34 sauberen Zeilen und die eindeutig zuzuordnende müssen durchgehen, durchgegangen: ${durch.length}`);
assert.equal(vorgelegt.length,2,
  `die Zeile ohne E-Mail und die ohne Namen müssen vorgelegt werden, vorgelegt: ${vorgelegt.length}`);
assert.ok(vorgelegt.every(r=>r.reason==='REVIEW_REQUIRED'),
  `und zwar zur Prüfung, gefunden: ${JSON.stringify([...new Set(vorgelegt.map(r=>r.reason))])}`);
assert.equal(db3.prepare("SELECT COUNT(*) n FROM memberships WHERE tenant_id=? AND role='participant'").get(T).n,35,
  'genau die durchgelassenen Zeilen dürfen zu Personen werden');
assert.equal(db3.prepare("SELECT COUNT(*) n FROM users WHERE email='keine.person@lernende.example.invalid'").get().n,0,
  'aus einer Zeile ohne Namen darf kein Konto entstehen');
assert.equal(db3.prepare("SELECT COUNT(*) n FROM users WHERE display_name='Ohne Mail'").get().n,0,
  'aus einer Zeile ohne E-Mail darf kein Konto entstehen - es gäbe keinen Weg hinein');
assert.equal(db3.prepare("SELECT COUNT(*) n FROM users WHERE email='ohne.klasse@lernende.example.invalid'").get().n,1,
  'die eindeutig zuzuordnende Zeile dagegen wird angelegt');

// ---------------------------------------------------------------------------------------------
// 6. Mailausfall mitten im Anlegen: Anbieter da, Versand scheitert. Dann darf kein halbes Konto
//    zurückbleiben - kein Benutzer, keine Mitgliedschaft, niemand am Träger geführt. Sonst stünde
//    eine Person im Portal, die sich nie anmelden kann und die niemand erneut einladen würde.
// ---------------------------------------------------------------------------------------------
const db4=new DatabaseSync(':memory:');
db4.exec('PRAGMA foreign_keys=ON;');
db4.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db4.exec(await readFile(`migrations/${name}`,'utf8'));
db4.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','hbg-tn4','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_tn4','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_vfa','${T}',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
`);
const ausfall={DB:d1(db4),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',
  EMAIL:{send:async()=>{throw new Error('MAIL_TRANSPORT_UNAVAILABLE');}}};
const e4=await previewParticipantImport(ausfall,auth,T,{source_name:'04_Teilnehmende.csv',rows:zeilen});
const r4=await applyParticipantImport(ausfall,auth,T,{batch_id:e4.batch_id,digest:e4.digest});
assert.equal(r4.results.filter(r=>r.action==='skipped').length,34,
  'bei Mailausfall darf keine einzige Person angelegt werden');
assert.equal(db4.prepare("SELECT COUNT(*) n FROM users WHERE status='active' AND email NOT LIKE '%@localhost.invalid'").get().n,1,
  'kein halbes Konto darf zurückbleiben - nur der Admin von vorher');
assert.equal(db4.prepare("SELECT COUNT(*) n FROM memberships WHERE role='participant'").get().n,0,
  'und keine Mitgliedschaft ohne Person');
assert.equal(db4.prepare('SELECT COUNT(*) n FROM tenant_users').get().n,0,
  'und niemand bleibt am Träger geführt');

console.log('participant-import-apply: ok');
