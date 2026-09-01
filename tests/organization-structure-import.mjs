import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { routeRows } from '../dist/core/intake-classifier.js';
import { mapOrganizationRows } from '../dist/core/organization-import-file.js';
import { importRole, previewOrganizationImport, applyOrganizationImport, ORGANIZATION_BLOCKING_WARNINGS } from '../dist/core/organization-import.js';

// Ein Bildungstraeger laedt sein Organigramm hoch: Standorte mit Anschrift, darunter Bereiche,
// darunter Kurse und Raeume. Bis hierher landete jede dieser Zeilen im Auffangfall "Teilnehmer".
// Der Kunde bekam "Campus Nord", "Geschaeftsfuehrung" und "IT-Betrieb" als Personen ohne E-Mail
// zum Import vorgelegt - und "Verwaltung & Organisation" als Fach, weil in "Fachbereich" das
// Wort "Fach" steckt. Nichts davon war anzulegen, nichts davon war zu gebrauchen.
//
// Dieser Test liest nicht, er fuehrt aus: echtes SQLite mit dem echten Schema aller Migrationen,
// echte Kundenzeilen, echter Entwurf, echtes Anlegen.

// Genau die Kopfzeile und die Zeilen aus dem Abnahmepaket des Kunden (02_Organigramm.csv).
const ORGANIGRAMM=`node_type,location_id,unit_id,external_id,parent_external_id,name,type,location_external_id,street,postal_code,city,country
location,LOC-001,,LOC-BER-NORD,ORG-MBA-TEST,Campus Nord,Standort,LOC-BER-NORD,Datenbogenweg 17,12627,Berlin,DE
location,LOC-002,,LOC-BER-MITTE,ORG-MBA-TEST,Campus Mitte,Standort,LOC-BER-MITTE,Prüffeldstraße 42,10179,Berlin,DE
org_unit,,OU-001,OU-GF,ORG-MBA-TEST,Geschäftsführung,Leitung,LOC-BER-MITTE,,,,
org_unit,,OU-002,OU-VERW,OU-GF,Verwaltung & Organisation,Fachbereich,LOC-BER-MITTE,,,,
org_unit,,OU-011,OU-ITOPS,OU-GF,IT-Betrieb,Service,LOC-POT-OST,,,,
`;
// Die Kinder stehen hier absichtlich VOR ihren Eltern - die Reihenfolge in der Datei darf keine
// Rolle spielen.
const UMGEKEHRT=`node_type,external_id,parent_external_id,name,type
org_unit,OU-VERW,OU-GF,Verwaltung & Organisation,Fachbereich
org_unit,OU-GF,,Geschäftsführung,Leitung
`;
// Kopfzeile aus 03_Kurse.xlsx bzw. 06_Raeume_Ressourcen.xlsx des Kunden.
const KURSE=`course_id,external_id,parent_external_id,course_code,course_name,org_unit_external_id,location_external_id,status
CRS-001,EXT-ADM-26-01,OU-VERW,ADM-26-01,Verwaltungsgrundlagen A,OU-VERW,LOC-BER-MITTE,aktiv
`;
const RAEUME=`resource_id,external_id,parent_external_id,name,location_external_id,resource_type,capacity,features,status
RM-001,ROOM-BN-A101,LOC-BER-NORD,Seminarraum A101,LOC-BER-NORD,Raum,24,Beamer;Whiteboard,verfügbar
`;

const rowsOf=text=>mapOrganizationRows(parseCsv(text).rows);

// ---------------------------------------------------------------------------------------------
// 1. Die Erkennung. Ausgefuehrt auf den echten Zeilen des Kunden.
// ---------------------------------------------------------------------------------------------
assert.deepEqual(rowsOf(ORGANIGRAMM).map(importRole),['org_unit','org_unit','org_unit','org_unit','org_unit'],
  'jede Zeile eines Organigramms ist eine Einheit - keine Person und kein Fach');
assert.deepEqual(rowsOf(KURSE).map(importRole),['course'],'eine Kurszeile bleibt ein Kurs');
assert.deepEqual(rowsOf(RAEUME).map(importRole),['resource'],'ein Raum ist keine Person');

