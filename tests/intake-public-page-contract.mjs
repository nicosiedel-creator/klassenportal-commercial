import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Die öffentliche Eingangsseite ist die einzige Oberfläche, die jemand ohne Konto erreicht.
// Sie wurde zweimal geschrieben: einmal fest im Worker-HTML, einmal als ausgeliefertes Skript.
// Ausgeliefert wurde das Skript, weil ein Regex den fest eingebauten Block ersetzte - traf der
// Regex einmal nicht, ging die schwächere Fassung live: rohe Fehlercodes fuer den Kunden und
// ein Upload, der die Sitzungscookies mitschickte. Es darf nur noch eine Fassung geben.

const page=await readFile('src/core/intake-center.ts','utf8');
const wrapper=await readFile('src/core/secure-intake-page.ts','utf8');
const script=await readFile('public/intake-public-upload.js','utf8');

const template=(page.match(/const html=`([\s\S]*?)`;return new Response\(html/)||[])[1];
assert.ok(template,'die Eingangsseite muss als ein zusammenhaengendes HTML-Template erkennbar bleiben');

// Genau so, wie der Kunde sie bekommt: das Template nach der Nachbearbeitung des Wrappers.
const served=template.replace(',.rtf,.html,.htm','');

const scripts=[...served.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,1,`die Eingangsseite darf genau ein Skript einbinden, gefunden: ${scripts.length}`);
assert.equal(scripts[0][2].trim(),'','die Eingangsseite darf kein Skript im HTML mitfuehren, nur eine Datei laden');
assert.match(scripts[0][1],/src="\/intake-public-upload\.js"/,'die Eingangsseite muss die geprüfte Upload-Datei laden');

// Der eigentliche Grund fuer die Doppelung: die eingebaute Fassung zeigte x.message roh an.
assert.doesNotMatch(served,/\.message/,'im Seiten-HTML darf keine Fehlerausgabe mehr stehen');

// Diese Dateitypen sind auf einer Seite ohne Anmeldung nicht vorgesehen.
const accept=(served.match(/accept="([^"]*)"/)||[])[1];
assert.ok(accept,'das Auswahlfeld muss die erlaubten Dateitypen benennen');
for(const risky of ['.html','.htm','.rtf'])
  assert.ok(!accept.split(',').includes(risky),`die oeffentliche Seite darf ${risky} nicht zum Hochladen anbieten`);
assert.ok(wrapper.includes('.rtf,.html,.htm'),'die Verengung der Dateitypen muss im Wrapper erhalten bleiben');

// Die ausgelieferte Datei holt sich den Token selbst und schickt keine Cookies mit.
assert.match(script,/location\.pathname\.match\(\/\^\\\/eingang/,'die Upload-Datei muss den Token aus der Adresse lesen');
assert.match(script,/credentials:'omit'/,'der oeffentliche Upload darf keine Sitzungscookies mitsenden');

console.log('Öffentliche Eingangsseite: eine Fassung, geladen statt eingebaut, ohne Cookies: OK');
