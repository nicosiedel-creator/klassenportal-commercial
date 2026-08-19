import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const css=await readFile('public/customer-compact.css','utf8');
const theme=await readFile('public/vfa13-reference.css','utf8');
const refresh=await readFile('public/customer-dashboard-refresh.css','utf8');
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

assert.match(refresh,/@media\(min-width:961px\)[\s\S]*grid-template-columns:var\(--kp-nav-w\) minmax\(0,1fr\)/,'desktop dashboard refresh must use a real two-column layout instead of a floating overlay');
assert.match(refresh,/\.customer-portal-admin \.side\{[\s\S]*position:static!important/,'refreshed sidebar must remain static in grid flow');
assert.doesNotMatch(refresh,/position:sticky!important|position:fixed!important/,'dashboard refresh must not reintroduce sticky/fixed customer navigation');
assert.match(refresh,/@media\(max-width:960px\)[\s\S]*\.customer-portal-admin \.layout\{display:block!important\}/,'dashboard navigation must collapse back to document flow on smaller screens');
assert.match(refresh,/background:var\(--portal-primary,#2563eb\)/,'dashboard refresh must inherit the customer primary brand color rather than cloning a foreign palette');
assert.match(refresh,/#kp-setup-preparation/,'dashboard refresh must style the setup preparation card consistently');

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
assert.match(ui,/function navSourceLabel\(button\)/,'navigation organizer must keep a stable source label for dynamically injected module buttons');
assert.match(ui,/button\.dataset\.customerNavSourceLabel/,'navigation organizer must read and write the stable source label');
assert.match(ui,/const label=navSourceLabel\(button\)/,'navigation grouping must use the original source label after visual relabeling');
assert.match(ui,/function navMemorySet\(open\)\{try\{sessionStorage\.setItem/,'blocked session storage must not break navigation state writes');
assert.match(ui,/function navMemoryGet\(\)\{try\{return sessionStorage\.getItem/,'blocked session storage must not break navigation state reads');
assert.match(ui,/const storedOpen=navMemoryGet\(\)/,'navigation must use the guarded storage accessor');
assert.match(ui,/aria-controls/,'secondary navigation toggle must be accessible');
assert.match(ui,/extraActive\|\|storedOpen/,'an active secondary section must remain visible');
assert.match(ui,/button\.parentElement!==primary/,'existing navigation buttons must be moved rather than recreated so their handlers survive');
assert.ok(html.includes('/customer-compact.css?v=20260818-2'),'customer layout CSS cache key must be bumped');
assert.ok(html.includes('/customer-admin-ui.js?v=20260818-3'),'customer navigation JS cache key must reflect the final navigation implementation');
assert.ok(html.includes('/customer-admin-nav-labels.js?v=20260818-1'),'clarified navigation label asset must be loaded');
assert.ok(html.includes('/vfa13-reference.css?v=20260818-3'),'later customer theme cache key must reflect the final non-sticky theme');
assert.ok(html.includes('/customer-dashboard-refresh.css?v=20260819-1'),'original dashboard refresh must be loaded after the base customer styles');
assert.ok(html.includes('/setup-preparation-ui.js?v=20260819-1'),'customer setup preparation UI must be loaded');

console.log('Customer admin navigation, dashboard layout and non-overlap checks: OK');