// Ohne node_type und ohne Typspalte - so schreibt Excel dieselbe Datei (02_Organigramm.xlsx
// enthaelt nur location_id, external_id, parent_external_id, name und die Anschrift).
assert.deepEqual(rowsOf('location_id,external_id,parent_external_id,name,street,postal_code,city,country\nLOC-001,LOC-BER-NORD,ORG-MBA-TEST,Campus Nord,Datenbogenweg 17,12627,Berlin,DE\n').map(importRole),
  ['org_unit'],'auch ohne Typspalte ist eine Zeile mit Standortkennung und Anschrift eine Einheit');
const ohneTyp=rowsOf('location_id,external_id,parent_external_id,name,street,postal_code,city,country\nLOC-001,LOC-BER-NORD,ORG-MBA-TEST,Campus Nord,Datenbogenweg 17,12627,Berlin,DE\n');

// Die Gegenprobe. Genau hier darf die Struktur-Erkennung NICHT greifen: wer einen Namen und eine
// E-Mail hat, ist ein Mensch und kein Bereich. Welche Art Mensch, entscheidet die Funktion -
// "Leitung" ist eine Verwaltungsfunktion, also eine beschaeftigte Person mit Rechten auf ihrem
// Bereich, und kein Kursteilnehmer. Die Zusage, um die es hier geht, bleibt dieselbe: keine
// Organisationseinheit.
const KEINE_EINHEIT=[
  [{role:'Leitung',display_name:'Frau Alma Reiter',email:'alma@example.invalid'},'staff',
    'eine Person mit E-Mail bleibt eine Person, auch wenn ihre Funktion "Leitung" heisst'],
  [{role:'Leitung',display_name:'Frau Alma Reiter',email:'alma@example.invalid',location_id:'LOC-1'},'staff',
    'auch neben einer Standortspalte bleibt eine Person mit E-Mail eine Person'],
  [{role:'Leitung',first_name:'Alma',last_name:'Reiter'},'staff',
    'ein Vor- und Nachname ist eine Person, kein Bereich'],
];
for(const [row,erwartet,warum] of KEINE_EINHEIT){
  assert.equal(importRole(row),erwartet,warum);
  assert.notEqual(importRole(row),'org_unit',`${warum} - und erst recht keine Organisationseinheit`);
}
assert.equal(importRole({fach:'Anatomie',fachkuerzel:'ANA'}),'subject','ein Fach bleibt ein Fach');
assert.equal(importRole({course_name:'Pflege 2026 A',course_code:'PF26A'}),'course','ein Kurs bleibt ein Kurs');
assert.equal(importRole({display_name:'Jonas Weber',email:'jonas@example.invalid',kurs:'PF26A'}),'participant',
  'ein Teilnehmer bleibt ein Teilnehmer');
// Ein Standort ohne Namen ist keine Einheit, die man anlegen koennte.
assert.equal(rowsOf('node_type,external_id,name\nlocation,LOC-X,\n').map(importRole)[0],'org_unit');

// Und der Eingang muss ein Organigramm auf denselben Weg schicken. Vorher galt jede dieser
// Zeilen als Teilnehmerzeile - der ganze Ordner landete beim Teilnehmerimport.
assert.equal(routeRows(parseCsv(ORGANIGRAMM).rows).route,'organization','ein Organigramm gehoert in den Organisationsimport');
assert.equal(routeRows(parseCsv(RAEUME).rows).route,'organization','eine Raumliste gehoert in den Organisationsimport');

