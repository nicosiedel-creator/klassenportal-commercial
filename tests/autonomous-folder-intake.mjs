import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { buildZip } from './helpers/zip.mjs';
import { extractIntakeDocument } from '../dist/core/intake-document-extract.js';
import { emptyRouted, routeExtracted, routeRows, routeText, archiveNeedsClientText } from '../dist/core/intake-classifier.js';
import { safeAutoOrganizationCandidate } from '../dist/core/intake-center.js';

// Gefordert ist: ein Mandant wirft einen ganzen Ordner ein, das System sucht sich alles selbst
// heraus und legt es an; nur bei Unklarheiten wird zurueckgefragt.
//
// Bis hierher las der Eingang JEDE Unterlage als Teilnehmerliste. Eine Kursliste im Ordner wurde
// damit zu Teilnehmerzeilen ohne Namen und ohne E-Mail - der ganze Stapel landete in der
// Handpruefung, obwohl nichts daran unklar war. Und ein gezippter Ordner wurde als
// "nicht unterstuetzt" abgewiesen.
//
// Dieser Test fuehrt aus, statt zu lesen: er baut ein echtes ZIP-Archiv und schickt es durch
// dieselbe Erkennung und dieselbe Weiche, die der Worker benutzt.

const KURSLISTE='course_name,course_code\nPflege 2026 A,PF26A\nPflege 2026 B,PF26B\n';
const DOZENTEN='rolle,name,email,kurs\nDozent,Frau Alma Reiter,alma.reiter@traeger.example,PF26A\n';
const FAECHER='fach,fachkuerzel\nAnatomie,ANA\n';
const TEILNEHMER='name,email,kurs\nJonas Weber,jonas.weber@example.org,PF26A\nMia Kunz,mia.kunz@example.org,PF26B\n';
const VERTRAG='Ausbildungsvertrag\n\nName: Sara Baum\nE-Mail: sara.baum@example.org\nKurs: Pflege 2026 A\nVertragsnummer: 4711\n';

// ---------------------------------------------------------------------------------------------
// 1. Ein gezippter Ordner muss ausgepackt werden. Vorher: "nicht unterstuetzt".
// ---------------------------------------------------------------------------------------------
for(const deflate of [false,true]){
  const zip=await buildZip([
    ['Traeger/kurse.csv',KURSLISTE],
    ['Traeger/dozenten.csv',DOZENTEN],
    ['Traeger/teilnehmer.csv',TEILNEHMER],
    ['Traeger/vertraege/sara.txt',VERTRAG],
    ['Traeger/logo.bmp','nicht lesbar'],
    ['Traeger/.DS_Store','x'],
    ['__MACOSX/._kurse.csv','x'],
  ],{deflate});
  const extracted=await extractIntakeDocument('ordner.zip','application/zip',zip);
  assert.equal(extracted.kind,'archive',`ein gezippter Ordner muss ausgepackt werden (deflate=${deflate})`);
  const names=extracted.entries.map(e=>e.name);
  assert.deepEqual(names,['Traeger/dozenten.csv','Traeger/kurse.csv','Traeger/teilnehmer.csv','Traeger/vertraege/sara.txt'],
    `nur lesbare Unterlagen duerfen uebernommen werden (deflate=${deflate})`);
  assert.ok(!names.some(n=>n.includes('.DS_Store')||n.startsWith('__MACOSX')),'Systemdateien duerfen nicht in den Eingang gelangen');
}

// Ein Archiv im Archiv wird nicht geoeffnet - sonst liesse sich jede Grenze durch Schachteln
// umgehen - aber es wird benannt statt stillschweigend verworfen.
const inner=await buildZip([['a.csv',KURSLISTE]]);
const nested=await extractIntakeDocument('aussen.zip','application/zip',await buildZip([['innen.zip',new Uint8Array(inner)],['kurse.csv',KURSLISTE]]));
assert.equal(nested.kind,'archive');
assert.deepEqual(nested.entries.map(e=>e.name),['kurse.csv'],'ein geschachteltes Archiv darf nicht geoeffnet werden');
assert.ok(nested.skipped.includes('innen.zip'),'ein uebersprungenes Archiv muss benannt werden');

// Etwas, das kein ZIP ist, bleibt es auch mit der Endung .zip nicht.
assert.equal((await extractIntakeDocument('kaputt.zip','application/zip',new TextEncoder().encode('kein zip').buffer)).kind,'unsupported');

