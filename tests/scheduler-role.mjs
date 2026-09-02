// Die Rolle "Stundenplanung" - genau so viel Recht wie zum Planen noetig, nicht mehr.
//
// Bisher gab es nur "Verantwortlich", wenn jemand planen koennen sollte. Darin steckten
// auch Rechteverwaltung und Teilnehmerpflege. Wer den Stundenplan macht, braucht beides
// nicht. Dieser Test fuehrt den ganzen Weg aus: Zuweisung, Auflösung der Rechte in der
// Sitzung, erlaubte Planung, verweigerte Rechteverwaltung.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { augmentOrgAuth, hasPermission } from '../dist/core/enterprise-access.js';
import { createOrgGrant } from '../dist/core/enterprise-organization.js';
import { autofillTimetablePlan } from '../dist/core/planning-constraints.js';

// Die Rechte stehen in der Oberflaeche - der Test liest sie dort, damit beides nicht auseinanderlaeuft.
const ui=await readFile('public/enterprise-admin-ui.js','utf8');
const treffer=/const PLAN_PERMS=(\[[^\]]*\]);/.exec(ui);
assert.ok(treffer,'die Oberfläche muss die Rechte der Rolle Stundenplanung benennen');
const PLAN_PERMS=JSON.parse(treffer[1].replace(/'/g,'"'));
assert.ok(ui.includes('<option value="scheduler">Stundenplanung</option>'),
  'die Rolle muss im Formular auswählbar sein');
assert.ok(/rolleZuRechten=v=>v==='scheduler'\?\{profile:'custom',permissions:PLAN_PERMS\}/.test(ui),
  'die Auswahl muss auf genau diese Rechte abgebildet werden');
assert.ok(PLAN_PERMS.includes('courses.manage'),'ohne courses.manage kann niemand planen');
for(const verboten of ['access.manage','participants.manage','org.manage','content.manage'])
  assert.ok(!PLAN_PERMS.includes(verboten),`die Rolle Stundenplanung darf ${verboten} nicht enthalten`);

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_rolle',ADMIN='usr_admin',PLANER='usr_planer',TS='2026-01-01T00:00:00.000Z';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Träger','tr','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${ADMIN}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${PLANER}','planer@example.invalid','Planer','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_ad','${T}',NULL,'${ADMIN}','tenant_admin','${TS}');
INSERT INTO org_unit_types(tenant_id,type_key,label,created_at,updated_at) VALUES('${T}','school','Schule','${TS}','${TS}');
INSERT INTO org_units(id,tenant_id,parent_id,type_key,name,code,status,created_at,updated_at) VALUES('org_1','${T}',NULL,'school','Hauptstandort','HS','active','${TS}','${TS}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','${ADMIN}','active','manual','${TS}','${TS}');
INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES('${T}','${PLANER}','active','manual','${TS}','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_p','${T}','Klasse P','P',1,'${TS}','${TS}');
INSERT INTO course_org_units(tenant_id,course_id,org_unit_id,created_at) VALUES('${T}','crs_p','org_1','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_p','${T}','Frau Alt','a@example.invalid','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_p','${T}','room','Raum 1','R1',30,'active','${ADMIN}','${TS}','${TS}');
INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T}','crs_p','08:00','16:00',90,0,0,'${ADMIN}','${TS}');
INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_p','${T}','Woche','2026-09-07','2026-09-08','draft','${ADMIN}','${TS}','${TS}');
`);
const env={DB:d1(db)};
const adminAuth={userId:ADMIN,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};

// 1. Der Kundenadmin vergibt die Rolle so, wie es die Oberfläche tut.
await createOrgGrant(env,adminAuth,T,{email:'planer@example.invalid',org_unit_id:'org_1',profile:'custom',permissions:PLAN_PERMS});
const gespeichert=db.prepare(`SELECT profile,permissions_json FROM org_permission_grants WHERE tenant_id='${T}' AND user_id='${PLANER}'`).get();
assert.ok(gespeichert,'die Zuweisung muss gespeichert sein');
assert.deepEqual(JSON.parse(gespeichert.permissions_json).sort(),[...PLAN_PERMS].sort(),
  'es dürfen genau die Rechte der Rolle gespeichert werden, keine weiteren');

// 2. In der Sitzung des Planers kommen genau diese Rechte an.
const roh={userId:PLANER,role:'guest',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const planer=await augmentOrgAuth(env,roh,T);
assert.ok(hasPermission(planer,'courses.manage'),'die Rolle muss planen dürfen');
assert.ok(hasPermission(planer,'courses.view'),'die Rolle muss Klassen sehen dürfen');
for(const verboten of ['access.manage','participants.manage','org.manage','content.manage'])
  assert.ok(!hasPermission(planer,verboten),`die Rolle darf ${verboten} nicht erhalten`);
assert.ok(planer.courseIds.includes('crs_p'),'die Klassen des zugewiesenen Bereichs müssen erreichbar sein');

// 3. Planen darf sie wirklich - nicht nur auf dem Papier.
const r=await autofillTimetablePlan(env,planer,T,'tpv_p',{course_ids:['crs_p']});
assert.equal(r.created,2,`Montag und Dienstag, war: ${r.created}`);
assert.equal(r.published,false,'auch die Planungsrolle veröffentlicht nichts von selbst');

// 4. Rechte weitergeben darf sie nicht.
await assert.rejects(()=>createOrgGrant(env,planer,T,{email:'fremd@example.invalid',org_unit_id:'org_1',profile:'responsible'}),
  /FORBIDDEN_ORG_SCOPE/,'die Planungsrolle darf keine Rechte vergeben - erst recht keine höheren');

// 5. Und sich selbst nicht hochstufen.
await assert.rejects(()=>createOrgGrant(env,planer,T,{email:'planer@example.invalid',org_unit_id:'org_1',profile:'responsible'}),
  /FORBIDDEN_ORG_SCOPE/,'Selbsterhöhung muss ausgeschlossen bleiben');

console.log('scheduler-role: ok');
