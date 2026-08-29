import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const browser=await readFile('scripts/commercial-browser-e2e.mjs','utf8');
const readiness=await readFile('src/core/launch-readiness.ts','utf8');
const migration=await readFile('src/core/eu-storage-migration.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const policy=await readFile('PRODUCTION_ACCEPTANCE_2026-08-25.md','utf8');

assert.match(browser,/width:390,height:844/);
// Die Abnahme misst das Telefonfenster ohne Chromiums isMobile/hasTouch-Emulation: die
// verbreitert bei Ueberlauf das Layoutfenster (shrink-to-fit) und meldete deshalb null
// Querlauf, waehrend fuenf oeffentliche Seiten auf einem echten Telefon bis zu 594px
// seitlich ausliefen. Die vollstaendige Begruendung und Pfadabdeckung: tests/browser-mobile-contract.mjs.
assert.doesNotMatch(browser,/isMobile\s*:\s*true|hasTouch\s*:\s*true/,'die Live-Abnahme darf den Querlauf nicht per Geraete-Emulation wegmessen');
assert.match(browser,/document\.documentElement\.scrollWidth-window\.innerWidth/);
for(const path of ['/plattform-admin','/produkt','/kunden-admin','/dozentenportal'])assert.ok(browser.includes(`'${path}'`));
assert.match(readiness,/inspectEuStorageMigration/);
assert.match(readiness,/storageMigration:storageMigration\.complete/);
assert.match(migration,/runEuStorageMigrationCycle/);
assert.doesNotMatch(migration,/LEGACY_FILES!?\.delete/);
assert.match(index,/runEuStorageMigrationCycle/);
assert.match(policy,/VFA-13 ist ausdrücklich nicht Bestandteil/);
assert.match(policy,/CI erhält dafür keine Administrator-Zugangsdaten/);
assert.match(policy,/Merge ausschließlich, wenn.*alle sechs Pflichtgates grün/s);
// Die Abnahme liest die Sitzung ueber /api/auth/me und benennt im Fehlerfall die Kennung des
// Kontos, dem die Rechte fehlen. Sie las dafuer user.id - ein Feld, das es dort nicht gibt; die
// Sitzung liefert userId. Der Befund lautete deshalb "user id (unknown)" und war damit genau so
// wenig behebbar wie vorher. Jedes Feld, das die Abnahme aus der Sitzung liest, muss es in der
// Sitzung auch geben.
const types=await readFile('src/core/types.ts','utf8');
const sessionShape=(types.match(/export interface SessionUser \{([\s\S]*?)\n\}/)||[])[1];
assert.ok(sessionShape,'die Sitzungsform muss als SessionUser auffindbar bleiben');
const sessionFields=new Set([...sessionShape.matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\??\s*:/gm)].map(m=>m[1]));
assert.ok(sessionFields.has('userId')&&sessionFields.has('isPlatformAdmin'),'die Sitzungsform wurde nicht richtig gelesen');
const read=[...browser.matchAll(/d\?\.user\?\.([A-Za-z0-9_]+)/g)].map(m=>m[1]);
assert.ok(read.length,'die Abnahme muss die Sitzung ueberhaupt auswerten');
const unknown=[...new Set(read)].filter(field=>!sessionFields.has(field));
assert.deepEqual(unknown,[],`die Abnahme liest Felder, die /api/auth/me nicht liefert: ${unknown.join(', ')}`);
assert.ok(read.includes('userId'),'die Abnahme muss die Kennung des Kontos nennen koennen');

console.log('Commercial production acceptance contract: OK');
