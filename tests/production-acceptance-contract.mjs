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
console.log('Commercial production acceptance contract: OK');
