// Eine ganze Teilnehmerliste muss vollständig ankommen.
//
// Gemessen: eine Person kostet rund 16 Unteranfragen - Konto suchen, Konto anlegen,
// Mandantenzuordnung, Mitgliedschaft, Einladung samt Mailversand, Nachweiszeile. Die Plattform
// lässt 1000 je Aufruf zu. Eine Liste mit 120 Personen brach damit mitten im Anlegen ab: ein Teil
// war angelegt UND eingeladen, der Rest nicht, und der Kunde sah nur einen Abbruch, ohne zu
// wissen, wer schon drin ist. Beim zweiten Versuch begann alles wieder von vorn.
//
// Dieser Test führt die Übernahme aus - gegen echtes SQLite mit dem echten Schema und einem
// Mailweg, der die Einladung entgegennimmt und zählt, statt sie zu verschicken. Aus einem
// Testlauf geht keine Mail hinaus.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1, d1MitZaehler } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { mapParticipantRows } from '../dist/core/participant-import-file.js';
import { previewParticipantImport, applyParticipantImport } from '../dist/core/participant-document-import.js';
import { continueParticipantImports, handleIntakePublicUpload } from '../dist/core/intake-center.js';
import { sha256Text } from '../dist/core/utils.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const TS=new Date().toISOString();
const zahl=(sql,...a)=>Number(Object.values(db.prepare(sql).get(...a)??{0:0})[0]||0);
const zeilen=(sql,...a)=>db.prepare(sql).all(...a);
const KOPF='Teilnehmer_ID;Vorname;Nachname;E-Mail;Kurscode;Status';
const liste=(n,praefix)=>mapParticipantRows(parseCsv([KOPF,...Array.from({length:n},(_,i)=>{
  const k=String(i+1).padStart(4,'0');
  return `${praefix}${k};Vorname${k};Nachname${k};${praefix.toLowerCase()}.${k}@lernende.example.invalid;KURS-1;aktiv`;
})].join('\n')+'\n').rows);

