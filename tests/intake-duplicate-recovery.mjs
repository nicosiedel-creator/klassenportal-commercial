import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { handleIntakePublicUpload } from '../dist/core/intake-center.js';

// Gemessen bei einem Kunden in Produktion: drei Stundenplan-Dateien standen im Prüf-Cockpit als
//
//   07_Stundenplan.csv    113 KB · failed · DUPLICATE_DOCUMENT
//   07_Stundenplan.xlsx    41 KB · failed · DUPLICATE_DOCUMENT
//   08_Stundenplan_PDF.pdf 47 KB · failed · DUPLICATE_DOCUMENT
//
// und ließen sich nicht mehr hochladen - dauerhaft.
//
// Ursache: die Doppel-Prüfung verglich gegen JEDE frühere Zeile mit demselben Inhalt, auch gegen
// ihre eigenen Absagen. Eine abgewiesene Datei wird als Zeile mit 'failed'/DUPLICATE_DOCUMENT
// gespeichert; beim nächsten Versuch fand die Prüfung genau diese Zeile und wies wieder ab. Ab
// dem ersten Fehlschlag war dieselbe Datei für immer gesperrt, und jeder Versuch legte eine
// weitere Sperrzeile an.
//
// Dieser Test führt den ausgelieferten Upload aus.

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_dup',U='usr_dup',TS=new Date().toISOString();
const ABLAUF=new Date(Date.now()+7*86400000).toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Träger','tdup','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_dup','${T}',NULL,'${U}','tenant_admin','${TS}');
`);

// Der abgelegte Inhalt landet hier statt in R2.
const r2=new Map();
const env={DB:d1(db),
  FILES:{put:async(k,v)=>{r2.set(k,v);return{};},delete:async k=>{r2.delete(k);}},
  ASSETS:{fetch:async()=>new Response('x',{status:404})}};

// Ein Upload-Link, wie ihn die Kundenoberfläche anlegt.
const { sha256Text }=await import('../dist/core/utils.js');
const TOKEN='upload-token-fuer-den-test';
db.prepare(`INSERT INTO intake_upload_links(id,tenant_id,course_id,org_unit_id,label,token_hash,max_uploads,upload_count,expires_at,revoked_at,created_by,created_at)
  VALUES(?,?,NULL,NULL,?,?,?,0,?,NULL,?,?)`)
  .run('inl_1',T,'Test',await sha256Text(TOKEN),200,ABLAUF,U,TS);

const CSV='Datum;Beginn;Ende;Kurscode\n10.09.2026;08:15;11:30;VFA-26-A\n';
const hochladen=async(dateiname,inhalt)=>{
  const form=new FormData();
  form.append('files',new File([inhalt],dateiname,{type:'text/csv'}));
  return handleIntakePublicUpload(env,TOKEN,new Request('https://portal.example.invalid/x',{method:'POST',body:form}));
};
const zustand=()=>db.prepare('SELECT filename,extraction_state,error_code,r2_key FROM intake_documents ORDER BY created_at,id').all();

// ---------------------------------------------------------------------------------------------
// 1. Der erste Einwurf gelingt und legt den Inhalt ab.
// ---------------------------------------------------------------------------------------------
await hochladen('07_Stundenplan.csv',CSV);
let alle=zustand();
assert.equal(alle.length,1,`nach dem ersten Einwurf genau ein Dokument, gefunden: ${JSON.stringify(alle)}`);
assert.ok(alle[0].r2_key,'der Inhalt muss abgelegt sein');
assert.notEqual(alle[0].error_code,'DUPLICATE_DOCUMENT','der erste Einwurf ist kein Doppel');

// ---------------------------------------------------------------------------------------------
// 2. Derselbe Inhalt ein zweites Mal: zu Recht als Doppel abgewiesen, solange das Original liegt.
// ---------------------------------------------------------------------------------------------
await hochladen('07_Stundenplan.csv',CSV);
alle=zustand();
assert.equal(alle.length,2);
assert.equal(alle[1].error_code,'DUPLICATE_DOCUMENT','der zweite Einwurf desselben Inhalts ist ein Doppel');
assert.equal(alle[1].r2_key,null,'eine Absage legt keinen Inhalt ab');

// ---------------------------------------------------------------------------------------------
// 3. Das Original wird gelöscht - und jetzt muss derselbe Inhalt WIEDER hochladbar sein.
//    Vorher zählte die Prüfung ihre eigene Absage aus Schritt 2 als Original und wies für immer
//    ab. Genau hier saß der Kunde fest.
// ---------------------------------------------------------------------------------------------
db.prepare("UPDATE intake_documents SET r2_key=NULL,extraction_state='purged' WHERE r2_key IS NOT NULL").run();
await hochladen('07_Stundenplan.csv',CSV);
alle=zustand();
const letzte=alle[alle.length-1];
assert.notEqual(letzte.error_code,'DUPLICATE_DOCUMENT',
  `nach dem Löschen des Originals muss derselbe Inhalt wieder hochladbar sein, war: ${JSON.stringify(letzte)}`);
assert.ok(letzte.r2_key,'und der Inhalt muss wieder abgelegt werden');

// ---------------------------------------------------------------------------------------------
// 4. Eine Absage allein sperrt nichts mehr: auch nach mehreren Fehlversuchen geht es weiter,
//    sobald kein Original mehr liegt.
// ---------------------------------------------------------------------------------------------
db.prepare("UPDATE intake_documents SET r2_key=NULL,extraction_state='purged' WHERE r2_key IS NOT NULL").run();
for(let i=0;i<3;i++)await hochladen('07_Stundenplan.csv',CSV);
const nachDrei=zustand();
const gesperrt=nachDrei.slice(-3).filter(d=>d.error_code==='DUPLICATE_DOCUMENT').length;
assert.ok(gesperrt<3,
  `drei Versuche dürfen nicht alle abgewiesen werden, abgewiesen: ${gesperrt} - genau so entstand die Dauersperre`);

// ---------------------------------------------------------------------------------------------
// 5. Und eine nicht lesbare Datei sperrt sich nicht selbst aus: wird das Format später
//    unterstützt - wie Kalender und E-Mails seit kurzem -, muss derselbe Inhalt erneut
//    eingeworfen werden können.
// ---------------------------------------------------------------------------------------------
db.exec("DELETE FROM intake_documents");
db.prepare(`INSERT INTO intake_documents(id,batch_id,tenant_id,filename,content_type,size_bytes,sha256,r2_key,extraction_state,error_code,created_at,expires_at)
  SELECT 'ind_alt',b.id,?,?,?,?,?,NULL,'unsupported','UNSUPPORTED_DOCUMENT',?,? FROM intake_batches b LIMIT 1`)
  .run(T,'12_Kalender.ics','text/calendar',10,await sha256Text('egal'),TS,ABLAUF);
const vorher=db.prepare('SELECT COUNT(*) n FROM intake_documents').get().n;
await hochladen('12_Kalender.ics',CSV);
const neu=zustand()[db.prepare('SELECT COUNT(*) n FROM intake_documents').get().n-1];
assert.notEqual(neu.error_code,'DUPLICATE_DOCUMENT',
  'eine früher nicht lesbare Datei darf einen späteren Einwurf nicht sperren');
void vorher;

console.log('intake-duplicate-recovery: ok');