// ---------------------------------------------------------------------------------------------
// 2. Echtes Schema, echter Entwurf, echtes Anlegen.
// ---------------------------------------------------------------------------------------------
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_struct',U='usr_struct',TS=new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Märkische Bildungsakademie','mba','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_struct','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_adm','${T}',NULL,'Verwaltungsgrundlagen A','adm-26-01','login',1,'${TS}','${TS}');
`);
const env={DB:d1(db)};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const apply=async preview=>applyOrganizationImport(env,auth,T,{batch_id:preview.batch_id,digest:preview.digest});

const preview=await previewOrganizationImport(env,auth,T,{source_name:'02_Organigramm.csv',rows:rowsOf(ORGANIGRAMM)});
assert.equal(preview.candidates.length,5,'aus fuenf Zeilen duerfen nicht mehr und nicht weniger Funde werden');
assert.equal(preview.summary.counts.org_unit,5);
assert.equal(preview.summary.counts.participant,undefined,'keine dieser Zeilen ist eine Person');
assert.equal(preview.summary.counts.subject,undefined,'"Fachbereich" ist kein Fach');

// Dieselbe Zeile ohne Typspalte - so schreibt Excel sie - muss trotzdem ein Standort werden und
// kein beliebiger Bereich: die Anschrift ist das entscheidende Merkmal.
const ohneTypPreview=await previewOrganizationImport(env,auth,T,{source_name:'ohne-typ.csv',rows:ohneTyp});
assert.equal(ohneTypPreview.candidates[0].org_unit_type_key,'location',
  'eine Zeile mit Anschrift ist ein Standort, auch wenn die Datei keinen Typ nennt');

const byName=Object.fromEntries(preview.candidates.map(c=>[c.display_name,c]));
assert.equal(byName['Campus Nord'].org_unit_type_key,'location','ein Standort bekommt den mitgelieferten Typ');
assert.equal(byName['Verwaltung & Organisation'].org_unit_type_key,'department','ein Fachbereich ist ein Bereich');
assert.equal(byName['Geschäftsführung'].org_unit_type_key,'leitung','eine eigene Bezeichnung des Kunden bleibt erhalten');
assert.equal(byName['Geschäftsführung'].org_unit_type_label,'Leitung');
assert.equal(byName['IT-Betrieb'].org_unit_type_key,'service');
assert.deepEqual(byName['Campus Nord'].address,{street:'Datenbogenweg 17',postal_code:'12627',city:'Berlin',country:'DE'},
  'die Anschrift eines Standorts darf nicht verloren gehen');

// Der oberste Knoten des Kunden (der Traeger selbst) steht nicht in der Datei. Das ist zu sagen,
// aber es darf den Import nicht blockieren.
assert.ok(byName['Campus Nord'].warnings.includes('ORG_UNIT_PARENT_NOT_FOUND'),
  'eine unbekannte uebergeordnete Kennung muss benannt werden');
assert.ok(!byName['Verwaltung & Organisation'].warnings.length,
  'ein Elternknoten aus derselben Datei ist kein Hinweis wert');
assert.equal(byName['Campus Nord'].confidence,100,'ein benannter Hinweis darf die Sicherheit nicht senken');
assert.equal(preview.summary.needs_review,0,'nichts an diesem Organigramm ist unklar');

const applied=await apply(preview);
const created=applied.results.filter(r=>r.type==='org_unit'&&r.action==='created');
assert.equal(created.length,5,`alle fuenf Einheiten muessen entstehen, entstanden sind ${created.length}: ${JSON.stringify(applied.results)}`);

const units=Object.fromEntries(db.prepare('SELECT external_id,id,parent_id,type_key,name,metadata_json FROM org_units WHERE tenant_id=?').all(T).map(r=>[r.external_id,r]));
assert.equal(Object.keys(units).length,5);
assert.equal(units['OU-VERW'].parent_id,units['OU-GF'].id,'die Hierarchie der Datei muss im Portal stehen');
assert.equal(units['OU-ITOPS'].parent_id,units['OU-GF'].id);
assert.equal(units['LOC-BER-NORD'].parent_id,null,'ein Knoten ohne auffindbaren Elternknoten wird oberste Ebene');
assert.equal(units['OU-GF'].parent_id,null);
assert.equal(JSON.parse(units['LOC-BER-NORD'].metadata_json||'{}').city,'Berlin','die Anschrift muss am Standort gespeichert werden');
const types=Object.fromEntries(db.prepare('SELECT type_key,label,is_active FROM org_unit_types WHERE tenant_id=?').all(T).map(r=>[r.type_key,r]));
assert.equal(types.leitung.label,'Leitung','ein neuer Typ wird mit der Bezeichnung des Kunden angelegt');
assert.equal(types.location.label,'Standort','ein vorhandener Typ darf nicht ueberschrieben werden');

// Zweiter Durchlauf derselben Datei: nichts darf sich verdoppeln.
const again=await apply(await previewOrganizationImport(env,auth,T,{source_name:'02_Organigramm.csv',rows:rowsOf(ORGANIGRAMM)}));
assert.equal(again.results.filter(r=>r.action==='created').length,0,'ein zweiter Durchlauf darf nichts erneut anlegen');
assert.equal(again.results.filter(r=>r.type==='org_unit'&&r.action==='existing').length,5,
  'ein zweiter Durchlauf muss die Einheiten als vorhanden melden - nicht als fehlgeschlagen');
assert.equal(db.prepare('SELECT COUNT(*) n FROM org_units WHERE tenant_id=?').get(T).n,5,'ein zweiter Durchlauf darf nichts verdoppeln');

// Die Reihenfolge in der Datei darf keine Rolle spielen: Kind vor Elternteil.
const reverse=await apply(await previewOrganizationImport(env,auth,T,{source_name:'umgekehrt.csv',rows:rowsOf(UMGEKEHRT)}));
assert.equal(reverse.results.filter(r=>r.action==='created').length,0,'beide Einheiten gab es schon');
const fresh=new DatabaseSync(':memory:');
fresh.exec('PRAGMA foreign_keys=ON;');
fresh.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())fresh.exec(await readFile(`migrations/${name}`,'utf8'));
fresh.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','MBA','mba','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_struct','${T}',NULL,'${U}','tenant_admin','${TS}');
`);
const freshEnv={DB:d1(fresh)};
const reversePreview=await previewOrganizationImport(freshEnv,auth,T,{source_name:'umgekehrt.csv',rows:rowsOf(UMGEKEHRT)});
await applyOrganizationImport(freshEnv,auth,T,{batch_id:reversePreview.batch_id,digest:reversePreview.digest});
const reverseUnits=Object.fromEntries(fresh.prepare('SELECT external_id,id,parent_id FROM org_units WHERE tenant_id=?').all(T).map(r=>[r.external_id,r]));
assert.equal(reverseUnits['OU-VERW'].parent_id,reverseUnits['OU-GF'].id,
  'steht das Kind vor dem Elternteil, muss es warten statt an der Wurzel zu landen');

