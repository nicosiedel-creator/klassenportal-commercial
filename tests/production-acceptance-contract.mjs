import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';

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
// Der Worker haengt an jede Antwort die Sicherheitsheader (harden): CSP, X-Frame-Options: DENY,
// nosniff, Referrer-Policy, Permissions-Policy, HSTS. Eine Seite, die er nie sieht, bekommt
// keinen einzigen davon. Gemessen am lokalen Kandidaten: /kunden-admin 6/6, /customer-admin 0/6 -
// dieselbe Anwendung, dasselbe Sitzungscookie, nur ohne Klickjacking-Schutz. Jede ausgelieferte
// Seite muss deshalb durch den Worker laufen, nicht nur die mit deutschem Routennamen.
//
// Ausgenommen sind allein die VFA13-Seiten: ihre Routen (/lernabend-vfa13, /quiz/vfa13/*) laufen
// bereits durch den Worker, und an der VFA13-Zuordnung wird hier nichts geaendert.
const workerFirst=JSON.parse(await readFile('wrangler.jsonc','utf8')).assets?.run_worker_first??[];
assert.ok(workerFirst.length,'die Asset-Konfiguration muss run_worker_first fuehren');
const coveredByWorker=path=>workerFirst.some(pattern=>
  new RegExp('^'+pattern.replace(/[.+^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*')+'$').test(path));
// Der Wurzelpfad ist die Anmeldeseite und stand ueberhaupt nicht in run_worker_first - gemessen
// 0/6 Headern, also ohne Klickjacking-Schutz auf dem Anmeldeformular. Er muss durch den Worker
// laufen wie jede andere Seite.
assert.ok(coveredByWorker('/'),'die Anmeldeseite unter / muss durch den Worker laufen');

// Ohne Ausnahme: auch die VFA13-Zweitadressen (/vfa-study-entry, -presenter, -quiz) laufen jetzt
// durch den Worker. Erreichbar bleiben sie dabei genau wie zuvor, weil sie neben ihren kanonischen
// Routen /lernabend-vfa13 und /quiz/vfa13/* von der Release-Sperre ausgenommen sind.
const bypassSourceLine=index.split('\n').find(line=>line.includes('function releaseGateBypass'))||'';
assert.ok(bypassSourceLine,'die Umgehungsliste der Release-Sperre muss auffindbar bleiben');
const shippedPages=(await readdir('public')).filter(name=>name.endsWith('.html'));
// /testcenter.html und /testcenter sind dieselbe Seite - der Asset-Speicher leitet die eine auf die
// andere um. Solange die Release-Sperre nur die endungslose Schreibweise als ausgenommen kannte,
// sperrte sie die .html-Form: /testcenter.html antwortete in Produktion mit 503, obwohl
// /testcenter erreichbar blieb. Dasselbe gilt fuer /index gegenueber /.
assert.match(bypassSourceLine,/replace\(\/\\\.html\$\/,''\)/,
  'die Release-Sperre muss die .html-Schreibweise auf dieselbe Seite zurueckfuehren');
assert.match(bypassSourceLine,/trimmed==='\/index'\?'\/':/,
  '/index ist nur eine zweite Schreibweise fuer die Anmeldeseite und muss ebenso behandelt werden');

// Gelesen ist nicht geprueft: die Regel wird ausgefuehrt. Eine oeffentliche Seite muss in beiden
// Schreibweisen erreichbar bleiben, eine geschuetzte in beiden gesperrt.
const bypass=new Function('LEGAL_PATHS',
  `${bypassSourceLine.replace(/:string/g,'').replace(/:boolean/g,'').replace(/ as any/g,'')}; return releaseGateBypass;`)(
  ['/impressum','/datenschutz','/agb','/avv']);
for(const path of ['/testcenter','/testcenter.html','/certificate-verify','/certificate-verify.html','/','/index','/index.html'])
  assert.equal(bypass(path),true,`${path} muss von der Release-Sperre ausgenommen bleiben`);
for(const path of ['/customer-admin','/customer-admin.html','/kunden-admin','/department-lead','/partner'])
  assert.equal(bypass(path),false,`${path} darf die Release-Sperre nicht umgehen`);

assert.ok(shippedPages.length>=10,`zu wenige ausgelieferte Seiten gefunden: ${shippedPages.length}`);
const unhardened=shippedPages
  .map(name=>'/'+name.replace(/\.html$/,''))
  .filter(route=>!coveredByWorker(route));
assert.deepEqual(unhardened,[],
  `diese Seiten werden ohne die Sicherheitsheader des Workers ausgeliefert: ${unhardened.join(', ')}`);

// Eine Seite, die run_worker_first nicht auffuehrt, wird direkt aus dem Asset-Speicher
// ausgeliefert - der Worker sieht die Anfrage nie, und die Release-Sperre greift dort nicht.
// Genau so war /department-lead in Produktion mit 200 erreichbar, waehrend /produkt,
// /kunden-admin und /dozentenportal gesperrt waren. Jede Route, deren Sperrung die Abnahme
// verlangt, muss deshalb durch den Worker laufen und darf die Sperre nicht umgehen.
const lockedBlock=(browser.match(/const MOBILE_RELEASE_LOCKED=\[([^\]]*)\]/)||[])[1];
assert.ok(lockedBlock,'die Abnahme muss die zu sperrenden Seiten benennen');
const lockedPaths=[...lockedBlock.matchAll(/'([^']+)'/g)].map(m=>m[1]);
assert.ok(lockedPaths.length>=4,`zu wenige gesperrte Seiten gefunden: ${lockedPaths.length}`);
const bypassing=lockedPaths.filter(path=>!coveredByWorker(path));
assert.deepEqual(bypassing,[],
  `diese Seiten laufen am Worker vorbei und koennen deshalb nicht gesperrt werden: ${bypassing.join(', ')}`);
// Und sie duerfen die Sperre auch nicht ausdruecklich umgehen.
// releaseGateBypass steht auf einer einzigen Zeile; ein mehrzeiliges Muster liest sonst die
// folgenden Routen-Handler mit und meldet Umgehungen, die es nicht gibt.
const bypassSource=index.split('\n').find(line=>line.includes('function releaseGateBypass'))||'';
assert.ok(bypassSource,'die Umgehungsliste der Release-Sperre muss auffindbar bleiben');
const exempt=lockedPaths.filter(path=>bypassSource.includes(`'${path}'`));
assert.deepEqual(exempt,[],`diese Seiten umgehen die Release-Sperre ausdruecklich: ${exempt.join(', ')}`);

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

// Jede Seite, die eine gesperrte Produktion sperrt, darf dort nicht mit dem Verhalten der
// entsperrten geprueft werden. Die Seitenschleife des Dokumentenvertrags ueberspringt solche
// Seiten bereits; der Block zu /angebot tat es nicht und verlangte auch in Produktion die Meldung
// der Angebotsseite, obwohl dort die Sperrseite steht. Beide Modi muessen unterschieden werden.
const documentContract=(browser.match(/async function publicDocumentContract\(\)\{[\s\S]*?\n\}/)||[''])[0];
assert.ok(documentContract,'der Dokumentenvertrag muss auffindbar bleiben');
assert.match(documentContract,/mode==='locked-production'&&MOBILE_RELEASE_LOCKED\.includes\(path\)/,
  'die Seitenschleife muss gesperrte Seiten in Produktion ueberspringen');
assert.match(documentContract,/if\(mode==='locked-production'\)\{[\s\S]*?nicht für den Produktivbetrieb freigegeben/,
  '/angebot muss in der gesperrten Produktion gegen die Sperrseite geprueft werden');
assert.match(documentContract,/\}else if\(!\/unvollständig\/i\.test\(offerText\)\)/,
  'im Kandidatenmodus muss die Meldung der Angebotsseite weiterhin verlangt werden');
assert.match(documentContract,/offerCalls\.length\)problems\.push/,
  'ohne Token darf in keinem Modus ein Angebot abgefragt werden');

// Die Release-Sperre antwortet auf den gesperrten Seiten mit 503 - genau das verlangt
// lockedProductionSurface dort mit allowStatuses:[503] und prueft zusaetzlich den Text der
// Sperrseite. Die Sammelpruefung am Ende meldete dieselben Antworten trotzdem als unerwartet.
// Die Erwartung gehoert an die Navigation, die sie deklariert, nicht in eine zweite Liste.
assert.match(browser,/allowStatuses\.includes\(response\.status\(\)\)\)routeAllowedErrors\.add\(/,
  'eine ausdruecklich zugelassene Fehlerantwort muss an der Navigation vermerkt werden');
assert.match(browser,/function expectedBrowserHttpError\(entry\)\{if\(routeAllowedErrors\.has\(/,
  'die Sammelpruefung muss diese Antworten als erwartet erkennen');
assert.match(browser,/allowStatuses:\[503\]\}\);if\(!\/noch nicht für den Produktivbetrieb freigegeben/,
  'die gesperrten Seiten muessen weiterhin einzeln auf die Sperrseite geprueft werden');
// Und nichts darf pauschal durchgehen: die Erwartung gilt nur fuer den genauen Status derselben
// Antwort, nicht fuer die Adresse allein.
assert.match(browser,/routeAllowedErrors\.add\(`\$\{response\.status\(\)\} \$\{response\.url\(\)\}`\)/,
  'die Erwartung muss Status und Adresse zusammen festhalten');

console.log('Commercial production acceptance contract: OK');
