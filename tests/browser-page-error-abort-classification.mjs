import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// WebKit meldet einen abgebrochenen fetch zweimal: einmal als requestfailed - dort verbucht ihn
// der Abbruchzaehler des Browserlaufs - und einmal als Konsolenmeldung
//   "Fetch API cannot load http://127.0.0.1:8787/api/auth/me due to access control checks."
// die Playwright fuer WebKit als pageerror weiterreicht. Der Cross-Browser-Lauf 33367959491 lief
// deshalb vollstaendig durch und scheiterte erst an dieser Doppelmeldung, obwohl /api/auth/me im
// selben Lauf hundertfach beantwortet wurde und beide Aufrufstellen (routeAdmin,
// routeParticipant) die Ablehnung selbst abfangen.
//
// Verworfen werden darf so eine Meldung nur unter derselben Bedingung, unter der ein Abbruch
// ueberhaupt als unbedenklich gilt: derselbe Pfad wurde im Lauf abgebrochen UND beantwortet.
// Dieser Test fuehrt den Klassifizierer aus der ausgelieferten Datei aus - er liest ihn nicht.

const source = await readFile('scripts/commercial-browser-e2e.mjs', 'utf8');
const cut = (head, foot) => {
  const from = source.indexOf(head);
  assert.notEqual(from, -1, `"${head}" muss im Browserlauf auffindbar bleiben`);
  const to = source.indexOf(foot, from);
  assert.notEqual(to, -1, `das Ende von "${head}" muss auffindbar bleiben`);
  return source.slice(from, to);
};
const klassifizierer = new Function(`
${cut('const LOAD_FAILURE=', '\nfunction abortedPageErrors(')}
${cut('function abortedPageErrors(', '\npage.on(\'requestfailed\'')}
return {pageErrorIsKnownAbort,abortedPageErrors};`)();
const { pageErrorIsKnownAbort, abortedPageErrors } = klassifizierer;

const WEBKIT = 'Fetch API cannot load http://127.0.0.1:8787/api/auth/me due to access control checks. [at routeAdmin (http://127.0.0.1:8787/admin-entry-route-ui.js?v=20260817-3:29:26)] @ http://127.0.0.1:8787/';
const CHROMIUM = 'TypeError: Failed to fetch [at routeParticipant (http://127.0.0.1:8787/participant-route-ui.js:18:30)] @ http://127.0.0.1:8787/';

// 1. Der gemessene Fall: der Pfad wurde abgebrochen und beantwortet - die Meldung ist dieselbe
//    Sache ein zweites Mal.
assert.equal(pageErrorIsKnownAbort(WEBKIT, ['/api/auth/me']), true,
  'ein Ladefehler auf einem abgebrochenen und beantworteten Pfad ist der bereits verbuchte Abbruch');
// Chromium nennt bei "Failed to fetch" keinen Pfad. Was sich nicht zuordnen laesst, wird auch
// nicht verworfen - lieber ein Befund zu viel als ein verschwundener.
assert.equal(pageErrorIsKnownAbort(CHROMIUM, ['/api/auth/me']), false,
  'eine Meldung ohne genannten Pfad laesst sich keinem Abbruch zuordnen und bleibt ein Befund');
// Nennt Chromium den Pfad doch - etwa in der Aufrufkette -, greift dieselbe Bedingung.
assert.equal(pageErrorIsKnownAbort(`${CHROMIUM} /api/auth/me`, ['/api/auth/me']), true,
  'mit genanntem Pfad ist es derselbe Fall wie bei WebKit');

// 2. Ohne verbuchten Abbruch bleibt es ein Befund. Das ist die Selbstpruefung: traegt die
//    Annahme nicht, faellt der Lauf weiterhin auf.
assert.equal(pageErrorIsKnownAbort(WEBKIT, []), false,
  'ohne einen einzigen verbuchten Abbruch darf nichts verworfen werden');
assert.equal(pageErrorIsKnownAbort(WEBKIT, ['/api/courses']), false,
  'ein anderer Pfad rechtfertigt das Verwerfen nicht');

// 3. Ein echter Programmfehler bleibt ein Programmfehler, auch wenn er denselben Pfad nennt.
for (const echt of [
  "TypeError: Cannot set properties of undefined (setting 'innerHTML') [at renderHub] @ http://127.0.0.1:8787/api/auth/me",
  'ReferenceError: opCourses is not defined @ http://127.0.0.1:8787/api/auth/me',
  'Error: FORBIDDEN_TENANT [at users] @ http://127.0.0.1:8787/api/auth/me',
])
  assert.equal(pageErrorIsKnownAbort(echt, ['/api/auth/me']), false,
    `kein Ladefehler, also kein Abbruch: ${echt.slice(0, 48)}`);

// 4. Auch eine von der CSP verweigerte Anfrage darf nicht durch die Hintertuer verschwinden. Sie
//    kann diese Bedingung gar nicht erfuellen, weil ihr errorText auf kein Abbruchmuster passt
//    und der Abbruchzaehler sie deshalb nie verbucht - die Pfadliste bleibt fuer sie leer.
assert.equal(pageErrorIsKnownAbort('Refused to connect to https://static.cloudflareinsights.com/beacon.js because it violates the Content Security Policy', []), false,
  'eine von der CSP verweigerte Anfrage bleibt sichtbar');

// 5. Ein leerer Pfad darf nicht auf jede Meldung passen.
assert.equal(pageErrorIsKnownAbort(WEBKIT, ['/']), false,
  'der Wurzelpfad darf nicht jede Meldung verschlucken');

// 6. Die Liste trennt sauber: nur die erkannten gehen weg, der Rest bleibt stehen.
const alle = [WEBKIT, "TypeError: Cannot read properties of null (reading 'value') @ http://127.0.0.1:8787/kunden-admin"];
const erkannt = abortedPageErrors(alle, ['/api/auth/me']);
assert.deepEqual(erkannt, [WEBKIT], 'genau die erkannte Meldung wird aussortiert');
assert.equal(alle.filter(x => !erkannt.includes(x)).length, 1, 'der echte Fehler bleibt ein Befund');

// 7. Und die Zusage des Zaehlers selbst: abortedAndAnswered nennt ausschliesslich Pfade, die
//    beides gesehen haben.
const tracker = new Function(`${cut('const NAVIGATION_ABORT=', '\nconst aborts=abortTracker();')}\nreturn abortTracker;`)()();
tracker.serve({ url: () => 'http://127.0.0.1:8787/api/auth/me' });
tracker.note({ method: () => 'GET', url: () => 'http://127.0.0.1:8787/api/auth/me' }, 'Load request cancelled');
tracker.note({ method: () => 'GET', url: () => 'http://127.0.0.1:8787/api/courses' }, 'Load request cancelled');
assert.deepEqual(tracker.abortedAndAnswered(), ['/api/auth/me'],
  'nur ein Pfad, der auch geliefert hat, zaehlt als unbedenklich abgebrochen');
assert.deepEqual(tracker.unanswered(), ['/api/courses (1x abgebrochen, nie beantwortet)'],
  'ein Pfad, der nur abbricht, bleibt ein Befund - diese Zusage darf nicht mit umkippen');

console.log('Browserlauf: WebKits doppelte Abbruchmeldung wird nur unter der bereits geltenden Bedingung verworfen, echte Seitenfehler bleiben Befunde: OK');