// ---------------------------------------------------------------------------------------------
// 3. Ein Kurs gehoert an seinen Bereich, ein Raum an seinen Standort.
// ---------------------------------------------------------------------------------------------
const coursePreview=await previewOrganizationImport(env,auth,T,{source_name:'03_Kurse.csv',rows:rowsOf(KURSE)});
assert.equal(coursePreview.candidates[0].org_unit_ref,'OU-VERW','die Bereichsspalte der Kursliste darf nicht weggeworfen werden');
await apply(coursePreview);
const link=db.prepare('SELECT org_unit_id,is_primary FROM course_org_units WHERE tenant_id=? AND course_id=?').get(T,'crs_adm');
assert.ok(link,'der Kurs muss mit seinem Bereich verbunden werden');
assert.equal(link.org_unit_id,units['OU-VERW'].id);
assert.equal(Number(link.is_primary),1,'die erste Zuordnung eines Kurses ist seine fuehrende');
await apply(await previewOrganizationImport(env,auth,T,{source_name:'03_Kurse.csv',rows:rowsOf(KURSE)}));
assert.equal(db.prepare('SELECT COUNT(*) n FROM course_org_units WHERE tenant_id=? AND course_id=?').get(T,'crs_adm').n,1,
  'dieselbe Zuordnung darf nicht zweimal entstehen');

