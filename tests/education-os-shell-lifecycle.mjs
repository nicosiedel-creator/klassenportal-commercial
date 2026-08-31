import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Der Browserlauf brach auf /kunden-admin ab mit
//   TypeError: Cannot set properties of undefined (setting 'innerHTML')
//   [at loadAll (education-os-ui.js:25:971)]
// Spalte 971 ist der catch-Zweig von loadAll.
//
// Ursache: body(name) ist `shell?.querySelector(...)` und gibt undefined zurueck, sobald das
// Fenster geschlossen ist - close() setzt shell auf null. loadAll laedt sieben Abfragen
// gleichzeitig; wird das Fenster waehrenddessen geschlossen (oder die Seite verlassen, was jede
// Abfrage abbrechen laesst), schreibt der catch-Zweig in ein Fenster, das es nicht mehr gibt -
// und wirft dabei selbst. render() prueft genau das seit jeher; loadAll tat es nicht.
//
// Dieser Test liest nicht, er fuehrt aus: die echte loadAll aus der ausgelieferten Datei, gegen
// eine Nachbildung, in der das Fenster mitten im Laden verschwindet.

const source = await readFile('public/education-os-ui.js', 'utf8');
const lines = source.split('\n');
const line = head => {
  const found = lines.find(l => l.trimStart().startsWith(head));
  assert.ok(found, `"${head}" muss in education-os-ui.js auffindbar bleiben`);
  return found;
};
const cut = (head, foot) => {
  const from = source.indexOf(head);
  assert.notEqual(from, -1, `"${head}" muss in education-os-ui.js auffindbar bleiben`);
  const to = source.indexOf(foot, from);
  assert.notEqual(to, -1, `das Ende von "${head}" muss auffindbar bleiben`);
  return source.slice(from, to);
};
// Die echten Bausteine: der Zustand, das Schliessen, der Zugriff auf die Bereiche und loadAll.
const SOURCE = [
  line('let shell=null,state='),
  line('function close(){'),
  line('const body=name=>shell?.querySelector'),
  cut('  async function loadAll(){', '\n  function render('),
].join('\n');

// Eine bewusst kleine Nachbildung des Fensters: mehr als Bereiche und Zaehler braucht loadAll
// nicht. Geschlossen wird mit der echten close()-Funktion aus der Datei.
function umgebung({ schliesstWaehrendDesLadens = false, abfrageScheitert = false, zaehlerFehlt = false, garNichtGeoeffnet = false } = {}) {
  const felder = new Map([['cockpit', { innerHTML: '' }], ['intent', { innerHTML: '' }]]);
  const alleZaehler = [['[data-risk-count]', { textContent: '' }], ['[data-find-count]', { textContent: '' }]];
  const zaehler = new Map(alleZaehler.filter(([sel]) => !String(zaehlerFehlt) || !sel.includes(String(zaehlerFehlt))));
  const fenster = { remove() {}, querySelector: sel => zaehler.get(sel) ?? felder.get(String(sel).replace(/\[data-pane-body="|"\]/g, '')) ?? null };
  // Der catch-Zweig ist die einzige Stelle, die errorText ruft. Wird er betreten, obwohl nichts
  // schiefgehen sollte, hat sich loadAll selbst einen Fehler gebaut - genau der gemeldete Fall.
  const zustand = { gerendert: 0, fehlerTexte: 0 };
  const env = new Function('api', 'q', 'tenant', 'E', 'errorText', 'render', 'felder',
    `${SOURCE}
     const bereiche=name=>felder.get(name);
     return {loadAll, close, oeffnen(f){shell=f;}, offen:()=>Boolean(shell), zustand:()=>state};`)
    (
      async () => {
        if (schliesstWaehrendDesLadens) env.close();
        if (abfrageScheitert) throw new Error('FORBIDDEN');
        return { twin: {}, risks: [], findings: [], scenarios: [], executions: [], courses: [], policy: {} };
      },
      p => p, () => 'ten_1', v => String(v), e => { zustand.fehlerTexte++; return String(e.message); }, () => { zustand.gerendert++; }, felder,
    );
  if (!garNichtGeoeffnet) env.oeffnen(fenster);
  return { env, felder, zustand, lauf: () => env.loadAll() };
}

