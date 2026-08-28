import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { buildAdaptiveRecoveryPlan } from '../dist/core/adaptive-recovery.js';

// Der Planer las eine Spalte curriculum_items.subject_id, die es nie gab. Jede Anfrage endete
// mit einem D1-Fehler und damit als 500 - eine ausgelieferte Funktion, die nie funktionieren
// konnte. Nur echtes SQL gegen das echte Migrationsschema deckt so etwas auf, deshalb läuft die
// Abfrage hier gegen eine vollständig migrierte Datenbank statt gegen ein Mock.
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
// Wrangler führt die Migrationen gegen eine Datenbank aus, die diese Buchführungstabelle bereits
// hat; eine Migration räumt darin auf. Ohne sie bricht der Durchlauf ab, obwohl das Schema stimmt.
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
  const sql=await readFile(`migrations/${name}`,'utf8');
  try{db.exec(sql);}catch(error){throw new Error(`migration ${name} failed against node:sqlite: ${error.message}`);}
}
const env={DB:d1(db)};
const now='2026-08-28T06:00:00.000Z';
const T='ten_recovery',C='crs_recovery',U='usr_recovery';
db.exec(`
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','plan@example.invalid','Planerin','x',0,0,'active','${now}','${now}');
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Bildungswerk','bildungswerk','active','${now}','${now}');
INSERT INTO courses(id,tenant_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('${C}','${T}','Fachklasse','fk-01','login',1,'${now}','${now}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_plan','${T}',NULL,'${U}','tenant_admin','${now}');
INSERT INTO subjects(id,tenant_id,name,short_name,created_at) VALUES('sub_theory','${T}','Fachtheorie','FT','${now}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_theory','${T}','Dozentin Fachtheorie',NULL,'${now}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_other','${T}','Dozent ohne Qualifikation',NULL,'${now}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_a1','${T}','room','Raum A1','A1',30,'active','${U}','${now}','${now}');
INSERT INTO curriculum_frameworks(id,tenant_id,name,authority_type,status,created_by,created_at,updated_at) VALUES('frm','${T}','Rahmenlehrplan','internal','active','${U}','${now}','${now}');
INSERT INTO curriculum_items(id,tenant_id,framework_id,parent_id,code,title,description,learning_objectives,target_minutes,exam_relevant,mandatory,sort_order,created_at,updated_at) VALUES('cit','${T}','frm',NULL,'LF1','Lernfeld 1',NULL,NULL,360,1,1,1,'${now}','${now}');
INSERT INTO course_curriculum_bindings(tenant_id,course_id,framework_id,is_primary,assigned_by,assigned_at) VALUES('${T}','${C}','frm',1,'${U}','${now}');
INSERT INTO attendance_sessions(id,tenant_id,course_id,session_date,starts_at,ends_at,subject,room,instructor_text,delivery_mode,status,source,source_ref,created_by,created_at,updated_at) VALUES('ats','${T}','${C}','2026-08-20','2026-08-20T08:15:00.000Z','2026-08-20T09:45:00.000Z','Fachtheorie','A1',NULL,'onsite','held','manual',NULL,'${U}','${now}','${now}');
INSERT INTO curriculum_session_links(id,tenant_id,course_id,curriculum_item_id,session_id,planned_minutes,actual_minutes,coverage_status,evidence_note,linked_by,linked_at,updated_at) VALUES('csl','${T}','${C}','cit','ats',0,90,'covered',NULL,'${U}','${now}','${now}');
INSERT INTO teacher_qualifications(id,tenant_id,teacher_id,subject_id,qualification_type,title,status,valid_from,valid_until,created_by,created_at,updated_at) VALUES('tq','${T}','tch_theory','sub_theory','subject_approval','Fachtheorie Lehrbefähigung','valid',NULL,NULL,'${U}','${now}','${now}');
`);

const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[C],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const plan=await buildAdaptiveRecoveryPlan(env,auth,T,C,{from_date:'2026-09-01',to_date:'2026-09-30'});

assert.equal(plan.gap_minutes,270,'target minutes minus covered minutes must be the gap');
assert.ok(plan.entries.length>0,'a plan for an open gap must propose lessons');
assert.equal(plan.covered_minutes,plan.entries.reduce((n,e)=>n+e.planned_minutes,0),'covered minutes must be what the entries actually plan');
assert.equal(plan.gap_minutes-plan.covered_minutes,plan.remaining_gap_minutes,'the plan must account for every gap minute');

// Ein Lehrplanpunkt trägt kein Fach; es kommt aus dem Unterricht, der ihn abdeckt.
assert.equal(plan.entries[0].subject_id,'sub_theory','the subject must be resolved through the sessions that cover the item');
assert.equal(plan.entries[0].subject_text,'Fachtheorie','the resolved subject must name the proposal');
// Und weil das Fach bekannt ist, greift die Fachqualifikation.
for(const entry of plan.entries)assert.equal(entry.teacher_id,'tch_theory',`only a teacher qualified for the subject may be proposed, got ${entry.teacher_id}`);
for(const entry of plan.entries)assert.ok(entry.starts_at>='2026-09-01'&&entry.starts_at<='2026-09-30T23:59:59Z',`proposal ${entry.starts_at} left the requested horizon`);
assert.ok(plan.digest&&plan.digest.length>=32,'a plan must carry a digest the draft step can pin');

// Ohne benanntes Fach im Unterricht bleibt der Planer arbeitsfähig statt zu scheitern.
db.exec(`UPDATE attendance_sessions SET subject='Ein Fach, das es im Katalog nicht gibt' WHERE id='ats';`);
const unnamed=await buildAdaptiveRecoveryPlan(env,auth,T,C,{from_date:'2026-09-01',to_date:'2026-09-30'});
assert.equal(unnamed.entries[0].subject_id,null,'an unmatched session subject must not invent a subject id');
assert.equal(unnamed.entries[0].subject_text,'Lernfeld 1','without a subject the curriculum item names the proposal');
assert.ok(unnamed.entries.length>0,'an unresolved subject must not stop the planner');

console.log('Adaptive recovery plan runs against the migrated schema, resolves its subject from covering sessions and respects teacher qualification: OK');
