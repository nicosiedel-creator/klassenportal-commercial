import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';
import { PAGE_ADDRESSES, canonicalPagePath, matchPageAddress, pageSurface, refererSurface } from '../dist/core/page-routes.js';

// Gemeldet mit Bildschirmfoto: klassenportal.app/KUNDEN-admin zeigte nicht die Kundenverwaltung,
// sondern die Startseite - mit Status 200, also ohne jeden Hinweis darauf, dass etwas nicht
// stimmt. Dieselbe Messung am laufenden Worker (wrangler dev, ohne Release-Sperre) vor dieser
// Aenderung:
//
//   /kunden-admin       200 Kundenverwaltung      /KUNDEN-admin      200 Startseite
//   /plattform-admin    200 Plattformverwaltung   /PLATTFORM-ADMIN   200 Startseite
//   /klassen-admin      200 Klassenverwaltung     /KLASSEN-ADMIN     200 Startseite
//   /portal-admin       200 Startseite            /gibtsnicht        200 Startseite
//
// /portal-admin ist der Fall, der zeigt, wo der Fehler wirklich sass: die Weiterleitung dafuer
// stand seit der letzten Freigabe im Worker und war im Test gruen - in Produktion lief sie nie.
// not_found_handling stand auf "single-page-application", also beantwortete der Asset-Dienst
// jede unbekannte Adresse selbst mit index.html, und der Worker sah die Anfrage nicht.
//
// Dieser Test prueft die Trennung an allen drei Stellen, an denen sie brechen kann: an der
// Adresstabelle, am ausgefuehrten Worker und an der Asset-Konfiguration, die entscheidet, ob der
// Worker ueberhaupt gefragt wird.

const { default: worker } = await import('../dist/index.js');
const dateien = new Set((await readdir('public')).map(name => '/' + name));

// ---------------------------------------------------------------- 1. Die Tabelle selbst
for (const eintrag of PAGE_ADDRESSES) {
  assert.equal(canonicalPagePath(eintrag.path), eintrag.path,
    `${eintrag.path} ist selbst nicht kanonisch geschrieben und koennte deshalb nie ausgeliefert werden`);
  if (eintrag.asset) assert.ok(dateien.has(eintrag.asset),
    `${eintrag.path} verweist auf ${eintrag.asset} - diese Seite gibt es nicht`);
  for (const zweitname of eintrag.aliases ?? []) {
    assert.equal(canonicalPagePath(zweitname), zweitname,
      `die Zweitschreibweise ${zweitname} ist selbst nicht kanonisch und wuerde nie greifen`);
    assert.notEqual(zweitname, eintrag.path, `${zweitname} ist kein Zweitname, sondern die Adresse selbst`);
  }
}
const alleSchreibweisen = PAGE_ADDRESSES.flatMap(e => [e.path, ...(e.aliases ?? [])]);
assert.equal(new Set(alleSchreibweisen).size, alleSchreibweisen.length,
  'eine Schreibweise darf nicht auf zwei Adressen zeigen');

// Jede Verwaltungsoberflaeche hat genau eine Adresse - das ist der Kern der Trennung.
for (const oberflaeche of ['plattform', 'kunden']) {
  const treffer = PAGE_ADDRESSES.filter(e => e.surface === oberflaeche);
  assert.equal(treffer.length, 1,
    `es darf genau eine Adresse fuer die ${oberflaeche}-Oberflaeche geben, gefunden: ${treffer.map(e => e.path).join(', ')}`);
}

// ---------------------------------------------------------------- 2. Der ausgefuehrte Worker
let angefragt = null;
const SEITE = { ASSETS: { fetch: async request => { angefragt = new URL(request.url).pathname; return new Response('<!doctype html>seite', { headers: { 'content-type': 'text/html' } }); } } };
const LEER = { ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } };
// Gemessen wird hier die Adressfuehrung, nicht die Release-Sperre: gegen 127.0.0.1 und ohne
// gesetzten Produktionsursprung ist die Sperre offen. Dass die Weiterleitung auch vor einer
// geschlossenen Sperre greift, misst tests/platform-admin-address.mjs an einer gesperrten
// Umgebung.
const HOST = 'https://127.0.0.1';
const hole = (pfad, env = SEITE, method = 'GET', headers = { accept: 'text/html' }) =>
  worker.fetch(new Request(HOST + pfad, { method, headers }), env);

