// "Wenn Teilnehmer hochgeladen werden und diese in mehreren Kursen sind, sollte das im
// Teilnehmerprofil zusammengefasst werden. Und nicht das ich eine Fehlermeldung bekomme."
//
// Eine Zelle wie "ADM-26-01;ADM-26-02" war bisher EIN Kursname, den kein Kurs so trug: die
// ganze Zeile blieb mit "Angegebener Kurs existiert nicht" liegen. Wer wirklich in zwei Klassen
// sitzt - etwa weil er einen Zusatzkurs parallel besucht -, kam ueberhaupt nicht durch den
// Import. Jetzt entsteht aus einer solchen Zeile fuer jeden genannten Kurs eine eigene
// Mitgliedschaft derselben Person; das Teilnehmerprofil listet ohnehin alle Kurse einer Person
// nebeneinander (participant360.ts fragt sie schon heute ohne Einschraenkung ab) - hier wird nur
// dafuer gesorgt, dass beide Mitgliedschaften ueberhaupt entstehen.
//
// Dieser Test fuehrt aus: echtes SQLite mit dem echten Schema, echter Entwurf, echtes Anlegen -
// und die Gegenprobe, dass eine gewoehnliche Ein-Kurs-Zeile sich keinen Deut anders verhaelt als
// vorher.
import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { mapOrganizationRows } from '../dist/core/organization-import-file.js';
import { previewOrganizationImport, applyOrganizationImport } from '../dist/core/organization-import.js';
import { participant360 } from '../dist/core/participant-360.js';

const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON;');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));