const roomPreview=await previewOrganizationImport(env,auth,T,{source_name:'06_Raeume.csv',rows:rowsOf(RAEUME)});
assert.equal(roomPreview.candidates[0].type,'resource');
assert.equal(roomPreview.candidates[0].resource_kind,'room');
assert.equal(roomPreview.candidates[0].capacity,24);
assert.deepEqual(roomPreview.candidates[0].features,['Beamer','Whiteboard']);
assert.equal(roomPreview.candidates[0].resource_status,'active','"verfügbar" ist nutzbar');
await apply(roomPreview);
const room=db.prepare('SELECT name,resource_type,code,location,capacity,features_json,status FROM planning_resources WHERE tenant_id=?').get(T);
assert.ok(room,'ein Raum muss als Ressource entstehen, nicht als Person');
assert.equal(room.resource_type,'room');
assert.equal(room.code,'ROOM-BN-A101');
assert.equal(room.location,'Campus Nord','der Standort des Raums muss aufgeloest werden, nicht als Kennung stehen bleiben');
assert.equal(Number(room.capacity),24);
assert.deepEqual(JSON.parse(room.features_json),['Beamer','Whiteboard']);
assert.equal(room.status,'active');
const roomAgain=await apply(await previewOrganizationImport(env,auth,T,{source_name:'06_Raeume.csv',rows:rowsOf(RAEUME)}));
assert.equal(db.prepare('SELECT COUNT(*) n FROM planning_resources WHERE tenant_id=?').get(T).n,1,'derselbe Raum darf nicht zweimal entstehen');
assert.equal(roomAgain.results.filter(r=>r.type==='resource'&&r.action==='existing').length,1,
  'ein bekannter Raum muss als vorhanden gemeldet werden - nicht als fehlgeschlagen');

// ---------------------------------------------------------------------------------------------
// 4. Was der Pruefende korrigiert, gilt - auch fuer Einheiten.
// ---------------------------------------------------------------------------------------------
const corrected=await previewOrganizationImport(env,auth,T,{source_name:'korrektur.csv',rows:rowsOf(ORGANIGRAMM),role_overrides:{'0':'ignore','2':'participant'}});
assert.equal(corrected.candidates.length,4,'eine abgewaehlte Zeile darf nicht mehr auftauchen');
assert.equal(corrected.candidates.filter(c=>c.type==='participant').length,1,'eine richtiggestellte Zeile muss als das gelten, was der Pruefende sagt');
assert.ok(corrected.candidates.find(c=>c.type==='participant').warnings.includes('EMAIL_REQUIRED'),
  'auch eine richtiggestellte Zeile laeuft durch dieselbe Pruefung');

console.log('Standorte, Organisationseinheiten, Raeume und ihre Zuordnungen werden aus echten Kundendateien angelegt: OK');

// ---------------------------------------------------------------------------------------------
// 4b. Die Reihenfolge des Anlegens haengt an der Art des Fundes, nicht an der Zeilennummer.
//     Steht der Teilnehmer in der Datei VOR seinem Kurs und der Kurs vor seinem Bereich, muss
//     trotzdem erst der Bereich, dann der Kurs und zuletzt der Teilnehmer entstehen. Sonst
//     scheiterte jede solche Datei an sich selbst: COURSE_NOT_RESOLVED fuer einen Kurs, den
//     dieselbe Datei anlegt.
// ---------------------------------------------------------------------------------------------
const DURCHEINANDER=`role,name,email,course_name,course_code,org_unit_external_id,external_id,parent_external_id,node_type,type
Teilnehmer,Jonas Weber,jonas.weber@example.invalid,Pflege 2026 A,PF26A,,,,,
Dozent,Alma Reiter,alma.reiter@example.invalid,Pflege 2026 A,PF26A,,,,,
Kurs,,,Pflege 2026 A,PF26A,OU-PFLEGE,,,,
,,,,,,OU-PFLEGE,,org_unit,Fachbereich
`;
const mixed=rowsOf(DURCHEINANDER);
mixed[3].name='Pflege & Gesundheit';
// Die Kurszeile steht in der Datei zweimal: einmal ohne Bereichsangabe und einmal mit. Aus beiden
// darf ein Fund werden, und die Bereichsangabe darf dabei nicht verloren gehen.
mixed.splice(2,0,{role:'Kurs',course_name:'Pflege 2026 A',course_code:'PF26A'});
// Und ganz vorn eine Unterrichtsstunde - die Zeilenart mit den meisten Abhaengigkeiten: sie
// braucht ihren Kurs UND ihre Dozentin, und beide stehen in dieser Datei hinter ihr.
mixed.unshift({role:'Unterricht',datum:'10.09.2026',beginn:'08:15',ende:'11:30',
  course_code:'PF26A',dozent:'Alma Reiter',raum:'A-1'});