// Die kanonische Adresse liefert aus und leitet nicht weiter.
for (const eintrag of PAGE_ADDRESSES) {
  angefragt = null;
  const r = await hole(eintrag.path);
  assert.notEqual(r.status, 308, `${eintrag.path} ist die richtige Schreibweise und darf nicht weiterleiten`);
  assert.notEqual(r.status, 404, `${eintrag.path} steht in der Tabelle und muss erreichbar sein`);
  if (eintrag.asset) assert.equal(angefragt, eintrag.asset,
    `${eintrag.path} muss ${eintrag.asset} ausliefern, geholt wurde ${angefragt}`);
}

// Jede andere Schreibweise fuehrt dauerhaft auf die eine Adresse.
const varianten = pfad => [
  pfad.toUpperCase(),
  pfad.replace(/(^|\/)([a-z])/g, (_, s, c) => s + c.toUpperCase()),
  pfad === '/' ? null : pfad + '/',
  pfad === '/' ? null : pfad + '.html',
].filter(v => v && v !== pfad);
for (const eintrag of PAGE_ADDRESSES) {
  for (const schreibweise of [...varianten(eintrag.path), ...(eintrag.aliases ?? [])]) {
    const r = await hole(schreibweise);
    assert.equal(r.status, 308,
      `${schreibweise} muss dauerhaft auf ${eintrag.path} fuehren, geantwortet wurde ${r.status}`);
    assert.equal(r.headers.get('location'), eintrag.path,
      `${schreibweise} muss auf ${eintrag.path} zeigen, gezeigt wurde ${r.headers.get('location')}`);
    assert.equal(await r.text(), '', `${schreibweise}: eine Weiterleitung liefert keinen Inhalt`);
  }
}

// Die gemeldeten und die intern verwendeten Zweitnamen werden hier ausdruecklich genannt, nicht
// aus der Tabelle gelesen: sonst verschwaende mit dem Eintrag auch die Pruefung. /portal-admin
// steht in Lesezeichen, /customer-admin und /platform-admin waren die zweite oeffentliche
// Adresse derselben Seite.
const GEMELDET = [
  ['/portal-admin', '/plattform-admin'], ['/portaladmin', '/plattform-admin'],
  ['/platform-admin', '/plattform-admin'], ['/customer-admin', '/kunden-admin'],
  ['/class-admin', '/klassen-admin'], ['/index', '/'], ['/index.html', '/'],
  ['/KUNDEN-admin', '/kunden-admin'], ['/PLATTFORM-ADMIN', '/plattform-admin'],
  ['/KLASSEN-ADMIN', '/klassen-admin'], ['/Kunden-Admin/', '/kunden-admin'],
];
for (const [schreibweise, ziel] of GEMELDET) {
  const r = await hole(schreibweise);
  assert.equal(r.status, 308, `${schreibweise} muss dauerhaft auf ${ziel} fuehren, geantwortet wurde ${r.status}`);
  assert.equal(r.headers.get('location'), ziel,
    `${schreibweise} muss auf ${ziel} zeigen, gezeigt wurde ${r.headers.get('location')}`);
}

// Der Grund, weswegen jemand kam, geht dabei nicht verloren.
const mitFrage = await hole('/KUNDEN-admin?continue=%2Fklassen-admin&tab=kurse');
assert.equal(mitFrage.headers.get('location'), '/kunden-admin?continue=%2Fklassen-admin&tab=kurse');

// Auf eine Seite wird nicht geschrieben - auch nicht ueber eine Zweitschreibweise.
assert.equal((await hole('/KUNDEN-admin', SEITE, 'POST')).status, 405);

// Adressen mit beweglichen Teilen bleiben unberuehrt: dort ist Gross-/Kleinschreibung Inhalt.
// /portal/<Traeger>/<Kurs> darf nicht kleingeschrieben werden, sonst zeigt der Link ins Leere.
for (const pfad of ['/portal/Traeger-A/Kurs-B7', '/einrichtung/AbC123', '/angebot/XyZ789'])
  assert.notEqual((await hole(pfad)).status, 308, `${pfad} traegt Inhalt in der Schreibweise und darf nicht umgeschrieben werden`);

