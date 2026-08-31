import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Gemeldet: "Ich habe Stundenplaene hochgeladen und diese wurden nicht erkannt oder sehen nur die
// Schueler ihren Plan und der Admin nicht?"
//
// Der zweite Teil der Frage war berechtigt. Die Karte "Inhalte" im Kundenadmin fragte
//   const c=S.courses[0]  ->  /api/content/lessons?...&course_id=<erste Klasse>
// ab. Immer nur die erste Klasse der Liste, ohne Auswahl und ohne Hinweis darauf. Ein Stundenplan
// fuer jede andere Klasse war fuer den Admin unsichtbar, waehrend die Teilnehmer dieser Klasse ihn
// sehr wohl sahen - genau das Bild, das gemeldet wurde. "Pruefungen" hatte denselben Fehler.
// Zusaetzlich verschluckte die Karte jeden Fehler der Abfrage (Promise.allSettled ohne Auswertung
// des Ablehnungsgrundes, try{}catch{} ohne Meldung) und zeigte dafuer "Keine Eintraege" - also
// dasselbe Bild wie bei leeren Daten.
//
// Dieser Test liest nicht, er fuehrt aus: die echten Funktionen aus der ausgelieferten app.js,
// gegen eine gestellte Umgebung. Belegt wird, welche URLs tatsaechlich abgefragt werden.

const app = await readFile('public/app.js', 'utf8');
const lines = app.split('\n');
const grab = (head) => {
  const line = lines.find(l => l.startsWith(head));
  assert.ok(line, `"${head}" muss in public/app.js auffindbar bleiben`);
  return line;
};

const SOURCE = [
  grab('const h=v=>'),
  grab('function courseOptions('),
  grab('function courseName('),
  grab('function contentScope('),
  grab('function contentCoursePicker('),
  grab('function contentMeta('),
  grab('function contentItem('),
  grab('function loadFailure('),
  grab('async function content(){'),
  grab('async function exams(){'),
].join('\n');

// Der Server liefert einem Kunden-Admin ohne course_id bewusst den gesamten Mandanten. Genau
// darauf stuetzt sich die Vorgabe "Alle Klassen/Kurse", deshalb wird die Zusage hier mitgeprueft.
const data = await readFile('src/core/data.ts', 'utf8');
const listContent = data.slice(data.indexOf('export async function listContent'), data.indexOf('function teamsContent'));
assert.match(listContent, /if\(courseId\)/, 'listContent muss weiterhin nach course_id unterscheiden');
assert.match(
  listContent,
  /else if\(!auth\.isPlatformAdmin&&auth\.role!=='tenant_admin'\)/,
  'ohne course_id darf die Einschraenkung auf eigene Kurse ausdruecklich nicht fuer den Kunden-Admin gelten - sonst traegt die Vorgabe "Alle Klassen/Kurse" nicht',
);

function run(state, { answers = {}, rejects = {} } = {}) {
  const requested = [];
  const rendered = { title: '', body: '' };
  const bound = [];
  const S = { tenantId: 'ten_1', courses: [], contentCourseId: '', me: {}, ...state };
  const api = async (url) => {
    requested.push(url);
    const type = String(url.split('/api/content/')[1] || '').split('?')[0];
    if (rejects[type]) throw Object.assign(new Error(rejects[type]), { code: rejects[type] });
    return { ok: true, items: answers[type] || [] };
  };
  const env = new Function(
    'S', 'api', 'frame', 'qa', 'q', 'supportReadOnly', 'contentModal', 'bindCoursePicker', 'formModal', 'notice', 'window',
    `${SOURCE}\nreturn {courseOptions,courseName,contentScope,contentCoursePicker,contentItem,loadFailure,content,exams};`,
  )(
    S,
    api,
    (title, body) => { rendered.title = title; rendered.body = body; },
    () => [],
    () => ({ onclick: null, addEventListener() {} }),
    () => false,
    () => {},
    (reload) => bound.push(reload),
    () => {},
    () => {},
    {},
  );
  return { S, env, requested, rendered, bound };
}

const COURSES = [
  { id: 'crs_a', name: 'Verwaltungsfachangestellte 2026' },
  { id: 'crs_b', name: 'Pflegehelfer Abendkurs' },
  { id: 'crs_c', name: 'IT-Grundlagen' },
];
const courseIdsIn = (urls) => urls.map(u => (u.match(/course_id=([^&]+)/) || [])[1] || null);
// Nur die Karte selbst, ohne Werkzeugleiste - sonst wuerde schon die Klassenauswahl in der
// Leiste jeden Klassennamen enthalten und die Pruefung ins Leere laufen.
const cardOf = (body, label) => {
  const grid = body.split('<div class="grid">')[1] ?? body.split('<div class="card">').slice(1).join('<div class="card">');
  assert.ok(grid, 'die Karten muessen im Ergebnis auffindbar bleiben');
  const after = grid.split(`<h3>${label}</h3>`)[1];
  assert.ok(after !== undefined, `die Karte "${label}" muss vorhanden sein`);
  return after.split('<h3>')[0];
};

// 1. Der Befund selbst: ohne eigene Auswahl darf keine einzige Abfrage auf eine Klasse verengt
//    werden. Vorher trug jede der fuenf URLs course_id=crs_a.
{
  const t = run({ courses: COURSES });
  await t.env.content();
  assert.equal(t.requested.length, 5, 'die Inhaltskarte fragt weiterhin alle fuenf Bereiche ab');
  assert.deepEqual(
    courseIdsIn(t.requested), [null, null, null, null, null],
    `ohne Auswahl darf keine Abfrage auf eine einzelne Klasse verengt werden, gefragt wurde: ${t.requested.join(' | ')}`,
  );
  for (const url of t.requested) assert.match(url, /tenant_id=ten_1/, 'der Mandant muss weiterhin mitgegeben werden');
}

