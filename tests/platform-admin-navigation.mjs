import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Gemeldet: "Mein Portaladmin ist mittlerweile auch komisch. Ich brauche keine
// Teilnehmerverwaltung und sowas. Sowas brauche ich nur wenn ich für den Kunden alles einrichten
// soll."
//
// Berechtigt. app.js rendete fuer beide Oberflaechen dieselben neun Kundeneintraege - Klassen,
// Benutzer & Rollen, Inhalte, Pruefungen, Branding, Module, Import/Export -, und
// platform-admin-ui.js versteckte davon nachtraeglich sieben per style.display. Das ging bei
// jedem Neuaufbau der Leiste kurz auf, die Bereiche blieben ueber S.view erreichbar, und ohne
// dieses Modul stand der Plattform-Admin in der vollen Kundenverwaltung.
//
// Weggenommen werden durfte dabei nichts: der Plattform-Admin ist die einzige Stelle, an der
// ueberhaupt schreibend in einen Kundenbereich eingerichtet werden kann - auf /kunden-admin ist
// er ausdruecklich nur lesend (supportPlatformAdmin). Deshalb: die Leiste entsteht gleich
// richtig, und die Kundenbereiche erscheinen erst, wenn ein Kunde ausdruecklich zur Einrichtung
// gewaehlt wurde.
//
// Dieser Test liest nicht, er fuehrt aus: die echten Funktionen aus der ausgelieferten app.js,
// je einmal fuer jede Oberflaeche.

const app = await readFile('public/app.js', 'utf8');
const lines = app.split('\n');
const grab = head => {
  const line = lines.find(l => l.startsWith(head));
  assert.ok(line, `"${head}" muss in public/app.js auffindbar bleiben`);
  return line;
};
const SOURCE = [
  grab('const SURFACE='),
  grab('const CUSTOMER_PATH='),
  grab('const PLATFORM_SURFACE='),
  grab('const S={me:window.__KP_BOOT_USER'),
  grab('try{if(PLATFORM_SURFACE)S.setupTenantId='),
  grab('const TENANT_NAVS='),
  grab('const CUSTOMER_NAVS='),
  grab('const PLATFORM_NAVS='),
  grab('function setupMode()'),
  grab('function navigation()'),
  grab('function setupTenantName()'),
  grab('function startSetup('),
  grab('function endSetup()'),
  grab('function selectTenant('),
].join('\n');

const KUNDEN = [{ id: 'ten_a', name: 'Märkische Bildungsakademie' }, { id: 'ten_b', name: 'Zweiter Träger' }];
const neuerSpeicher = (gespeichert = null) => {
  const speicher = new Map(gespeichert ? [['kp_setup_tenant', gespeichert]] : []);
  return { getItem: k => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, String(v)), removeItem: k => speicher.delete(k) };
};
// Welche Oberflaeche laeuft, sagt die ausgelieferte Seite ueber data-surface - nicht die Adresse.
// Der Prueftisch stellt deshalb genau das, was der Browser dort vorfindet, und gar keine Adresse:
// wuerde app.js sie doch lesen, faellt das hier sofort auf.
function oberflaeche(seite, { gespeichert = null, store = neuerSpeicher(gespeichert) } = {}) {
  const env = new Function('window', 'document', 'sessionStorage', 'localStorage',
    `${SOURCE}\nreturn {S,navigation,setupMode,setupTenantName,startSetup,endSetup,selectTenant};`)(
    {}, { body: { dataset: { surface: seite } } }, store, { getItem: () => null, setItem() {}, removeItem() {} });
  env.S.tenants = KUNDEN;
  return env;
}
const eintraege = env => env.navigation().map(([k]) => k);
const TENANT_BEREICHE = ['courses', 'users', 'content', 'exams', 'branding', 'modules', 'data'];

// 1. Der Befund: auf der Plattformseite gehört kein Kundenbereich in die Leiste.
{
  const p = oberflaeche('plattform');
  assert.deepEqual(eintraege(p), ['overview', 'tenants'],
    `die Plattformleiste führt nur Plattformbereiche, gefunden: ${eintraege(p).join(', ')}`);
  for (const bereich of TENANT_BEREICHE)
    assert.ok(!eintraege(p).includes(bereich), `"${bereich}" gehört nicht in die Plattformleiste`);
  assert.equal(p.setupMode(), false, 'ohne ausdrückliche Auswahl wird für niemanden eingerichtet');
}

// 2. Der Kundenbereich bleibt unverändert - dort ist genau das die Arbeit.
for (const seite of ['kunden', 'start']) {
  const k = oberflaeche(seite);
  assert.deepEqual(eintraege(k), ['overview', 'tenants', ...TENANT_BEREICHE],
    `die Seite "${seite}" muss die vollständige Kundenleiste behalten`);
}

