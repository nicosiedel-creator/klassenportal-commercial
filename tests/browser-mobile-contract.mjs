import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
const script=await readFile('scripts/commercial-browser-e2e.mjs','utf8');
const index=await readFile('src/index.ts','utf8');

// Das mobile Fenster muss die Breite eines echten Telefons haben, sonst misst die Abnahme
// nichts, was ein Kunde je sieht.
assert.match(script,/width:390,height:844/,'die mobile Abnahme muss ein 390px breites Fenster messen');

// Regression: Chromiums isMobile-Emulation schaltet shrink-to-fit ein und verbreitert bei
// Ueberlauf das Layoutfenster, statt ueberzulaufen (innerWidth 459 statt 390). Damit meldete
// die Messung jahrelang null Ueberlauf, waehrend fuenf oeffentliche Seiten auf einem echten
// Telefon um bis zu 594px seitlich ausliefen - darunter Datenschutz, AGB und AVV. Die
// Emulation darf hier nicht zurueckkehren; keine Pruefung bedient etwas per Beruehrung.
assert.doesNotMatch(script,/isMobile\s*:\s*true/,'isMobile-Emulation verdeckt echten Querlauf und darf nicht zurueckkehren');
assert.doesNotMatch(script,/hasTouch\s*:\s*true/,'hasTouch zieht in Chromium dieselbe shrink-to-fit-Emulation nach sich');

assert.match(script,/horizontal overflow/,'die mobile Abnahme muss Querlauf melden');
assert.match(script,/mobile page errors/);
assert.match(script,/mobile failed requests/);

// Die Messung muss die Seiten abdecken, auf denen die Fehler tatsaechlich sassen. Die
// rechtlich verpflichtenden Dokumente umgehen die Release-Sperre und sind in beiden Modi
// erreichbar - sie gehoeren damit in dieselbe Messung wie die Portaloberflaechen.
const list=script.match(/const MOBILE_PATHS=\[([^\]]*)\]/);
assert.ok(list,'die mobile Abnahme muss ihre Pfadliste als MOBILE_PATHS fuehren');
const covered=new Set([...list[1].matchAll(/'([^']+)'/g)].map(m=>m[1]));
const legal=[...index.match(/const LEGAL_PATHS=\[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(m=>m[1]);
assert.ok(legal.length>=7,'LEGAL_PATHS konnte nicht aus src/index.ts gelesen werden');
for(const path of legal)assert.ok(covered.has(path),`rechtlich verpflichtende Seite ${path} fehlt in der mobilen Messung`);
for(const path of ['/','/plattform-admin','/produkt','/kunden-admin','/dozentenportal'])
  assert.ok(covered.has(path),`Portaloberflaeche ${path} fehlt in der mobilen Messung`);

console.log('Desktop/mobile browser acceptance contract: OK');
