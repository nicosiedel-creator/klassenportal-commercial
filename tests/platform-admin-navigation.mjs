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
  grab('const CUSTOMER_PATH='),
  grab('const PLATFORM_PATH='),
  grab('const S={me:window.__KP_BOOT_USER'),
  grab('try{if(PLATFORM_PATH)S.setupTenantId='),
  grab('const TENANT_NAVS='),
  grab('const CUSTOMER_NAVS='),
  grab('const PLATFORM_NAVS='),
  grab('function setupMode()'),
  grab('function navigation()'),
  grab('function setupTenantName()'),
  grab('function startSetup('),
  grab('function endSetup()'),
].join('\n');

const KUNDEN = [{ id: 'ten_a', name: 'Märkische Bildungsakademie' }, { id: 'ten_b', name: 'Zweiter Träger' }];
const neuerSpeicher = (gespeichert = null) => {
  const speicher = new Map(gespeichert ? [['kp_setup_tenant', gespeichert]] : []);
  return { getItem: k => speicher.get(k) ?? null, setItem: (k, v) => speicher.set(k, String(v)), removeItem: k => speicher.delete(k) };
};
function oberflaeche(pfad, { gespeichert = null, store = neuerSpeicher(gespeichert) } = {}) {
  const env = new Function('window', 'location', 'sessionStorage', 'localStorage',
    `${SOURCE}\nreturn {S,navigation,setupMode,setupTenantName,startSetup,endSetup};`)(
    {}, { pathname: pfad }, store, { getItem: () => null, setItem() {}, removeItem() {} });
  env.S.tenants = KUNDEN;
  return env;
}
const eintraege = env => env.navigation().map(([k]) => k);
const TENANT_BEREICHE = ['courses', 'users', 'content', 'exams', 'branding', 'modules', 'data'];

// 1. Der Befund: auf der Plattformseite gehört kein Kundenbereich in die Leiste.
{
  const p = oberflaeche('/plattform-admin');
  assert.deepEqual(eintraege(p), ['overview', 'tenants'],
    `die Plattformleiste führt nur Plattformbereiche, gefunden: ${eintraege(p).join(', ')}`);
  for (const bereich of TENANT_BEREICHE)
    assert.ok(!eintraege(p).includes(bereich), `"${bereich}" gehört nicht in die Plattformleiste`);
  assert.equal(p.setupMode(), false, 'ohne ausdrückliche Auswahl wird für niemanden eingerichtet');
}

// 2. Der Kundenbereich bleibt unverändert - dort ist genau das die Arbeit.
for (const pfad of ['/kunden-admin', '/']) {
  const k = oberflaeche(pfad);
  assert.deepEqual(eintraege(k), ['overview', 'tenants', ...TENANT_BEREICHE],
    `${pfad} muss die vollständige Kundenleiste behalten`);
}

