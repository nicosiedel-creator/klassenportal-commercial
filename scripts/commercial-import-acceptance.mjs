import { chromium } from 'playwright';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Der Kunde wirft seinen Betrieb als Dateien ein, und seine Dateien verweisen ueber SEINE
// Kennungen aufeinander: die Kursliste fuehrt CLS-001/COURSE-001, die Teilnehmerliste verweist
// genau darauf. Gemessen an seinem echten Paket scheiterte das vollstaendig - 96 Kurszeilen
// wurden als Personen ohne E-Mail vorgelegt, 0 Kurse entstanden, und keine einzige seiner 1537
// Teilnehmerzeilen fand ihre Klasse. Auf dem Bildschirm stand ueberall "Kein Kurs erkannt".
//
// Genau dieser Weg wird hier im echten Browser gegen den echten Server gefahren: hochladen,
// Vorschau lesen, uebernehmen, nachzaehlen. Ausgefuehrt, nicht im Quelltext gelesen - eine
// Zusicherung, die nur der Quelltext traegt, hat diesen Fehler zwei Runden lang uebersehen.

const base=(process.env.COMMERCIAL_BASE_URL||'http://127.0.0.1:8787').replace(/\/$/,'');
const config=String(process.env.COMMERCIAL_WRANGLER_CONFIG||'wrangler.browser-e2e.json');
const findings=[];
function ok(what){findings.push(`OK   ${what}`);console.log(`OK   ${what}`);}
function fail(what){findings.push(`FAIL ${what}`);console.error(`FAIL ${what}`);process.exitCode=1;}
function check(bedingung,what){bedingung?ok(what):fail(what);}

