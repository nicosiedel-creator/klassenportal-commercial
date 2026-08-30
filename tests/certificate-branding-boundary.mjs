import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { serveTenantLogo, uploadTenantLogo } from '../dist/core/branding.js';
import { forbidClassAdminStudentData } from '../dist/core/student-role.js';

// Zwei Befunde aus der Spec-Pruefung, die beide produktiv erreichbar waren:
//
// 1. certificates-router.ts war der einzige Router mit Zugriff auf fremde Teilnehmerdaten, der
//    forbidClassAdminStudentData nicht einzog. prepareCertificate nimmt eine beliebige user_id
//    und liefert attendancePercent und progress dieser Person - genau die Daten, die ein
//    Klassenadmin nie sehen darf. Die Funktion schreibt zusaetzlich: sie legt einen
//    certificate_records-Eintrag an und stellt bei approval_mode='objective_auto' sofort aus.
//
// 2. branding.ts erlaubte image/svg+xml als Logo. Das Logo wird unter /brand/logo/<tenant> ohne
//    Anmeldung im eigenen Origin ausgeliefert, eine SVG darf Skript ausfuehren, und eine CSP
//    als zweite Schutzschicht existiert nicht.

function auth(role, overrides={}){
  return {userId:'usr_1',role,tenantIds:['t1'],courseIds:['c1'],isPlatformAdmin:false,session:{},...overrides};
}

// --- 1. Klassenadmin-Grenze im Zertifikatsmodul --------------------------------------------

// Die Wache selbst.
assert.throws(()=>forbidClassAdminStudentData(auth('class_admin')),/FORBIDDEN_CLASS_ADMIN_STUDENT_DATA/,
  'class_admin muss von Endpunkten mit fremden Teilnehmerdaten abgewiesen werden');
for(const role of ['tenant_admin','participant']) forbidClassAdminStudentData(auth(role));

// Der Router laesst sich ohne echte Session nicht sinnvoll fahren, deshalb wird hier vertraglich
// geprueft, dass jede Route mit fremden Teilnehmerdaten die Wache traegt. Ohne diese Pruefung
// faellt ein spaeter ergaenzter Endpunkt still durch.
const router=await readFile('src/core/certificates-router.ts','utf8');
assert.match(router,/import\s*\{[^}]*forbidClassAdminStudentData[^}]*\}\s*from\s*'\.\/student-role\.js'/,
  'certificates-router muss die Wache importieren');

const guarded=[
  ["path==='/api/certificates/records'",'Zertifikatsliste mit Namen, E-Mail und Snapshot'],
  ["path==='/api/certificates/prepare'",'Snapshot mit attendancePercent und progress fremder Teilnehmer'],
  ['approve&&','Freigabe liefert denselben Snapshot erneut'],
  ['issue&&','Ausstellung liefert denselben Snapshot erneut'],
];
for(const [needle,why] of guarded){
  const line=router.split('\n').find(l=>l.includes(needle)&&l.includes('request.method'));
  assert.ok(line,`Route ${needle} nicht gefunden - Test an den Router anpassen`);
  assert.ok(line.includes('forbidClassAdminStudentData(auth)'),`${needle} braucht die Wache: ${why}`);
}

// Der Prueflink wird als Teilnehmer bewertet, sonst erreicht ein Klassenadmin ueber die Kursrolle
// jede fremde Bescheinigung des Kurses.
const linkLine=router.split('\n').find(l=>l.includes('verification-link'));
assert.ok(linkLine&&linkLine.includes('asStudentView(auth)'),
  'verification-link muss den Klassenadmin als Teilnehmer bewerten');

// Die eigene Bescheinigungsliste bleibt fuer den Klassenadmin erreichbar - er ist Teilnehmer.
const myLine=router.split('\n').find(l=>l.includes("path==='/api/certificates/my'"));
assert.ok(myLine&&!myLine.includes('forbidClassAdminStudentData'),
  'die eigene Bescheinigungsliste darf dem Klassenadmin nicht genommen werden');

// --- 2. Logo-Upload und -Auslieferung ------------------------------------------------------

function brandingEnv(storedContentType){
  return {
    DB:{prepare(){return{bind(){return{async first(){return{id:'t1'};}};}};}},
    FILES:{
      async get(){return storedContentType?{body:'x',etag:'"e"',httpMetadata:{contentType:storedContentType}}:null;},
      async put(){throw new Error('PUT_SHOULD_NOT_BE_REACHED');},
    },
  };
}
function logoRequest(type){
  const form=new FormData();
  form.set('logo',new File([new Uint8Array([1,2,3])],'logo.svg',{type}));
  return new Request('https://example.test/api/tenant/logo',{method:'POST',body:form});
}

// SVG wird beim Upload abgewiesen, bevor irgendetwas in R2 landet.
await assert.rejects(
  uploadTenantLogo(brandingEnv(null),auth('tenant_admin'),'t1',logoRequest('image/svg+xml')),
  /LOGO_FORMAT_INVALID/,
  'image/svg+xml darf nicht als Logo hochladbar sein');

for(const type of ['text/html','application/javascript','image/svg+xml; charset=utf-8']){
  await assert.rejects(
    uploadTenantLogo(brandingEnv(null),auth('tenant_admin'),'t1',logoRequest(type)),
    /LOGO_FORMAT_INVALID/,
    `${type} darf nicht als Logo hochladbar sein`);
}

// Ein vor dieser Aenderung abgelegtes SVG liegt weiterhin im Bucket. Es darf beim Ausliefern
// nicht mehr als SVG deklariert werden, sonst fuehrt der Browser es weiterhin aus.
const legacy=await serveTenantLogo(brandingEnv('image/svg+xml'),'t1');
assert.equal(legacy.headers.get('content-type'),'application/octet-stream',
  'ein bereits gespeichertes SVG darf nicht als image/svg+xml ausgeliefert werden');
assert.match(legacy.headers.get('content-disposition')||'',/^attachment/,
  'ein nicht erlaubter Logotyp muss als Download ausgeliefert werden');
assert.equal(legacy.headers.get('x-content-type-options'),'nosniff');

// Erlaubte Bildtypen bleiben unveraendert inline nutzbar.
const png=await serveTenantLogo(brandingEnv('image/png'),'t1');
assert.equal(png.headers.get('content-type'),'image/png');
assert.equal(png.headers.get('content-disposition'),'inline');

// Gegenprobe: materials.ts sperrt denselben Typ. Beide Stellen duerfen nicht auseinanderlaufen.
const materials=await readFile('src/core/materials.ts','utf8');
assert.ok(materials.includes("'image/svg+xml'"),'materials.ts muss image/svg+xml weiterhin sperren');
const branding=await readFile('src/core/branding.ts','utf8');
assert.ok(!/ALLOWED\s*=\s*new Set\([^)]*svg/.test(branding),'branding.ts darf svg nicht wieder erlauben');

console.log('Zertifikats-Rollengrenze und Logo-Upload: Klassenadmin abgewiesen, SVG als Logo gesperrt, Altbestand entschaerft: OK');