// 3. Wer für einen Kunden einrichtet, wählt ihn aus - und bekommt dann dessen Bereiche.
{
  const p = oberflaeche('/plattform-admin');
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

// 3b. Beendet heißt beendet: nach dem Neuladen darf die Einrichtung nicht wieder offen sein.
{
  const store = neuerSpeicher();
  const erste = oberflaeche('/plattform-admin', { store });
  erste.startSetup('ten_a');
  assert.equal(store.getItem('kp_setup_tenant'), 'ten_a', 'die begonnene Einrichtung wird gemerkt');
  erste.endSetup();
  const nachNeuladen = oberflaeche('/plattform-admin', { store });
  assert.equal(nachNeuladen.setupMode(), false,
    'eine beendete Einrichtung darf nach dem Neuladen nicht zurückkehren');
  assert.deepEqual(eintraege(nachNeuladen), ['overview', 'tenants']);
}

// 4. Eine gespeicherte Einrichtung überlebt das Neuladen - aber nur auf der Plattformseite.
{
  const p = oberflaeche('/plattform-admin', { gespeichert: 'ten_b' });
  assert.equal(p.setupMode(), true, 'die begonnene Einrichtung ist nach dem Neuladen noch offen');
  assert.equal(p.setupTenantName(), 'Zweiter Träger');
  const k = oberflaeche('/kunden-admin', { gespeichert: 'ten_b' });
  assert.equal(k.S.setupTenantId, null, 'im Kundenbereich gibt es keinen Einrichtungsmodus');
}

// 5. Fail closed: eine Auswahl, die es nicht mehr gibt, öffnet keine Bereiche.
{
  const p = oberflaeche('/plattform-admin', { gespeichert: 'ten_geloescht' });
  assert.equal(p.setupMode(), false, 'ein unbekannter Kunde ist kein Einrichtungsmodus');
  assert.deepEqual(eintraege(p), ['overview', 'tenants'], 'und öffnet keine Kundenbereiche');
  assert.equal(p.setupTenantName(), '', 'und hat keinen Namen, den man anzeigen könnte');
}

// ---------------------------------------------------------------------------------------------
// 6. Die Leiste ist die Wahrheit: was dort nicht steht, wird auch nicht gebaut. Sonst bliebe ein
//    Kundenbereich über S.view erreichbar, obwohl niemand ihn geöffnet hat.
// ---------------------------------------------------------------------------------------------
const renderLine = grab('async function render()');
function renderIn(pfad) {
  const gebaut = [];
  const views = Object.fromEntries(['overview', 'tenants', 'courses', 'users', 'content', 'exams', 'branding', 'modules', 'data'].map(n => [n, () => gebaut.push(n)]));
  const env = new Function('window', 'location', 'sessionStorage', 'localStorage', 'views', 'frame', 'q', 'h',
    `${SOURCE}
     const {overview,tenants,courses,users,content,exams,branding,modules,data}=views;
     ${renderLine}
     return {S,render,navigation};`)(
    {}, { pathname: pfad }, { getItem: () => null, setItem() {}, removeItem() {} }, { getItem: () => null, setItem() {}, removeItem() {} },
    views, () => {}, () => ({ onclick: null }), v => String(v));
  env.S.tenants = KUNDEN;
  return { env, gebaut };
}
for (const bereich of TENANT_BEREICHE) {
  const { env, gebaut } = renderIn('/plattform-admin');
  env.S.view = bereich;
  await env.render();
  assert.deepEqual(gebaut, ['overview'],
    `"${bereich}" darf auf der Plattformseite nicht gebaut werden, gebaut wurde: ${gebaut.join(', ')}`);
  assert.equal(env.S.view, 'overview', 'und der Bereich darf nicht als gewählt stehen bleiben');
}
{
  const { env, gebaut } = renderIn('/kunden-admin');
  env.S.view = 'users';
  await env.render();
  assert.deepEqual(gebaut, ['users'], 'im Kundenbereich wird derselbe Bereich sehr wohl gebaut');
}

// ---------------------------------------------------------------------------------------------
// 7. Die nachträgliche Korrektur darf nicht zurückkommen: sie würde beim Einrichten für einen
//    Kunden genau die Bereiche wieder verstecken, die app.js dafür bewusst einblendet.
// ---------------------------------------------------------------------------------------------
const platformUi = await readFile('public/platform-admin-ui.js', 'utf8');
assert.doesNotMatch(platformUi, /querySelectorAll\('\[data-v\]'\)/,
  'die Plattformoberfläche darf die Leiste nicht mehr nachträglich umbauen - sie entsteht in app.js richtig');
assert.doesNotMatch(platformUi, /#tenantPick'\)\?\.remove\(\)/,
  'die Kundenauswahl wird beim Einrichten gebraucht und darf nicht mehr entfernt werden');
assert.match(platformUi, /pa-onboarding-nav/, 'die plattformeigenen Einträge bleiben hier zu Hause');

console.log(`Plattformadmin: eigene Leiste statt versteckter Kundenverwaltung; ${TENANT_BEREICHE.length} Kundenbereiche erst nach ausdrücklicher Auswahl eines Kunden, und ohne sie auch nicht baubar: OK`);
