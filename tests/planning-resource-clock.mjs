import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { listPlanningResourcesManaged } from '../dist/core/planning-resource-management.js';

// Die Zähler "bevorstehende Sperren" und "bevorstehende Reservierungen" verglichen gegen
// datetime('now') - also "YYYY-MM-DD HH:MM:SS" - während die Anwendung ISO-8601 mit T und Z
// schreibt. Am selben Tag sortiert jeder gespeicherte Zeitpunkt hinter dem naiven Wert, also
// zählte alles, was heute bereits vorbei war, weiter als bevorstehend.
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

const iso=at=>new Date(at).toISOString();
const now=Date.now(),hour=3600_000;
const T='ten_clock',U='usr_clock',stamp=iso(now);
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Werk','werk','active','${stamp}','${stamp}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','a@example.invalid','A','x',0,0,'active','${stamp}','${stamp}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_clock','${T}',NULL,'${U}','tenant_admin','${stamp}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_clock','${T}','room','Raum A','A',20,'active','${U}','${stamp}','${stamp}');
`);
// Eine Sperre, die heute schon vorbei ist, und eine, die heute noch kommt.
const past=[iso(now-3*hour),iso(now-2*hour)],future=[iso(now+2*hour),iso(now+3*hour)];
db.prepare("INSERT INTO planning_resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,reason,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
  .run('pru_past',T,'res_clock',past[0],past[1],'vorbei',U,stamp,stamp);
db.prepare("INSERT INTO planning_resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,reason,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)")
  .run('pru_future',T,'res_clock',future[0],future[1],'kommt noch',U,stamp,stamp);

const env={DB:d1(db)};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const [resource]=await listPlanningResourcesManaged(env,auth,T);
assert.ok(resource,'the tenant must see its planning resource');
assert.equal(Number(resource.future_blocks),1,
  `only the block that has not ended yet may count as upcoming, got ${resource.future_blocks} - a block that ended earlier today must not`);

// Und die Grenze gilt in beide Richtungen: endet alles in der Vergangenheit, ist der Zähler 0.
db.exec("DELETE FROM planning_resource_unavailability WHERE id='pru_future';");
const [afterwards]=await listPlanningResourcesManaged(env,auth,T);
assert.equal(Number(afterwards.future_blocks),0,'a resource whose blocks are all over must report none upcoming');

console.log('Upcoming planning blocks are counted against the timestamp format the application writes: OK');