// Was es nicht gibt, sagt das - statt eine fremde Verwaltungsoberflaeche zu zeigen.
for (const pfad of ['/gibtsnicht', '/voellig/unbekannt', '/kunden-admin-alt', '/PORTAL-ADMIN-XYZ']) {
  const r = await hole(pfad, LEER);
  assert.equal(r.status, 404, `${pfad} gibt es nicht und muss 404 antworten, geantwortet wurde ${r.status}`);
  const inhalt = await r.text();
  assert.ok(inhalt.includes('Diese Seite gibt es nicht'), `${pfad} muss eine verstaendliche Seite zeigen`);
  assert.ok(!inhalt.includes(pfad), `${pfad}: die angefragte Adresse darf nicht zurueckgespiegelt werden`);
  assert.doesNotMatch(inhalt, /SELECT |stack|Error:|cloudflare|worker|token/i,
    `${pfad}: die Fehlerseite darf nichts ueber den inneren Aufbau verraten`);
}
// Und sie taeuscht keinen Erfolg vor, auch nicht fuer Maschinen.
const ohneBrowser = await hole('/gibtsnicht', LEER, 'GET', {});
assert.equal(ohneBrowser.status, 404);
assert.equal((await hole('/gibtsnicht', LEER, 'HEAD')).status, 404);
assert.equal(await (await hole('/gibtsnicht', LEER, 'HEAD')).text(), '', 'eine HEAD-Antwort hat keinen Inhalt');

// Eine wirklich vorhandene Datei bleibt erreichbar - die 404-Seite darf sie nicht verdraengen.
angefragt = null;
const datei = await hole('/styles.css');
assert.equal(datei.status, 200, 'ausgelieferte Dateien muessen erreichbar bleiben');
assert.equal(angefragt, '/styles.css');

// ---------------------------------------------------------------- 3. Die Nur-Lesen-Sperre
// Sie hing an der genauen Schreibweise: auf /kunden-admin griff sie, auf /KUNDEN-admin nicht -
// dieselbe Seite, aber mit vollen Plattformrechten schreibend in Kundendaten.
for (const referer of ['https://klassenportal.app/kunden-admin', 'https://klassenportal.app/KUNDEN-admin',
  'https://klassenportal.app/Kunden-Admin/', 'https://klassenportal.app/kunden-admin.html',
  'https://klassenportal.app/customer-admin', 'https://klassenportal.app/customer-admin.html?tab=kurse'])
  assert.equal(refererSurface(referer), 'kunden',
    `${referer} ist die Kundenoberflaeche und muss die Supportansicht nur lesend halten`);
// Die eigene Oberflaeche bleibt schreibend, sonst waere die Plattformverwaltung unbenutzbar.
assert.equal(refererSurface('https://klassenportal.app/plattform-admin'), 'plattform');
assert.equal(refererSurface('https://klassenportal.app/PLATTFORM-ADMIN'), 'plattform');
assert.equal(refererSurface(null), null);
assert.equal(refererSurface('keine-gueltige-adresse'), null);
// Eine fremde Herkunft mit demselben Pfad fuehrt in die vorsichtigere Richtung: nur lesend.
assert.equal(refererSurface('https://fremde.example/kunden-admin'), 'kunden');
// Und beide Stellen im Worker fragen dieselbe Quelle, statt die Schreibweise noch einmal selbst
// zu vergleichen.
for (const datei of ['src/index.ts', 'src/core/router.ts']) {
  const quelle = await readFile(datei, 'utf8');
  assert.ok(quelle.includes('refererSurface(request.headers.get(\'referer\'))'),
    `${datei} muss die Herkunft ueber die gemeinsame Adresstabelle bestimmen`);
  assert.ok(!/referer[\s\S]{0,200}?===\s*'\/kunden-admin'/.test(quelle),
    `${datei} darf die Schreibweise der Adresse nicht selbst vergleichen`);
}

// ---------------------------------------------------------------- 4. Wird der Worker gefragt?
const wrangler = JSON.parse(await readFile('wrangler.jsonc', 'utf8'));
assert.notEqual(wrangler.assets?.not_found_handling, 'single-page-application',
  'mit der Einzelseiten-Rueckfallebene beantwortet der Asset-Dienst jede unbekannte Adresse selbst mit index.html und Status 200 - der Worker sieht sie nie, und keine Weiterleitung dieser Datei wird jemals ausgefuehrt');
