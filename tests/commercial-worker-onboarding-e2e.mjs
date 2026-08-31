import { strict as assert } from 'node:assert';
import { spawn, spawnSync } from 'node:child_process';
import { closeSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildZip } from './helpers/zip.mjs';

const npx=process.platform==='win32'?'npx.cmd':'npx';
const config='wrangler.browser-e2e-runtime.json';
const base='http://127.0.0.1:8791';
const scratch=mkdtempSync(join(tmpdir(),'kp-commercial-runtime-'));
const envFile=join(scratch,'e2e.env');
const logFile=join(scratch,'wrangler.log');
let worker=null,logFd=null;

function run(cmd,args,options={}){
  const result=spawnSync(cmd,args,{encoding:'utf8',stdio:options.capture?['ignore','pipe','pipe']:'inherit',env:{...process.env,...options.env}});
  if(result.error)throw result.error;
  if((result.status??1)!==0)throw new Error(`${cmd} ${args.join(' ')} failed (${result.status}): ${result.stderr||result.stdout||''}`);
  return result.stdout||'';
}
function parseEnvFile(){
  const vars={};
  for(const line of readFileSync(envFile,'utf8').split(/\r?\n/)){
    const i=line.indexOf('=');if(i<1)continue;vars[line.slice(0,i)]=line.slice(i+1);
  }
  return vars;
}
async function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms));}
async function stopWorker(){
  const running=worker;worker=null;
  if(!running)return;
  const exited=new Promise(resolve=>{running.once('exit',resolve);running.once('error',resolve);});
  try{running.kill('SIGTERM');}catch{}
  await Promise.race([exited,sleep(15000)]);
  await sleep(250);
}
async function api(path,{method='GET',body,headers={}}={}){
  const requestHeaders={...headers};
  if(body!==undefined)requestHeaders['content-type']='application/json';
  if(['POST','PUT','PATCH','DELETE'].includes(method))requestHeaders.origin=base;
  const response=await fetch(base+path,{method,headers:requestHeaders,body:body===undefined?undefined:JSON.stringify(body),redirect:'manual'});
  const text=await response.text();let data=null;try{data=JSON.parse(text);}catch{}
  return{status:response.status,text,data,headers:response.headers};
}
function onboardingBody(email,password,course){
  return{admin_name:'Runtime Acceptance Admin',admin_email:email,admin_password:password,admin_password_confirm:password,commercial_acceptance:'1',commercial_cost_confirmation:'1',first_course_name:course,first_course_code:course==='Parallelkurs'?'PAR-01':'E2E-01',access_mode:'login'};
}
// Das Plattformkonto der Browser-Abnahme entsteht nur in dieser isolierten Datenbank. Es muss
// dort wirklich anmeldefaehig und Plattformverwalter sein - sonst prueft der Browserlauf die
// Kundeneinrichtung gar nicht, sondern nur eine Anmeldemaske.
async function platformAccountAudit(fixtureEnv){
  const email=fixtureEnv.E2E_LOCAL_PLATFORM_EMAIL,password=fixtureEnv.E2E_LOCAL_PLATFORM_PASSWORD;
  assert.ok(email&&password,'the seed must export the local platform acceptance credentials');
  assert.match(email,/@example\.invalid$/,'the local platform account must use a reserved, undeliverable domain');

  const wrong=await api('/api/auth/login',{method:'POST',body:{email,password:`${password}-falsch`}});
  assert.equal(wrong.status,401,'a wrong password must not open a platform session');

  const login=await api('/api/auth/login',{method:'POST',body:{email,password}});
  assert.equal(login.status,200,`the seeded platform account must be able to sign in, got ${login.status}`);
  const cookie=String(login.headers.get('set-cookie')||'').split(';')[0];
  assert.match(cookie,/^kp_session=/,'signing in must issue a session cookie');

  const me=await api('/api/auth/me',{headers:{cookie}});
  assert.equal(me.status,200);
  assert.equal(me.data?.user?.isPlatformAdmin,true,'the seeded account must hold platform administration rights');

  // Der eigentliche Weg: ein Einrichtungslink laesst sich anlegen und wieder auflisten.
  const customer=`runtime-acceptance-${Date.now()}@example.invalid`;
  const created=await api('/api/platform/onboarding-invitations',{method:'POST',headers:{cookie},body:{customer_email:customer,plan_id:'provider',valid_days:'7'}});
  assert.equal(created.status,201,`a platform admin must be able to create a customer setup link, got ${created.status}`);
  assert.match(String(created.data?.url||''),/\/einrichtung\//,'the created setup link must be an onboarding link');
  const list=await api('/api/platform/onboarding-invitations',{headers:{cookie}});
  assert.equal(list.status,200);
  assert.ok((list.data?.invitations||[]).some(row=>row.customer_email===customer),'the created setup link must appear in the invitation list');

  // Ohne Sitzung bleibt derselbe Weg verschlossen.
  const anonymous=await api('/api/platform/onboarding-invitations',{method:'POST',body:{customer_email:customer,plan_id:'provider',valid_days:'7'}});
  assert.ok([401,403].includes(anonymous.status),`creating a setup link without a session must be refused, got ${anonymous.status}`);
  console.log('Local platform acceptance account, its rights and the customer setup path: OK');
}

async function ready(){
  for(let i=0;i<60;i++){
    if(worker?.exitCode!==null)break;
    try{const r=await fetch(base+'/plattform-admin');if(r.status===200)return;}catch{}
    await sleep(500);
  }
  const tail=readFileSync(logFile,'utf8').slice(-12000);
  throw new Error(`Local Worker did not become ready.\n${tail}`);
}
// Der Asset-Dienst fuehrt .html-Pfade auf ihre kanonische Form zurueck (/testcenter.html ->
// /testcenter). Das ist kein Fehler, aber mit redirect:'manual' bleibt der Rumpf leer, und die
// Pruefung las das als "leer ausgeliefert". Einmal folgen, dann messen - eine zweite
// Weiterleitung waere ein echter Befund.
async function followOnce(path){
  const first=await api(path);
  if(![301,302,303,307,308].includes(first.status))return first;
  const location=first.headers.get('location');
  assert.ok(location,`${path} redirected without a target`);
  const second=await api(location);
  assert.ok(![301,302,303,307,308].includes(second.status),`${path} redirects more than once, via ${location}`);
  return second;
}

async function surfaceAndAssetAudit(){
  const surfaces=['/','/produkt','/plattform-admin','/kunden-admin','/klassen-admin','/dozentenportal','/testcenter.html','/impressum','/datenschutz','/agb','/avv','/unterauftragsverarbeiter','/datenportabilitaet','/rechtsverstoss-melden','/passwort-vergessen'];
  const htmlBodies=[];
  for(const path of surfaces){
    const r=await followOnce(path);
    assert.notEqual(r.status,404,`${path} must not return 404`);assert.ok(r.status<500,`${path} returned ${r.status}`);assert.ok(r.text.trim().length>20,`${path} rendered empty`);assert.doesNotMatch(r.text,/error\s*1042|worker threw exception|internal server error/i,`${path} rendered a server error`);htmlBodies.push([path,r.text]);
  }
  const publicFiles=readdirSync('public');
  for(const name of publicFiles.filter(x=>/\.(?:html|js|css)$/i.test(x))){
    const r=await followOnce('/'+name);assert.notEqual(r.status,404,`asset /${name} missing`);assert.ok(r.status<500,`asset /${name} returned ${r.status}`);assert.ok(r.text.length>0,`asset /${name} empty`);if(name.endsWith('.html'))htmlBodies.push(['/'+name,r.text]);
  }
  const internal=new Set();
  for(const [,html] of htmlBodies){
    for(const match of html.matchAll(/href\s*=\s*["']([^"']+)["']/gi)){
      const href=match[1].trim();if(!href||href.startsWith('#')||/^(?:mailto:|tel:|javascript:)/i.test(href))continue;
      let url;try{url=new URL(href,base);}catch{throw new Error(`Invalid href: ${href}`);}if(url.origin===base)internal.add(url.pathname+url.search);
    }
  }
  for(const path of internal){const r=await api(path);assert.notEqual(r.status,404,`internal link ${path} returned 404`);assert.ok(r.status<500,`internal link ${path} returned ${r.status}`);}
  console.log(`Runtime surface audit: ${surfaces.length} routed surfaces, ${publicFiles.filter(x=>/\.(?:html|js|css)$/i.test(x)).length} top-level assets, ${internal.size} internal links OK.`);
}
async function securityAndFreezeAudit(){
  let r=await api('/api/public/product');assert.equal(r.status,200,'public product contract must load');
  r=await api('/api/platform/onboarding-invitations');assert.ok([401,403].includes(r.status),`unauthenticated onboarding list must be protected, got ${r.status}`);
  r=await api('/api/onboarding/runtime-acceptance-invalid-token-000000000000');assert.notEqual(r.status,200,'invalid onboarding token must fail');assert.equal(r.data?.error,'ONBOARDING_NOT_FOUND');
  r=await api('/api/payments/checkout-status?session_id=cs_test_runtime_acceptance');assert.equal(r.status,503);assert.equal(r.data?.error,'PAYMENT_DISABLED');
  r=await api('/api/payments/stripe/webhook',{method:'POST',body:{}});assert.equal(r.status,200);assert.equal(r.data?.ignored,true);assert.equal(r.data?.paymentProcessing,'disabled');
  console.log('Runtime auth boundary + payment freeze: OK.');
}
async function acceptedOfferAudit(env){
  const token=env.E2E_ONBOARDING_PRIMARY_TOKEN,email=env.E2E_ONBOARDING_PRIMARY_ADMIN,password=env.E2E_ONBOARDING_PRIMARY_PASSWORD;
  assert.ok(token&&email&&password,'primary fixture environment missing');
  const path='/api/onboarding/'+encodeURIComponent(token),body=onboardingBody(email,password,'E2E Erstkurs');
  let r=await api(path);assert.equal(r.status,200);assert.equal(r.data?.invitation?.status,'open');assert.ok(r.data?.invitation?.locked_offer?.quote_number,'accepted offer must be locked into onboarding');
  r=await api(path,{method:'POST',body:{...body,admin_password_confirm:'Absichtlich-Anders-2026!'}});assert.equal(r.status,400);assert.equal(r.data?.error,'PASSWORD_CONFIRMATION_MISMATCH');
  r=await api(path,{method:'POST',body:{...body,commercial_cost_confirmation:undefined}});assert.equal(r.status,400);assert.equal(r.data?.error,'DOUBLE_COST_CONFIRMATION_REQUIRED');
  r=await api(path,{method:'POST',body:{...body,admin_email:'ungueltig'}});assert.equal(r.status,400);assert.equal(r.data?.error,'ONBOARDING_REQUIRED_FIELDS');
  r=await api(path);assert.equal(r.status,200);assert.equal(r.data?.invitation?.status,'open','negative checks must not consume invitation');
  r=await api(path,{method:'POST',body});assert.equal(r.status,200,`accepted offer activation failed: ${r.text}`);assert.equal(r.data?.ok,true);assert.equal(r.data?.commercial?.status,'active');assert.equal(r.data?.commercial?.paymentProcessing,'disabled');assert.ok(r.data?.tenant_id);assert.equal(r.data?.login_email,email);
  const login=await api('/api/auth/login',{method:'POST',body:{email,password}});assert.equal(login.status,200,`new tenant admin login failed: ${login.text}`);const cookie=login.headers.get('set-cookie')?.split(';')[0];assert.ok(cookie,'login must return a session cookie');
  const me=await api('/api/auth/me',{headers:{cookie}});assert.equal(me.status,200);assert.equal(String(me.data?.user?.email||'').toLowerCase(),email.toLowerCase());
  r=await api(path,{method:'POST',body:{}});assert.notEqual(r.status,200,'completed onboarding replay must fail');assert.equal(r.data?.error,'ONBOARDING_UNAVAILABLE');
  console.log('Accepted offer -> tenant -> manual commerce -> login -> replay protection: OK.');
}
async function concurrencyAudit(env){
  const token=env.E2E_ONBOARDING_RACE_TOKEN,email=env.E2E_ONBOARDING_RACE_ADMIN,password=env.E2E_ONBOARDING_RACE_PASSWORD;
  assert.ok(token&&email&&password,'race fixture environment missing');
  const path='/api/onboarding/'+encodeURIComponent(token),body=onboardingBody(email,password,'Parallelkurs');
  const results=await Promise.all([api(path,{method:'POST',body}),api(path,{method:'POST',body})]);
  const winners=results.filter(x=>x.status===200&&x.data?.ok===true),losers=results.filter(x=>x.status!==200);
  assert.equal(winners.length,1,`double activation must have exactly one winner: ${results.map(x=>x.status+'/'+(x.data?.error||x.data?.ok)).join(' | ')}`);assert.equal(losers.length,1);
  assert.ok(['ONBOARDING_ALREADY_IN_PROGRESS','ONBOARDING_UNAVAILABLE'].includes(String(losers[0].data?.error||'')),`unsafe race loser: ${losers[0].status}/${losers[0].data?.error}`);assert.equal(winners[0].data?.commercial?.paymentProcessing,'disabled');
  const completed=await api(path);assert.equal(completed.status,200);assert.equal(completed.data?.invitation?.status,'completed');
  console.log('Concurrent double-click / duplicate-tenant protection: OK.');
}

// Gefordert ist, dass ein Mandant einen ganzen Ordner einwirft und das System sich alles selbst
// heraussucht und anlegt. Bis hierher las der Eingang jede Unterlage als Teilnehmerliste - eine
// Kursliste im Ordner wurde damit zu Teilnehmerzeilen ohne Namen und ohne E-Mail, und der ganze
// Stapel landete in der Handpruefung.
//
// Dieser Lauf wirft einen echten gezippten Ordner in den echten Worker und prueft in der echten
// D1, dass die Kurse danach da sind - ohne einen einzigen Handgriff.
async function autonomousFolderIntakeAudit(fixtureEnv){
  const email=fixtureEnv.E2E_ONBOARDING_PRIMARY_ADMIN,password=fixtureEnv.E2E_ONBOARDING_PRIMARY_PASSWORD;
  const login=await api('/api/auth/login',{method:'POST',body:{email,password}});
  assert.equal(login.status,200,`tenant admin login for folder intake failed: ${login.text}`);
  const cookie=String(login.headers.get('set-cookie')||'').split(';')[0];
  const me=await api('/api/auth/me',{headers:{cookie}});
  const tenantId=String(me.data?.user?.tenantRoles?.[0]?.tenantId||'');
  assert.ok(tenantId,'the onboarded tenant admin must carry a tenant');

  const before=await api(`/api/courses?tenant_id=${encodeURIComponent(tenantId)}`,{headers:{cookie}});
  assert.equal(before.status,200,`course listing failed: ${before.text}`);
  const namesBefore=new Set((before.data?.courses||[]).map(c=>String(c.name)));

  const created=await api(`/api/enterprise/intake/upload-links?tenant_id=${encodeURIComponent(tenantId)}`,{method:'POST',headers:{cookie},body:{label:'Ordner-Abnahme',valid_days:1,max_uploads:1}});
  assert.equal(created.status,201,`upload link creation failed: ${created.text}`);
  const token=decodeURIComponent(new URL(created.data.link.url).pathname.split('/').filter(Boolean).at(-1));
  assert.ok(token,'the upload link must carry a token');

  // Ein Ordner, wie ihn ein Bildungstraeger wirklich abgibt: Kurse, Faecher, Dozenten - gemischt,
  // unsortiert, mit Systemdateien dazwischen.
  // Der Eingang weist dieselbe Datei ein zweites Mal als Duplikat ab - das ist richtig so. Damit
  // dieser Lauf wiederholbar bleibt, traegt der Ordner eine eigene Kennung je Durchlauf.
  const run=`${Date.now().toString(36)}`;
  const kursA=`Abnahme Pflege A ${run}`,kursB=`Abnahme Pflege B ${run}`;
  const zip=await buildZip([
    ['Traeger/kurse.csv',`course_name,course_code\n${kursA},ABN-A-${run}\n${kursB},ABN-B-${run}\n`],
    ['Traeger/faecher.csv',`fach,fachkuerzel\nAbnahme Anatomie ${run},AN${run.slice(-4)}\n`],
    ['Traeger/teilnehmer.csv',`name,email,kurscode\nAbnahme Lernende ${run},abnahme.${run}@example.invalid,ABN-A-${run}\n`],
    ['Traeger/organigramm.csv',`node_type,external_id,parent_external_id,name,type,street,postal_code,city,country\nlocation,ABN-LOC-${run},ABN-ROOT-${run},Abnahme Campus ${run},Standort,Datenbogenweg 17,12627,Berlin,DE\norg_unit,ABN-OU-${run},ABN-LOC-${run},Abnahme Fachbereich ${run},Fachbereich,,,,\n`],
    ['Traeger/raeume.csv',`resource_type,external_id,name,location_external_id,capacity,features,status\nRaum,ABN-ROOM-${run},Abnahme Seminarraum ${run},ABN-LOC-${run},24,Beamer;Whiteboard,verfügbar\n`],
    // Ein Ordner eines Bildungstraegers enthaelt seinen Stundenplan. Bis hierher hatte die
    // Weiche dafuer kein Gleis: eine Stundenplanzeile nennt einen Kurscode, also wurde sie als
    // Kurs gelesen - und der Stundenplan verschwand stillschweigend ("Stundenplaene hochgeladen
    // und diese wurden nicht erkannt").
    ['Traeger/stundenplan.csv',`course_code,date,start_time,end_time,room,session_type,topic\nABN-A-${run},2026-09-07,08:15,11:30,Abnahme Seminarraum ${run},Unterricht,Abnahme Regelunterricht ${run}\nABN-A-${run},2026-09-08,12:30,15:45,Abnahme Seminarraum ${run},Online,Abnahme Vertiefung ${run}\n`],
    // Und die Beschaeftigten: Menschen ohne Klasse. Fuer sie gab es bis hierher keine Rolle - sie
    // fielen in den Auffangfall "Teilnehmer" und blieben mit COURSE_REQUIRED liegen. Jetzt
    // bekommen sie eine Freigabe auf ihrem Bereich, gestaffelt nach Funktion.
    //
    // Bewusst keine Leitungsfunktion in diesem Ordner: "Verantwortlich" schliesst das Vergeben
    // weiterer Rechte ein und wird deshalb zur Bestaetigung vorgelegt - womit dieser Ordner nicht
    // mehr vollstaendig eindeutig waere, worum es hier aber gerade geht. Dass aus einem Import nie
    // eine Verantwortlichen-Freigabe entsteht, prueft tests/organization-staff-roles.mjs.
    ['Traeger/beschaeftigte.csv',`first_name,last_name,role,email,org_unit_external_id,portal_role\nAbnahme,Service ${run},Teilnehmendenservice,abnahme.service.${run}@example.invalid,ABN-OU-${run},staff\nAbnahme,Technik ${run},IT-Support,abnahme.technik.${run}@example.invalid,ABN-OU-${run},staff\n`],
    ['Traeger/.DS_Store','x'],
  ],{deflate:true});
  const form=new FormData();
  form.append('files',new Blob([zip],{type:'application/zip'}),'traeger-ordner.zip');
  const response=await fetch(`${base}/api/intake/upload/${encodeURIComponent(token)}`,{method:'POST',headers:{origin:base},body:form});
  const payload=await response.json();
  assert.equal(response.status,201,`folder upload failed: ${JSON.stringify(payload)}`);
  assert.equal(payload.status,'automatisch verarbeitet',`a folder with only unambiguous structure must not need review, got: ${payload.status}`);

  const after=await api(`/api/courses?tenant_id=${encodeURIComponent(tenantId)}`,{headers:{cookie}});
  assert.equal(after.status,200);
  const namesAfter=(after.data?.courses||[]).map(c=>String(c.name));
  for(const expected of [kursA,kursB]){
    assert.ok(namesAfter.includes(expected),`${expected} must have been created from the uploaded folder without any manual step`);
    assert.ok(!namesBefore.has(expected),`${expected} must be new - otherwise this run proves nothing`);
  }
  // Der eigentliche Beweis fuer die Reihenfolge: der Teilnehmer im selben Ordner nennt einen
  // Kurs, den es beim Hochladen noch gar nicht gab. Wuerde der Teilnehmerentwurf vor dem Anlegen
  // der Struktur ausgewertet, stuende hier COURSE_NOT_FOUND und kein Kurs - und der Stapel waere
  // trotz voelliger Eindeutigkeit in der Handpruefung gelandet.
  const view=await api(`/api/enterprise/intake/batches/${encodeURIComponent(payload.batch_id)}?tenant_id=${encodeURIComponent(tenantId)}`,{headers:{cookie}});
  assert.equal(view.status,200,`intake batch view failed: ${view.text}`);
  const candidates=view.data?.preview?.candidates||[];
  assert.equal(candidates.length,1,'the folder carried exactly one participant');
  const resolvedCourse=(after.data?.courses||[]).find(c=>String(c.name)===kursA);
  assert.ok(resolvedCourse,'the referenced course must exist after the run');
  assert.equal(candidates[0].course_id,resolvedCourse.id,
    'the participant must be resolved against the course the same folder created');
  assert.ok(!(candidates[0].warnings||[]).includes('COURSE_NOT_FOUND'),
    'a course created by the same folder must not be reported as missing');

  // Die Struktur muss auch in der Rueckverfolgung stehen, nicht nur ihre Wirkung.
  assert.ok(view.data?.organization?.batch_id,'the batch must remember its organization import');
  const orgTypes=(view.data.organization.candidates||[]).map(c=>c.type).sort();
  for(const expected of ['course','subject','org_unit','resource','lesson','staff'])
    assert.ok(orgTypes.includes(expected),`${expected} must be recognised as structure, got ${orgTypes.join(',')}`);

  // Standorte, Bereiche und Raeume muessen wirklich entstanden sein - im echten Worker, mit dem
  // Systemkonto des Eingangs, nicht nur im Entwurf. Vorher landete genau dieses Organigramm als
  // Personenliste ohne E-Mail in der Handpruefung.
  const unitsResponse=await api(`/api/enterprise/org/units?tenant_id=${encodeURIComponent(tenantId)}`,{headers:{cookie}});
  assert.equal(unitsResponse.status,200,`org unit listing failed: ${unitsResponse.text}`);
  const units=unitsResponse.data?.units||[];
  const campus=units.find(x=>String(x.name)===`Abnahme Campus ${run}`),bereich=units.find(x=>String(x.name)===`Abnahme Fachbereich ${run}`);
  assert.ok(campus,`the campus from the folder must exist, got ${units.map(x=>x.name).join(',')}`);
  assert.ok(bereich,'the department from the folder must exist');
  assert.equal(String(campus.type_key),'location','a campus must become a location');
  assert.equal(String(bereich.parent_id),String(campus.id),'the hierarchy of the folder must survive');
  assert.equal(JSON.parse(String(campus.metadata_json||'{}')).city,'Berlin','the address of a campus must not be lost');

  const resourceResponse=await api(`/api/education/planning/resources?tenant_id=${encodeURIComponent(tenantId)}`,{headers:{cookie}});
  assert.equal(resourceResponse.status,200,`resource listing failed: ${resourceResponse.text}`);
  const room=(resourceResponse.data?.resources||[]).find(x=>String(x.name)===`Abnahme Seminarraum ${run}`);
  assert.ok(room,'the room from the folder must exist as a resource, not as a person');
  assert.equal(String(room.resource_type),'room');
  assert.equal(Number(room.capacity),24);
  assert.equal(String(room.location),`Abnahme Campus ${run}`,'the room must sit at the campus the same folder created');

  // Und der Stundenplan desselben Ordners muss wirklich im Portal stehen - an der Klasse, die
  // derselbe Ordner gerade erst angelegt hat, mit Raum und Unterrichtsart.
  const lessonsResponse=await api(`/api/content/lessons?tenant_id=${encodeURIComponent(tenantId)}&course_id=${encodeURIComponent(resolvedCourse.id)}`,{headers:{cookie}});
  assert.equal(lessonsResponse.status,200,`lesson listing failed: ${lessonsResponse.text}`);
  const lessons=(lessonsResponse.data?.items||[]).filter(x=>String(x.course_id)===String(resolvedCourse.id));
  assert.equal(lessons.length,2,`both lessons from the folder must exist, got ${JSON.stringify(lessons)}`);
  const first=lessons.find(x=>String(x.starts_at).startsWith('2026-09-07'));
  assert.ok(first,`the first lesson must carry its date, got ${lessons.map(x=>x.starts_at).join(',')}`);
  assert.equal(String(first.starts_at),'2026-09-07T08:15:00','date and start time must be joined');
  assert.equal(String(first.ends_at),'2026-09-07T11:30:00');
  assert.equal(String(first.room),`Abnahme Seminarraum ${run}`,'the room of the row belongs on the lesson');
  assert.match(String(first.notes||''),/Unterrichtsart: Unterricht/,'the session type belongs in the note');
  assert.match(String(first.notes||''),new RegExp(`Abnahme Regelunterricht ${run}`),'the topic of the lesson belongs in the note');

  // Die Portalrollen der Beschaeftigten. Geprueft wird hier, was dieser Lauf ehrlich pruefen kann:
  // dass der echte Worker aus den Zeilen des Ordners beschaeftigte Personen macht, mit dem Bereich
  // des Ordners und dem Profil ihrer Funktion. Das Erteilen der Freigabe selbst legt ein Konto an
  // und verschickt dessen Aktivierung - dafuer braucht es einen Postausgang, den dieser lokale
  // Lauf bewusst nicht hat (und dieser Lauf verschickt grundsaetzlich keine Post). Dass die
  // Freigabe dann mit den richtigen Rechten am richtigen Bereich entsteht, prueft
  // tests/organization-staff-roles.mjs gegen echtes SQLite mit allen Migrationen.
  const staffCandidates=(view.data?.organization?.candidates||[]).filter(c=>c.type==='staff');
  assert.equal(staffCandidates.length,2,`both staff rows must be recognised as staff, got ${JSON.stringify(staffCandidates)}`);
  const byProfile=Object.fromEntries(staffCandidates.map(c=>[String(c.access_profile),c]));
  assert.ok(byProfile.editor,`the participant service must be staffed as editor, got ${Object.keys(byProfile).join(',')}`);
  assert.ok(byProfile.custom,'the IT support must get its own narrow set');
  assert.deepEqual(byProfile.custom.access_permissions,['org.view','courses.view'],
    'the IT support must not be offered participant data');
  assert.ok(!(byProfile.editor.access_permissions||[]).includes('access.manage'),
    'editing must not include handing out rights');
  assert.equal(staffCandidates.filter(c=>String(c.access_profile)==='responsible').length,0,
    'no responsible profile comes out of this folder');
  for(const c of staffCandidates){
    assert.equal(String(c.org_unit_ref),`ABN-OU-${run}`,'the staff grant must point at the unit of the same folder');
    assert.deepEqual(c.warnings||[],[],`a clean staff row must not carry a warning: ${JSON.stringify(c.warnings)}`);
  }

  console.log('Ganzer Ordner eingeworfen -> Standorte, Bereiche, Raeume, Kurse, Faecher, Stundenplan, Portalrollen der Beschaeftigten und der Teilnehmer des neuen Kurses ohne Handgriff verarbeitet: OK.');
}

try{
  const configJson=JSON.parse(readFileSync('wrangler.jsonc','utf8'));configJson.vars={...configJson.vars,APP_ORIGIN:base,PAYMENTS_ENABLED:'false'};delete configJson.routes;writeFileSync(config,JSON.stringify(configJson,null,2));
  run(npx,['wrangler','d1','migrations','apply','DB','--local','--config',config]);
  writeFileSync(envFile,'');
  run(process.execPath,['scripts/commercial-onboarding-e2e-state.mjs','seed',config],{env:{GITHUB_ENV:envFile,PAYMENTS_ENABLED:'false'}});
  const fixtureEnv=parseEnvFile();
  logFd=openSync(logFile,'a');worker=spawn(npx,['wrangler','dev','--config',config,'--local','--ip','127.0.0.1','--port','8791','--local-upstream','127.0.0.1','--upstream-protocol','http'],{env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1',PAYMENTS_ENABLED:'false'},stdio:['ignore',logFd,logFd]});
  await ready();
  await Promise.all([surfaceAndAssetAudit(),securityAndFreezeAudit()]);
  await platformAccountAudit(fixtureEnv);
  await acceptedOfferAudit(fixtureEnv);
  await concurrencyAudit(fixtureEnv);
  await autonomousFolderIntakeAudit(fixtureEnv);
  // Der persistierte Zustand wird als SQLite-Datei gelesen. Solange der Worker sie offen haelt,
  // kann SQLite den lesenden Prozess mit SQLITE_BUSY abweisen. Deshalb erst anhalten, dann lesen.
  await stopWorker();
  run(process.execPath,['scripts/commercial-onboarding-e2e-state.mjs','verify',config],{env:{PAYMENTS_ENABLED:'false'}});
  console.log('Commercial local Worker + migrated D1 runtime acceptance: OK');
}catch(error){
  try{console.error(readFileSync(logFile,'utf8').slice(-16000));}catch{}
  throw error;
}finally{
  try{worker?.kill('SIGTERM');}catch{}
  if(logFd!==null)try{closeSync(logFd);}catch{}
  try{rmSync(config,{force:true});}catch{}
  try{rmSync(scratch,{recursive:true,force:true});}catch{}
}
