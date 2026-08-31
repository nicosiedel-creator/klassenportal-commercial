import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Gemeldet aus einem Durchklick der Einrichtungsstrecke im Browser: auf /einrichtung/<token> stand
// in der Karte "Einrichtung vorbereiten", sichtbar bei y=326:
//
//   "Keine echten Testdaten verwenden. Für Tests ausschließlich fiktive Personen und
//    E-Mail-Adressen unter example.invalid verwenden."
//
// Das ist die Seite, auf der ein zahlender Bildungstraeger sein Portal einrichtet. Er soll dort
// seine echte Organisation eintragen; der Hinweis sagte ihm das Gegenteil. Gemeint war er fuer
// Testlaeufe - er stand aber ohne jede Bedingung im Markup.
//
// Dieser Test liest nicht nach Zeichenketten, sondern fuehrt die ausgelieferten Funktionen aus.

const quelle = await readFile('public/setup-preparation-ui.js', 'utf8');
const zeilen = quelle.split('\n');
const hole = kopf => {
  const zeile = zeilen.find(z => z.startsWith(kopf));
  assert.ok(zeile, `"${kopf}" muss in public/setup-preparation-ui.js auffindbar bleiben`);
  return zeile;
};
// checklistHtml ist mehrzeilig; von seinem Kopf bis zur schliessenden Zeile.
const beginn = zeilen.findIndex(z => z.startsWith('function checklistHtml('));
assert.notEqual(beginn, -1, 'checklistHtml muss auffindbar bleiben');
const ende = zeilen.findIndex((z, i) => i > beginn && z === '}');
assert.notEqual(ende, -1, 'checklistHtml muss geschlossen werden');
const quellText = [
  hole('const E='),
  hole('const TESTDATEN_HINWEIS='),
  ...zeilen.slice(zeilen.findIndex(z => z.startsWith('function testumgebung()')), zeilen.findIndex(z => z.startsWith('function testumgebung()')) + 4),
  ...zeilen.slice(beginn, ende + 1),
].join('\n');

const baue = (hostname, kunde) =>
  new Function('location', `${quellText}\nreturn checklistHtml(${kunde ? 'true' : 'false'});`)({ hostname });

const HINWEIS = 'Keine echten Testdaten verwenden';

// Auf der Produktionsdomain darf er nicht erscheinen - in keiner der beiden Fassungen.
for (const kunde of [false, true]) {
  const html = baue('klassenportal.app', kunde);
  assert.ok(!html.includes(HINWEIS),
    `auf der Produktionsdomain darf der Testdaten-Hinweis nicht erscheinen (${kunde ? 'Kundenoberfläche' : 'Einrichtungsstrecke'})`);
  // Die Karte selbst muss bleiben - weggenommen wird nur der Hinweis.
  assert.ok(html.includes('Einrichtung vorbereiten'),
    'die Vorbereitungsliste selbst muss erhalten bleiben');
  assert.ok(html.includes('example.invalid') === false || !html.includes(HINWEIS),
    'der Hinweistext darf nicht über einen anderen Weg zurückkommen');
}
// Eine echte Kundendomain ist genauso Produktion.
assert.ok(!baue('portal.bildungsakademie.de', false).includes(HINWEIS),
  'auch auf einer eigenen Kundendomain ist der Hinweis fehl am Platz');

// Dort, wo er gemeint war, bleibt er: Vorschau und Entwicklung.
for (const host of ['127.0.0.1', 'localhost', 'klassenportal-commercial.nicosiedel.workers.dev', 'vorschau.pages.dev']) {
  assert.ok(baue(host, false).includes(HINWEIS),
    `auf ${host} soll der Testdaten-Hinweis weiterhin erscheinen`);
}

console.log('Einrichtungsstrecke: der Testdaten-Hinweis erscheint nur noch auf Vorschau- und Entwicklungsadressen, nicht mehr beim zahlenden Kunden: OK');
