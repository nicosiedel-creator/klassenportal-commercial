import { strict as assert } from 'node:assert';

// Gemeldet mit Bildschirmfoto: klassenportal.app/portal-admin zeigte die Kundenverwaltung -
// Mandanten, Klassen/Kurse, Benutzer & Rollen, Inhalte, Prüfungen, Branding, Module,
// Import/Export - mitsamt Kundenauswahl.
//
// /portal-admin ist keine Route dieses Portals und war es nie. Unbekannte Adressen werden als
// Einzelseiten-Anwendung behandelt (not_found_handling: single-page-application) und liefern
// still index.html aus. Dort laeuft die gewoehnliche Oberflaeche; frueher hat
// platform-admin-ui.js die fremden Eintraege nachtraeglich per style.display ueberklebt, seit
// dem Umbau tut es das zu Recht nicht mehr - und der Vertipper wurde sichtbar.
//
// Eine Adresse, die es nicht gibt, darf keine halbe Verwaltung zeigen. Sie fuehrt dorthin, wo
// sie hin soll.
//
// Dieser Test liest nicht, er fuehrt den ausgelieferten Worker aus.
const { default: worker } = await import('../dist/index.js');
// Die Weiterleitung braucht keine Umgebung. Fuer die Gegenprobe - dass die echte Adresse
// ausliefert statt weiterzuleiten - wird die Auslieferung der Seite gestellt.
const SEITE = { ASSETS: { fetch: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }) } };
const antwort = async (url, method = 'GET', env = {}) => worker.fetch(new Request(url, { method }), env);

for (const pfad of ['/portal-admin', '/portal-admin/', '/portaladmin']) {
  const r = await antwort(`https://klassenportal.app${pfad}`);
  assert.equal(r.status, 308, `${pfad} muss dauerhaft weiterleiten, geantwortet wurde ${r.status}`);
  assert.equal(r.headers.get('location'), '/plattform-admin',
    `${pfad} muss auf die Plattformverwaltung zeigen, gezeigt wurde: ${r.headers.get('location')}`);
}

// Eine mitgegebene Fortsetzung darf dabei nicht verloren gehen - sonst landet man zwar richtig,
// aber ohne das, weswegen man kam.
const mitFrage = await antwort('https://klassenportal.app/portal-admin?continue=%2Fkunden-admin');
assert.equal(mitFrage.headers.get('location'), '/plattform-admin?continue=%2Fkunden-admin',
  'die Adresszusätze müssen mitgehen');

// Die Weiterleitung darf nicht zwischengespeichert werden und nichts ausliefern.
const einfach = await antwort('https://klassenportal.app/portal-admin');
assert.equal(einfach.headers.get('cache-control'), 'no-store');
assert.equal(await einfach.text(), '', 'eine Weiterleitung hat keinen Inhalt');

// Schreibende Zugriffe auf eine Seite gibt es nicht.
assert.equal((await antwort('https://klassenportal.app/portal-admin', 'POST')).status, 405,
  'auf eine Seite wird nicht geschrieben');

// Und die eigentliche Adresse bleibt, was sie ist: sie leitet nicht weiter, sondern liefert.
const echt = await antwort('https://klassenportal.app/plattform-admin', 'GET', SEITE);
assert.notEqual(echt.status, 308, 'die Plattformverwaltung darf nicht auf sich selbst weiterleiten');
assert.equal(echt.status, 200, 'sie liefert ihre Seite aus');

// Die Weiterleitung muss auch vor der Live-Freigabe funktionieren - sonst laeuft ein Lesezeichen
// im gesperrten Zustand in eine 503 statt an sein Ziel. /plattform-admin ist dort ausgenommen,
// der Weg dorthin muss es auch sein.
const { readFile } = await import('node:fs/promises');
const source = await readFile('src/index.ts', 'utf8');
const bypass = source.slice(source.indexOf('function releaseGateBypass('), source.indexOf('\nasync function releaseGateAllowsLockedRequest('));
for (const pfad of ['/plattform-admin', '/portal-admin', '/portaladmin'])
  assert.ok(bypass.includes(`normalized==='${pfad}'`),
    `${pfad} muss von der Release-Sperre ausgenommen sein wie sein Ziel`);

console.log('Adressen der Plattformverwaltung: /portal-admin und /portaladmin führen dauerhaft nach /plattform-admin statt still die Kundenoberfläche zu zeigen: OK');