function mandant(T,U,kurs='crs_1'){
  db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Bildungswerk ${T}','${T}','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','${U}@example.invalid','Leitung','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_${U}','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('${kurs}','${T}',NULL,'Klasse 1','KURS-1','login',1,'${TS}','${TS}');
`);
  return{userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
}
function postfach(){
  const versandt=[];
  const send=async m=>{versandt.push(String(m.to||''));if(String(m.to||'').startsWith('kaputt.'))throw new Error('MAILBOX_UNAVAILABLE');return{messageId:`test-${versandt.length}`};};
  return{versandt,send};
}

// ---------------------------------------------------------------------------------------------
// 1. Ein Aufruf bleibt unter der Grenze - und die Liste kommt trotzdem vollständig an.
// ---------------------------------------------------------------------------------------------
const T1='ten_gross',U1='usr_gross';
const auth1=mandant(T1,U1,'crs_1');
const {DB,stand}=d1MitZaehler(db);
const post1=postfach();
let mails=0;
const env1={DB,MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',
  EMAIL:{send:async m=>{mails++;return post1.send(m);}}};
const entwurf=await previewParticipantImport(env1,auth1,T1,{source_name:'liste.csv',rows:liste(120,'A')});
assert.equal(entwurf.candidates.length,120,'die Vorschau muss alle 120 Zeilen kennen');

const GRENZE=1000;
let laeufe=0,neuGesamt=0,letzter=null;
while(laeufe<12){
  stand.abfragen=0;mails=0;laeufe++;
  letzter=await applyParticipantImport(env1,auth1,T1,{batch_id:entwurf.batch_id,digest:entwurf.digest});
  const neu=letzter.results.filter(x=>x.action==='created_invited').length;
  assert.ok(stand.abfragen+mails<GRENZE,
    `ein einzelner Aufruf muss unter der Plattformgrenze bleiben, waren: ${stand.abfragen} Abfragen und ${mails} Mails`);
  assert.ok(neu<=50,`ein Aufruf darf höchstens die gemessene Zahl anlegen, waren: ${neu}`);
  if(laeufe===1){
    assert.equal(letzter.completed,false,'nach dem ersten Aufruf muss der Rest ausdrücklich offen sein');
    assert.equal(letzter.remaining,70,`70 von 120 müssen offen bleiben, gemeldet: ${letzter.remaining}`);
    assert.equal(zahl(`SELECT COUNT(*) FROM participant_import_batches WHERE id=? AND status='preview'`,entwurf.batch_id),1,
      'solange etwas offen ist, darf die Übernahme nicht als erledigt gelten');
  }
  if(laeufe===2)assert.equal(letzter.results.filter(x=>x.action==='already_applied').length,50,
    'der zweite Aufruf darf die bereits angelegten Personen nicht erneut anfassen');
  neuGesamt+=neu;
  if(letzter.completed)break;
}
assert.equal(letzter.completed,true,`die Übernahme muss ein Ende finden, war nach ${laeufe} Aufrufen offen`);
assert.equal(laeufe,3,`120 Personen brauchen genau drei Aufrufe, waren: ${laeufe}`);
assert.equal(neuGesamt,120,`alle 120 Personen müssen angelegt werden, waren: ${neuGesamt}`);
assert.equal(zahl(`SELECT COUNT(*) FROM memberships WHERE tenant_id=? AND role='participant'`,T1),120,
  'jede Person muss genau eine Mitgliedschaft haben');
assert.equal(zahl('SELECT COUNT(DISTINCT email) FROM participant_import_results WHERE batch_id=?',entwurf.batch_id),120,
  'jede Zeile muss genau einmal festgehalten sein');
assert.equal(post1.versandt.length,120,`jede neue Person bekommt genau eine Einladung, versandt: ${post1.versandt.length}`);
assert.equal(new Set(post1.versandt).size,120,'niemand darf zwei Einladungen bekommen');
assert.equal(zahl(`SELECT COUNT(*) FROM participant_import_batches WHERE id=? AND status='applied'`,entwurf.batch_id),1,
  'erst wenn nichts mehr offen ist, gilt die Übernahme als erledigt');

// ---------------------------------------------------------------------------------------------
// 2. Die Obergrenze aus der Anfrage darf die gemessene Grenze nur unterschreiten.
// ---------------------------------------------------------------------------------------------
const T2='ten_grenze',U2='usr_grenze';
const auth2=mandant(T2,U2,'crs_2');
const post2=postfach();
const env2={DB:d1(db),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',EMAIL:{send:post2.send}};
const entwurf2=await previewParticipantImport(env2,auth2,T2,{source_name:'liste.csv',rows:liste(80,'B')});
const gierig=await applyParticipantImport(env2,auth2,T2,{batch_id:entwurf2.batch_id,digest:entwurf2.digest,max_apply:5000});
assert.equal(gierig.results.filter(x=>x.action==='created_invited').length,50,
  'eine aus der Anfrage gewünschte höhere Obergrenze darf die gemessene Grenze nicht anheben');
const sparsam=await applyParticipantImport(env2,auth2,T2,{batch_id:entwurf2.batch_id,digest:entwurf2.digest,max_apply:10});
assert.equal(sparsam.results.filter(x=>x.action==='created_invited').length,10,
  'eine kleinere Obergrenze aus der Anfrage muss gelten');

// ---------------------------------------------------------------------------------------------
// 3. Ein Fehlschlag wird festgehalten - und nicht bei jedem Aufruf erneut versucht.
// ---------------------------------------------------------------------------------------------
const T3='ten_fehler',U3='usr_fehler';
const auth3=mandant(T3,U3,'crs_3');
const post3=postfach();
const env3={DB:d1(db),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',EMAIL:{send:post3.send}};
const kaputt=liste(3,'C');
kaputt[1].email='kaputt.001@lernende.example.invalid';
const entwurf3=await previewParticipantImport(env3,auth3,T3,{source_name:'liste.csv',rows:kaputt});
const lauf3a=await applyParticipantImport(env3,auth3,T3,{batch_id:entwurf3.batch_id,digest:entwurf3.digest});
assert.equal(lauf3a.completed,true,'drei Zeilen passen in einen Aufruf');
assert.equal(lauf3a.results.filter(x=>x.action==='skipped').length,1,'die nicht einladbare Person muss übersprungen werden');
assert.equal(zahl(`SELECT COUNT(*) FROM participant_import_results WHERE batch_id=? AND action='skipped' AND email='kaputt.001@lernende.example.invalid'`,entwurf3.batch_id),1,
  'auch das Scheitern muss festgehalten werden - sonst weiß später niemand, wer fehlt');
assert.equal(zahl(`SELECT COUNT(*) FROM users WHERE email='kaputt.001@lernende.example.invalid'`),0,
  'wer nicht eingeladen werden kann, darf auch kein Konto behalten');
const versucheVorher=post3.versandt.filter(x=>x.startsWith('kaputt.')).length;
assert.equal(versucheVorher,1,'der Versand darf genau einmal versucht worden sein');

// Ein weiterer Aufruf würde bei einer offenen Übernahme folgen. Hier ist sie erledigt - genau das
// muss der Server auch sagen, statt still noch einmal von vorn zu beginnen.
await assert.rejects(()=>applyParticipantImport(env3,auth3,T3,{batch_id:entwurf3.batch_id,digest:entwurf3.digest}),
  /PARTICIPANT_IMPORT_NOT_PENDING/,'eine erledigte Übernahme darf nicht ein zweites Mal laufen');
assert.equal(post3.versandt.filter(x=>x.startsWith('kaputt.')).length,1,
  'eine gescheiterte Zeile darf nicht bei jedem Aufruf erneut angeschrieben werden');

// ---------------------------------------------------------------------------------------------
// 4. Der automatische Eingang führt zu Ende, was ein Lauf nicht geschafft hat.
// ---------------------------------------------------------------------------------------------
const T4='ten_eingang',U4='usr_eingang';
const auth4=mandant(T4,U4,'crs_4');
const post4=postfach();
const env4={DB:d1(db),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',EMAIL:{send:post4.send}};
const entwurf4=await previewParticipantImport(env4,auth4,T4,{source_name:'liste.csv',rows:liste(60,'D')});
const spaeter=new Date(Date.now()+7200_000).toISOString();
db.exec(`INSERT INTO intake_batches(id,tenant_id,channel_id,source,source_sender,source_message_id,source_subject,sender_authenticated,default_course_id,status,participant_import_batch_id,document_count,accepted_count,skipped_count,created_at,updated_at,expires_at)
VALUES('itk_1','${T4}',NULL,'email','absender@example.invalid','m1','Teilnehmerliste',1,'crs_4','processing','${entwurf4.batch_id}',1,0,0,'${TS}','${TS}','${spaeter}');`);

let ticks=0;
while(ticks<10){
  ticks++;
  const erg=await continueParticipantImports(env4,1);
  assert.ok(erg.continued+erg.finished>0,`ein Lauf muss etwas tun, solange etwas offen ist (Tick ${ticks})`);
  const stand4=db.prepare(`SELECT status,accepted_count,skipped_count FROM intake_batches WHERE id='itk_1'`).get();
  if(stand4.status!=='processing')break;
}
const eingang=db.prepare(`SELECT status,accepted_count,skipped_count FROM intake_batches WHERE id='itk_1'`).get();
assert.equal(eingang.status,'completed',`der Eingang muss zu Ende geführt werden, war: ${eingang.status}`);
assert.equal(eingang.accepted_count,60,`alle 60 Personen müssen gezählt sein, gezählt: ${eingang.accepted_count}`);
assert.equal(eingang.skipped_count,0,'ohne Beanstandung darf nichts als übersprungen gelten');
assert.equal(zahl(`SELECT COUNT(*) FROM memberships WHERE tenant_id=? AND role='participant'`,T4),60,
  'jede Person aus dem Eingang muss ihre Mitgliedschaft haben');
assert.equal(new Set(post4.versandt).size,60,'jede Person aus dem Eingang bekommt genau eine Einladung');
assert.ok(ticks>=3,`60 Personen dürfen nicht in einem einzigen automatischen Lauf entstehen, Läufe: ${ticks}`);
assert.equal((await continueParticipantImports(env4,1)).continued,0,'ist nichts offen, darf kein Lauf mehr etwas tun');

// ---------------------------------------------------------------------------------------------
// 5. Derselbe Fall über den echten Weg: ein Einwurf mit 120 Personen, den die Automatik selbst
//    übernimmt. Auch sie darf nicht mitten im Anlegen abbrechen.
// ---------------------------------------------------------------------------------------------
const T5='ten_auto',U5='usr_auto';
const auth5=mandant(T5,U5,'crs_5');
const post5=postfach();
const r2=new Map();
const env5={DB:d1(db),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',
  EMAIL:{send:post5.send},
  FILES:{put:async(k,v)=>{r2.set(k,v);return{};},get:async k=>r2.has(k)?{arrayBuffer:async()=>r2.get(k)}:null,delete:async k=>{r2.delete(k);}},
  ASSETS:{fetch:async()=>new Response('x',{status:404})}};
const TOKEN='einwurf-token-fuer-den-test';
db.prepare(`INSERT INTO intake_upload_links(id,tenant_id,course_id,org_unit_id,label,token_hash,max_uploads,upload_count,expires_at,revoked_at,created_by,created_at)
  VALUES(?,?,NULL,NULL,?,?,?,0,?,NULL,?,?)`)
  .run('inl_auto',T5,'Test',await sha256Text(TOKEN),200,new Date(Date.now()+7*86400000).toISOString(),U5,TS);
const csv=['name,email,kurs',...Array.from({length:120},(_,i)=>{const k=String(i+1).padStart(4,'0');
  return `Vorname${k} Nachname${k},e.${k}@lernende.example.invalid,Klasse 1`;})].join('\n')+'\n';
const form=new FormData();
form.append('files',new File([csv],'teilnehmer.csv',{type:'text/csv'}));
await handleIntakePublicUpload(env5,TOKEN,new Request('https://portal.example.invalid/x',{method:'POST',body:form}));
const einwurf=db.prepare(`SELECT id,status,accepted_count,participant_import_batch_id FROM intake_batches WHERE tenant_id='${T5}' ORDER BY rowid DESC LIMIT 1`).get();
assert.ok(einwurf,'der Einwurf muss angelegt sein');
assert.ok(einwurf.participant_import_batch_id,'der Einwurf muss seinen Teilnehmerentwurf kennen');
assert.equal(einwurf.status,'processing',
  `ein Einwurf mit 120 Personen darf nach einem Lauf nicht als erledigt gelten, war: ${einwurf.status}`);
assert.ok(zahl(`SELECT COUNT(*) FROM memberships WHERE tenant_id=? AND role='participant'`,T5)>0,
  'der erste Lauf muss aber schon Personen angelegt haben');
let autoTicks=0;
while(autoTicks<12){
  autoTicks++;
  await continueParticipantImports(env5,1);
  if(db.prepare(`SELECT status FROM intake_batches WHERE id='${einwurf.id}'`).get().status!=='processing')break;
}
const fertig5=db.prepare(`SELECT status,accepted_count FROM intake_batches WHERE id='${einwurf.id}'`).get();
assert.equal(fertig5.status,'completed',`der Einwurf muss zu Ende geführt werden, war: ${fertig5.status}`);
assert.equal(zahl(`SELECT COUNT(*) FROM memberships WHERE tenant_id=? AND role='participant'`,T5),120,
  'alle 120 Personen aus dem Einwurf müssen angelegt sein');
assert.equal(fertig5.accepted_count,120,`der Einwurf muss 120 übernommene Personen zählen, zählte: ${fertig5.accepted_count}`);

// Und der geplante Lauf muss diese Fortsetzung überhaupt aufrufen - sonst bliebe ein Eingang
// dauerhaft in Arbeit stehen, ohne dass es jemand merkt.
const einstieg=await readFile('src/index.ts','utf8');
const geplant=einstieg.slice(einstieg.indexOf('async scheduled('));
assert.match(geplant.slice(0,geplant.indexOf("if(controller?.cron==='*/5")),/continueParticipantImports\(env/,
  'der Fünf-Minuten-Lauf muss offene Teilnehmerübernahmen fortsetzen');

console.log(`participant-import-scale: ok (120 in ${laeufe} Aufrufen, Eingang in ${ticks} Läufen)`);