const workerFirst = wrangler.assets?.run_worker_first ?? [];
const laeuftDurchDenWorker = pfad => workerFirst.some(muster =>
  new RegExp('^' + muster.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$').test(pfad));
for (const eintrag of PAGE_ADDRESSES)
  assert.ok(laeuftDurchDenWorker(eintrag.path),
    `${eintrag.path} laeuft am Worker vorbei und traegt deshalb weder Sicherheitsheader noch die Release-Sperre`);

// ---------------------------------------------------------------- 5. Die Seite sagt, was sie ist
// Die Oberflaeche darf ihre Rolle nicht aus der Adresse raten. Genau dieser Vergleich hat unter
// /KUNDEN-admin die Startseite fuer die Kundenverwaltung gehalten.
const huellen = { '/platform-admin.html': 'plattform', '/customer-admin.html': 'kunden', '/class-admin.html': 'klassen', '/index.html': 'start' };
for (const [seite, oberflaeche] of Object.entries(huellen)) {
  const html = await readFile('public' + seite, 'utf8');
  const body = (html.match(/<body[^>]*>/) || [''])[0];
  assert.ok(body.includes(`data-surface="${oberflaeche}"`),
    `${seite} muss sich als ${oberflaeche}-Oberflaeche zu erkennen geben, gefunden: ${body}`);
}
for (const [seite, oberflaeche] of Object.entries(huellen)) {
  const eintrag = PAGE_ADDRESSES.find(e => e.asset === seite);
  if (eintrag) assert.equal(eintrag.surface, oberflaeche,
    `${seite} gibt sich als ${oberflaeche} aus, die Adresstabelle fuehrt sie als ${eintrag.surface}`);
}
assert.equal(pageSurface('/index.html'), 'start', '/index.html ist eine zweite Schreibweise der Startseite');
for (const [datei, konstante] of [['public/app.js', 'CUSTOMER_PATH'], ['public/app.js', 'PLATFORM_SURFACE'], ['public/boot.js', 'CUSTOMER_PATH']]) {
  const zeile = (await readFile(datei, 'utf8')).split('\n').find(z => z.startsWith(`const ${konstante}=`)) || '';
  assert.ok(zeile, `${datei}: ${konstante} muss auffindbar bleiben`);
  assert.ok(zeile.includes('dataset') || zeile.includes('SURFACE==='),
    `${datei}: ${konstante} muss die ausgelieferte Seite fragen, nicht die Adresse - gefunden: ${zeile}`);
  assert.ok(!zeile.includes('location.pathname'),
    `${datei}: ${konstante} darf die Oberflaeche nicht aus der Adresse raten - gefunden: ${zeile}`);
}
// Gegenprobe auf die Verdrahtung: app.js liest genau das Merkmal, das die Huellen tragen.
const app = await readFile('public/app.js', 'utf8');
assert.ok(/const SURFACE=document\.body\?\.dataset\?\.surface/.test(app),
  'app.js muss die Oberflaeche aus data-surface der ausgelieferten Seite lesen');

// ---------------------------------------------------------------- 6. Die Tabelle in einer Hand
// Rechtstexte werden nicht aus einer Datei ausgeliefert, sondern erzeugt. Sie muessen trotzdem in
// der Adresstabelle stehen, sonst haette /IMPRESSUM wieder keine Adresse.
const index = await readFile('src/index.ts', 'utf8');
const rechtstexte = [...((index.match(/const LEGAL_PATHS=\[([^\]]*)\]/) || [])[1] || '').matchAll(/'([^']+)'/g)].map(m => m[1]);
assert.ok(rechtstexte.length >= 7, `zu wenige Rechtstexte gefunden: ${rechtstexte.length}`);
for (const pfad of rechtstexte)
  assert.ok(matchPageAddress(pfad)?.kind === 'serve', `${pfad} fehlt in der Adresstabelle`);

console.log(`Adressraum des Portals: ${PAGE_ADDRESSES.length} Adressen, jede in genau einer Schreibweise; Zweitschreibweisen leiten weiter, Unbekanntes antwortet 404, die Oberflaeche kommt von der Seite: OK`);
