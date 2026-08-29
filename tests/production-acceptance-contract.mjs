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
// Die Produktionsdomain beantwortet Anfragen mit Automatisierungskennung mit 403 - der Live-Smoke
// oeffnet sie deshalb seit jeher mit einer gewoehnlichen Browserkennung. Die Abnahme lief mit der
// Standardkennung und bekam auf /plattform-admin dieselbe 403. Beide muessen die Seite so oeffnen,
// wie ein Kunde sie oeffnet, sonst prueft die Abnahme eine Tuer, die fuer sie nie aufgeht.
const smoke=await readFile('.github/workflows/commercial-main-live-smoke.yml','utf8');
assert.match(smoke,/AppleWebKit\/537\.36/,'der Live-Smoke muss die Produktionsdomain mit einer gewoehnlichen Browserkennung oeffnen');
assert.match(browser,/const DESKTOP_UA='Mozilla\/5\.0[^']*AppleWebKit\/537\.36[^']*'/,'die Abnahme braucht dieselbe gewoehnliche Browserkennung');
assert.match(browser,/newPage\(\{viewport:\{width:1440,height:1000\},locale:'de-DE',userAgent:DESKTOP_UA\}\)/,'die Hauptseite der Abnahme muss diese Kennung auch benutzen');
assert.doesNotMatch(browser,/engine\.launch\(\{headless:true\}\)/,'Chromium muss ohne Automatisierungsmerkmal starten, sonst blockt der Bot-Schutz die eigene Domain');

// Eine Plattformsitzung wird nur an APP_ORIGIN ausgestellt - issueSession wirft sonst
// PLATFORM_ORIGIN_MISMATCH (nachgemessen am lokalen Kandidaten: HTTP 403). Die Abnahme lief gegen
// die workers.dev-Adresse und konnte deshalb nie hineinkommen; der Befund lautete jahrelang
// "kein Plattformadmin", obwohl es an der Adresse lag. Die Anmeldung muss an genau dem Ursprung
// stattfinden, den die Worker-Konfiguration als Produktionsursprung fuehrt.
const workflow=await readFile('.github/workflows/commercial-production-acceptance.yml','utf8');
const wrangler=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const appOrigin=String(wrangler.vars?.APP_ORIGIN||'');
assert.match(appOrigin,/^https:\/\//,'APP_ORIGIN muss eine HTTPS-Produktionsdomain sein');
const platformUrl=(workflow.match(/COMMERCIAL_PLATFORM_URL:\s*(\S+)/)||[])[1];
assert.equal(platformUrl,appOrigin,'die Abnahme muss sich an APP_ORIGIN anmelden, sonst verweigert der Worker die Plattformsitzung');
assert.match(browser,/const platformBase=\(process\.env\.COMMERCIAL_PLATFORM_URL\|\|base\)/,'die Abnahme braucht einen eigenen Ursprung fuer die Plattformanmeldung');
assert.match(browser,/navigate\(page,`\$\{platformBase\}\/plattform-admin`/,'die Anmeldeseite muss ueber diesen Ursprung geoeffnet werden');
// Die Sperrpruefung bleibt bewusst auf der workers.dev-Adresse: dort gilt die Sperre
// bedingungslos, auf der Produktionsdomain haengt sie an der Freigabe der Worker-Version.
const baseUrl=(workflow.match(/COMMERCIAL_BASE_URL:\s*(\S+)/)||[])[1];
assert.notEqual(baseUrl,appOrigin,'die Sperrpruefung darf nicht auf die Produktionsdomain wandern, sonst prueft sie eine schwaechere Aussage');
assert.match(String(baseUrl),/workers\.dev$/,'die Sperrpruefung muss den Worker direkt ansprechen');

// /api/auth/me antwortet auch ohne Anmeldung mit 200 und user:null - nachgemessen am lokalen
// Kandidaten. Die Abnahme wartete auf den Status statt auf einen Benutzer, brach deshalb schon im
// ersten Durchlauf ab und meldete anschliessend "kein Plattformadmin", obwohl gar keine Sitzung
// bestand. Die Bedingung muss die Sitzung selbst sein, nicht ihr Statuscode.
assert.match(browser,/signedIn:!!d\?\.user\b/,'die Abnahme muss eine echte Sitzung als Anmeldung werten');
assert.match(browser,/if\(session\.signedIn\|\|session\.error\)break;/,'die Wartesschleife muss auf die Sitzung warten, nicht auf den Statuscode');
assert.doesNotMatch(browser,/if\(session\.status===200\|\|session\.error\)break;/,'der Statuscode allein beweist keine Anmeldung');
assert.match(browser,/if\(!session\.signedIn\)\{/,'eine fehlende Anmeldung braucht einen eigenen Befund, nicht den zu fehlenden Rechten');
assert.match(browser,/\(Adresse entfernt\)/,'der Seitentext im Befund darf keine E-Mail-Adresse enthalten');

const read=[...browser.matchAll(/d\?\.user\?\.([A-Za-z0-9_]+)/g)].map(m=>m[1]);
assert.ok(read.length,'die Abnahme muss die Sitzung ueberhaupt auswerten');
const unknown=[...new Set(read)].filter(field=>!sessionFields.has(field));
assert.deepEqual(unknown,[],`die Abnahme liest Felder, die /api/auth/me nicht liefert: ${unknown.join(', ')}`);
assert.ok(read.includes('userId'),'die Abnahme muss die Kennung des Kontos nennen koennen');

console.log('Commercial production acceptance contract: OK');
