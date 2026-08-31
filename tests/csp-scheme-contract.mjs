import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// upgrade-insecure-requests laesst den Browser jede Unterressource auf https umstellen. Ueber
// https gehoert die Anweisung dorthin und bleibt. Ueber http ist sie sinnlos - es gibt nichts zu
// sichern - und schaedlich: Chromium und Firefox nehmen die Rueckadresse davon aus, WebKit nicht.
//
// Gemessen im Cross-Browser-Lauf 33323216016 (WebKit 26.0): das Dokument kam ueber
// http://127.0.0.1:8787 an, und genau die sechs Dateien, die es nachlaedt, scheiterten an
// "Error performing TLS handshake: An unexpected TLS packet was received" - angefragt unter
// https://127.0.0.1:8787/... Die Seite blieb ohne Stylesheet und ohne ihre Skripte.
//
// Dieser Test fuehrt den ausgelieferten Worker aus, statt seine Quelle zu lesen.
const { default: worker }=await import('../dist/index.js');

const answer=async url=>{
  const response=await worker.fetch(new Request(url),{});
  return String(response.headers.get('content-security-policy')||'');
};

const secure=await answer('https://klassenportal.app/');
assert.match(secure,/upgrade-insecure-requests/,
  'ueber https muss die Anweisung stehen bleiben - so laeuft der Betrieb');
assert.match(secure,/default-src 'self'/,'die uebrige Richtlinie bleibt unveraendert');

const plain=await answer('http://127.0.0.1:8787/');
assert.ok(!plain.includes('upgrade-insecure-requests'),
  'ueber http darf die Anweisung nicht mitgehen - sonst laedt WebKit die eigenen Dateien ueber https und bekommt einen TLS-Fehler');
// Alles andere muss gleich bleiben: entfernt wird genau eine Anweisung, nicht die Richtlinie.
assert.equal(plain,secure.replace('; upgrade-insecure-requests',''),
  'ueber http darf ausschliesslich diese eine Anweisung fehlen');
for(const directive of ["default-src 'self'","object-src 'none'","frame-ancestors 'none'","script-src 'self'","base-uri 'self'","form-action 'self'"])
  assert.ok(plain.includes(directive),`${directive} muss auch ueber http gelten`);

console.log('upgrade-insecure-requests gilt ueber https und entfaellt ueber http, ohne die uebrige Richtlinie anzutasten: OK');
