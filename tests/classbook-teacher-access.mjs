import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { handleCollaborationReportingApi } from '../dist/core/collaboration-reporting-router.js';
import { sha256Text } from '../dist/core/utils.js';

// Der Unterrichtsnachweis im Dozentenportal scheiterte immer mit 403: die Berichtsrouten
// verlangten pauschal das delegierte Recht reports.view, wodurch die eigene, engere
// Klassenbuchprüfung - eine nachgewiesene Dozentenzuordnung genau zu dieser Klasse - nie
// erreicht wurde. Diese Prüfung fährt den echten Router gegen das echte Migrationsschema und
// fixiert die vollständige Matrix, damit die Grenze beim Reparieren nicht aufgeht.
function d1(db){
  const bindable=v=>v===undefined||v===null?null:typeof v==='boolean'?(v?1:0):v;
  const stmt=sql=>{
    let values=[];
    const run=()=>({s:db.prepare(sql),v:values.map(bindable)});
    const api={
      bind(...args){values=args;return api;},
      async first(column){const{s,v}=run();const row=s.get(...v);if(row===undefined)return null;return column===undefined?row:row[column]??null;},
      async all(){const{s,v}=run();return{results:s.all(...v),success:true};},
      async run(){const{s,v}=run();const r=s.run(...v);return{success:true,meta:{changes:Number(r.changes||0)}};},
      async raw(){const{s,v}=run();return s.all(...v).map(row=>Object.values(row));},
    };
    return api;
  };
  return{prepare:stmt,async batch(list){const out=[];for(const item of list)out.push(await item.run());return out;}};
}

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const now='2026-08-28T06:00:00.000Z',future='2026-12-31T00:00:00.000Z';
const T='ten_book',C='crs_book';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Bildungswerk','bildungswerk','active','${now}','${now}');
INSERT INTO courses(id,tenant_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('${C}','${T}','Fachklasse','fk-01','login',1,'${now}','${now}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES
 ('usr_admin','admin@example.invalid','Admin','x',0,0,'active','${now}','${now}'),
 ('usr_teacher','teacher@example.invalid','Dozentin','x',0,0,'active','${now}','${now}'),
 ('usr_rep','rep@example.invalid','Klassensprecher','x',0,0,'active','${now}','${now}'),
 ('usr_student','student@example.invalid','Teilnehmerin','x',0,0,'active','${now}','${now}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES
 ('mem_admin','${T}',NULL,'usr_admin','tenant_admin','${now}'),
 ('mem_teacher','${T}','${C}','usr_teacher','guest','${now}'),
 ('mem_rep','${T}','${C}','usr_rep','class_admin','${now}'),
 ('mem_student','${T}','${C}','usr_student','participant','${now}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES
 ('${T}','usr_admin','active','manual','${now}','${now}'),
 ('${T}','usr_teacher','active','manual','${now}','${now}'),
 ('${T}','usr_rep','active','manual','${now}','${now}'),
 ('${T}','usr_student','active','manual','${now}','${now}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch','${T}','Dozentin','teacher@example.invalid','${now}');
INSERT INTO teacher_portal_assignments(id,tenant_id,teacher_id,user_id,course_id,auth_membership_id,status,granted_by,created_at,updated_at)
 VALUES('tpa','${T}','tch','usr_teacher','${C}','mem_teacher','active','usr_admin','${now}','${now}');
`);
const tokens={};
// Sitzungen verfallen auch im Leerlauf, deshalb die echte Uhrzeit statt des Fixture-Datums.
const issued=new Date().toISOString();
for(const user of ['usr_admin','usr_teacher','usr_rep','usr_student']){
  const raw=`token-${user}-0123456789abcdef`;
  db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at,auth_method,auth_tenant_id) VALUES(?,?,?,?,?,'password',NULL)").run(await sha256Text(raw),user,future,issued,issued);
  tokens[user]=raw;
}
const env={DB:d1(db),APP_ORIGIN:'https://portal.example.invalid'};
async function call(user,path,{method='GET',body}={}){
  const url=`https://portal.example.invalid${path}`;
  const headers={cookie:`kp_session=${tokens[user]}`,origin:'https://portal.example.invalid'};
  if(body)headers['content-type']='application/json';
  const response=await handleCollaborationReportingApi(new Request(url,{method,headers,body:body?JSON.stringify(body):undefined}),env);
  assert.ok(response,`${path} must be handled by the reporting router`);
  let data={};try{data=await response.json();}catch{}
  return{status:response.status,error:data.error,data};
}
const own=`?tenant_id=${T}&course_id=${C}`;

// Eine zugeordnete Lehrkraft erreicht das Klassenbuch ihrer eigenen Klasse.
const teacher=await call('usr_teacher',`/api/reports/classbook/profiles${own}`);
assert.equal(teacher.status,200,`an assigned teacher must reach their own classbook, got ${teacher.status}/${teacher.error}`);
assert.ok(Array.isArray(teacher.data.profiles)&&teacher.data.profiles.length,'the classbook must offer its export profiles');

// Und sonst nichts: keine mandantenweite Auswertung, kein Klassenbuch ohne Klassenbezug.
assert.equal((await call('usr_teacher',`/api/reports/definitions?tenant_id=${T}`)).error,'FORBIDDEN_DELEGATED_REPORT_ACCESS','tenant-wide reporting stays a delegated privilege');
assert.equal((await call('usr_teacher',`/api/reports/classbook/profiles?tenant_id=${T}`)).error,'FORBIDDEN_CLASSBOOK_EXPORT','without a course the classbook needs the delegated privilege too');
assert.equal((await call('usr_teacher',`/api/reports/classbook/profiles${own}`,{method:'POST',body:{name:'X',authority_type:'custom'}})).error,'TENANT_ADMIN_REQUIRED','a teacher must not write export profiles');
assert.equal((await call('usr_teacher',`/api/reports/classbook/course-profile${own}`,{method:'PUT',body:{profile_ref:'builtin:topics'}})).error,'TENANT_ADMIN_REQUIRED','a teacher must not repoint a course profile');

// Lernende bleiben draußen - der Klassensprecher zuerst, weil er sonst Mitschülerdaten sähe.
assert.equal((await call('usr_rep',`/api/reports/classbook/profiles${own}`)).error,'FORBIDDEN_CLASS_ADMIN_STUDENT_DATA','a class representative must never reach report data');
assert.equal((await call('usr_student',`/api/reports/classbook/profiles${own}`)).error,'FORBIDDEN_CLASSBOOK_EXPORT','a participant has no classbook access');

// Die Mandantenadministration behält beides.
assert.equal((await call('usr_admin',`/api/reports/classbook/profiles${own}`)).status,200);
assert.equal((await call('usr_admin',`/api/reports/definitions?tenant_id=${T}`)).status,200);

// Eine widerrufene Zuordnung schließt sofort - und zwar schon an der Tür des Routers, der für
// jeden Aufruf mit Klassenbezug eine gültige Zuordnung verlangt. Die Klassenbuchprüfung dahinter
// ist damit die zweite, nicht die einzige Schranke.
db.exec("UPDATE teacher_portal_assignments SET status='revoked' WHERE id='tpa';");
const revoked=await call('usr_teacher',`/api/reports/classbook/profiles${own}`);
assert.equal(revoked.status,403,'a revoked assignment must close the classbook again');
assert.equal(revoked.error,'FORBIDDEN_TEACHER_COURSE','a revoked assignment is refused before the classbook check');

console.log('Classbook stays open to the teacher assigned to that course and closed to everyone else: OK');
