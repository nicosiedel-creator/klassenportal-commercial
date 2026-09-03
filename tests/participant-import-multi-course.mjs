import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { d1 } from './helpers/d1.mjs';
import { parseCsv } from '../dist/portability/csv.js';
import { mapParticipantRows } from '../dist/core/participant-import-file.js';
import { previewParticipantImport, applyParticipantImport } from '../dist/core/participant-document-import.js';

// Meldung des Kunden: "Wenn Teilnehmer hochgeladen werden und diese in mehreren Kursen sind,
// sollte das im Teilnehmer profil zusammengefasst werden. Und nicht das ich eine Fehlermeldung
// bekomme." Der Organisations-Import (PR #220) konnte das schon; der eigenständige Weg "Nur
// Teilnehmer importieren" (dieselbe Kurs-Spalte, aber eigene Erkennung in
// participant-document-import.ts) kannte je Zeile nur einen einzigen Kurs.
//
// Eine Zelle mit mehreren, durch Semikolon/Komma/Pipe/Zeilenumbruch getrennten Kursen wird jetzt
// in mehrere Kandidaten aufgeteilt - eine Person, mehrere Kurszuordnungen. createTenantUser legt
// dabei nur einmal ein Konto an; die zweite Kurszuordnung wird als bestehendes Konto ergänzt, so
// dass am Ende genau eine Person mit mehreren Mitgliedschaften im Teilnehmerprofil steht.

const KOPF='Teilnehmer_ID;Vorname;Nachname;E-Mail;Kurscode;Status';
const ZEILEN=[
  // Komma-Liste, unquotiert - der Zell-Trenner ist hier ";", ein Komma in der Zelle bleibt also
  // ein normales Zeichen und braucht keine Anführungszeichen.
  'T101;Lea;Brand;lea.brand@lernende.example.invalid;VFA-26-A,VFA-26-B;aktiv',
  // Regressionszeile: ein einzelner Kurs muss weiterhin genau einen Kandidaten ergeben.
  'T102;Max;Muster;max.muster@lernende.example.invalid;VFA-26-A;aktiv',
  // Semikolon-Liste - hier muss die Zelle in Anführungszeichen stehen, sonst trennt sie der
  // CSV-Parser selbst in zwei Spalten. Genau das speichert Excel beim Export so ab.
  'T103;Nina;Roth;nina.roth@lernende.example.invalid;"VFA-26-A;VFA-26-B";aktiv',
];
const DATEI=[KOPF,...ZEILEN].join('\n')+'\n';

async function frischeUmgebung(slug){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON;');
  db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
  for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort())db.exec(await readFile(`migrations/${name}`,'utf8'));
  const T='ten_mc',U='usr_mc',TS=new Date().toISOString();
  db.exec(`
INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES('${T}','Hellersdorfer Bildungs gGmbH','${slug}','active','${TS}','${TS}');
INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES('${U}','admin@example.invalid','Admin','x',0,0,'active','${TS}','${TS}');
INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_mc','${T}',NULL,'${U}','tenant_admin','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_a','${T}',NULL,'Umschulung VFA A','VFA-26-A','login',1,'${TS}','${TS}');
INSERT INTO courses(id,tenant_id,location_id,name,code,access_mode,is_active,created_at,updated_at) VALUES('crs_b','${T}',NULL,'Umschulung VFA B','VFA-26-B','login',1,'${TS}','${TS}');
`);
  const versandt=[];
  const env={DB:d1(db),MAIL_FROM:'kein-versand@example.invalid',APP_ORIGIN:'https://portal.example.invalid',
    EMAIL:{send:async m=>{versandt.push(m);return{messageId:`test-${versandt.length}`};}}};
  const auth={userId:U,role:'tenant_admin',tenantIds:[T],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false};
  return{db,T,U,env,auth,versandt};
}