assert.deepEqual(mixed.map(importRole),['lesson','participant','teacher','course','course','org_unit'],
  'die Datei nennt die Stunde zuerst und die Einheit zuletzt - genau umgekehrt zur noetigen Reihenfolge');

// Neue Personen bekommen eine Einladung. Ohne Mailweg lehnt der Import sie zu Recht ab - das ist
// eine eigene Regel und darf diese Messung der Reihenfolge nicht verdecken. Der Versand selbst
// wird hier nur entgegengenommen und gezaehlt: aus einem Testlauf darf keine echte Mail hinausgehen.
const sent=[];
const mailEnv={...env,MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',EMAIL:{send:async message=>{sent.push(message);return{messageId:`test-${sent.length}`};}}};
const mixedPreview=await previewOrganizationImport(mailEnv,auth,T,{source_name:'durcheinander.csv',rows:mixed});
// Denselben Kurs nennen hier drei Zeilen. Daraus darf genau ein Fund werden - und zwar die echte
// Kurszeile, nicht der Platzhalter, der aus der Teilnehmerzeile entsteht: nur die echte Zeile
// laesst sich in der Vorschau im Typ richtigstellen, und nur sie kennt ihren Bereich.
const kursFunde=mixedPreview.candidates.filter(c=>c.type==='course');
assert.equal(kursFunde.length,1,'derselbe Kurs darf nicht mehrfach vorgeschlagen werden');
assert.ok(!kursFunde[0].synthesized,'der Fund muss die echte Kurszeile sein, nicht der Platzhalter');
assert.ok(kursFunde[0].source_row===2||kursFunde[0].source_row===3,'sonst zeigt die Typkorrektur auf die falsche Zeile der Datei');
assert.equal(kursFunde[0].org_unit_ref,'OU-PFLEGE','der Bereich der Kurszeile darf nicht verloren gehen');
const mixedResult=await applyOrganizationImport(mailEnv,auth,T,{batch_id:mixedPreview.batch_id,digest:mixedPreview.digest});
const step=type=>mixedResult.results.findIndex(r=>r.type===type);
assert.ok(step('org_unit')<step('course'),'die Einheit muss vor dem Kurs entstehen');
assert.ok(step('course')<step('participant'),'der Kurs muss vor seinem Teilnehmer entstehen');
// Der Dozent haengt an seinem Kurs, nicht am Teilnehmer. Frueher stand hier "der Dozent wird
// zuletzt zugeordnet" - das hielt eine zufaellige Reihenfolge fest, keine Abhaengigkeit, und
// verdeckte die eine, die wirklich zaehlt: eine Unterrichtsstunde braucht ihre Dozentin. Solange
// 'lesson' vor 'teacher' lief, ergab ein ganzer eingeworfener Ordner 29 Stunden ohne eine
// einzige Dozentin, obwohl beide Listen darin lagen.
assert.ok(step('course')<step('teacher'),'der Dozent haengt an seinem Kurs und muss nach ihm entstehen');
assert.ok(step('teacher')<step('lesson'),'die Dozentin muss vor der Unterrichtsstunde entstehen, die sie haelt');
for(const r of mixedResult.results)
  assert.notEqual(r.action,'skipped',`nichts darf an der Reihenfolge scheitern: ${JSON.stringify(r)}`);
// Und die Zuordnung ist wirklich entstanden, nicht nur die Reihenfolge stimmig: die Stunde aus
// derselben Datei traegt die Dozentin aus derselben Datei.
const gehalteneStunde=db.prepare('SELECT teacher_id FROM lessons WHERE tenant_id=?').get(T);
assert.ok(gehalteneStunde,'die Unterrichtsstunde aus derselben Datei muss entstanden sein');
assert.equal(gehalteneStunde.teacher_id,
  db.prepare('SELECT id FROM teachers WHERE tenant_id=? AND name=?').get(T,'Alma Reiter')?.id,
  'die Stunde muss die Dozentin tragen, die dieselbe Datei anlegt');
const neuerKurs=db.prepare('SELECT id FROM courses WHERE tenant_id=? AND code=?').get(T,'pf26a');
assert.ok(neuerKurs,'der Kurs aus derselben Datei muss entstanden sein');
assert.equal(db.prepare('SELECT COUNT(*) n FROM memberships WHERE tenant_id=? AND course_id=?').get(T,neuerKurs.id).n>0,true,
  'der Teilnehmer muss in dem Kurs stehen, den dieselbe Datei angelegt hat');
assert.ok(db.prepare('SELECT org_unit_id FROM course_org_units WHERE tenant_id=? AND course_id=?').get(T,neuerKurs.id),
  'der Kurs muss an dem Bereich haengen, den dieselbe Datei angelegt hat');

// ---------------------------------------------------------------------------------------------
// 5. Die Oberflaeche. Was der Server sperrt, muss die Oberflaeche genauso sperren - und der Weg
//    dorthin muss auffindbar sein.
// ---------------------------------------------------------------------------------------------
const orgUi=await readFile('public/organization-import-ui.js','utf8');
const cockpit=await readFile('public/intake-center-ui.js','utf8');
const errors=await readFile('public/kp-error-text.js','utf8');
// Genau die Liste pruefen, die sperrt - nicht irgendein Vorkommen des Codes in einer
// Beschriftung. Sonst bliebe eine entfernte Sperre unbemerkt.
const listAfter=(text,marker)=>{const from=text.indexOf(marker);assert.notEqual(from,-1,`${marker} nicht gefunden`);const rest=text.slice(from+marker.length);return rest.slice(0,rest.indexOf(']'));};
const orgBlockingList=listAfter(orgUi,'const blocking=new Set(['),cockpitBlockingList=listAfter(cockpit,"const orgBlocking=c=>c.type==='tenant_admin_review'||(c.warnings||[]).some(x=>[");
for(const w of ORGANIZATION_BLOCKING_WARNINGS){
  assert.ok(orgBlockingList.includes(`'${w}'`),`die Vorschau muss ${w} genauso sperren wie der Server`);
  assert.ok(cockpitBlockingList.includes(`'${w}'`),`das Pruef-Cockpit muss ${w} genauso sperren wie der Server`);
}
for(const t of ['org_unit','resource'])assert.ok(orgUi.includes(`['${t}',`),`der Pruefende muss eine Zeile auf "${t}" richtigstellen koennen`);
assert.ok(orgUi.includes('ORG_UNIT_PARENT_NOT_FOUND'),'ein benannter Hinweis muss auch angezeigt werden');
// Jeder Code, den dieser Weg werfen kann, braucht einen deutschen Satz. Ein SCREAMING_SNAKE in
// der Oberflaeche ist fuer den Kunden keine Auskunft.
for(const code of ['ORG_UNIT_NAME_REQUIRED','ORG_UNIT_PARENT_INVALID','ORG_UNIT_PARENT_UNRESOLVED','ORG_UNIT_TYPE_INACTIVE','ORG_UNIT_TYPE_MISSING','ORG_TYPE_NOT_FOUND','ORG_EXTERNAL_ID_EXISTS','ORG_UNIT_FIELDS_REQUIRED','RESOURCE_NAME_REQUIRED','FORBIDDEN_PLANNING_MANAGE'])
  assert.ok(new RegExp(`\\b${code}:'`).test(errors),`${code} braucht einen verstaendlichen deutschen Satz`);

// Der Eintrag heisst jetzt nach dem, was er tut: nicht nur Teilnehmer, sondern der ganze
// Bildungstraeger. Die Beschriftung kommt aus der Uebersetzung - ohne den Schluessel dort
// ueberschreibt die Sprachschicht den Knopf wieder mit dem alten Text.
const customerUi=await readFile('public/customer-admin-ui.js','utf8');
const i18n=await readFile('public/customer-admin-i18n.js','utf8');
assert.match(customerUi,/PRIMARY_NAV_LABELS=new Set\(\[[^\]]*'Bildungsträger importieren'/,'der Einstieg muss dauerhaft sichtbar bleiben');
assert.match(orgUi,/customerNavSourceLabel='Bildungsträger importieren';b\.textContent='Bildungsträger importieren'/,
  'der Knopf muss unter diesem Namen laufen');
assert.match(i18n,/\['Bildungsträger importieren','provider_import'\]/,'die Sprachschicht muss den neuen Eintrag kennen');
assert.equal((i18n.match(/provider_import:'/g)||[]).length,13,
  'ohne Uebersetzung in jeder Sprache faellt der Eintrag in anderen Sprachen auf den Schluesselnamen zurueck');
assert.match(i18n,/participant_import:'Nur Teilnehmer importieren'/,'der reine Teilnehmerimport bleibt als eigener Eintrag erhalten');

// Ein ganzer Ordner muss sich ins Fenster ziehen lassen - und die Ablegeflaeche muss sichtbar
// sein, nicht nur zufaellig auftauchen, waehrend man etwas darueber zieht.
const quick=await readFile('public/intake-quick-upload-ui.js','utf8');
const shared=await readFile('public/kp-folder-drop.js','utf8');
const shell=await readFile('public/customer-admin.html','utf8');
assert.match(shared,/webkitGetAsEntry/,'ein abgelegter Ordner muss als Verzeichnis gelesen werden');
assert.match(shared,/createReader\(\)/,'ein abgelegter Ordner muss durchlaufen werden');
assert.match(shared,/if\(!batch\.length\)break;/,'readEntries liefert hoechstens 100 Eintraege - es muss bis zur leeren Antwort weitergelesen werden');
assert.match(shared,/webkitdirectory/,'der Ordner muss sich auch ueber den Dateidialog waehlen lassen');
assert.match(shared,/function dropCard\(/,'die sichtbare Ablegeflaeche muss es als gemeinsames Bauteil geben');
assert.match(shared,/e\.stopPropagation\(\)/,'ein Wurf auf die sichtbare Flaeche darf nicht zusaetzlich fensterweit ankommen');
assert.match(shell,/kp-folder-drop\.js/,'ohne Einbindung steht das gemeinsame Bauteil keiner der beiden Seiten zur Verfuegung');

// Dass die Flaeche in jedem Fall wieder verschwindet, wird ausgefuehrt statt gelesen:
// tests/intake-drop-overlay.mjs fuehrt sie gegen eine Nachbildung des Fensters. Hier steht nur,
// dass es keine zweite, abweichende Kopie davon gibt.
assert.match(quick,/KPFolderDrop\?\.windowDropOverlay\(/,'der Sofort-Eingang muss die gemeinsame Ablegeflaeche benutzen');
assert.ok(!/depth\+\+|depth=Math\.max/.test(quick),'eine Zaehlung von dragenter gegen dragleave darf es nicht mehr geben - genau sie blieb haengen');
assert.ok(!/#intake-drop-overlay/.test(quick),'es darf nur eine Ablegeflaeche geben, nicht zwei, die auseinanderlaufen');

// Beide Einstiege muessen sich gleich verhalten.
assert.match(quick,/window\.KPIntakeUpload=/,'der Bildungstraeger-Import muss denselben Weg benutzen koennen');
assert.match(quick,/f\.onclick=openDropDialog/,'"Ganzen Ordner einlesen" muss die sichtbare Flaeche oeffnen, nicht sofort den Dateidialog');
assert.match(orgUi,/<div data-org-drop><\/div>/,'auch "Bildungsträger importieren" braucht die sichtbare Ablegeflaeche im Dialog');
assert.match(orgUi,/window\.KPFolderDrop\.dropCard\(/,'und zwar dieselbe wie der Ordner-Einstieg');
assert.match(orgUi,/KPFolderDrop\.routeDropped\(result\)==='preview'/,'eine einzelne Liste geht direkt in die Vorschau mit der Typkorrektur');
assert.match(orgUi,/window\.KPIntakeUpload\.accept\(result\)/,'ein ganzer Ordner geht ueber den Eingang');
assert.match(quick,/Unklare Fälle jetzt prüfen/,'nach dem Einlesen muss der Weg zur Pruefung dastehen, nicht nur ihr Name');

console.log('Oberflaeche: gleiche Sperren wie der Server, benannter Einstieg und Ordner per Drag & Drop: OK');