const T='ten_multi',U='usr_multi',TS=new Date().toISOString();
db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Bildungswerk','bw-multi','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','leitung@example.invalid','Leitung','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_l','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,name,code,is_active,created_at,updated_at) VALUES('crs_bestand','${T}','Bestandskurs','BESTAND-A',1,'${TS}','${TS}');
`);
const versandt=[];
const env={DB:d1(db),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',
  EMAIL:{send:async m=>{versandt.push(m);return{messageId:`test-${versandt.length}`};}}};
const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
const rowsOf=text=>mapOrganizationRows(parseCsv(text).rows);
const zahl=(sql,...a)=>Number(Object.values(db.prepare(sql).get(...a)??{0:0})[0]||0);

// ---------------------------------------------------------------------------------------------
// 1. Zwei Kurse, die es noch nicht gibt - beide muessen im selben Lauf entstehen UND die Person
//    muss in beiden landen.
// ---------------------------------------------------------------------------------------------
const NEU=`role,name,email,course_code
participant,Mia Weber,mia.weber@example.invalid,ADM-26-01;ADM-26-02
`;
const entwurf1=await previewOrganizationImport(env,auth,T,{source_name:'teilnehmer.csv',rows:rowsOf(NEU)});
const kursFunde=entwurf1.candidates.filter(c=>c.type==='course'),teilnehmerFunde=entwurf1.candidates.filter(c=>c.type==='participant');
assert.equal(kursFunde.length,2,`aus einer Zelle mit zwei Kursen muessen zwei Kursvorschlaege entstehen, waren: ${kursFunde.length}`);
assert.deepEqual(kursFunde.map(c=>c.course_code).sort(),['ADM-26-01','ADM-26-02'],'beide genannten Kurse muessen erkannt werden');
assert.equal(teilnehmerFunde.length,2,`aus einer Person mit zwei Kursen muessen zwei Teilnehmerzeilen entstehen, waren: ${teilnehmerFunde.length}`);
assert.deepEqual(teilnehmerFunde.map(c=>c.display_name),['Mia Weber','Mia Weber'],'beide Zeilen muessen zur selben Person gehoeren');
assert.deepEqual(teilnehmerFunde.map(c=>c.course_code).sort(),['ADM-26-01','ADM-26-02'],'jede Zeile muss ihrem eigenen Kurs zugeordnet sein');
for(const t of teilnehmerFunde){
  assert.ok(!t.warnings.some(w=>['COURSE_NOT_FOUND','COURSE_AMBIGUOUS','COURSE_NOT_RESOLVED','COURSE_REQUIRED'].includes(w)),
    `eine mehrfach genannte, aber gueltige Kurszelle darf keine Fehlermeldung ausloesen - Hinweise: ${JSON.stringify(t.warnings)}`);
  assert.ok(t.warnings.includes('COURSE_WILL_BE_CREATED'),'beide Kurse existieren noch nicht - das muss offen benannt werden, nicht verschwiegen');
}
// Beide korrigierbaren Zeilen (Kurs + Teilnehmer) muessen auf DIESELBE Ursprungszeile zeigen -
// eine Typkorrektur in der Oberflaeche darf nicht nur die Haelfte der Person treffen.
assert.equal(new Set(teilnehmerFunde.map(c=>c.source_row)).size,1,'beide Teilnehmerzeilen muessen aus derselben Ursprungszeile stammen');

const ergebnis1=await applyOrganizationImport(env,auth,T,{batch_id:entwurf1.batch_id,digest:entwurf1.digest});
const angelegteKurse=ergebnis1.results.filter(r=>r.type==='course'&&r.action==='created');
assert.equal(angelegteKurse.length,2,`beide Kurse muessen angelegt werden, angelegt: ${angelegteKurse.length}`);
const teilnehmerErgebnisse=ergebnis1.results.filter(r=>r.type==='participant');
assert.equal(teilnehmerErgebnisse.length,2,'fuer beide Kurse muss je eine Mitgliedschaft entstehen');
assert.ok(teilnehmerErgebnisse.every(r=>r.action==='created_invited'||r.action==='existing_added'),
  `beide Mitgliedschaften muessen wirklich angelegt werden, Aktionen: ${JSON.stringify(teilnehmerErgebnisse.map(r=>r.action))}`);
assert.equal(new Set(teilnehmerErgebnisse.map(r=>r.user_id)).size,1,'beide Mitgliedschaften muessen zur selben Person gehoeren');
assert.equal(new Set(teilnehmerErgebnisse.map(r=>r.course_id)).size,2,'die Mitgliedschaften muessen zu zwei VERSCHIEDENEN Kursen gehoeren');

const userId=teilnehmerErgebnisse[0].user_id;
assert.equal(zahl(`SELECT COUNT(*) FROM memberships WHERE tenant_id=? AND user_id=? AND role='participant'`,T,userId),2,
  'in der Datenbank muessen es zwei eigenstaendige Mitgliedschaften sein - keine wurde durch die andere ersetzt');
assert.equal(zahl(`SELECT COUNT(DISTINCT email) FROM users WHERE id=?`,userId),1,'es darf nur EIN Benutzerkonto fuer Mia Weber entstehen');

// Und das Teilnehmerprofil fasst es zusammen, statt nur den ersten Kurs zu zeigen.
const profil=await participant360(env,auth,T,userId);
assert.equal(profil.courses.length,2,`das Profil muss beide Kurse zeigen, zeigte: ${profil.courses.length}`);
assert.deepEqual(profil.courses.map(c=>c.code).sort(),['adm-26-01','adm-26-02'],'das Profil muss genau die beiden zugeordneten Kurse nennen - createCourse fuehrt jeden Code durch slugify()');

// ---------------------------------------------------------------------------------------------
// 2. Derselbe Fall mit einem bereits BESTEHENDEN Kurs neben einem neuen - kein Doppel-Anlegen.
// ---------------------------------------------------------------------------------------------
const GEMISCHT=`role,name,email,course_code
participant,Jonas Kern,jonas.kern@example.invalid,BESTAND-A;ADM-26-03
`;
const entwurf2=await previewOrganizationImport(env,auth,T,{source_name:'teilnehmer2.csv',rows:rowsOf(GEMISCHT)});
const t2=entwurf2.candidates.filter(c=>c.type==='participant');
assert.equal(t2.length,2,'auch hier muessen zwei Teilnehmerzeilen entstehen');
const bestehend=t2.find(c=>c.course_code==='BESTAND-A'),neuer=t2.find(c=>c.course_code==='ADM-26-03');
assert.ok(bestehend.course_id,'der bereits bestehende Kurs muss sofort aufgeloest sein - kein "wird neu angelegt" fuer etwas, das es schon gibt');
assert.ok(!bestehend.warnings.includes('COURSE_WILL_BE_CREATED'),'ein bestehender Kurs darf nicht als neu angelegt gemeldet werden');
assert.ok(neuer.warnings.includes('COURSE_WILL_BE_CREATED'),'der wirklich neue Kurs muss weiterhin so gemeldet werden');
const ergebnis2=await applyOrganizationImport(env,auth,T,{batch_id:entwurf2.batch_id,digest:entwurf2.digest});
assert.equal(ergebnis2.results.filter(r=>r.type==='course'&&r.action==='created').length,1,
  'nur der wirklich neue Kurs darf angelegt werden');
assert.equal(zahl(`SELECT COUNT(*) FROM courses WHERE tenant_id=? AND code='BESTAND-A'`,T),1,
  'der bestehende Kurs darf sich nicht verdoppeln');
assert.equal(ergebnis2.results.filter(r=>r.type==='participant'&&(r.action==='created_invited'||r.action==='existing_added')).length,2,
  'auch im gemischten Fall muessen beide Mitgliedschaften entstehen');

// ---------------------------------------------------------------------------------------------
// 2b. Derselbe Fall ueber den Kursnamen statt den Kurscode - so, wie eine Liste ohne eigenes
//    Kurskennungssystem die Spalte fuehrt.
// ---------------------------------------------------------------------------------------------
const NAMEN=`role,name,email,course_name
participant,Tom Adler,tom.adler@example.invalid,Verwaltungsgrundlagen A; Verwaltungsgrundlagen B
`;
const entwurf2b=await previewOrganizationImport(env,auth,T,{source_name:'teilnehmer2b.csv',rows:rowsOf(NAMEN)});
const t2b=entwurf2b.candidates.filter(c=>c.type==='participant');
assert.equal(t2b.length,2,'auch eine ueber den Kursnamen getrennte Liste muss zwei Zeilen ergeben');
assert.deepEqual(t2b.map(c=>c.course_name).sort(),['Verwaltungsgrundlagen A','Verwaltungsgrundlagen B'],
  'jede Zeile muss ihren eigenen Kursnamen tragen - keine darf den Namen der anderen erben');
const ergebnis2b=await applyOrganizationImport(env,auth,T,{batch_id:entwurf2b.batch_id,digest:entwurf2b.digest});
assert.equal(new Set(ergebnis2b.results.filter(r=>r.type==='participant').map(r=>r.course_id)).size,2,
  'zwei ueber den Namen getrennte Kurse muessen zu zwei verschiedenen Mitgliedschaften fuehren');

// ---------------------------------------------------------------------------------------------
// 3. Die Gegenprobe: eine gewoehnliche Ein-Kurs-Zeile bleibt GENAU eine Zeile - keine
//    unbeabsichtigte Vervielfachung durch diese Aenderung.
// ---------------------------------------------------------------------------------------------
const EINFACH=`role,name,email,course_code
participant,Anna Fest,anna.fest@example.invalid,BESTAND-A
`;
const entwurf3=await previewOrganizationImport(env,auth,T,{source_name:'teilnehmer3.csv',rows:rowsOf(EINFACH)});
assert.equal(entwurf3.candidates.filter(c=>c.type==='participant').length,1,
  'eine Zeile ohne Trennzeichen darf sich nicht vervielfachen');
assert.equal(entwurf3.candidates.filter(c=>c.type==='course').length,0,
  'ein bestehender Kurs darf keinen zusaetzlichen Kursvorschlag erzeugen');

// ---------------------------------------------------------------------------------------------
// 4. Komma als Trennzeichen - genauso gaengig wie das Semikolon in einer deutschen Tabelle.
// ---------------------------------------------------------------------------------------------
const KOMMA=`role,name,email,course_code
participant,Lea Brand,lea.brand@example.invalid,"ADM-26-04,ADM-26-05"
`;
const entwurf4=await previewOrganizationImport(env,auth,T,{source_name:'teilnehmer4.csv',rows:rowsOf(KOMMA)});
assert.equal(entwurf4.candidates.filter(c=>c.type==='participant').length,2,
  'ein Komma muss genauso trennen wie ein Semikolon');
assert.deepEqual(entwurf4.candidates.filter(c=>c.type==='participant').map(c=>c.course_code).sort(),['ADM-26-04','ADM-26-05']);

console.log('organization-import-multi-course: ok (2 neue Kurse, gemischter Fall, Ein-Kurs-Gegenprobe)');
