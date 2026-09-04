import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { emptyRouted, routeExtracted } from '../dist/core/intake-classifier.js';
import { importRole } from '../dist/core/organization-import.js';
import { mapOrganizationRows } from '../dist/core/organization-import-file.js';
import { mapParticipantRows } from '../dist/core/participant-import-file.js';
import { previewOrganizationImport, applyOrganizationImport } from '../dist/core/organization-import.js';
import { previewParticipantImport } from '../dist/core/participant-document-import.js';

// Ein Bildungstraeger wirft seinen ganzen Betrieb als Ordner ein. Seine Dateien verweisen ueber
// SEINE Kennungen aufeinander: die Kursliste fuehrt class_id/external_id, die Teilnehmerliste
// verweist mit class_id/course_external_id genau darauf. Genau dieses - voellig uebliche - Muster
// scheiterte vollstaendig, gemessen am echten Paket eines Kunden:
//
//   96 Kurszeilen  -> als Teilnehmer ohne E-Mail vorgelegt, 0 Kurse entstanden
//   1537 Teilnehmer -> 0 zugeordnet, auf dem Bildschirm ueberall "Kein Kurs erkannt"
//
// Zwei Ursachen, beide hier festgenagelt:
//   1. Eine Kursliste fuehrt ebenfalls eine Spalte "name" - dort steht der Kursname. Sie wurde
//      als Personenname gelesen, die Datei landete auf dem Teilnehmer-Gleis.
//   2. Die Kennungen des Traegers wurden beim Anlegen weggeworfen. Danach zeigte jeder Verweis
//      aus einer anderen Datei ins Leere.

const KURSE=[
  'class_id;external_id;kurscode;name;typ;jahrgang;site_id;schuljahr;teilnehmer_soll;kapazitaet;status;startdatum;enddatum',
  'CLS-001;COURSE-001;5a;Klasse 5a;Klassenverband;5;ST-01;2026/2027;24;26;aktiv;2026-09-01;2027-07-31',
  'CLS-002;COURSE-002;5b;Klasse 5b;Klassenverband;5;ST-01;2026/2027;24;26;aktiv;2026-09-01;2027-07-31',
  'CLS-003;COURSE-003;6a;Klasse 6a;Klassenverband;6;ST-01;2026/2027;22;26;aktiv;2026-09-01;2027-07-31',
].join('\n')+'\n';

