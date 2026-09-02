// Wann eine Honorarkraft arbeiten MOECHTE.
//
// Das Portal kannte bisher nur die Abwesenheit - also wann jemand nicht kann. Fuer Dozentinnen
// und Dozenten auf Honorarbasis ist das Gegenteil der eigentliche Planungsschluessel: sie geben
// selbst an, wann sie zur Verfuegung stehen.
//
// Der schwierigste Teil ist die Einfuehrung selbst: wuerde "keine Zusage" als "nicht verfuegbar"
// gelten, waere ueber Nacht jeder bestehende Mandant planungsunfaehig. Deshalb ist die Zusage
// ausdruecklich freiwillig - und genau das wird hier ausgefuehrt geprueft.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { planningSuggestions, saveTeacherAvailability, listTeacherAvailability, deleteTeacherAvailability,
  autofillTimetablePlan, validateAdvancedTimetablePlan } from '../dist/core/planning-constraints.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_hono',U='usr_leitung',TS='2026-01-01T00:00:00.000Z';
// 2026-09-07 ist ein Montag.
const MO='2026-09-07T08:00:00.000Z',MO_ENDE='2026-09-07T09:30:00.000Z';
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Bildungswerk','bw','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','leitung@example.invalid','Leitung','x',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_hono','hono@example.invalid','Frau Honorar','x',0,0,'active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('usr_fremd','fremd@example.invalid','Fremde','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_l','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_h','${T}','Klasse H','H',1,'${TS}','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_hono','${T}','Frau Honorar','hono@example.invalid','${TS}');
INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('tch_fest','${T}','Anna Fest','fest@example.invalid','${TS}');
INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,capacity,status,created_by,created_at,updated_at) VALUES('res_1','${T}','room','Raum 1','R1',30,'active','${U}','${TS}','${TS}');
INSERT INTO teacher_portal_assignments(id,tenant_id,teacher_id,user_id,course_id,status,created_at,updated_at) VALUES('tpa_1','${T}','tch_hono','usr_hono','crs_h','active','${TS}','${TS}');
`);
const env={DB:d1(db)};
const leitung={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const hono={userId:'usr_hono',role:'guest',tenantIds:[T],courseIds:['crs_h'],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const fremd={userId:'usr_fremd',role:'guest',tenantIds:[T],courseIds:['crs_h'],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const namen=r=>r.teachers.map(t=>t.name).sort();

// ---------------------------------------------------------------------------
// 1. Ohne jede Zusage bleibt alles wie bisher. Das ist die Einführungsbedingung.
// ---------------------------------------------------------------------------
const ohne=await planningSuggestions(env,leitung,T,{course_id:'crs_h',starts_at:MO,ends_at:MO_ENDE});
assert.deepEqual(namen(ohne),['Anna Fest','Frau Honorar'],
  'solange niemand eine Arbeitszeit zugesagt hat, muss weiter jeder vorgeschlagen werden');

// ---------------------------------------------------------------------------
// 2. Die Honorarkraft trägt selbst ein, wann sie arbeiten möchte.
// ---------------------------------------------------------------------------
const eigen=await saveTeacherAvailability(env,hono,T,{teacher_id:'tch_hono',weekday:1,starts_time:'08:00',ends_time:'12:00'});
assert.ok(eigen.availability_id,'die eigene Zusage muss gespeichert werden');
assert.equal(db.prepare(`SELECT source FROM teacher_availability WHERE id='${eigen.availability_id}'`).get().source,'teacher',
  'die Herkunft muss festhalten, dass sie es selbst war');

// Montagvormittag: beide werden vorgeschlagen - sie innerhalb ihrer Zusage, er ohne Zusage.
const mo=await planningSuggestions(env,leitung,T,{course_id:'crs_h',starts_at:MO,ends_at:MO_ENDE});
assert.deepEqual(namen(mo),['Anna Fest','Frau Honorar']);

// Montagnachmittag: sie hat nicht zugesagt und darf nicht vorgeschlagen werden.
const nachmittag=await planningSuggestions(env,leitung,T,{course_id:'crs_h',starts_at:'2026-09-07T14:00:00.000Z',ends_at:'2026-09-07T15:30:00.000Z'});
assert.deepEqual(namen(nachmittag),['Anna Fest'],
  `wer Arbeitszeiten zugesagt hat, darf außerhalb davon nicht vorgeschlagen werden: ${JSON.stringify(namen(nachmittag))}`);

// Dienstag: gar keine Zusage für diesen Tag.
const dienstag=await planningSuggestions(env,leitung,T,{course_id:'crs_h',starts_at:'2026-09-08T08:00:00.000Z',ends_at:'2026-09-08T09:30:00.000Z'});
assert.deepEqual(namen(dienstag),['Anna Fest'],'ein Tag ohne Zusage ist kein Arbeitstag');

// Ein Termin, der über das Ende der Zusage hinausragt, zählt nicht als abgedeckt.
const ueberSteht=await planningSuggestions(env,leitung,T,{course_id:'crs_h',starts_at:'2026-09-07T11:00:00.000Z',ends_at:'2026-09-07T13:00:00.000Z'});
assert.deepEqual(namen(ueberSteht),['Anna Fest'],'eine Zusage muss den ganzen Termin abdecken, nicht nur seinen Beginn');

// ---------------------------------------------------------------------------
// 3. Wer es besonders gern macht, wird zuerst vorgeschlagen. Die Namen sind bewusst so
//    gewaehlt, dass die alphabetische Reihenfolge das Gegenteil ergaebe - sonst waere der
//    Vorrang nicht von der Namenssortierung zu unterscheiden.
// ---------------------------------------------------------------------------
await saveTeacherAvailability(env,leitung,T,{teacher_id:'tch_fest',weekday:1,starts_time:'08:00',ends_time:'18:00'});
await saveTeacherAvailability(env,hono,T,{id:eigen.availability_id,teacher_id:'tch_hono',weekday:1,starts_time:'08:00',ends_time:'12:00',preference:'preferred'});
const vorrang=await planningSuggestions(env,leitung,T,{course_id:'crs_h',starts_at:MO,ends_at:MO_ENDE});
assert.equal(vorrang.teachers[0].name,'Frau Honorar',
  `wer diesen Zeitraum ausdrücklich bevorzugt, muss zuerst stehen: ${JSON.stringify(namen(vorrang))}`);

// ---------------------------------------------------------------------------
// 4. Eine befristete Zusage gilt nur in ihrem Zeitraum.
// ---------------------------------------------------------------------------
await saveTeacherAvailability(env,leitung,T,{id:eigen.availability_id,teacher_id:'tch_hono',weekday:1,starts_time:'08:00',ends_time:'12:00',valid_from:'2026-10-01'});
const zuFrueh=await planningSuggestions(env,leitung,T,{course_id:'crs_h',starts_at:MO,ends_at:MO_ENDE});
assert.deepEqual(namen(zuFrueh),['Anna Fest'],'vor Beginn der Befristung gilt die Zusage nicht');
const spaeter=await planningSuggestions(env,leitung,T,{course_id:'crs_h',starts_at:'2026-10-05T08:00:00.000Z',ends_at:'2026-10-05T09:30:00.000Z'});
assert.deepEqual(namen(spaeter),['Anna Fest','Frau Honorar'],'innerhalb der Befristung gilt sie wieder');
await saveTeacherAvailability(env,leitung,T,{id:eigen.availability_id,teacher_id:'tch_hono',weekday:1,starts_time:'08:00',ends_time:'12:00'});

// ---------------------------------------------------------------------------
// 5. Der automatische Entwurf hält sich daran.
// ---------------------------------------------------------------------------
db.exec(`
INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,default_lesson_minutes,allow_saturday,allow_sunday,updated_by,updated_at) VALUES('${T}','crs_h','14:00','18:00',90,0,0,'${U}','${TS}');
INSERT INTO timetable_plan_versions(id,tenant_id,name,starts_on,ends_on,status,created_by,created_at,updated_at) VALUES('tpv_1','${T}','Woche','2026-09-07','2026-09-07','draft','${U}','${TS}','${TS}');
DELETE FROM teacher_availability WHERE teacher_id='tch_fest';
`);
const entwurf=await autofillTimetablePlan(env,leitung,T,'tpv_1',{course_ids:['crs_h']});
assert.equal(entwurf.created,1);
assert.equal(db.prepare(`SELECT teacher_id FROM timetable_plan_entries WHERE plan_id='tpv_1'`).get().teacher_id,'tch_fest',
  'der Nachmittagstermin darf nicht der Honorarkraft zugeteilt werden, die nur vormittags zugesagt hat');

// ---------------------------------------------------------------------------
// 6. Wird jemand doch außerhalb seiner Zusage eingeplant, sagt die Prüfung das.
// ---------------------------------------------------------------------------
db.exec(`UPDATE timetable_plan_entries SET teacher_id='tch_hono' WHERE plan_id='tpv_1';`);
const geprueft=await validateAdvancedTimetablePlan(env,leitung,T,'tpv_1');
const hinweise=db.prepare(`SELECT conflict_type,severity,message FROM timetable_plan_conflicts WHERE plan_id='tpv_1' AND conflict_type='teacher_outside_availability'`).all();
assert.equal(hinweise.length,1,
  `ein Termin außerhalb der Zusage muss auffallen: ${JSON.stringify(geprueft)}`);
assert.equal(hinweise[0].severity,'warning',
  'als Hinweis, nicht als Fehler - eine Absprache im Einzelfall muss möglich bleiben, aber sichtbar');
assert.match(hinweise[0].message,/Arbeitszeiten/,'und im Klartext erklärt sein');

// ---------------------------------------------------------------------------
// 7. Niemand trägt für jemand anderen ein.
// ---------------------------------------------------------------------------
await assert.rejects(()=>saveTeacherAvailability(env,fremd,T,{teacher_id:'tch_hono',weekday:2,starts_time:'08:00',ends_time:'12:00'}),
  /FORBIDDEN_TEACHER_AVAILABILITY/,'wer nicht diese Person ist, darf ihre Arbeitszeiten nicht setzen');
await assert.rejects(()=>saveTeacherAvailability(env,hono,T,{teacher_id:'tch_fest',weekday:2,starts_time:'08:00',ends_time:'12:00'}),
  /FORBIDDEN_TEACHER_AVAILABILITY/,'auch eine andere Dozentin darf das nicht');
await assert.rejects(()=>listTeacherAvailability(env,fremd,T),
  /FORBIDDEN_TEACHER_AVAILABILITY/,'und die Liste aller Arbeitszeiten sieht nicht jeder');
const eigeneListe=await listTeacherAvailability(env,hono,T,'tch_hono');
assert.equal(eigeneListe.length,1,'die eigene Liste darf man sehen');

// ---------------------------------------------------------------------------
// 8. Unsinnige Angaben werden abgewiesen, nicht zurechtgebogen.
// ---------------------------------------------------------------------------
for(const [feld,eingabe] of [
  ['Wochentag',{weekday:0,starts_time:'08:00',ends_time:'12:00'}],
  ['Wochentag',{weekday:8,starts_time:'08:00',ends_time:'12:00'}],
  ['Uhrzeit',{weekday:1,starts_time:'12:00',ends_time:'08:00'}],
  ['Uhrzeit',{weekday:1,starts_time:'acht',ends_time:'12:00'}],
]) await assert.rejects(()=>saveTeacherAvailability(env,hono,T,{teacher_id:'tch_hono',...eingabe}),
  /AVAILABILITY_(WEEKDAY|TIME)_INVALID/,`unsinniger ${feld} muss abgewiesen werden: ${JSON.stringify(eingabe)}`);
await assert.rejects(()=>saveTeacherAvailability(env,hono,T,{teacher_id:'tch_hono',weekday:1,starts_time:'08:00',ends_time:'12:00',valid_from:'2026-10-01',valid_until:'2026-09-01'}),
  /AVAILABILITY_PERIOD_INVALID/,'ein Ende vor dem Beginn der Befristung muss abgewiesen werden');

// ---------------------------------------------------------------------------
// 9. Zurücknehmen geht auch - und wirkt sofort.
// ---------------------------------------------------------------------------
await deleteTeacherAvailability(env,hono,T,eigen.availability_id);
const wiederFrei=await planningSuggestions(env,leitung,T,{course_id:'crs_h',starts_at:'2026-09-07T14:00:00.000Z',ends_at:'2026-09-07T15:30:00.000Z'});
assert.deepEqual(namen(wiederFrei),['Anna Fest','Frau Honorar'],
  'ohne jede Zusage gilt wieder keine Einschränkung');

// ---------------------------------------------------------------------------
// 10. Beide Oberflächen bieten es an - und sagen, dass die Angabe freiwillig ist.
// ---------------------------------------------------------------------------
const portal=await readFile('public/teacher-availability-ui.js','utf8');
assert.match(portal,/\/api\/education\/planning\/teacher-availability/,'das Dozentenportal muss die Arbeitszeiten setzen können');
assert.match(portal,/freiwillig/i,'und sagen, dass die Angabe freiwillig ist');
assert.match(portal,/nur noch innerhalb/i,'und was passiert, sobald man etwas einträgt');
assert.match(portal,/method:'DELETE'/,'zurücknehmen muss auch gehen');
const lazy=await readFile('public/teacher-lazy-modules.js','utf8');
assert.match(lazy,/teacher-availability-ui/,'die Karte muss im Dozentenportal auch geladen werden');

const admin=await readFile('public/planning-resource-ui.js','utf8');
assert.match(admin,/data-availability-list/,'die Planungsverwaltung muss die zugesagten Arbeitszeiten zeigen');
assert.match(admin,/geplant wie bisher/,'und erklären, was ohne Angabe gilt');
for(const tag of ['Montag','Sonntag'])
  assert.ok(portal.includes(tag)&&admin.includes(tag),`der Wochentag ${tag} muss im Klartext stehen, nicht als Zahl`);

console.log('teacher-availability: ok');
