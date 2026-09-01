import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { extractIntakeDocument, icsRows, emlText } from '../dist/core/intake-document-extract.js';

// Aus einem echten Abnahmepaket eines Bildungsträgers (18 Dateien) kamen 4 nie im Portal an:
// der Prüfungskalender (.ics) und drei Betriebsmails (.eml) - Raumsperrung, Dozentenausfall,
// Prüfungsverschiebung. Der Ordner-Einwurf filterte sie schon im Browser weg; der Server hätte
// sie als "unsupported" verworfen. Gemeldet wurde nur "4 Datei(en) waren keine lesbaren
// Unterlagen" - also genau die Vorgänge, die den Betrieb ändern, unsichtbar.
//
// Dieser Test liest nicht, er führt den ausgelieferten Extraktor aus.

const kalender = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Klassenportal Testpaket//DE
BEGIN:VEVENT
UID:P001@traeger.example.invalid
DTSTART:20260918T090000
DTEND:20260918T103000
SUMMARY:BGB-Klausur 1 (VFA-26-A)
LOCATION:A-204
DESCRIPTION:Hilfsmittel: BGB
END:VEVENT
BEGIN:VEVENT
UID:P003@traeger.example.invalid
DTSTART:20260925T090000
DTEND:20260925T103000
SUMMARY:Rechnungswesen Test (KFM-26-B)
LOCATION:B-105
DESCRIPTION:Taschen
 rechner
END:VEVENT
END:VCALENDAR`;

// 1. Ein Kalender wird zu Zeilen - mit denselben Spalten wie eine eingeworfene Prüfungsliste,
//    damit er sich damit zusammenführen lässt statt daneben zu stehen.
const zeilen = icsRows(kalender);
assert.equal(zeilen.length, 2, `zwei Termine erwartet, gelesen wurden ${zeilen.length}`);
assert.deepEqual(zeilen[0], {
  Termin_ID: 'P001', Titel: 'BGB-Klausur 1', Kurscode: 'VFA-26-A',
  Datum: '18.09.2026', Beginn: '09:00', Ende: '10:30',
  Raum: 'A-204', Beschreibung: 'Hilfsmittel: BGB',
});
// Fortgesetzte Zeilen (RFC 5545) gehören zusammen und werden nicht zerrissen.
assert.equal(zeilen[1].Beschreibung, 'Taschenrechner', 'eine umbrochene Beschreibung muss zusammengesetzt werden');
assert.equal(zeilen[1].Kurscode, 'KFM-26-B');
// Ohne Klammer am Ende wird kein Kurs geraten.
assert.equal(icsRows(kalender.replace(' (VFA-26-A)', ''))[0].Kurscode, '',
  'ein Kurs darf nur übernommen werden, wenn er wirklich im Titel steht');
// Ein Kalender ohne Termine ist keine Zeilenquelle.
assert.deepEqual(icsRows('BEGIN:VCALENDAR\nEND:VCALENDAR'), []);

// 2. Eine Mail wird zum Vorgang: Betreff, Datum, Absender und der lesbare Text.
const mail = `From: hausverwaltung@traeger.example.invalid
To: bildungsplanung@traeger.example.invalid
Date: Tue, 08 Sep 2026 15:42:00 +0200
Subject: Raum A-301 am 10.09.2026 gesperrt

Guten Tag,

Raum A-301 ist am Donnerstag, 10.09.2026, von 12:00 bis 16:00 Uhr gesperrt.

Viele Grüße`;
const text = emlText(mail);
for (const teil of ['Betreff: Raum A-301 am 10.09.2026 gesperrt', 'Datum: Tue, 08 Sep 2026',
                    'Von: hausverwaltung@traeger.example.invalid', 'Raum A-301 ist am Donnerstag'])
  assert.ok(text.includes(teil), `der Mailtext muss "${teil}" enthalten, gelesen wurde:\n${text.slice(0, 300)}`);
assert.ok(!text.includes('To: bildungsplanung') || text.includes('An: bildungsplanung'),
  'Kopfzeilen werden deutsch benannt, nicht roh übernommen');

// Quoted-printable und mehrteilige Mails dürfen nicht als Zeichensalat ankommen.
const qp = `Subject: =?UTF-8?Q?Pr=C3=BCfung_verschoben?=
Content-Transfer-Encoding: quoted-printable

