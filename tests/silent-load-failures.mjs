// Eine leere Liste muss sich von einer nicht geladenen Liste unterscheiden.
//
// Zweimal aus dem Kundenbetrieb gemeldet, beide Male dasselbe Bild: eine Auswahl steht leer da,
// der Kunde haelt es fuer "es gibt nichts", und in Wahrheit ist die Abfrage gescheitert. Der
// Ausloeser ist immer dieselbe Zeile: .catch(()=>({liste:[]})) - der Grund wird weggeworfen,
// bevor ihn irgendwer sehen kann.
//
// Dieser Test haelt die Bereiche frei davon, die ein Kundenadmin taeglich bedient, und faengt
// neue Vorkommen ab, bevor sie in den Betrieb gehen.
import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Oberflaechen, in denen eine verschluckte Liste den Kunden ratlos zuruecklaesst.
const DATEIEN=['certificate-workflow-ui','communication-admin-ui','intake-center-ui',
  'education-operations-extended-ui','planning-resource-ui'];

const verschluckt=[];
for(const name of DATEIEN){
  const quelle=await readFile(`public/${name}.js`,'utf8');
  // Gemeint ist nur das Auffangen, das eine benannte Nutzlast vortaeuscht - also aus einem
  // Fehler eine scheinbar gueltige, leere Antwort macht. Ein Rueckfall auf einen anderen Weg
  // (Zwischenablage -> Eingabefeld) oder das Lesen eines Koerpers, der kein JSON ist, ist
  // ausdruecklich in Ordnung und bleibt erlaubt.
  for(const treffer of quelle.matchAll(/\.catch\(\(\)\s*=>\s*(\(\{\s*[a-zA-Z_$]+\s*:|\[\s*\])/g))
    verschluckt.push(`${name}.js: vorgetäuschte leere Antwort bei Zeichen ${treffer.index}`);
  for(const treffer of quelle.matchAll(/catch\s*\{\s*[a-zA-Z_$]+\s*=\s*\[\]\s*;?\s*\}/g))verschluckt.push(`${name}.js: catch{…=[]} bei Zeichen ${treffer.index}`);
}
assert.deepEqual(verschluckt,[],
  `hier wird der Grund einer gescheiterten Abfrage weggeworfen:\n${verschluckt.join('\n')}`);

// Und der aufgefangene Grund muss auch wirklich gezeigt werden.
const ZEIGEN=[
  ['certificate-workflow-ui','Die Klassenliste konnte nicht geladen werden'],
  ['certificate-workflow-ui','Die Workflow-Regeln konnten nicht geladen werden'],
  ['communication-admin-ui','Nicht alle Empfängerlisten konnten geladen werden'],
  ['intake-center-ui','Die Klassenliste konnte nicht geladen werden'],
  ['intake-center-ui','Der Arbeitsbereich konnte nicht bestimmt werden'],
  ['education-operations-extended-ui','Die Klassenliste konnte nicht geladen werden'],
];
for(const [name,satz] of ZEIGEN){
  const quelle=await readFile(`public/${name}.js`,'utf8');
  assert.ok(quelle.includes(satz),`${name}.js muss den gescheiterten Ladevorgang benennen: "${satz}"`);
  // Der Satz darf nicht bloss dastehen - er muss den aufgefangenen Fehler mitführen.
  const stelle=quelle.indexOf(satz);
  // Nur bis zum Ende genau dieses Hinweises schauen - sonst borgt sich ein Satz ohne Grund den
  // Grund des naechsten Hinweises und die Behauptung ginge grundlos durch.
  const ende=quelle.indexOf('</div>',stelle);
  assert.ok(ende>stelle,`${name}.js: der Hinweis "${satz}" ist nicht abgeschlossen`);
  const umfeld=quelle.slice(stelle,ende);
  // Der Satz muss den aufgefangenen Grund mitfuehren - entweder direkt uebersetzt oder ueber
  // eine Variable, die ihn traegt. Ein fester Satz ohne Grund waere wieder nur "irgendwas ging
  // schief".
  assert.match(umfeld,/\$\{[^}]*(hinweis\(|KP_ERROR_TEXT|Fehler)/,
    `${name}.js muss den Grund mitteilen, nicht nur, dass etwas schiefging`);
}

// Die aufgefangenen Fehler dürfen nicht technisch durchschlagen: jede dieser Oberflächen muss
// das gemeinsame deutsche Wörterbuch benutzen, statt einen SCREAMING_SNAKE_CODE zu zeigen.
for(const name of DATEIEN){
  const quelle=await readFile(`public/${name}.js`,'utf8');
  // Zwei Wege sind erlaubt und beide richtig: das gemeinsame Woerterbuch, oder eine eigene,
  // speziellere Uebersetzung dieser Oberflaeche - so ist es im Woerterbuch selbst festgehalten.
  // Verboten ist nur, einen technischen Code stehen zu lassen.
  assert.ok(/KP_ERROR_TEXT/.test(quelle)||/function friendly\(|const FRIENDLY=/.test(quelle),
    `${name}.js muss Fehler übersetzen, keinen technischen Code zeigen`);
}

console.log(`silent-load-failures: ok (${DATEIEN.length} Oberflächen geprüft)`);
