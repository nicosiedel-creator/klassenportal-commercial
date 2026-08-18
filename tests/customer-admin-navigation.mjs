import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const css=await readFile('public/customer-compact.css','utf8');
const theme=await readFile('public/vfa13-reference.css','utf8');
const ui=await readFile('public/customer-admin-ui.js','utf8');
const labels=await readFile('public/customer-admin-nav-labels.js','utf8');
const html=await readFile('public/customer-admin.html','utf8');

assert.match(css,/\.customer-portal-admin \.side\{position:static!important;/,'customer admin navigation must stay in normal document flow');
assert.doesNotMatch(css,/\.customer-portal-admin \.side\{[^}]*position:sticky/,'customer admin compact CSS must never cover scrolled content with sticky positioning');
assert.match(theme,/\.customer-portal-admin \.side\{position:static!important;/,'later VFA13 theme must preserve the non-sticky customer navigation');
assert.doesNotMatch(theme,/\.customer-portal-admin \.side\{[^}]*position:sticky/,'later VFA13 theme must not reintroduce sticky customer navigation');
assert.doesNotMatch(theme,/\.customer-portal-admin \.side\{[^}]*z-index:50/,'later VFA13 theme must not reintroduce the old overlay stacking layer');
assert.match(theme,/\.customer-portal-admin \.kp-customer-nav-primary\{flex-wrap:wrap!important\}/,'VFA13 theme must preserve wrapped primary customer navigation without making the header sticky');
assert.match(css,/\.kp-customer-nav-primary/,'customer admin needs a dedicated compact primary navigation row');
assert.match(css,/\.kp-customer-nav-more-panel\[hidden\]\{display:none!important\}/,'secondary navigation must collapse without overlaying the workspace');
assert.match(css,/@media\(max-width:680px\)[\s\S]*overflow-x:auto/,'primary navigation must remain usable on narrow screens');

for(const label of ['Übersicht','Klassen/Kurse','Benutzer & Rollen','Teilnehmer importieren','Inhalte','Prüfungen','Module','Paket & Abrechnung']){
  assert.ok(ui.includes(`'${label}'`),`primary customer navigation missing ${label}`);
}
for(const group of ['Lernen & Kommunikation','Organisation & Betrieb','Technik & Integrationen']){
  assert.ok(ui.includes(group),`secondary navigation group missing ${group}`);
}
for(const wording of ['Dokumente hochladen','Organisation & Struktur','Verantwortliche & Vertretungen','SSO, SCIM & API']){
  assert.ok(labels.includes(wording),`clarified customer navigation wording missing ${wording}`);
}
assert.match(labels,/customerNavSourceLabel/,'visual relabeling must preserve the original module label for grouping');
assert.match(ui,/aria-controls/,'secondary navigation toggle must be accessible');
assert.match(ui,/extraActive\|\|storedOpen/,'an active secondary section must remain visible');
assert.match(ui,/button\.parentElement!==primary/,'existing navigation buttons must be moved rather than recreated so their handlers survive');
assert.ok(html.includes('/customer-compact.css?v=20260818-2'),'customer layout CSS cache key must be bumped');
assert.ok(html.includes('/customer-admin-ui.js?v=20260818-2'),'customer navigation JS cache key must be bumped');
assert.ok(html.includes('/customer-admin-nav-labels.js?v=20260818-1'),'clarified navigation label asset must be loaded');
assert.ok(html.includes('/vfa13-reference.css?v=20260818-2'),'later customer theme cache key must be bumped');

console.log('Customer admin navigation and non-overlap checks: OK');