// -------------------------------------------------------------------------------------------
// 1. Der Entwurf: aus 3 Zeilen müssen 5 Kandidaten werden - Lea und Nina je zweimal, mit
//    unterschiedlichem, jeweils aufgelöstem Kurs; Max unverändert einmal.
// -------------------------------------------------------------------------------------------
{
  const {env,auth,T}=await frischeUmgebung('hbg-mc1');
  const zeilen=mapParticipantRows(parseCsv(DATEI).rows);
  assert.equal(zeilen.length,3,'die Datei muss 3 Zeilen liefern');
  const entwurf=await previewParticipantImport(env,auth,T,{source_name:'multi.csv',rows:zeilen});
  assert.equal(entwurf.candidates.length,5,
    `3 Zeilen mit 2+1+2 Kursen müssen 5 Kandidaten ergeben, gefunden: ${entwurf.candidates.length}`);
  const lea=entwurf.candidates.filter(c=>c.email==='lea.brand@lernende.example.invalid');
  const nina=entwurf.candidates.filter(c=>c.email==='nina.roth@lernende.example.invalid');
  const max=entwurf.candidates.filter(c=>c.email==='max.muster@lernende.example.invalid');
  assert.equal(lea.length,2,`Lea muss zwei Kandidaten haben (Komma-Liste), gefunden: ${lea.length}`);
  assert.equal(nina.length,2,`Nina muss zwei Kandidaten haben (Semikolon-Liste), gefunden: ${nina.length}`);
  assert.equal(max.length,1,`Max (ein Kurs) darf nicht aufgeteilt werden, gefunden: ${max.length}`);
  assert.deepEqual(new Set(lea.map(c=>c.course_id)),new Set(['crs_a','crs_b']),
    `Leas beide Kandidaten müssen auf die beiden echten Kurse aufgelöst sein, gefunden: ${JSON.stringify(lea.map(c=>c.course_id))}`);
  assert.deepEqual(new Set(nina.map(c=>c.course_id)),new Set(['crs_a','crs_b']),
    `Ninas beide Kandidaten müssen auf die beiden echten Kurse aufgelöst sein, gefunden: ${JSON.stringify(nina.map(c=>c.course_id))}`);
  for(const c of[...lea,...nina,...max])
    assert.equal((c.warnings||[]).length,0,
      `keiner der aufgeteilten Kandidaten darf beanstandet werden, gefunden: ${JSON.stringify([c.display_name,c.course_id,c.warnings])}`);
  console.log('participant-import-multi-course 1/4 (Entwurf teilt Zellen mit mehreren Kursen auf): ok');
}

// -------------------------------------------------------------------------------------------
// 2. Die Übernahme: aus 5 Kandidaten müssen 3 Personen mit zusammen 5 Mitgliedschaften werden -
//    und genau 3 Einladungen, nicht 5. Die zweite Kurszuordnung derselben Person darf keine
//    zweite Mail auslösen; sie ergänzt nur das bestehende Konto.
// -------------------------------------------------------------------------------------------
{
  const {env,auth,T,db,versandt}=await frischeUmgebung('hbg-mc2');
  const zeilen=mapParticipantRows(parseCsv(DATEI).rows);
  const entwurf=await previewParticipantImport(env,auth,T,{source_name:'multi.csv',rows:zeilen});
  const ergebnis=await applyParticipantImport(env,auth,T,{batch_id:entwurf.batch_id,digest:entwurf.digest});
  const uebersprungen=ergebnis.results.filter(r=>r.action==='skipped');
  assert.equal(uebersprungen.length,0,
    `keine der 5 Zeilen darf übersprungen werden, übersprungen: ${JSON.stringify(uebersprungen)}`);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email LIKE '%@lernende.example.invalid'").get().n,3,
    'aus 5 Kandidaten müssen genau 3 Personen werden - Lea und Nina je einmal, nicht doppelt');
  assert.equal(db.prepare("SELECT COUNT(*) n FROM memberships WHERE tenant_id=? AND role='participant'").get(T).n,5,
    'zusammen müssen 5 Mitgliedschaften entstehen - eine je Kurszuordnung');
  const leaMemberships=db.prepare(`SELECT m.course_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email='lea.brand@lernende.example.invalid' AND m.role='participant'`).all();
  assert.deepEqual(new Set(leaMemberships.map(r=>r.course_id)),new Set(['crs_a','crs_b']),
    `Leas Profil muss beide Kurse zusammenfassen, gefunden: ${JSON.stringify(leaMemberships)}`);
  const ninaMemberships=db.prepare(`SELECT m.course_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email='nina.roth@lernende.example.invalid' AND m.role='participant'`).all();
  assert.deepEqual(new Set(ninaMemberships.map(r=>r.course_id)),new Set(['crs_a','crs_b']),
    `Ninas Profil muss beide Kurse zusammenfassen, gefunden: ${JSON.stringify(ninaMemberships)}`);
  assert.equal(versandt.length,3,
    `es dürfen nur 3 Einladungen verschickt werden - eine je Person, nicht eine je Kurszuordnung, verschickt: ${versandt.length}`);
  const empfaenger=new Set(versandt.map(m=>String(m?.to||m?.To||m?.recipient||'')));
  assert.deepEqual(empfaenger,new Set(['lea.brand@lernende.example.invalid','max.muster@lernende.example.invalid','nina.roth@lernende.example.invalid']),
    `jede der 3 Personen darf genau eine eigene Einladung bekommen, gefunden: ${JSON.stringify([...empfaenger])}`);
  console.log('participant-import-multi-course 2/4 (Übernahme fasst Kurse im Profil zusammen, eine Einladung je Person): ok');
}