// 2. Ein Stundenplan der zweiten Klasse muss beim Admin ankommen - der gemeldete Fall.
{
  const t = run({ courses: COURSES }, {
    answers: { lessons: [{ id: 'l1', course_id: 'crs_b', starts_at: '2026-09-01T08:00', room: 'B 204' }] },
  });
  await t.env.content();
  const card = cardOf(t.rendered.body, 'Stundenplan');
  assert.match(card, /Pflegehelfer Abendkurs/, 'der Stundenplan einer anderen Klasse muss sichtbar sein und seine Klasse benennen');
  assert.match(card, /B 204/, 'der Raum gehoert zur Stundenplanzeile');
  assert.doesNotMatch(card, /Keine Einträge/, 'die Stundenplankarte darf bei vorhandenen Stunden nicht leer melden');
}

// 3. Es gibt eine echte Auswahl - jede Klasse, plus die Vorgabe.
{
  const t = run({ courses: COURSES });
  const picker = t.env.contentCoursePicker();
  assert.match(picker, /Alle Klassen\/Kurse/, 'die Auswahl braucht eine Sammelansicht');
  for (const c of COURSES) assert.ok(picker.includes(`value="${c.id}"`) && picker.includes(c.name), `${c.name} muss waehlbar sein`);
  await t.env.content();
  assert.match(t.rendered.body, /data-course-scope/, 'die Auswahl muss in der Inhaltsansicht auch erscheinen');
  assert.equal(t.bound.length, 1, 'die Auswahl muss verdrahtet sein, sonst waehlt sie nichts aus');
}

// 4. Wer eine Klasse waehlt, bekommt genau diese - und nur diese.
{
  const t = run({ courses: COURSES, contentCourseId: 'crs_c' });
  await t.env.content();
  assert.deepEqual(new Set(courseIdsIn(t.requested)), new Set(['crs_c']), 'die gewaehlte Klasse muss jede Abfrage verengen');
  assert.match(t.env.contentCoursePicker(), /value="crs_c" selected/, 'die gewaehlte Klasse muss in der Auswahl markiert bleiben');
  assert.match(t.env.courseOptions(true), /value="crs_c" selected/, 'ein neuer Eintrag soll in der gerade betrachteten Klasse vorbelegt sein');
}

// 5. Eine Auswahl aus einem anderen Mandanten darf nicht stehen bleiben: sie faellt auf die
//    Sammelansicht zurueck statt eine fremde Klasse abzufragen.
{
  const t = run({ courses: COURSES, contentCourseId: 'crs_fremd' });
  await t.env.content();
  assert.deepEqual(courseIdsIn(t.requested), [null, null, null, null, null], 'eine unbekannte Klassen-Auswahl darf nicht abgefragt werden');
  assert.equal(t.env.contentScope(), '', 'contentScope muss eine unbekannte Auswahl verwerfen');
}

// 6. Ein Fehler ist kein leerer Stundenplan. Vorher sah beides gleich aus.
{
  const t = run({ courses: COURSES }, { rejects: { lessons: 'FORBIDDEN' } });
  await t.env.content();
  const card = cardOf(t.rendered.body, 'Stundenplan');
  assert.match(card, /class="error"/, 'eine fehlgeschlagene Abfrage muss als Fehler erscheinen');
  assert.doesNotMatch(card, /Keine Einträge/, 'ein Fehler darf nicht als "keine Eintraege" ausgegeben werden');
  assert.match(t.rendered.body, /<h3>Meldungen<\/h3>/, 'die uebrigen Bereiche muessen trotzdem laden');
}

// 7. Pruefungen hatten denselben Fehler und bekommen dieselbe Behandlung.
{
  const t = run({ courses: COURSES }, { answers: { exams: [{ id: 'e1', title: 'Zwischenprüfung', starts_at: '2026-10-01T09:00', course_id: 'crs_b', visible_to_students: 1 }] } });
  await t.env.exams();
  assert.deepEqual(courseIdsIn(t.requested), [null], 'die Pruefungsliste darf ohne Auswahl nicht auf die erste Klasse verengt werden');
  const zeile = t.rendered.body.split('<div class="item">')[1] ?? '';
  assert.match(zeile, /Zwischenprüfung/, 'die Pruefung einer anderen Klasse muss sichtbar sein');
  assert.match(zeile, /Pflegehelfer Abendkurs/, 'die Pruefungszeile muss ihre Klasse benennen');
  assert.match(t.rendered.body, /data-course-scope/, 'auch die Pruefungsansicht braucht die Auswahl');

  const bad = run({ courses: COURSES }, { rejects: { exams: 'FORBIDDEN' } });
  await bad.env.exams();
  assert.match(bad.rendered.body, /class="error"/, 'eine fehlgeschlagene Pruefungsabfrage muss als Fehler erscheinen');
  assert.doesNotMatch(bad.rendered.body, /Keine Prüfungen/, 'ein Fehler darf nicht als "keine Pruefungen" ausgegeben werden');
}

// 8. Ohne jede Klasse (frisch angelegter Mandant) darf nichts abstuerzen und nichts verengt werden.
{
  const t = run({ courses: [] });
  await t.env.content();
  assert.deepEqual(courseIdsIn(t.requested), [null, null, null, null, null], 'ohne Klassen darf keine course_id erfunden werden');
  await t.env.exams();
  assert.match(t.rendered.body, /Keine Prüfungen/, 'ein leerer Mandant meldet leer - und nicht einen Fehler');
}

console.log('Kundenadmin-Inhalte: Stundenplan und Pruefungen sind nicht mehr auf die erste Klasse verengt, jede Klasse ist waehlbar, Fehler erscheinen als Fehler: OK');
