import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Im Dozentenportal entscheidet die Ueberschrift der offenen Klasse, auf welche Klasse sich das
// Lehrplan-Fenster bezieht. In teacher-curriculum-ui.js stand dafuer:
//
//   active = courses.find(...) || courses.length===1 ? courses[0] : courses.find(...) || null
//
// "||" bindet staerker als "?:". Die Bedingung war also (gefunden || genau ein Kurs) - und traf
// sie zu, wurde courses[0] genommen statt des gefundenen Kurses. Ein Dozent mit mehreren Klassen
// bekam damit im Lehrplanfortschritt und im Lehrplan-Fenster immer die erste Klasse angezeigt,
// egal welche offen war. "Lehrplanbezug speichern" haette den Bezug einer Unterrichtsstunde an
// der falschen Klasse abgelegt.
//
// Die beiden Schwesterdateien mit derselben Auswahl schreiben sie seit jeher richtig. Dieser Test
// fuehrt alle drei aus und vergleicht sie miteinander.

const FAELLE = [
  { name: 'die offene Klasse ist die dritte', title: 'Pflegehelfer Abendkurs', erwartet: 'crs_c' },
  { name: 'die offene Klasse ist die erste', title: 'Verwaltungsfachangestellte 2026', erwartet: 'crs_a' },
  { name: 'keine Ueberschrift passt', title: 'Irgendetwas anderes', erwartet: null },
  { name: 'ohne Ueberschrift', title: '', erwartet: null },
];
const KURSE = [
  { course_id: 'crs_a', course_name: 'Verwaltungsfachangestellte 2026', tenant_id: 'ten_1' },
  { course_id: 'crs_b', course_name: 'IT-Grundlagen', tenant_id: 'ten_1' },
  { course_id: 'crs_c', course_name: 'Pflegehelfer Abendkurs', tenant_id: 'ten_1' },
];

function auswahl(source, head, name) {
  const line = source.split('\n').find(l => l.includes(head));
  assert.ok(line, `"${head}" muss in ${name} auffindbar bleiben`);
  // Der reine Auswahlausdruck, ohne den Rest der Funktion: alles zwischen "active=" und dem
  // naechsten ";" - genau die Stelle, an der der Vorrangfehler sass.
  const from = line.indexOf('active=');
  assert.notEqual(from, -1, `${name}: die Zuweisung an active muss auffindbar bleiben`);
  const expr = line.slice(from + 'active='.length, line.indexOf(';', from));
  return new Function('courses', 'title', `return (${expr});`);
}

const QUELLEN = [
  ['teacher-curriculum-ui.js', "active=courses.find(c=>String(c.course_name)===title)"],
  ['teacher-learning-mode-display.js', "active=courses.find(c=>String(c.course_name)===title)"],
  ['teacher-learning-operations-ui.js', "active=courses.find(c=>String(c.course_name)===title)"],
];

for (const [datei, head] of QUELLEN) {
  const source = await readFile(`public/${datei}`, 'utf8');
  const waehle = auswahl(source, head, datei);

  for (const fall of FAELLE) {
    const gewaehlt = waehle(KURSE, fall.title);
    assert.equal(gewaehlt?.course_id ?? null, fall.erwartet,
      `${datei}: ${fall.name} - erwartet ${fall.erwartet}, gewaehlt wurde ${gewaehlt?.course_id ?? null}`);
  }

  // Mit genau einer Klasse ist die Auswahl eindeutig, auch ohne passende Ueberschrift.
  const eine = [KURSE[1]];
  assert.equal(waehle(eine, 'passt nicht')?.course_id ?? null, 'crs_b',
    `${datei}: bei genau einer Klasse muss diese gewaehlt werden`);
  assert.equal(waehle(eine, 'IT-Grundlagen')?.course_id ?? null, 'crs_b',
    `${datei}: bei genau einer Klasse bleibt es dabei, auch wenn die Ueberschrift passt`);
  assert.equal(waehle([], 'IT-Grundlagen') ?? null, null,
    `${datei}: ohne Klassen darf keine erfunden werden`);
}

console.log(`Dozentenportal: alle drei Auswahlen treffen die offene Klasse statt der ersten (${FAELLE.length} Fälle × ${QUELLEN.length} Dateien): OK`);
