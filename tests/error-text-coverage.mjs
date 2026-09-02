// Kein technischer Code darf im Portal erscheinen - und "Die Aktion konnte nicht ausgeführt
// werden" ist fast so schlecht.
//
// Gemeldet aus dem Kundenbetrieb: der Einwurf schlug mit DUPLICATE_DOCUMENT fehl, die Oberfläche
// zeigte nur den allgemeinen Satz. Der Kunde konnte daraus nicht ableiten, was zu tun ist, und
// die Ursachensuche kostete einen ganzen Umweg. Dieser Test prüft für alle Fehler, die der
// Kunde in den von ihm bedienten Bereichen auslösen kann, dass es einen verständlichen deutschen
// Satz gibt - und führt das Wörterbuch dabei wirklich aus.
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Die Bereiche, die ein Kundenadmin selbst bedient.
const MODULE=['intake-center','intake-document-extract','planning-constraints','planning-resource-management',
  'learning-operations','education-operations','certificates','certificate-eligible','participant-document-import',
  'enterprise-organization','education-intent','course-signatures','exam-documentation',
  // Zweite Runde: der Tagesbetrieb. Anwesenheit ist die meistbenutzte Funktion des Portals
  // ueberhaupt - dort einen technischen Code zu zeigen ist am teuersten.
  'auth','data','attendance-classbook','teacher-portal','collaboration-reporting','advanced-modules',
  'commerce','enterprise-access','branding','tenant-portability',
  // Dritte Runde: Unterricht und Bewertung. Aufgaben, Abgaben, Noten, Tests, Meldungen an
  // Klassen, Verantwortlichkeiten, der Autopilot und die eigene Domain.
  'assignments-gradebook','gradebook-correctness','learning-suite','education-autopilot','lesson-hub',
  'responsibilities','secure-communications','custom-domains','microsoft-course-invitations','live-study-router'];

const codes=new Set();
for(const m of MODULE){
  let quelle='';
  try{quelle=await readFile(`src/core/${m}.ts`,'utf8');}catch{continue;}
  for(const treffer of quelle.matchAll(/throw new Error\('([A-Z][A-Z0-9_]*)'\)/g))codes.add(treffer[1]);
}
assert.ok(codes.size>380,`es müssen die Fehler aller Kundenbereiche eingesammelt werden, waren: ${codes.size}`);

// Das echte Wörterbuch ausführen, nicht nur lesen.
const quelle=await readFile('public/kp-error-text.js','utf8');
const fenster={};
new Function('window',quelle)(fenster);
const text=fenster.KP_ERROR_TEXT;
assert.equal(typeof text,'function','das Wörterbuch muss eine Übersetzungsfunktion bereitstellen');

const ohneText=[],technisch=[],zuKurz=[];
for(const code of [...codes].sort()){
  const satz=String(text({message:code})||'');
  if(satz===code)ohneText.push(code);
  else if(/[A-Z]{3,}_[A-Z]/.test(satz))technisch.push(code);
  else if(satz.length<15)zuKurz.push(code);
}
assert.deepEqual(ohneText,[],
  `diese Fehler erscheinen dem Kunden als technischer Code: ${ohneText.join(', ')}`);
assert.deepEqual(technisch,[],
  `in diesen Texten steckt noch ein technischer Code: ${technisch.join(', ')}`);
assert.deepEqual(zuKurz,[],
  `diese Texte sind zu knapp, um zu helfen: ${zuKurz.join(', ')}`);

// Der allgemeine Rückfallsatz darf nicht die Antwort auf alles sein: für die Bereiche, die der
// Kunde bedient, muss ein eigener Satz stehen.
const allgemein=String(text({message:'GIBT_ES_NICHT_XYZ'}));
const nurAllgemein=[...codes].filter(c=>String(text({message:c}))===allgemein);
assert.deepEqual(nurAllgemein,[],
  `diese Fehler landen beim allgemeinen Satz statt bei einer Erklärung: ${nurAllgemein.join(', ')}`);

// Kein Text darf verraten, wie es innen aussieht.
for(const [code,satz] of Object.entries(fenster.KP_ERROR_TEXTS||{})){
  assert.ok(!/\b(SELECT|INSERT|UPDATE|DELETE|FROM|D1_ERROR|sqlite|stack|Cloudflare|Worker|token|sk_)\b/i.test(satz),
    `der Text zu ${code} verrät Internes: ${satz}`);
  // Spaltennamen aus der Datei des Kunden (parent_external_id) sind erlaubt und hilfreich -
  // sie sagen ihm, wo er nachsehen muss. Verboten sind erzeugte interne Kennungen.
  assert.ok(!/\b(ten|usr|crs|res|tpv|tpe|grt|ind|cer|rbp|rbe)_[0-9a-f]/.test(satz),
    `der Text zu ${code} enthält eine erzeugte interne Kennung: ${satz}`);
}

console.log(`error-text-coverage: ok (${codes.size} Kundenfehler geprüft)`);
