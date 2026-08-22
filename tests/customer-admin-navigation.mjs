import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const css=await readFile('public/customer-compact.css','utf8');
const refresh=await readFile('public/customer-dashboard-refresh.css','utf8');
const enterprise=await readFile('public/customer-enterprise.css','utf8');
const enterpriseUx=await readFile('public/customer-enterprise-ux.js','utf8');
const planning=await readFile('public/planning-resource-ui.js','utf8');
const ui=await readFile('public/customer-admin-ui.js','utf8');
const labels=await readFile('public/customer-admin-nav-labels.js','utf8');
const lazy=await readFile('public/customer-admin-lazy-modules.js','utf8');
const html=await readFile('public/customer-admin.html','utf8');

assert.match(css,/\.customer-portal-admin \.side\{position:static!important;/,'customer admin navigation must stay in normal document flow');
assert.doesNotMatch(css,/\.customer-portal-admin \.side\{[^}]*position:sticky/,'customer admin compact CSS must never cover scrolled content with sticky positioning');
assert.match(css,/\.kp-customer-nav-primary/,'customer admin needs a dedicated compact primary navigation row');
assert.match(css,/\.kp-customer-nav-more-panel\[hidden\]\{display:none!important\}/,'secondary navigation must collapse without overlaying the workspace');
assert.match(css,/@media\(max-width:680px\)[\s\S]*overflow-x:auto/,'primary navigation must remain usable on narrow screens');

assert.match(refresh,/@media\(min-width:961px\)[\s\S]*grid-template-columns:var\(--kp-nav-w\) minmax\(0,1fr\)/,'desktop dashboard refresh must use a real two-column layout instead of a floating overlay');
assert.match(refresh,/\.customer-portal-admin \.side\{[\s\S]*position:static!important/,'refreshed sidebar must remain static in grid flow');
assert.doesNotMatch(refresh,/position:sticky!important|position:fixed!important/,'dashboard refresh must not reintroduce sticky/fixed customer navigation');
assert.match(refresh,/@media\(max-width:960px\)[\s\S]*\.customer-portal-admin \.layout\{display:block!important\}/,'dashboard navigation must collapse back to document flow on smaller screens');
assert.match(refresh,/background:var\(--portal-primary,#2563eb\)/,'dashboard refresh must inherit the customer primary brand color rather than cloning a foreign palette');
assert.match(refresh,/#kp-setup-preparation/,'dashboard refresh must style the setup preparation card consistently');

for(const label of ['Übersicht','Klassen/Kurse','Benutzer & Rollen','Teilnehmer importieren','Inhalte','Prüfungen','Module','Paket & Abrechnung']) assert.ok(ui.includes(`'${label}'`),`primary customer navigation missing ${label}`);
for(const group of ['Lernen & Kommunikation','Organisation & Betrieb','Technik & Integrationen']) assert.ok(ui.includes(group),`secondary navigation group missing ${group}`);
for(const wording of ['Dokumente hochladen','Organisation & Struktur','Verantwortliche & Vertretungen','SSO, SCIM & API']) assert.ok(labels.includes(wording),`clarified customer navigation wording missing ${wording}`);
assert.match(labels,/customerNavSourceLabel/,'visual relabeling must preserve the original module label for grouping');
assert.match(ui,/function navSourceLabel\(button\)/,'navigation organizer must keep a stable source label for dynamically injected module buttons');
assert.match(ui,/button\.dataset\.customerNavSourceLabel/,'navigation organizer must read and write the stable source label');
assert.match(ui,/const label=navSourceLabel\(button\)/,'navigation grouping must use the original source label after visual relabeling');
assert.match(ui,/function navMemorySet\(open\)\{try\{sessionStorage\.setItem/,'blocked session storage must not break navigation state writes');
assert.match(ui,/function navMemoryGet\(\)\{try\{return sessionStorage\.getItem/,'blocked session storage must not break navigation state reads');
assert.match(ui,/extraActive\|\|navMemoryGet\(\)/,'navigation must use the guarded storage accessor when restoring the secondary panel');
assert.match(ui,/aria-controls/,'secondary navigation toggle must be accessible');
assert.match(ui,/button\.parentElement!==primary/,'existing navigation buttons must be moved rather than recreated so their handlers survive');
assert.match(ui,/Planung & Daten/,'completed customer setup must transition into an operational planning/data hub in the active runtime');
assert.match(ui,/kp-operations-hub/,'active customer runtime must own the completed setup operations hub');
assert.match(ui,/requestAnimationFrame/,'customer admin mutation work must be frame-coalesced');

assert.match(enterprise,/Operations & Verwaltung/,'enterprise customer admin must present a professional operations navigation identity');
assert.match(enterprise,/\.eo-os-main\{grid-template-columns:230px minmax\(0,1fr\)/,'Education OS must use a compact control-center workspace');
assert.match(enterprise,/\.eo-os-two\{grid-template-columns:minmax\(0,1\.55fr\)/,'intent workspace must prioritize the actual task over explanatory chrome');
assert.match(enterpriseUx,/resource_id:'Raum\/Ressource'/,'raw resource ids must have a human-facing label');
assert.match(enterpriseUx,/api\/education\/planning\/resources/,'intent UX must resolve room names against real tenant resources');
assert.match(enterpriseUx,/payload\.context\.resource_id=hits\[0\]\.id/,'unique room matches must become safe explicit context instead of exposing resource_id to the user');
assert.match(enterpriseUx,/starts_at=localToUtc/,'room outage until-date must be converted into an explicit simulation interval');
assert.match(enterpriseUx,/Noch eine Angabe nötig/,'missing intent context must be explained as an actionable customer message');
assert.match(planning,/<select name="type" required>/,'resource type must be a controlled dropdown');
assert.match(planning,/EDV-\/PC-Raum/,'resource type dropdown must include common education room types');

assert.ok(html.includes('/customer-compact.css?v=20260818-2'),'customer layout CSS cache key must be present');
assert.ok(html.includes('/customer-admin-ui.js?v=20260822-1'),'customer navigation JS cache key must reflect the final pretest implementation');
assert.ok(html.includes('/customer-admin-nav-labels.js?v=20260818-1'),'clarified navigation label asset must be loaded');
assert.doesNotMatch(html,/vfa13-reference\.css/,'commercial customer admin must not import the VFA13 class-portal theme');
assert.ok(html.includes('/customer-dashboard-refresh.css?v=20260819-1'),'original dashboard refresh must be loaded after the base customer styles');
assert.ok(html.includes('/setup-preparation-ui.js?v=20260821-2'),'customer setup preparation UI must use the corrected deterministic status gate');
assert.ok(html.includes('/customer-enterprise.css?v=20260821-2'),'enterprise customer-admin override must be loaded last');
assert.ok(html.includes('/customer-enterprise-ux.js?v=20260821-2'),'actionable Education OS intent UX must be loaded');
assert.ok(html.includes('/customer-moat-ui.js?v=20260822-1'),'customer Work Assistant runtime must be explicitly wired into the real customer admin');
assert.match(html,/grid-template-columns:260px minmax\(0,1fr\)!important/,'critical desktop left-rail layout must be present in the navigation HTML itself');
assert.ok(html.includes('/customer-admin-lazy-modules.js?v=20260821-1'),'heavy customer modules must be bootstrapped by the lazy loader');
assert.doesNotMatch(html,/src="\/enterprise-admin-ui\.js/,'heavy secondary modules must not all execute during first paint');
assert.match(lazy,/requestIdleCallback/,'secondary customer modules should wait until the first paint is responsive');
assert.match(lazy,/Array\.from\(\{length:6\}/,'secondary modules should use bounded parallelism instead of serial batches or an unbounded flood');
assert.match(lazy,/Promise\.all\(workers\)/,'bounded lazy-loader workers must be awaited before ready is announced');
assert.match(lazy,/kp:customer-modules-loaded/,'each lazy module must signal the navigation organizer after loading');
assert.match(lazy,/kp:customer-modules-ready/,'lazy loader must expose an explicit all-modules-ready signal');

console.log('Customer admin enterprise navigation, actionable intent UX and non-overlap checks: OK');
