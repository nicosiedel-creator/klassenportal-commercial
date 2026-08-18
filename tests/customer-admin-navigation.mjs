import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const css=await readFile('public/customer-compact.css','utf8');
const ui=await readFile('public/customer-admin-ui.js','utf8');
const html=await readFile('public/customer-admin.html','utf8');

assert.match(css,/\.customer-portal-admin \.side\{position:static!important;/,'customer admin navigation must stay in normal document flow');
assert.doesNotMatch(css,/\.customer-portal-admin \.side\{[^}]*position:sticky/,'customer admin navigation must never cover scrolled content with sticky positioning');
assert.match(css,/\.kp-customer-nav-primary/,'customer admin needs a dedicated compact primary navigation row');
assert.match(css,/\.kp-customer-nav-more-panel\[hidden\]\{display:none!important\}/,'secondary navigation must collapse without overlaying the workspace');
assert.match(css,/@media\(max-width:680px\)[\s\S]*overflow-x:auto/,'primary navigation must remain usable on narrow screens');

for(const label of ['Übersicht','Klassen/Kurse','Benutzer & Rollen','Teilnehmer importieren','Inhalte','Prüfungen','Module','Paket & Abrechnung']){
  assert.ok(ui.includes(`'${label}'`),`primary customer navigation missing ${label}`);
}
for(const group of ['Lernen & Kommunikation','Organisation & Betrieb','Technik & Integrationen']){
  assert.ok(ui.includes(group),`secondary navigation group missing ${group}`);
}
assert.match(ui,/aria-controls','secondary navigation toggle must be accessible');
assert.match(ui,/extraActive\|\|storedOpen/,'an active secondary section must remain visible');
assert.match(ui,/button\.parentElement!==primary/,'existing navigation buttons must be moved rather than recreated so their handlers survive');
assert.ok(html.includes('/customer-compact.css?v=20260818-2'),'customer layout CSS cache key must be bumped');
assert.ok(html.includes('/customer-admin-ui.js?v=20260818-2'),'customer navigation JS cache key must be bumped');

console.log('Customer admin navigation and non-overlap checks: OK');