Die Pr=C3=BCfung P001 wird auf den 21.09.2026 verschoben.`;
const qpText = emlText(qp);
assert.ok(qpText.includes('Prüfung P001 wird auf den 21.09.2026 verschoben'),
  `quoted-printable muss als UTF-8 dekodiert werden, gelesen wurde: ${qpText.slice(0, 200)}`);
assert.ok(qpText.includes('Betreff: Prüfung verschoben'),
  `ein Betreff nach RFC 2047 muss lesbar werden, gelesen wurde: ${qpText.slice(0, 120)}`);
assert.ok(!/Ã|=C3|=\?UTF/.test(qpText), `im Text darf kein Zeichensalat stehen: ${qpText.slice(0, 200)}`);
// Auch base64-kodierte Kopfzeilen.
assert.ok(emlText('Subject: =?UTF-8?B?UHLDvGZ1bmc=?=\n\nText').includes('Betreff: Prüfung'),
  'auch base64-kodierte Kopfzeilen müssen lesbar werden');
const mehrteilig = `Subject: Dozentenausfall
Content-Type: multipart/alternative; boundary="abc123"

--abc123
Content-Type: text/html; charset=utf-8

<p>D001 faellt aus.</p>
--abc123
Content-Type: text/plain; charset=utf-8

D001 faellt am 10.09.2026 krankheitsbedingt aus.
--abc123--`;
const mehrteiligText = emlText(mehrteilig);
assert.ok(mehrteiligText.includes('D001 faellt am 10.09.2026 krankheitsbedingt aus'),
  'aus einer mehrteiligen Mail muss der Textteil gelesen werden');
// Die HTML-Fassung steht in dieser Mail zuerst. Nur wer den Textteil wirklich sucht, findet ihn -
// und nur der Textteil gehört in den Vorgang, nicht Markup und nicht die Trennmarken.
assert.ok(!mehrteiligText.includes('<p>'),
  `die HTML-Fassung darf nicht mitgelesen werden, gelesen wurde:\n${mehrteiligText.slice(0, 300)}`);
assert.ok(!mehrteiligText.includes('--abc123'),
  `die Trennmarken der Mail gehören nicht in den Text, gelesen wurde:\n${mehrteiligText.slice(0, 300)}`);
assert.ok(!/content-type:/i.test(mehrteiligText),
  `die inneren Kopfzeilen gehören nicht in den Text, gelesen wurde:\n${mehrteiligText.slice(0, 300)}`);

// 3. Und der Weg von der Datei bis zum Ergebnis - genau so, wie der Import ihn geht.
const roh = t => new TextEncoder().encode(t).buffer;
const kal = await extractIntakeDocument('12_Pruefungskalender.ics', '', roh(kalender));
assert.equal(kal.kind, 'rows', `ein Kalender muss als Zeilen ankommen, angekommen ist "${kal.kind}"`);
assert.equal(kal.rows.length, 2);
const eml = await extractIntakeDocument('13_Mail_Raumsperrung_A301.eml', '', roh(mail));
assert.equal(eml.kind, 'texts', `eine Mail muss als Text ankommen, angekommen ist "${eml.kind}"`);
assert.ok(eml.texts[0].includes('A-301'));
// Auch über den Inhaltstyp allein, ohne Endung.
assert.equal((await extractIntakeDocument('anhang', 'text/calendar', roh(kalender))).kind, 'rows');
assert.equal((await extractIntakeDocument('anhang', 'message/rfc822', roh(mail))).kind, 'texts');

// 4. Die Filter davor lassen beide Arten durch - im Browser, im ZIP und auf der Upload-Seite.
// Sonst kommt der Extraktor nie an die Datei.
const dropDatei = await readFile('public/kp-folder-drop.js', 'utf8');
const unterstuetzt = (dropDatei.match(/const SUPPORTED=\/(.+?)\/i/) || [])[1] || '';
for (const endung of ['ics', 'eml'])
  assert.ok(unterstuetzt.includes(endung), `der Ordner-Einwurf muss .${endung} annehmen, er kennt: ${unterstuetzt}`);
const accept = (dropDatei.match(/const ACCEPT='([^']+)'/) || [])[1] || '';
for (const endung of ['.ics', '.eml'])
  assert.ok(accept.includes(endung), `der Dateidialog muss ${endung} anbieten, er bietet: ${accept}`);
const server = await readFile('src/core/intake-document-extract.ts', 'utf8');
const imArchiv = (server.match(/function folderEntryWanted[\s\S]{0,400}?test\(base\)/) || [''])[0];
for (const endung of ['ics', 'eml'])
  assert.ok(imArchiv.includes(endung), `auch im ZIP muss .${endung} durchkommen`);
const seite = await readFile('src/core/intake-center.ts', 'utf8');
for (const endung of ['.ics', '.eml'])
  assert.ok(seite.includes(`accept=`) && (seite.match(/accept="([^"]+)"/) || [])[1]?.includes(endung),
    `die öffentliche Upload-Seite muss ${endung} anbieten`);

console.log('Kalender und E-Mails im Import: .ics wird zu Terminzeilen, .eml zum lesbaren Vorgang, und alle drei Filter davor lassen beide durch: OK');
