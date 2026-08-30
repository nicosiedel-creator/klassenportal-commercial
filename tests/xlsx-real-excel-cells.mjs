import { strict as assert } from 'node:assert';
import { buildZip } from './helpers/zip.mjs';
import { parseXlsx } from '../dist/portability/xlsx.js';
import { mapOrganizationRows } from '../dist/core/organization-import-file.js';
import { importRole } from '../dist/core/organization-import.js';

// Ein Kunde lud seine Kursliste als .xlsx hoch. Das Portal meldete nur "Die Aktion konnte nicht
// ausgefuehrt werden. Bitte die Eingaben pruefen." - an den Eingaben lag es nicht.
//
// Der Zellenleser verlangte fuer jede Zelle ein schliessendes </c>. Excel schreibt eine
// formatierte, aber leere Zelle jedoch selbstschliessend: <c r="A1" s="1"/>. Das Muster lief
// dann bis zum </c> der NAECHSTEN Zelle und verschluckte sie mitsamt Wert. Aus einer Kursliste
// wurde die Kopfzeile ["0", null, "course_code"], der Kursname war weg.
//
// Dieser Test baut echte XLSX-Archive so, wie Excel sie schreibt, und fuehrt den ausgelieferten
// Leser darauf aus.

const sst=(...v)=>`<?xml version="1.0"?><sst>${v.map(x=>`<si><t>${x}</t></si>`).join('')}</sst>`;
const sheet=rows=>`<?xml version="1.0"?><worksheet><sheetData>${rows}</sheetData></worksheet>`;
const xlsx=async(strings,rows)=>parseXlsx(await buildZip([
  ['xl/sharedStrings.xml',sst(...strings)],
  ['xl/worksheets/sheet1.xml',sheet(rows)],
],{deflate:true}));

// 0. Der schwerste Befund: OOXML darf jedes Element mit einem Namensraum-Praefix schreiben.
//    Excel selbst laesst es weg, viele erzeugende Werkzeuge nicht. Eine echte Kundendatei
//    (03_Kurse.xlsx aus dem Abnahmepaket) schrieb <x:row>, <x:c>, <x:v> - und wurde als voellig
//    leer gelesen: 0 Zeilen fuer eine Datei mit 24 Kursen. Der Kunde bekam "keine verwertbare
//    Zeile" fuer eine Datei voller Daten.
const prefixed=await parseXlsx(await buildZip([
  ['xl/sharedStrings.xml','<?xml version="1.0"?><x:sst xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:si><x:t>course_name</x:t></x:si><x:si><x:t>course_code</x:t></x:si><x:si><x:t>Verwaltungsgrundlagen A</x:t></x:si><x:si><x:t>ADM-26-01</x:t></x:si></x:sst>'],
  ['xl/worksheets/sheet1.xml','<?xml version="1.0"?><x:worksheet xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:cols><x:col min="1" max="1" width="10"/></x:cols><x:sheetData>'+
    '<x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="s"><x:v>1</x:v></x:c></x:row>'+
    '<x:row r="2"><x:c r="A2" t="s"><x:v>2</x:v></x:c><x:c r="B2" t="s"><x:v>3</x:v></x:c></x:row>'+
    '</x:sheetData></x:worksheet>'],
],{deflate:true}));
assert.deepEqual(prefixed.headers,['course_name','course_code'],
  `eine Datei mit Namensraum-Praefix darf nicht leer gelesen werden, gelesen: ${JSON.stringify(prefixed.headers)}`);
assert.equal(prefixed.rows.length,1,'die Datenzeile muss ankommen');
assert.equal(prefixed.rows[0].course_name,'Verwaltungsgrundlagen A');
// <x:cols>/<x:col> beginnen ebenfalls mit "c" - sie duerfen nicht als Zellen gelesen werden.
assert.ok(!Object.keys(prefixed.rows[0]).some(k=>/^spalte_/.test(k)),'Spaltendefinitionen sind keine Zellen');

// 1. Der Befund: eine formatierte Leerzelle vor den Daten.
const strings=['course_name','course_code','Pflege 2026 A','PF26A','Pflege 2026 B','PF26B'];
const withStyledEmpty=await xlsx(strings,
  '<row r="1"><c r="A1" s="1"/><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>'+
  '<row r="2"><c r="A2" s="1"/><c r="B2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c></row>'+
  '<row r="3"><c r="A3" s="1"/><c r="B3" t="s"><v>4</v></c><c r="C3" t="s"><v>5</v></c></row>');
assert.ok(withStyledEmpty.headers.includes('course_name'),
  `eine leere Zelle davor darf die Kopfzeile nicht zerstoeren, gelesen: ${JSON.stringify(withStyledEmpty.headers)}`);