// -------------------------------------------------------------------------------------------
// 3. Fortsetzung über mehrere Läufe (wie die Oberfläche und der automatische Betrieb es tun):
//    mit einer Obergrenze von 1 Zeile je Aufruf braucht die Liste mehrere Durchläufe. Der
//    zweite Kurs einer Person darf dabei nicht fälschlich als "schon erledigt" übersprungen
//    werden, nur weil die E-Mail durch den ersten Kurs schon in den Ergebniszeilen steht.
// -------------------------------------------------------------------------------------------
{
  const {env,auth,T,db}=await frischeUmgebung('hbg-mc3');
  const zeilen=mapParticipantRows(parseCsv(DATEI).rows);
  const entwurf=await previewParticipantImport(env,auth,T,{source_name:'multi.csv',rows:zeilen});
  let laeufe=0,r=null;
  do{
    r=await applyParticipantImport(env,auth,T,{batch_id:entwurf.batch_id,digest:entwurf.digest,max_apply:1});
    laeufe++;
    assert.ok(!r.results.some(x=>x.action==='already_applied'&&x.reason),
      'ein als "schon erledigt" gemeldeter Kandidat darf nie zugleich eine noch fehlende Mitgliedschaft sein');
  }while(!r.completed&&laeufe<20);
  assert.ok(r.completed,`der Import muss innerhalb von 20 Läufen fertig werden, Läufe: ${laeufe}`);
  assert.equal(laeufe,5,`bei Obergrenze 1 müssen genau 5 Läufe nötig sein - einer je Kandidat, gebraucht: ${laeufe}`);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM memberships WHERE tenant_id=? AND role='participant'").get(T).n,5,
    'am Ende müssen trotz mehrfacher Läufe alle 5 Mitgliedschaften stehen - keine darf durch die Fortsetzung verloren gehen');
  const leaMemberships=db.prepare(`SELECT m.course_id FROM memberships m JOIN users u ON u.id=m.user_id WHERE u.email='lea.brand@lernende.example.invalid' AND m.role='participant'`).all();
  assert.equal(leaMemberships.length,2,
    `Leas zweiter Kurs darf über mehrere Läufe nicht als "schon erledigt" verloren gehen, gefunden: ${JSON.stringify(leaMemberships)}`);
  console.log('participant-import-multi-course 3/4 (Fortsetzung über mehrere Läufe verliert keinen zweiten Kurs): ok');
}

// -------------------------------------------------------------------------------------------
// 4. Ein zweiter Einwurf derselben Datei legt niemanden und keine Mitgliedschaft doppelt an.
// -------------------------------------------------------------------------------------------
{
  const {env,auth,T,db}=await frischeUmgebung('hbg-mc4');
  const zeilen=mapParticipantRows(parseCsv(DATEI).rows);
  const erster=await previewParticipantImport(env,auth,T,{source_name:'multi.csv',rows:zeilen});
  await applyParticipantImport(env,auth,T,{batch_id:erster.batch_id,digest:erster.digest});
  const zweiter=await previewParticipantImport(env,auth,T,{source_name:'multi.csv',rows:zeilen});
  await applyParticipantImport(env,auth,T,{batch_id:zweiter.batch_id,digest:zweiter.digest});
  assert.equal(db.prepare("SELECT COUNT(*) n FROM memberships WHERE tenant_id=? AND role='participant'").get(T).n,5,
    'ein zweiter Einwurf derselben Liste darf keine Mitgliedschaft doppelt anlegen');
  console.log('participant-import-multi-course 4/4 (zweiter Einwurf bleibt folgenlos): ok');
}

console.log('participant-import-multi-course: ok');