// 1. Der Normalfall: das Fenster bleibt offen, es wird geladen und gezeichnet.
{
  const u = umgebung();
  await u.lauf();
  assert.equal(u.zustand.gerendert, 1, 'bei offenem Fenster muss gezeichnet werden');
  assert.doesNotMatch(u.felder.get('cockpit').innerHTML, /eo-os-note error/, 'ohne Fehler darf kein Fehler dastehen');
}

// 2. Eine gescheiterte Abfrage bei offenem Fenster: der Fehler erscheint im Fenster.
{
  const u = umgebung({ abfrageScheitert: true });
  await u.lauf();
  assert.match(u.felder.get('cockpit').innerHTML, /eo-os-note error/, 'ein Fehler muss im Fenster erscheinen');
}

// 3. Der gemeldete Fall: das Fenster verschwindet waehrend des Ladens, und die Abfrage scheitert.
//    Vorher warf hier der catch-Zweig selbst.
{
  const u = umgebung({ schliesstWaehrendDesLadens: true, abfrageScheitert: true });
  await assert.doesNotReject(() => u.lauf(),
    'ein geschlossenes Fenster darf keinen Programmfehler ausloesen - genau das brach den Browserlauf ab');
}

// 4. Und ohne Fehler, aber mit geschlossenem Fenster: nichts wird gezeichnet, nichts geworfen -
//    und vor allem wird kein Fehler erfunden, den es nicht gibt.
{
  const u = umgebung({ schliesstWaehrendDesLadens: true });
  await assert.doesNotReject(() => u.lauf());
  assert.equal(u.zustand.gerendert, 0, 'in ein geschlossenes Fenster wird nicht gezeichnet');
  assert.equal(u.zustand.fehlerTexte, 0,
    'ein geschlossenes Fenster ist kein Fehler - der Fehlerzweig darf gar nicht erst betreten werden');
  // Und der Zustand darf nicht aus einem Lauf gefuellt werden, dessen Fenster es nicht mehr gibt:
  // wer gleich darauf wieder oeffnet, saehe sonst alte Daten als frische.
  assert.equal(u.env.zustand().twin, null,
    'ein Lauf ohne Fenster darf den Zustand nicht mehr fuellen');
  assert.deepEqual(u.env.zustand().risks, [], 'auch nicht teilweise');
}

// 5. Gar kein Fenster beim Aufruf: der Einstieg selbst steht vor dem try und wuerde ungeschuetzt
//    werfen, ohne dass irgendein catch ihn faengt.
{
  const u = umgebung({ garNichtGeoeffnet: true });
  await assert.doesNotReject(() => u.lauf(),
    'ohne Fenster darf loadAll nichts anfassen - der Einstieg liegt vor dem try');
  assert.equal(u.zustand.gerendert, 0);
  assert.equal(u.zustand.fehlerTexte, 0);
}

// 6. Ein Fenster, in dem einer der beiden Zaehler fehlt (aelterer Aufbau, unfertiges Zeichnen):
//    das darf das Laden nicht in den Fehlerzweig kippen - weder der eine noch der andere.
for (const fehlend of ['risk', 'find']) {
  const u = umgebung({ zaehlerFehlt: fehlend });
  await u.lauf();
  assert.equal(u.zustand.gerendert, 1, `ohne den ${fehlend}-Zaehler wird trotzdem gezeichnet`);
  assert.equal(u.zustand.fehlerTexte, 0, `ein fehlender ${fehlend}-Zaehler ist kein Ladefehler`);
}

// 5. Die Zusage, die dabei nicht verloren gehen darf: render() prueft das Fenster weiterhin
//    selbst - sonst haengt alles an dieser einen Stelle.
assert.match(source, /function render\(name\)\{if\(!shell\)return;/,
  'render muss weiterhin selbst pruefen, ob es ein Fenster gibt');
assert.match(source, /const body=name=>shell\?\.querySelector/,
  'body muss weiterhin ohne Fenster nichts liefern, statt zu werfen');

console.log('Education OS: ein waehrend des Ladens geschlossenes Fenster loest keinen Programmfehler mehr aus: OK');