function runWrangler(args){
  const r=spawnSync('npx',['wrangler',...args],{encoding:'utf8',env:{...process.env}});
  if(r.status!==0)throw new Error(`wrangler ${args[0]} ${args[1]} fehlgeschlagen: ${String(r.stderr||r.stdout).slice(-400)}`);
  return String(r.stdout||'');
}
function execute(sql){runWrangler(['d1','execute','DB','--local','--config',config,'--command',sql]);}
function query(sql){
  const raw=runWrangler(['d1','execute','DB','--local','--config',config,'--json','--command',sql]);
  const start=raw.indexOf('[');if(start<0)return[];
  try{const parsed=JSON.parse(raw.slice(start));return parsed?.[0]?.results??[];}catch{return[];}
}
const q=v=>`'${String(v).replaceAll("'","''")}'`;
function scryptHash(password){
  const N=32_768,r=8,p=3,salt=randomBytes(16);
  const key=scryptSync(password,salt,32,{N,r,p,maxmem:Math.max(64*1024*1024,128*N*r+1024*1024)});
  return `scrypt$${N}$${r}$${p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

// Ein eigener Mandant, damit die Abnahme nichts von den anderen Fixtures anfasst und beim
// zweiten Lauf denselben Ausgangszustand vorfindet.
const T='ten_import_acceptance',U='usr_import_acceptance';
// Das Kennwort ist je Lauf neu; fuer eine wiederholbare Fehlersuche laesst es sich vorgeben.
const ADMIN='import.abnahme@example.invalid',PASS=String(process.env.IMPORT_ACCEPTANCE_PASSWORD||`Ab-${randomBytes(9).toString('base64url')}!7x`);
const now=new Date().toISOString();

function seed(){
  execute(`
    DELETE FROM memberships WHERE tenant_id=${q(T)};
    DELETE FROM tenant_users WHERE tenant_id=${q(T)};
    DELETE FROM courses WHERE tenant_id=${q(T)};
    DELETE FROM sessions WHERE user_id=${q(U)};
    DELETE FROM users WHERE id=${q(U)};
    DELETE FROM users WHERE email=${q(ADMIN)};
    DELETE FROM tenants WHERE id=${q(T)};
    INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES(${q(T)},'Import-Abnahme','import-abnahme','active',${q(now)},${q(now)});
    INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at)
      VALUES(${q(U)},${q(ADMIN)},'Import Abnahme',${q(scryptHash(PASS))},0,0,'active',${q(now)},${q(now)});
    INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('mem_import_acceptance',${q(T)},NULL,${q(U)},'tenant_admin',${q(now)});
    -- Ohne die Mandantenzuordnung bleiben die Rollen der Sitzung leer und das Kundenportal
    -- laedt gar nicht erst - die Mitgliedschaft allein genuegt nicht.
    INSERT INTO tenant_users(tenant_id,user_id,status,source,created_at,updated_at) VALUES(${q(T)},${q(U)},'active','manual',${q(now)},${q(now)});
  `);
  check(Number(query(`SELECT COUNT(*) n FROM users WHERE id=${q(U)} AND status='active'`)[0]?.n||0)===1,
    'Abnahme-Mandant und sein Kunden-Admin sind angelegt');
}

// Genau die Struktur, mit der ein Bildungstraeger seine Dateien wirklich ausleitet: die Kursliste
// fuehrt ihre eigene Kennung neben dem Kurscode, die Teilnehmerliste nennt NUR die Kennung.
const KURSE=[
  'class_id;external_id;kurscode;name;typ;jahrgang;schuljahr;teilnehmer_soll;kapazitaet;status;startdatum;enddatum',
  'CLS-001;COURSE-001;5a;Klasse 5a;Klassenverband;5;2026/2027;24;26;aktiv;2026-09-01;2027-07-31',
  'CLS-002;COURSE-002;5b;Klasse 5b;Klassenverband;5;2026/2027;24;26;aktiv;2026-09-01;2027-07-31',
].join('\n')+'\n';
const TEILNEHMER=[
  'student_id;person_external_id;vorname;nachname;class_id;course_external_id;email;status',
  'STU-00001;PERSON-00001;Mila;Testmann;CLS-001;COURSE-001;abnahme.stu1@example.invalid;aktiv',
  'STU-00002;PERSON-00002;Mert;Nordblick;CLS-001;COURSE-001;abnahme.stu2@example.invalid;aktiv',
  'STU-00003;PERSON-00003;Lina;Testmann;CLS-002;COURSE-002;abnahme.stu3@example.invalid;aktiv',
].join('\n')+'\n';

const dir=mkdtempSync(join(tmpdir(),'import-abnahme-'));
const kursDatei=join(dir,'03_Kurse.csv'),tnDatei=join(dir,'05_Teilnehmer.csv');
writeFileSync(kursDatei,KURSE,'utf8');writeFileSync(tnDatei,TEILNEHMER,'utf8');

seed();

const browser=await chromium.launch();
const context=await browser.newContext({viewport:{width:1500,height:1000},locale:'de-DE'});
const page=await context.newPage();
const seitenfehler=[];
page.on('pageerror',e=>seitenfehler.push(String(e?.message||e).slice(0,300)));

try{
  // Die Anmeldemaske baut die Seite selbst auf - vor 'networkidle' gibt es sie noch nicht.
  await page.goto(`${base}/kunden-admin`,{waitUntil:'networkidle',timeout:45000});
  await page.locator('input[name="email"]').waitFor({timeout:25000});
  await page.locator('input[name="email"]').fill(ADMIN);
  await page.locator('input[name="password"]').fill(PASS);
  // Der Anmeldeknopf traegt kein type-Attribut im HTML - 'button[type=submit]' findet ihn nicht,
  // obwohl die DOM-Eigenschaft 'submit' meldet. Angesteuert wird er deshalb ueber seine Aufschrift.
  await page.locator('form button').filter({hasText:/^Anmelden$|^Sign in$/}).first().click();
  await page.locator('aside.side').first().waitFor({timeout:25000});
  ok('Anmeldung am Kundenportal');

  // Die Seitenleiste zeigt zunaechst nur die Kernbereiche. Die Importe liegen hinter "Weitere
  // Bereiche" in der Gruppe "Organisation & Betrieb", die ihre Module erst beim Anklicken laedt.
  await page.locator('aside.side button').filter({hasText:/Weitere Bereiche|More areas/i}).first().click();
  await page.locator('aside.side button').filter({hasText:/Organisation & Betrieb|Organisation & operations/i}).first().click();
  const orgKnopf=page.locator('aside.side button').filter({hasText:/^Bildungsträger importieren$/}).first();
  await orgKnopf.waitFor({timeout:30000});
  ok('Import-Bereich ist über die Navigation erreichbar');
  await orgKnopf.click();
  const orgDatei=page.locator('.modal input[type="file"]').first();
  await orgDatei.waitFor({timeout:20000});
  await orgDatei.setInputFiles(kursDatei);
  await page.locator('.modal button').filter({hasText:/Automatisch erkennen/i}).first().click();
  const orgTabelle=page.locator('.modal table').first();
  await orgTabelle.waitFor({timeout:30000});
  const orgText=await orgTabelle.innerText();
  check(/Klasse 5a/.test(orgText)&&/Klasse 5b/.test(orgText),
    'die Kursliste erscheint als Kurs, nicht als Person ohne E-Mail');
  check(!/Kein Kurs|E-Mail fehlt/i.test(orgText),
    'keine Kurszeile wird als unvollstaendige Person beanstandet');

  // Der Bestaetigungsdialog muss VOR dem Klick abgefangen sein - danach ist er schon da und
  // blockiert den Ablauf.
  page.on('dialog',d=>d.accept().catch(()=>{}));
  // Genau der Uebernehmen-Knopf, nicht der Sammelkorrektur-Knopf daneben - beide tragen das Wort.
  await page.locator('.modal [data-org-apply]').first().click();
  await page.locator('.modal [data-org-apply-status]').filter({hasText:/Fertig/i}).first().waitFor({timeout:60000});
  const kurse=query(`SELECT code,name,external_id FROM courses WHERE tenant_id=${q(T)} ORDER BY code`);
  check(kurse.length===2,`aus 2 Kurszeilen entstehen 2 Kurse (gefunden: ${kurse.length})`);
  check(kurse.map(k=>k.external_id).join(',')==='COURSE-001,COURSE-002',
    `jeder Kurs behaelt die Kennung des Traegers (gespeichert: ${kurse.map(k=>k.external_id).join(',')||'—'})`);
  check(kurse.map(k=>k.name).join(',')==='Klasse 5a,Klasse 5b',
    `die Kurse heissen wie in der Datei (gespeichert: ${kurse.map(k=>k.name).join(',')||'—'})`);
  await page.locator('.modal [data-close]').first().click();

  // --- Teilnehmerliste, die NUR ueber die Kennung verweist ------------------------------------
  // Die eben geladene Gruppe hat weitere Eintraege in die Seitenleiste gehaengt - sie liegen
  // wieder hinter "Weitere Bereiche".
  const mehr=page.locator('aside.side button').filter({hasText:/Weitere Bereiche|More areas/i}).first();
  if(await mehr.count())await mehr.click();
  const tnKnopf=page.locator('aside.side button').filter({hasText:/^Nur Teilnehmer importieren$/}).first();
  await tnKnopf.waitFor({timeout:25000});
  await tnKnopf.click();
  const tnDateiFeld=page.locator('.modal input[type="file"]').first();
  await tnDateiFeld.waitFor({timeout:20000});
  await tnDateiFeld.setInputFiles(tnDatei);
  await page.locator('.modal button').filter({hasText:/Vorschau/i}).first().click();
  const tnTabelle=page.locator('.modal table').first();
  await tnTabelle.waitFor({timeout:30000});
  const tnText=await tnTabelle.innerText();

  // Der eigentliche Befund des Kunden - er darf nirgends mehr stehen.
  check(!/Kein Kurs/i.test(tnText),
    'keine Teilnehmerzeile meldet mehr "Kein Kurs erkannt"');
  check(!/Mehrere passende Kurse/i.test(tnText),
    'keine Teilnehmerzeile meldet "Mehrere passende Kurse"');
  check(/Klasse 5a/.test(tnText)&&/Klasse 5b/.test(tnText),
    'jede Teilnehmerzeile zeigt ihre Klasse, obwohl die Datei nur die Kennung nennt');
  const prozente=[...tnText.matchAll(/(\d{1,3})\s*%/g)].map(m=>Number(m[1]));
  check(prozente.length>=3&&prozente.every(x=>x===100),
    `jede Zeile steht bei 100 % (gemessen: ${prozente.join(', ')||'—'})`);

  check(!seitenfehler.length,`keine Seitenfehler im Browser (${seitenfehler.slice(0,2).join(' | ')||'keine'})`);
}catch(e){
  fail(`Ablauf abgebrochen: ${String(e?.message||e).slice(0,300)}`);
  try{await page.screenshot({path:'/tmp/import-abnahme-fehler.png',fullPage:true});}catch{}
}finally{
  await browser.close();
}

console.log(`\nImport-Abnahme: ${findings.filter(f=>f.startsWith('OK')).length} bestanden, ${findings.filter(f=>f.startsWith('FAIL')).length} offen`);
if(process.exitCode)console.error('Import-Abnahme fehlgeschlagen.');
else console.log('Import-Abnahme bestanden.');