// Die Teilnehmerliste nennt weder Kurscode noch Kursname - nur die Kennungen des Traegers.
const TEILNEHMER=[
  'student_id;person_external_id;vorname;nachname;class_id;course_external_id;site_id;email;status',
  'STU-00001;PERSON-00001;Mila;Testmann;CLS-001;COURSE-001;ST-01;stu-00001@example.invalid;aktiv',
  'STU-00002;PERSON-00002;Mert;Nordblick;CLS-001;COURSE-001;ST-01;stu-00002@example.invalid;aktiv',
  'STU-00003;PERSON-00003;Lina;Testmann;CLS-002;COURSE-002;ST-01;stu-00003@example.invalid;aktiv',
  'STU-00004;PERSON-00004;Elif;Nordblick;CLS-003;COURSE-003;ST-01;stu-00004@example.invalid;aktiv',
].join('\n')+'\n';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));
const T='ten_pkg',U='usr_pkg',TS=new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','MetropolCampus','mc-pkg','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_pkg','${T}',NULL,'${U}','tenant_admin','${TS}');
`);
const versandt=[];
const env={DB:d1(db),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',
  EMAIL:{send:async m=>{versandt.push(m);return{messageId:`t-${versandt.length}`};}}};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};

// ---------------------------------------------------------------------------------------------
// 1. Eine Kurszeile ist eine Kurszeile - auch wenn ihre Namensspalte schlicht "name" heisst.
// ---------------------------------------------------------------------------------------------
const kursZeilen=parseCsv(KURSE).rows,tnZeilen=parseCsv(TEILNEHMER).rows;
assert.equal(importRole(kursZeilen[0]),'course',
  `eine Kursliste mit class_id/kurscode/Kapazitaet muss als Kurs erkannt werden, erkannt wurde: ${importRole(kursZeilen[0])}`);
assert.equal(importRole(tnZeilen[0]),'participant',
  `eine Teilnehmerzeile mit Vor-/Nachname und E-Mail bleibt ein Teilnehmer, erkannt wurde: ${importRole(tnZeilen[0])}`);

const routed=emptyRouted();
routeExtracted(routed,'03_Kurse.csv',{kind:'rows',rows:kursZeilen});
routeExtracted(routed,'05_Teilnehmer.csv',{kind:'rows',rows:tnZeilen});
assert.equal(routed.organizationRows.length,3,
  `die Kursliste gehoert auf das Organisations-Gleis, dort liegen: ${routed.organizationRows.length} Zeilen`);
assert.equal(routed.participantRows.length,4,
  `die Teilnehmerliste gehoert auf das Teilnehmer-Gleis, dort liegen: ${routed.participantRows.length} Zeilen`);
console.log('intake-package-cross-file-references 1/4 (Kursliste landet auf dem richtigen Gleis): ok');

// ---------------------------------------------------------------------------------------------
// 2. Aus den Kurszeilen entstehen Kurse - und sie behalten die Kennung des Traegers.
// ---------------------------------------------------------------------------------------------
const org=await previewOrganizationImport(env,auth,T,{source_name:'Paket',source_kind:'structured',rows:mapOrganizationRows(routed.organizationRows)});
const kursKandidaten=org.candidates.filter(c=>c.type==='course');
assert.equal(kursKandidaten.length,3,`3 Kurskandidaten erwartet, gefunden: ${kursKandidaten.length}`);
await applyOrganizationImport(env,auth,T,{batch_id:org.batch_id,digest:org.digest});
const kurse=db.prepare('SELECT id,code,name,external_id FROM courses WHERE tenant_id=? ORDER BY code').all(T);
assert.equal(kurse.length,3,`aus 3 Kurszeilen muessen 3 Kurse werden, entstanden: ${kurse.length}`);
assert.deepEqual(kurse.map(k=>k.external_id),['COURSE-001','COURSE-002','COURSE-003'],
  `jeder Kurs muss die Kennung des Traegers behalten, gespeichert: ${JSON.stringify(kurse.map(k=>k.external_id))}`);
console.log('intake-package-cross-file-references 2/4 (Kurse entstehen und behalten die Kundenkennung): ok');

// ---------------------------------------------------------------------------------------------
// 3. Die Teilnehmerliste findet ihre Klassen ueber genau diese Kennungen - ohne Kurscode, ohne
//    Kursnamen, nur ueber class_id/course_external_id.
// ---------------------------------------------------------------------------------------------
const p=await previewParticipantImport(env,auth,T,{source_name:'Paket',source_kind:'api',rows:mapParticipantRows(routed.participantRows)});
assert.equal(p.candidates.length,4);
const ohneKurs=p.candidates.filter(c=>!c.course_id);
assert.equal(ohneKurs.length,0,
  `jede Teilnehmerzeile muss ihre Klasse ueber die Kennung finden, ohne Kurs geblieben: ${JSON.stringify(ohneKurs.map(c=>[c.display_name,c.warnings]))}`);
const nachKurs=new Map(kurse.map(k=>[k.external_id,k.id]));
assert.equal(p.candidates[0].course_id,nachKurs.get('COURSE-001'),'Mila gehoert in Klasse 5a');
assert.equal(p.candidates[2].course_id,nachKurs.get('COURSE-002'),'Lina gehoert in Klasse 5b');
assert.equal(p.candidates[3].course_id,nachKurs.get('COURSE-003'),'Elif gehoert in Klasse 6a');
for(const c of p.candidates)
  assert.equal(c.warnings.length,0,`keine Zeile darf beanstandet werden, beanstandet: ${JSON.stringify([c.display_name,c.warnings])}`);
console.log('intake-package-cross-file-references 3/4 (Teilnehmer finden ihre Klasse ueber die Kundenkennung): ok');

// ---------------------------------------------------------------------------------------------
// 4. Ein zweiter Einwurf derselben Kursliste legt keinen zweiten Kurs an - wiedererkannt wird an
//    der Kennung, auch wenn der Traeger seinen Kursnamen inzwischen geaendert hat.
// ---------------------------------------------------------------------------------------------
const UMBENANNT=KURSE.replace('Klasse 5a','Klasse 5a (Ganztag)');
const org2=await previewOrganizationImport(env,auth,T,{source_name:'Paket erneut',source_kind:'structured',rows:mapOrganizationRows(parseCsv(UMBENANNT).rows)});
await applyOrganizationImport(env,auth,T,{batch_id:org2.batch_id,digest:org2.digest});
assert.equal(db.prepare('SELECT COUNT(*) n FROM courses WHERE tenant_id=?').get(T).n,3,
  'ein zweiter Einwurf derselben Kursliste darf keinen Kurs doppelt anlegen');
console.log('intake-package-cross-file-references 4/4 (zweiter Einwurf verdoppelt nichts): ok');

console.log('intake-package-cross-file-references: ok');