// 3. Wer für einen Kunden einrichtet, wählt ihn aus - und bekommt dann dessen Bereiche.
{
  const p = oberflaeche('plattform');
  p.startSetup('ten_a');
  assert.equal(p.setupMode(), true, 'nach der Auswahl wird eingerichtet');
  assert.equal(p.S.tenantId, 'ten_a', 'und zwar in diesem Kundenbereich');
  assert.equal(p.S.view, 'courses', 'die Einrichtung beginnt bei den Klassen');
  assert.equal(p.setupTenantName(), 'Märkische Bildungsakademie', 'der Kunde muss benennbar sein');
  assert.deepEqual(eintraege(p), ['overview', 'tenants', ...TENANT_BEREICHE],
    'erst jetzt erscheinen die Bereiche des Kunden');

  p.endSetup();
  assert.equal(p.setupMode(), false, 'und sie verschwinden wieder, wenn die Einrichtung endet');
  assert.deepEqual(eintraege(p), ['overview', 'tenants']);
  assert.equal(p.S.view, 'overview', 'zurück auf die Plattformübersicht');
}

// 3a. Der Wechsel des Kunden während einer Einrichtung: Hinweis und Bereiche müssen denselben
//     Kunden meinen - sonst nennt der Hinweis den einen, während die Bereiche schon die Daten
//     des anderen zeigen. Der gerade offene Bereich bleibt dabei stehen.
{
  const p = oberflaeche('plattform');
  p.startSetup('ten_a');
  p.S.view = 'users';
  p.selectTenant('ten_b');
  assert.equal(p.S.setupTenantId, 'ten_b', 'die Einrichtung wechselt mit');
  assert.equal(p.S.tenantId, 'ten_b', 'und die Bereiche arbeiten im selben Kundenbereich');
  assert.equal(p.setupTenantName(), 'Zweiter Träger', 'der Hinweis nennt denselben Kunden');
  assert.equal(p.S.view, 'users', 'der gerade offene Bereich bleibt stehen');
}

// Und im Kundenbereich bleibt ein Kundenwechsel ein Kundenwechsel, keine Einrichtung.
{
  const k = oberflaeche('kunden');
  k.selectTenant('ten_b');
  assert.equal(k.S.tenantId, 'ten_b', 'der Kundenbereich wechselt den Mandanten');
  assert.equal(k.S.setupTenantId, null, 'ohne daraus eine Einrichtung zu machen');
}

// 3b. Beendet heißt beendet: nach dem Neuladen darf die Einrichtung nicht wieder offen sein.
{
  const store = neuerSpeicher();
  const erste = oberflaeche('plattform', { store });
  erste.startSetup('ten_a');
  assert.equal(store.getItem('kp_setup_tenant'), 'ten_a', 'die begonnene Einrichtung wird gemerkt');
  erste.endSetup();
  const nachNeuladen = oberflaeche('plattform', { store });
  assert.equal(nachNeuladen.setupMode(), false,
    'eine beendete Einrichtung darf nach dem Neuladen nicht zurückkehren');
  assert.deepEqual(eintraege(nachNeuladen), ['overview', 'tenants']);
}

// 4. Eine gespeicherte Einrichtung überlebt das Neuladen - aber nur auf der Plattformseite.
{
  const p = oberflaeche('plattform', { gespeichert: 'ten_b' });
  assert.equal(p.setupMode(), true, 'die begonnene Einrichtung ist nach dem Neuladen noch offen');
  assert.equal(p.setupTenantName(), 'Zweiter Träger');
  const k = oberflaeche('kunden', { gespeichert: 'ten_b' });
  assert.equal(k.S.setupTenantId, null, 'im Kundenbereich gibt es keinen Einrichtungsmodus');
}

// 5. Fail closed: eine Auswahl, die es nicht mehr gibt, öffnet keine Bereiche.
{
  const p = oberflaeche('plattform', { gespeichert: 'ten_geloescht' });
  assert.equal(p.setupMode(), false, 'ein unbekannter Kunde ist kein Einrichtungsmodus');
  assert.deepEqual(eintraege(p), ['overview', 'tenants'], 'und öffnet keine Kundenbereiche');
  assert.equal(p.setupTenantName(), '', 'und hat keinen Namen, den man anzeigen könnte');
}