// ---------------------------------------------------------------------------------------------
// 2. Die Weiche. Jede Unterlage muss dorthin, wo sie hingehoert.
// ---------------------------------------------------------------------------------------------
const rowsOf=async (name,content)=>{const x=await extractIntakeDocument(name,'text/csv',new TextEncoder().encode(content).buffer);assert.equal(x.kind,'rows',`${name} muss als Tabelle gelesen werden`);return x.rows;};

assert.equal(routeRows(await rowsOf('kurse.csv',KURSLISTE)).route,'organization','eine reine Kursliste ist keine Teilnehmerliste');
assert.equal(routeRows(await rowsOf('kurse.csv',KURSLISTE)).reason,'ROLE_OTHER_THAN_PARTICIPANT');
// Eine Teilnehmerliste, die zusaetzlich eine Fachspalte fuehrt, bleibt eine Teilnehmerliste.
assert.equal(routeRows(await rowsOf('tn.csv','name,email,kurs,fach\nJonas Weber,jonas.weber@example.org,PF26A,Anatomie\n')).route,'participants',
  'eine Zusatzspalte darf eine Teilnehmerliste nicht umleiten');
assert.equal(routeRows(await rowsOf('dozenten.csv',DOZENTEN)).route,'organization','eine Dozentenliste ist keine Teilnehmerliste');
assert.equal(routeRows(await rowsOf('faecher.csv',FAECHER)).route,'organization','eine Fachliste ist keine Teilnehmerliste');
assert.equal(routeRows(await rowsOf('teilnehmer.csv',TEILNEHMER)).route,'participants','eine Teilnehmerliste bleibt eine Teilnehmerliste');
assert.equal(routeText(VERTRAG).route,'participants','ein Vertrag gehoert zum Teilnehmerimport');
assert.equal(routeText(VERTRAG).reason,'CONTRACT_SIGNAL');
assert.equal(routeText('Rolle: Dozentin\nName: Frau Alma Reiter\nE-Mail: alma.reiter@traeger.example\nKurs: Pflege 2026 A').route,'organization',
  'eine Dozentenangabe im Fliesstext gehoert zur Struktur');
// Ein Vertrag, in dem das Wort Rolle vorkommt, bleibt trotzdem ein Vertrag.
assert.equal(routeText(`${VERTRAG}\nRolle: Dozent\n`).route,'participants','das Vertragssignal muss staerker wiegen als eine Rollenzeile');

// ---------------------------------------------------------------------------------------------
// 3. Der ganze Ordner auf einmal: gemischt hinein, sauber sortiert heraus.
// ---------------------------------------------------------------------------------------------
const folder=await buildZip([
  ['Traeger/kurse.csv',KURSLISTE],
  ['Traeger/dozenten.csv',DOZENTEN],
  ['Traeger/faecher.csv',FAECHER],
  ['Traeger/teilnehmer.csv',TEILNEHMER],
  ['Traeger/vertraege/sara.txt',VERTRAG],
]);
const routed=routeExtracted(emptyRouted(),'ordner.zip',await extractIntakeDocument('ordner.zip','application/zip',folder));
assert.equal(routed.organizationRows.length,4,'Kurse, Faecher und Dozenten gehoeren in den Organisationsimport');
assert.equal(routed.participantRows.length,2,'die Teilnehmerzeilen gehoeren in den Teilnehmerimport');
assert.equal(routed.participantTexts.length,1,'der Vertrag gehoert in den Teilnehmerimport');
assert.equal(routed.organizationTexts.length,0);
assert.ok(routed.decisions.length>=5,'jede Entscheidung muss nachvollziehbar festgehalten werden');
for(const d of routed.decisions)assert.ok(d.source.startsWith('ordner.zip/'),'jede Entscheidung muss ihre Quelle nennen');

// Ohne die Weiche waere genau das hier passiert: alles gilt als Teilnehmer.
const alt=emptyRouted();
for(const entry of (await extractIntakeDocument('ordner.zip','application/zip',folder)).entries)
  if(entry.extracted.kind==='rows')alt.participantRows.push(...entry.extracted.rows);
assert.equal(alt.participantRows.length,6,'ohne Weiche waeren alle Zeilen Teilnehmerzeilen - genau das war der Fehler');

// ---------------------------------------------------------------------------------------------
// 4. Ein PDF im Archiv laesst sich dort nicht lesen. Es muss benannt werden, nicht verschwiegen.
// ---------------------------------------------------------------------------------------------
const withPdf=await extractIntakeDocument('ordner.zip','application/zip',await buildZip([
  ['Traeger/kurse.csv',KURSLISTE],
  ['Traeger/vertrag.pdf','%PDF-1.4\n%aaa\n'],
]));
assert.deepEqual(archiveNeedsClientText(withPdf),['Traeger/vertrag.pdf'],'ein PDF im Archiv muss zur Pruefung gestellt werden');

