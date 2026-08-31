import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Gemessen im Browser auf /kunden-admin, umgestellt auf Englisch: zwei Textstellen blieben
// deutsch - der Hinweis unter der Autopilot-Kachel und der Nur-Lesen-Hinweis der Supportansicht.
// Beim Nachzaehlen der Woerterbuecher war der eigentliche Befund groesser: im gemeinsamen
// Woerterbuch fehlten 18 Schluessel in 11 Sprachen, zusammen 198 Uebersetzungen. Wer das Portal
// auf Franzoesisch, Polnisch oder Arabisch stellte, las "Zahlung überfällig", "Wird gelöscht",
// "Lernmaterialien", "Vertretungen", "Wochenübersicht" weiter auf Deutsch: der Rueckfall eines
// fehlenden Schluessels ist die deutsche Quelle, und still fehlende Schluessel faellt niemandem
// auf.
//
// Dieser Test zaehlt nicht Zeichenketten im Quelltext, sondern liest die Woerterbuecher als
// Daten aus und vergleicht sie Schluessel fuer Schluessel.

const PAKETE = [
  ['public/localization.js', 'source', 'T'],
  ['public/customer-admin-i18n.js', 'SOURCE', 'T'],
  ['public/platform-admin-i18n.js', 'SOURCE', 'T'],
];
// Produktnamen. Sie lauten in jeder Sprache gleich und brauchen deshalb keinen eigenen Eintrag.
// Die Liste ist abschliessend: ein Schluessel, der hier steht und gar nicht fehlt, faellt auf -
// sonst waere sie ein bequemer Ort, um echte Luecken verschwinden zu lassen.
const NAMEN = ['starter', 'white_label', 'links', 'microsoft_365', 'microsoft_teams', 'teams', 'm365'];

function lies(quelle, name) {
  const start = quelle.indexOf(`const ${name}=`);
  assert.notEqual(start, -1, `${name} muss auffindbar bleiben`);
  const auf = quelle.indexOf('{', start);
  let tiefe = 0;
  for (let i = auf; i < quelle.length; i++) {
    if (quelle[i] === '{') tiefe++;
    else if (quelle[i] === '}' && --tiefe === 0) return new Function('return ' + quelle.slice(auf, i + 1))();
  }
  throw new Error(`${name} ist nicht geschlossen`);
}

let geprueft = 0, sprachen = 0;
for (const [datei, quellName, zielName] of PAKETE) {
  const inhalt = await readFile(datei, 'utf8');
  const deutsch = lies(inhalt, quellName), pakete = lies(inhalt, zielName);
  const schluessel = Object.keys(deutsch);
  assert.ok(schluessel.length >= 20, `${datei}: zu wenige Schluessel gefunden (${schluessel.length})`);
  const angeboten = Object.keys(pakete).filter(x => x !== 'de');
  assert.ok(angeboten.length >= 12, `${datei}: das Portal bietet mindestens 12 Sprachen an, gefunden: ${angeboten.length}`);

  for (const sprache of angeboten) {
    const wortschatz = pakete[sprache];
    const fehlend = schluessel.filter(k => !(k in wortschatz));
    const unerwartet = fehlend.filter(k => !NAMEN.includes(k));
    assert.deepEqual(unerwartet, [],
      `${datei}: ${sprache} faellt bei ${unerwartet.length} Schluessel(n) auf Deutsch zurueck: ${unerwartet.join(', ')}`);
    for (const [k, wert] of Object.entries(wortschatz)) {
      assert.ok(schluessel.includes(k), `${datei}: ${sprache} uebersetzt "${k}" - diesen Schluessel gibt es gar nicht`);
      assert.equal(typeof wert, 'string', `${datei}: ${sprache}.${k} ist kein Text`);
      assert.ok(wert.trim().length > 0, `${datei}: ${sprache}.${k} ist leer`);
    }
    sprachen++;
  }
  // Die Ausnahmeliste bleibt ehrlich: was dort steht, muss auch wirklich ueberall fehlen.
  for (const name of NAMEN) {
    if (!schluessel.includes(name)) continue;
    const vorhanden = angeboten.filter(s => name in pakete[s]);
    assert.deepEqual(vorhanden, [],
      `${datei}: "${name}" gilt als unuebersetzter Produktname, ist aber in ${vorhanden.join(', ')} uebersetzt - dann gehoert der Schluessel nicht auf die Ausnahmeliste`);
  }
  geprueft += schluessel.length;
}

// Und die beiden gemeldeten Stellen sind wirklich verdrahtet, nicht nur uebersetzt.
const kunde = await readFile('public/customer-admin-i18n.js', 'utf8');
const app = await readFile('public/app.js', 'utf8');
assert.match(kunde, /#kp-autopilot-primary small'\),t\('autopilot_hint'\)/,
  'der Hinweis unter der Autopilot-Kachel muss uebersetzt werden');
assert.match(kunde, /#kp-support-readonly/,
  'der Nur-Lesen-Hinweis der Supportansicht muss uebersetzt werden');
assert.match(app, /<div class="notice" id="kp-support-readonly">/,
  'der Nur-Lesen-Hinweis braucht eine stabile Kennung, sonst findet ihn die Uebersetzung nicht');
assert.match(kunde, /localizeNotices\(\);\}/,
  'die Uebersetzung der beiden Hinweise muss bei jedem Durchlauf mitlaufen');

console.log(`Sprachpakete: ${geprueft} Schlüssel über ${sprachen} Sprachfassungen vollständig; nur Produktnamen bleiben unübersetzt: OK`);