// 5b. Erkannt wird die Oberfläche an der Seite, die ausgeliefert wurde - nicht an der Adresse.
//     Gemeldet wurde genau der umgekehrte Fall: unter /KUNDEN-admin und /portal-admin lieferte
//     der Server still die Startseite aus, und die zeigte die Kundenverwaltung. Ein Vergleich auf
//     die Adresse hätte dort die falsche Leiste gebaut.
{
  const plattform = oberflaeche('plattform');
  assert.deepEqual(eintraege(plattform), ['overview', 'tenants'],
    'wird die Plattformseite ausgeliefert, gilt ihre Navigation');
  for (const seite of ['start', 'kunden', 'klassen', '', undefined])
    assert.deepEqual(eintraege(oberflaeche(seite)), ['overview', 'tenants', ...TENANT_BEREICHE],
      `eine Seite, die sich nicht als Plattformseite ausgibt (${String(seite)}), bleibt die gewöhnliche Oberfläche`);
}

// ---------------------------------------------------------------------------------------------
// 6. Die Leiste ist die Wahrheit: was dort nicht steht, wird auch nicht gebaut. Sonst bliebe ein
//    Kundenbereich über S.view erreichbar, obwohl niemand ihn geöffnet hat.
// ---------------------------------------------------------------------------------------------
const renderLine = grab('async function render()');
function renderIn(seite) {
  const gebaut = [];
  const views = Object.fromEntries(['overview', 'tenants', 'courses', 'users', 'content', 'exams', 'branding', 'modules', 'data'].map(n => [n, () => gebaut.push(n)]));
  const env = new Function('window', 'document', 'sessionStorage', 'localStorage', 'views', 'frame', 'q', 'h',
    `${SOURCE}
     const {overview,tenants,courses,users,content,exams,branding,modules,data}=views;
     ${renderLine}
     return {S,render,navigation};`)(
    {}, { body: { dataset: { surface: seite } } }, { getItem: () => null, setItem() {}, removeItem() {} }, { getItem: () => null, setItem() {}, removeItem() {} },
    views, () => {}, () => ({ onclick: null }), v => String(v));
  env.S.tenants = KUNDEN;
  return { env, gebaut };
}
for (const bereich of TENANT_BEREICHE) {
  const { env, gebaut } = renderIn('plattform');
  env.S.view = bereich;
  await env.render();
  assert.deepEqual(gebaut, ['overview'],
    `"${bereich}" darf auf der Plattformseite nicht gebaut werden, gebaut wurde: ${gebaut.join(', ')}`);
  assert.equal(env.S.view, 'overview', 'und der Bereich darf nicht als gewählt stehen bleiben');
}
{
  const { env, gebaut } = renderIn('kunden');
  env.S.view = 'users';
  await env.render();
  assert.deepEqual(gebaut, ['users'], 'im Kundenbereich wird derselbe Bereich sehr wohl gebaut');
}

// ---------------------------------------------------------------------------------------------
// 7. Die nachträgliche Korrektur darf nicht zurückkommen: sie würde beim Einrichten für einen
//    Kunden genau die Bereiche wieder verstecken, die app.js dafür bewusst einblendet.
// ---------------------------------------------------------------------------------------------
// Die Verdrahtung selbst: die Kundenauswahl liegt in frame() und laesst sich ohne Dokument nicht
// ausfuehren. Geprueft wird deshalb, dass sie ueber die Entscheidung oben laeuft und nicht wieder
// direkt an S.tenantId schreibt - genau daran liefen Hinweis und Bereiche vorher auseinander.
const frameLine = grab('function frame(');
assert.match(frameLine, /#tenantPick'\)\?\.addEventListener\('change',async e=>\{selectTenant\(e\.target\.value\);/,
  'die Kundenauswahl muss über selectTenant gehen, nicht direkt an S.tenantId schreiben');
assert.match(frameLine, /setupBanner\(\)/, 'während einer Einrichtung muss der Hinweis im Rahmen stehen');
assert.match(frameLine, /PLATFORM_SURFACE&&!setupMode\(\)\?'':picker\(\)/,
  'die Kundenauswahl gehört auf der Plattformseite nur in die Einrichtung');

const platformUi = await readFile('public/platform-admin-ui.js', 'utf8');
assert.doesNotMatch(platformUi, /querySelectorAll\('\[data-v\]'\)/,
  'die Plattformoberfläche darf die Leiste nicht mehr nachträglich umbauen - sie entsteht in app.js richtig');
assert.doesNotMatch(platformUi, /#tenantPick'\)\?\.remove\(\)/,
  'die Kundenauswahl wird beim Einrichten gebraucht und darf nicht mehr entfernt werden');
assert.match(platformUi, /pa-onboarding-nav/, 'die plattformeigenen Einträge bleiben hier zu Hause');

console.log(`Plattformadmin: eigene Leiste statt versteckter Kundenverwaltung; ${TENANT_BEREICHE.length} Kundenbereiche erst nach ausdrücklicher Auswahl eines Kunden, und ohne sie auch nicht baubar: OK`);