// ---------------------------------------------------------------------------------------------
// 5. Der Eingang muss beides bauen und in der richtigen Reihenfolge anwenden. Falsch herum
//    meldet jeder Teilnehmer eines neu angelegten Kurses COURSE_NOT_FOUND.
// ---------------------------------------------------------------------------------------------
const intake=await readFile('src/core/intake-center.ts','utf8');
assert.match(intake,/previewOrganizationImport/,'der Eingang muss einen Organisationsentwurf bauen koennen');
assert.match(intake,/applyOrganizationImport/,'der Eingang muss den Organisationsentwurf anwenden koennen');
const autoApply=intake.slice(intake.indexOf('async function maybeAutoApply('));
const autoBody=autoApply.slice(0,autoApply.indexOf('\nexport '));
assert.ok(autoBody.indexOf('applyOrganizationImport')<autoBody.indexOf('applyParticipantImport'),
  'die Struktur muss vor den Personen angelegt werden');
assert.ok(autoBody.indexOf('applyOrganizationImport')<autoBody.indexOf('buildParticipantPreview'),
  'der Teilnehmerentwurf muss nach dem Anlegen der Kurse neu gebaut werden');
// Was die Automatik nicht uebernehmen konnte, darf nicht als "automatisch verarbeitet"
// untergehen. Ein erreichtes Kurskontingent ist keine Unklarheit, sondern eine Entscheidung des
// Kunden - und er erfaehrt sie nur, wenn sie ihm jemand sagt.
assert.match(autoBody,/if\(skipped\)await createTask\(/,
  'uebersprungene Eintraege muessen einen Vorgang ausloesen, statt still zu verschwinden');
assert.match(autoBody,/reasons:\[\.\.\.skippedReasons\]/,
  'der Vorgang muss die Gruende nennen, nicht nur eine Zahl');

// Ausgefuehrt statt gelesen: die Regel, die entscheidet, was ohne Rueckfrage entstehen darf.
const org=(over={})=>({type:'course',display_name:'Pflege 2026 A',email:null,course_id:null,course_name:'Pflege 2026 A',course_code:'PF26A',course_ref:'pf26a',subject_name:null,subject_short_name:null,confidence:100,warnings:[],source_row:0,...over});
assert.equal(safeAutoOrganizationCandidate(org()),true,'ein eindeutiger Kurs muss ohne Rueckfrage entstehen');
assert.equal(safeAutoOrganizationCandidate(org({warnings:['COURSE_WILL_BE_CREATED']})),true,
  'einen fehlenden Kurs anzulegen ist die Aufgabe und kein Hinderungsgrund');
assert.equal(safeAutoOrganizationCandidate(org({type:'tenant_admin_review'})),false,
  'ein Kundenadministrator darf nie von selbst entstehen');
assert.equal(safeAutoOrganizationCandidate(org({type:'tenant_admin_review',warnings:[],confidence:100})),false,
  'auch ohne jede Warnung darf ein Kundenadministrator nicht von selbst entstehen');
for(const w of ['COURSE_AMBIGUOUS','COURSE_NOT_FOUND','NAME_REQUIRED','EMAIL_REQUIRED','COURSE_REQUIRED','TENANT_ADMIN_CONFIRMATION_REQUIRED'])
  assert.equal(safeAutoOrganizationCandidate(org({warnings:[w]})),false,`${w} muss eine Rueckfrage ausloesen`);
assert.equal(safeAutoOrganizationCandidate(org({confidence:69})),false,'unsichere Angaben muessen zurueckgefragt werden');

const applyBatch=intake.slice(intake.indexOf('export async function applyIntakeBatch('));
const applyBody=applyBatch.slice(0,applyBatch.indexOf('\nexport '));
assert.ok(applyBody.indexOf('applyOrganizationImport')<applyBody.indexOf('applyParticipantImport'),
  'auch die Handpruefung muss die Struktur zuerst anlegen');
assert.match(applyBody,/buildParticipantPreview/,'nach dem Anlegen der Struktur muss der Teilnehmerentwurf neu gebaut werden');

// Die Auswahl des Pruefenden darf der Neubau des Entwurfs nicht uebergehen, und dafuer muessen
// die Zeilennummern stabil sein - also braucht die Dokumentabfrage eine feste Reihenfolge.
assert.match(intake,/FROM intake_documents WHERE tenant_id=\? AND batch_id=\? AND extraction_state<>'purged' ORDER BY created_at,id/,
  'ohne feste Reihenfolge der Dokumente bedeuten die Zeilennummern des Entwurfs nach dem Neubau etwas anderes');
assert.ok(!/selected_indexes:organizationApplied\?undefined/.test(applyBody),
  'die Auswahl des Pruefenden darf nach dem Neubau nicht uebergangen werden');
assert.match(applyBody,/applyParticipantImport\(env,auth,tenantId,\{batch_id:participantBatchId,digest:participantDigest,selected_indexes:input\.selected_indexes\}\)/,
  'die Auswahl des Pruefenden muss unveraendert weitergereicht werden');

// Das Pruef-Cockpit muss zeigen, was es anlegt. Ein Uebernehmen, das zusaetzlich Kurse und
// Dozenten anlegt, ohne sie vorher zu zeigen, waere nicht hinnehmbar.
const cockpit=await readFile('public/intake-center-ui.js','utf8');
assert.match(cockpit,/Erkannte Struktur/,'die erkannte Struktur muss im Cockpit sichtbar sein');
assert.match(cockpit,/selected_organization_indexes/,'die Struktur muss einzeln abwaehlbar sein');
assert.match(cockpit,/tenant_admin_review/,'ein Kundenadministrator muss im Cockpit gesperrt sein');
for(const w of ['COURSE_NAME_REQUIRED','SUBJECT_NAME_REQUIRED','NAME_REQUIRED','EMAIL_REQUIRED','COURSE_REQUIRED','COURSE_AMBIGUOUS','COURSE_NOT_FOUND','TENANT_ADMIN_CONFIRMATION_REQUIRED'])
  assert.ok(cockpit.includes(w),`das Cockpit muss ${w} genauso sperren wie der Server`);

// ---------------------------------------------------------------------------------------------
// 6. Derselbe Weg gilt fuer Vertraege, die per E-Mail hereinkommen.
// ---------------------------------------------------------------------------------------------
const inbound=await readFile('src/core/cloudflare-inbound.ts','utf8');
assert.match(inbound,/routeExtracted/,'auch E-Mail-Anhaenge muessen ueber die Weiche laufen');
assert.match(inbound,/applyOrganizationImport/,'auch per E-Mail muss Struktur automatisch entstehen koennen');
// Nur der Rumpf von processMail, nicht die Import-Zeile am Dateikopf: sonst vergliche der Test
// die Reihenfolge der Importe statt der Reihenfolge des Anlegens.
const processMail=inbound.slice(inbound.indexOf('async function processMail('));
const processBody=processMail.slice(0,processMail.indexOf('\nexport '));
assert.ok(processBody.indexOf('applyOrganizationImport')>=0&&processBody.indexOf('applyParticipantImport')>=0,
  'der E-Mail-Eingang muss beide Seiten anwenden koennen');
assert.ok(processBody.indexOf('applyOrganizationImport')<processBody.indexOf('applyParticipantImport'),
  'auch im E-Mail-Eingang gilt: erst die Struktur, dann die Personen');
assert.ok(processBody.indexOf('applyOrganizationImport')<processBody.lastIndexOf('buildParticipants()'),
  'auch per E-Mail muss der Teilnehmerentwurf nach dem Anlegen der Kurse neu gebaut werden');

// ---------------------------------------------------------------------------------------------
// 7. Die Oberflaeche muss einen ganzen Ordner annehmen koennen.
// ---------------------------------------------------------------------------------------------
const quickUi=await readFile('public/intake-quick-upload-ui.js','utf8');
assert.match(quickUi,/webkitdirectory/,'die Kundenverwaltung muss einen ganzen Ordner annehmen');
assert.match(quickUi,/\.zip/,'ein gezippter Ordner muss annehmbar sein');
const publicUi=await readFile('public/intake-public-upload.js','utf8');
assert.match(publicUi,/webkitdirectory|#folder/,'auch die oeffentliche Einreichseite muss einen Ordner annehmen');
assert.match(intake,/webkitdirectory/,'die oeffentliche Seite muss das Ordnerfeld ausliefern');

console.log('Autonomer Ordner-Eingang: gezippte Ordner werden ausgepackt, Kurs-, Fach-, Dozenten-, Teilnehmer- und Vertragsunterlagen selbst sortiert, Struktur vor Personen angelegt: OK');
