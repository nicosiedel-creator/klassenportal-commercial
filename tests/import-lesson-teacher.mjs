import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { mapOrganizationRows } from '../dist/core/organization-import-file.js';
import { previewOrganizationImport, applyOrganizationImport } from '../dist/core/organization-import.js';

// Gemessen an einem echten Kundenlauf: der eingeworfene Stundenplan eines Bildungsträgers nennt
// die Dozentin als Kennung ("Dozenten_ID: D001"), die Dozentenliste führt dieselbe Kennung. Der
// Ordner-Einwurf legte die Unterrichtsstunde trotzdem ohne teacher_id an - ensureLesson schrieb
// dort fest NULL. Folgen: das Dozentenportal zeigte der Dozentin ihren eigenen Unterricht nicht,
// und keine Prüfung konnte "diese Person ist gleichzeitig zweimal verplant" überhaupt sehen,
// weil an der Stunde niemand stand.
//
// Dieser Test liest nicht, er führt aus: echtes SQLite, echtes Schema aller Migrationen, die
// echten Kopfzeilen des Abnahmepakets, echter Entwurf, echtes Anlegen.

// Kopfzeilen wörtlich aus 03_Dozierende.csv und 06_Stundenplan.csv des Kunden.
const DOZIERENDE=`Dozenten_ID;Name;E-Mail;Fachgebiete
D001;Dr. Lena Hoffmann;lena.hoffmann@traeger.example.invalid;Verwaltungsrecht
D002;Michael Brandt;michael.brandt@traeger.example.invalid;BGB
`;
const STUNDENPLAN=`Datum;Beginn;Ende;Kurscode;Fach_ID;Dozenten_ID;Raum;Typ
10.09.2026;08:15;11:30;VFA-26-A;F001;D001;A-204;Unterricht
10.09.2026;12:15;15:30;VFA-26-A;F003;D002;A-301;Unterricht
11.09.2026;08:15;11:30;VFA-26-A;F001;D999;A-204;Unterricht
12.09.2026;08:15;11:30;VFA-26-A;F001;;A-204;Unterricht
`;

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_les',U='usr_les',TS=new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','hbg','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_les','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_vfa','${T}',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
`);
const env={DB:d1(db)};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const rowsOf=text=>mapOrganizationRows(parseCsv(text,{delimiter:';'}).rows);
const lauf=async(name,text)=>{
  const preview=await previewOrganizationImport(env,auth,T,{source_name:name,rows:rowsOf(text)});
  return applyOrganizationImport(env,auth,T,{batch_id:preview.batch_id,digest:preview.digest});
};

// ---------------------------------------------------------------------------------------------
// 1. Die Dozentenliste. Die Kennung des Kunden muss am Dozentenstamm ankommen - ohne sie gibt es
//    später nichts, woran der Stundenplan seine Zeile festmachen könnte.
// ---------------------------------------------------------------------------------------------
await lauf('03_Dozierende.csv',DOZIERENDE);
const dozenten=db.prepare('SELECT id,name,email,external_id FROM teachers WHERE tenant_id=? ORDER BY external_id').all(T);
assert.equal(dozenten.length,2,`aus zwei Zeilen müssen zwei Dozierende werden, gefunden: ${JSON.stringify(dozenten)}`);
assert.equal(dozenten[0].external_id,'D001','die Kennung des Kunden muss am Dozentenstamm stehen');
assert.equal(dozenten[1].external_id,'D002');
assert.equal(dozenten[0].name,'Dr. Lena Hoffmann');
const D001=dozenten[0].id,D002=dozenten[1].id;

// Derselbe Ordner ein zweites Mal geworfen legt niemanden doppelt an.
await lauf('03_Dozierende.csv',DOZIERENDE);
assert.equal(db.prepare('SELECT COUNT(*) n FROM teachers WHERE tenant_id=?').get(T).n,2,
  'ein zweiter Einwurf derselben Liste darf niemanden doppelt anlegen');

// ---------------------------------------------------------------------------------------------
// 2. Der Stundenplan. Die Kennung muss die Stunde mit der Dozentin verbinden.
// ---------------------------------------------------------------------------------------------
await lauf('06_Stundenplan.csv',STUNDENPLAN);
const stunden=db.prepare('SELECT id,starts_at,room,teacher_id,notes FROM lessons WHERE tenant_id=? ORDER BY starts_at').all(T);
assert.equal(stunden.length,4,`aus vier Zeilen müssen vier Unterrichtsstunden werden, gefunden: ${stunden.length}`);
assert.equal(stunden[0].teacher_id,D001,
  `die Stunde am 10.09. 08:15 muss D001 tragen, gefunden: ${stunden[0].teacher_id}`);
assert.equal(stunden[1].teacher_id,D002,
  `die Stunde am 10.09. 12:15 muss D002 tragen, gefunden: ${stunden[1].teacher_id}`);
// Eine unbekannte Kennung wird nicht geraten, und eine leere Spalte erfindet niemanden.
assert.equal(stunden[2].teacher_id,null,'eine unbekannte Kennung darf keine Dozentin erfinden');
assert.equal(stunden[3].teacher_id,null,'eine leere Spalte darf keine Dozentin erfinden');
// Der Hinweis darf die Kennung nicht als Namen ausgeben - das wäre eine Auskunft, die keine ist.
assert.ok(!/Dozent\/in: D001/.test(String(stunden[0].notes||'')),
  `die Kennung gehört nicht als Name in den Hinweis, gefunden: ${stunden[0].notes}`);

// ---------------------------------------------------------------------------------------------
// 3. Ein zweiter Einwurf. Weder doppelte Stunden noch überschriebene Handarbeit.
// ---------------------------------------------------------------------------------------------
db.prepare('UPDATE lessons SET teacher_id=? WHERE id=?').run(D002,stunden[0].id);
await lauf('06_Stundenplan.csv',STUNDENPLAN);
assert.equal(db.prepare('SELECT COUNT(*) n FROM lessons WHERE tenant_id=?').get(T).n,4,
  'ein zweiter Einwurf desselben Stundenplans darf keine Stunde doppelt anlegen');
assert.equal(db.prepare('SELECT teacher_id FROM lessons WHERE id=?').get(stunden[0].id).teacher_id,D002,
  'eine von Hand gesetzte Dozentin darf ein erneuter Einwurf nicht überschreiben');
// Eine noch leere Zuordnung wird dagegen nachgetragen, sobald die Kennung bekannt ist.
db.prepare('UPDATE lessons SET teacher_id=NULL WHERE id=?').run(stunden[1].id);
await lauf('06_Stundenplan.csv',STUNDENPLAN);
assert.equal(db.prepare('SELECT teacher_id FROM lessons WHERE id=?').get(stunden[1].id).teacher_id,D002,
  'eine noch leere Zuordnung muss nachgetragen werden');

// Eine Dozentin, die schon unter ihrer E-Mail im Stamm steht, aber noch ohne Kennung: die
// Kennung muss nachgetragen werden, sonst findet der Stundenplan sie nie.
db.prepare('INSERT INTO teachers(id,tenant_id,name,email,external_id,created_at) VALUES(?,?,?,?,?,?)')
  .run('tch_ohne','ten_les','Petra Wolf','petra.wolf@traeger.example.invalid',null,TS);
await lauf('03_Dozierende_nachtrag.csv',`Dozenten_ID;Name;E-Mail
D003;Petra Wolf;petra.wolf@traeger.example.invalid
`);
assert.equal(db.prepare("SELECT external_id FROM teachers WHERE id='tch_ohne'").get().external_id,'D003',
  'eine bereits bekannte Dozentin muss ihre Kennung nachgetragen bekommen');
assert.equal(db.prepare("SELECT COUNT(*) n FROM teachers WHERE tenant_id=? AND email='petra.wolf@traeger.example.invalid'").get(T).n,1,
  'und darf dabei kein zweites Mal angelegt werden');

// ---------------------------------------------------------------------------------------------
// 4. Mehrdeutigkeit. Zwei Dozierende mit demselben Namen: dann wird nicht zugeordnet.
// ---------------------------------------------------------------------------------------------
db.prepare('INSERT INTO teachers(id,tenant_id,name,email,external_id,created_at) VALUES(?,?,?,?,?,?)')
  .run('tch_zwilling','ten_les','Klaus Meier','klaus.meier.a@traeger.example.invalid','D010',TS);
db.prepare('INSERT INTO teachers(id,tenant_id,name,email,external_id,created_at) VALUES(?,?,?,?,?,?)')
  .run('tch_zwilling2','ten_les','Klaus Meier','klaus.meier.b@traeger.example.invalid','D011',TS);
await lauf('06_Stundenplan_namen.csv',`Datum;Beginn;Ende;Kurscode;Dozent;Raum
15.09.2026;08:15;11:30;VFA-26-A;Klaus Meier;A-204
16.09.2026;08:15;11:30;VFA-26-A;Dr. Lena Hoffmann;A-204
`);
const namensstunden=db.prepare("SELECT starts_at,teacher_id FROM lessons WHERE tenant_id=? AND starts_at>='2026-09-15' ORDER BY starts_at").all(T);
assert.equal(namensstunden.length,2);
assert.equal(namensstunden[0].teacher_id,null,
  'bei zwei gleichnamigen Dozierenden darf keine der beiden geraten werden');
assert.equal(namensstunden[1].teacher_id,D001,
  'ein eindeutiger Name ordnet weiterhin zu - die Kennung ist nicht die einzige Brücke');

// Die Kennung bleibt eindeutig: dieselbe Kennung zweimal am selben Träger weist die Datenbank ab.
assert.throws(()=>db.prepare('INSERT INTO teachers(id,tenant_id,name,email,external_id,created_at) VALUES(?,?,?,?,?,?)')
  .run('tch_x','ten_les','Jemand',null,'D001',TS),/constraint|UNIQUE/i,
  'dieselbe Dozentenkennung darf am selben Träger nicht zweimal vergeben werden');

// ---------------------------------------------------------------------------------------------
// 5. Der Fall aus dem echten Kundenlauf: EIN eingeworfener Ordner, EIN Stapel - Dozentenliste und
//    Stundenplan liegen darin gemischt. Solange die Übernahme 'lesson' vor 'teacher' abarbeitete,
//    war der Dozentenstamm beim Anlegen der Stunde noch leer: gemessen 29 Unterrichtsstunden ohne
//    eine einzige Dozentin, obwohl beide Listen im selben Stapel lagen.
// ---------------------------------------------------------------------------------------------
const db2=new DatabaseSync(':memory:');
db2.exec('PRAGMA foreign_keys=ON;');
db2.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db2.exec(await readFile(`migrations/${name}`,'utf8'));
const T2='ten_mix',U2='usr_mix';
db2.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T2}','Hellersdorfer Bildungs gGmbH','hbg-mix','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U2}','admin2@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_mix','${T2}',NULL,'${U2}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_mix','${T2}',NULL,'Umschulung VFA','VFA-26-A','login',1,'${TS}','${TS}');
`);
const env2={DB:d1(db2)};
const auth2={userId:U2,role:'tenant_admin',tenantIds:[T2],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
// Die Stundenzeile steht hier absichtlich VOR der Dozentenzeile - so kommt ein Ordner an.
const gemischt=[
  {typ:'Unterricht',datum:'10.09.2026',beginn:'08:15',ende:'11:30',course_code:'VFA-26-A',dozenten_id:'D001',raum:'A-204'},
  {dozenten_id:'D001',display_name:'Dr. Lena Hoffmann',email:'lena.hoffmann@traeger.example.invalid'},
];
const vorschau=await previewOrganizationImport(env2,auth2,T2,{source_name:'Ordner',rows:gemischt});
const typen=vorschau.candidates.map(c=>c.type);
assert.ok(typen.includes('lesson')&&typen.includes('teacher'),
  `beide Zeilenarten müssen im selben Stapel erkannt werden, gefunden: ${JSON.stringify(typen)}`);
await applyOrganizationImport(env2,auth2,T2,{batch_id:vorschau.batch_id,digest:vorschau.digest});
const dozent=db2.prepare("SELECT id FROM teachers WHERE tenant_id=? AND external_id='D001'").get(T2);
assert.ok(dozent,'die Dozentin muss aus demselben Stapel entstehen');
const stunde=db2.prepare('SELECT teacher_id FROM lessons WHERE tenant_id=?').get(T2);
assert.ok(stunde,'die Unterrichtsstunde muss aus demselben Stapel entstehen');
assert.equal(stunde.teacher_id,dozent.id,
  'im selben Stapel muss die Dozentin vor der Stunde angelegt werden - sonst steht die Stunde ohne sie da');

console.log('import-lesson-teacher: ok');