assert.equal(withStyledEmpty.rows.length,2,'beide Kurszeilen muessen ankommen');
assert.equal(withStyledEmpty.rows[0].course_name,'Pflege 2026 A','der Kursname darf nicht verschwinden');
assert.equal(withStyledEmpty.rows[1].course_code,'PF26B');

// 2. Leerzelle mittendrin und am Ende - genauso haeufig.
const between=await xlsx(strings,
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" s="1"/><c r="C1" t="s"><v>1</v></c></row>'+
  '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" s="1"/><c r="C2" t="s"><v>3</v></c></row>');
assert.equal(between.rows[0].course_name,'Pflege 2026 A');
assert.equal(between.rows[0].course_code,'PF26A','eine Leerzelle zwischen zwei Werten darf keinen davon fressen');

// 3. Excel laesst wirklich leere Zellen ganz weg - die Spaltennummer steht im r-Attribut.
const gaps=await xlsx(strings,
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row>'+
  '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="C2" t="s"><v>3</v></c></row>');
assert.equal(gaps.rows[0].course_name,'Pflege 2026 A');
assert.equal(gaps.rows[0].course_code,'PF26A','eine ausgelassene Zelle darf die Spalten nicht verschieben');

// 4. Weitere Schreibweisen, die vorkommen: inlineStr, Zahl, Wahrheitswert.
const mixed=await xlsx(['name','anzahl','aktiv'],
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>'+
  '<row r="2"><c r="A2" t="inlineStr"><is><t>Pflege 2026 C</t></is></c><c r="B2"><v>17</v></c><c r="C2" t="b"><v>1</v></c></row>');
assert.equal(mixed.rows[0].name,'Pflege 2026 C','inlineStr muss gelesen werden');
assert.equal(mixed.rows[0].anzahl,17);
assert.equal(mixed.rows[0].aktiv,true);

// 5. Kein Rueckschritt: eine saubere Tabelle ohne Leerzellen liest sich wie zuvor.
const clean=await xlsx(strings,
  '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'+
  '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>');
assert.deepEqual(clean.headers,['course_name','course_code']);
assert.deepEqual(clean.rows,[{course_name:'Pflege 2026 A',course_code:'PF26A'}]);

// 6. Und das, worauf es dem Kunden ankommt: aus der Datei muss ein Kurs werden, kein Teilnehmer
//    ohne Namen. Genau daran scheiterte der Import.
const mapped=mapOrganizationRows(withStyledEmpty.rows);
assert.equal(mapped[0].course_name,'Pflege 2026 A','die Spaltenzuordnung muss den Kursnamen finden');
assert.equal(importRole(mapped[0]),'course','die Zeile muss als Kurs erkannt werden, nicht als Person');


// 7. Und die Meldung: von allen Codes, die dieser Weg werfen kann, darf keiner als
//    Allgemeinplatz oder als technischer Code beim Kunden ankommen. Genau das ist passiert -
//    "Die Aktion konnte nicht ausgefuehrt werden. Bitte die Eingaben pruefen." half niemandem.
const { readFile }=await import('node:fs/promises');
const dictWindow={};
new Function('window',await readFile('public/kp-error-text.js','utf8'))(dictWindow);
const text=code=>dictWindow.KP_ERROR_TEXT({message:code});
const GENERIC=text('EIN_CODE_DEN_ES_NICHT_GIBT');
const sources=await Promise.all(['src/portability/xlsx.ts','src/core/organization-import-file.ts','src/core/organization-import.ts'].map(f=>readFile(f,'utf8')));
const importCodes=new Set(sources.flatMap(src=>[...src.matchAll(/Error\('([A-Z][A-Z0-9_]{3,60})'\)/g)].map(m=>m[1])));
assert.ok(importCodes.size>=20,`die Codes des Importwegs muessen auffindbar bleiben, gefunden: ${importCodes.size}`);
for(const code of importCodes){
  const sentence=text(code);
  assert.notEqual(sentence,GENERIC,`${code} braucht einen eigenen Satz statt eines Allgemeinplatzes`);
  assert.doesNotMatch(sentence,/^[A-Z][A-Z0-9_]+$/,`${code} darf nie als technischer Code beim Kunden ankommen`);
}
// Auch ein Code, den es heute noch nicht gibt, muss verstaendlich ankommen.
assert.notEqual(text('XLSX_UNSUPPORTED_COMPRESSION_14'),GENERIC,
  'auch ein kuenftiger Excel-Abbruchgrund muss einen verstaendlichen Satz bekommen');

console.log(`XLSX aus echtem Excel: Namensraum-Praefixe, Leerzellen, Luecken, inlineStr und Zahlen werden gelesen ohne die Nachbarzelle zu verschlucken; ${importCodes.size} Fehlercodes des Importwegs haben einen verstaendlichen Satz: OK`);
