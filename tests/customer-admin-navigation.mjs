import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const [enterprise,enterpriseUx,planning,ui,i18n,lazy,html,dropdown,autopilot]=await Promise.all([
  readFile('public/customer-enterprise.css','utf8'),
  readFile('public/customer-enterprise-ux.js','utf8'),
  readFile('public/planning-resource-ui.js','utf8'),
  readFile('public/customer-admin-ui.js','utf8'),
  readFile('public/customer-admin-i18n.js','utf8'),
  readFile('public/customer-admin-lazy-modules.js','utf8'),
  readFile('public/customer-admin.html','utf8'),
  readFile('public/customer-nav-dropdown.js','utf8'),
  readFile('public/customer-autopilot-entry.js','utf8')
]);

for(const label of ['Übersicht','Klassen/Kurse','Benutzer & Rollen','Bildungsträger importieren','Inhalte','Prüfungen','Module','Paket & Abrechnung'])assert.ok(ui.includes(`'${label}'`),`primary customer navigation missing ${label}`);
for(const group of ['Lernen & Kommunikation','Organisation & Betrieb','Automatisierung & Education OS','Technik & Integrationen'])assert.ok(ui.includes(group),`customer navigation group missing ${group}`);
for(const wording of ['Dokumente hochladen','Organisation & Struktur','Verantwortliche & Vertretungen','SSO, SCIM & API'])assert.ok(i18n.includes(wording),`localized customer navigation wording missing ${wording}`);
assert.match(i18n,/customerNavSourceLabel/,'language pack must preserve stable source labels when localizing dynamic navigation');
for(const locale of ['en','fr','es','it','nl','pl','tr','uk','ro','cs','pt','ar'])assert.match(i18n,new RegExp(`\\b${locale}:\\{`),`customer shell language pack missing ${locale}`);
for(const key of ['customer_overview','more_areas','automation_os','participant_import','operations_intro','plans_title','data_backup_title'])assert.ok(i18n.includes(`${key}:`),`customer shell translation key missing ${key}`);
assert.match(i18n,/kp:localechange/,'customer shell must react immediately to language changes');
assert.match(i18n,/kp:customer-view-changed/,'customer shell must re-localize after deterministic app renders');
assert.match(i18n,/kp:customer-modules-group-ready/,'lazy customer modules must be localized when mounted');
assert.doesNotMatch(i18n,/MutationObserver/,'customer language switching must remain event-driven and avoid global mutation observers');
assert.match(ui,/function navSourceLabel\(button\)/,'navigation organizer must keep stable source labels');
assert.match(ui,/function navMemorySet\(open\)/,'secondary navigation state writes must be guarded');
assert.match(ui,/function navMemoryGet\(\)/,'secondary navigation state reads must be guarded');
assert.match(ui,/aria-controls/,'secondary navigation toggle must remain accessible');
assert.match(ui,/button\.parentElement!==primary/,'existing navigation nodes must be moved rather than recreated');
assert.match(ui,/LAZY_GROUPS/,'heavy feature areas must have explicit on-demand launchers');
assert.match(ui,/window\.KPCustomerModules\.loadGroup/,'customer navigation must activate on-demand feature groups through the bounded loader');
assert.match(ui,/Planung & Daten/,'completed setup must transition into the operational planning/data hub');

assert.match(enterprise,/@media\(min-width:961px\)[\s\S]*grid-template-columns:260px minmax\(0,1fr\)!important/,'desktop customer admin must use a true two-column layout');
assert.match(enterprise,/\.customer-portal-admin \.side\{position:static!important/,'desktop side navigation must remain in grid flow');
assert.doesNotMatch(enterprise,/@media\(min-width:961px\)[\s\S]{0,1600}\.customer-portal-admin \.side\{[^}]*position:(?:sticky|fixed)!important/,'desktop customer rail must never become sticky/fixed');
assert.match(enterprise,/backdrop-filter:none!important/,'customer rail must not use expensive blur');
assert.match(enterprise,/Operations & Verwaltung/,'enterprise customer admin must present an operations identity');
assert.match(enterprise,/\.eo-os-main\{grid-template-columns:230px minmax\(0,1fr\)/,'Education OS must remain a compact control center');

assert.match(enterpriseUx,/resource_id:'Raum\/Ressource'/,'raw resource ids must have human labels');
assert.match(enterpriseUx,/Noch eine Angabe nötig/,'ambiguous intent context must be explained for humans');
assert.match(enterpriseUx,/paneObserver\.observe\(pane/,'Education OS observer must be scoped to its active intent pane');
assert.doesNotMatch(enterpriseUx,/observe\(document\.(?:body|documentElement)/,'Education OS must never observe the entire customer document');
assert.match(enterpriseUx,/requestAnimationFrame/,'intent DOM work must be frame-coalesced');

assert.match(planning,/<select name="resource_subtype" required>/,'resource subtype must be a controlled dropdown');
for(const label of ['Unterrichtsraum','EDV-/PC-Raum','Prüfungsraum','Besprechungsraum','Praxisraum / Werkstatt','Labor','Veranstaltungsraum','Büro','Lager','Außenfläche','Sonstiges'])assert.ok(planning.includes(label),`resource dropdown missing ${label}`);
assert.match(planning,/data-edit-resource/,'resources must be editable');
assert.match(planning,/data-disable-resource/,'resources must be deactivatable');
assert.match(planning,/data-resource-block/,'resources must support unavailability blocks');
assert.match(planning,/name="teacher_id" required>\$\{options\(teachers\)\}/,'teacher planning must use a real teacher selector');
assert.match(planning,/name="course_id" required>\$\{options\(courses\)\}/,'planning must use real course selectors rather than raw ids');
assert.doesNotMatch(planning,/Dozenten-ID|Kurs-ID|teacher-001|room-101/,'planning UI must not expose internal-id examples or raw-id labels');

assert.match(html,/customer-enterprise\.css\?v=20260822-[56]/,'final enterprise CSS must be the customer shell stylesheet');
assert.doesNotMatch(html,/customer-compact\.css|customer-dashboard-refresh\.css|role-dashboard(?:-polish)?\.css/,'legacy customer layout layers must not be loaded');
assert.match(html,/customer-admin-ui\.js\?v=20260822-5/,'active customer navigation must be versioned');
assert.match(html,/customer-admin-lazy-modules\.js\?v=20260822-6/,'lazy module controller must use the performance release version');
assert.match(html,/customer-autopilot-entry\.js\?v=20260822-1/,'customer admin must mount the direct Autopilot entry at first paint');
assert.match(html,/customer-admin-i18n\.js\?v=20260822-1/,'customer admin must load its authoritative language pack');
assert.doesNotMatch(html,/customer-admin-nav-labels\.js/,'legacy German-only navigation relabeler must not overwrite selected locale');
assert.doesNotMatch(html,/src="\/customer-moat-ui\.js/,'work assistant implementation must not execute at first paint');
assert.doesNotMatch(html,/src="\/education-os-ui\.js/,'Autopilot implementation must stay lazy despite its prominent entry');
assert.doesNotMatch(html,/src="\/customer-enterprise-ux\.js/,'Education OS UX must not execute before Autopilot/automation is opened');
assert.doesNotMatch(html,/src="\/enterprise-admin-ui\.js/,'organization modules must not execute at first paint');
assert.match(lazy,/autopilot:\['education-os-ui','customer-enterprise-ux'\]/,'Autopilot must have a dedicated two-module fast path');
assert.match(lazy,/importObserverSafe/,'legacy Education OS global observer must be suppressed during lazy import');
assert.match(lazy,/group==='autopilot'\?1:2/,'Autopilot imports must be serialized so observer suppression cannot affect sibling modules');
assert.match(lazy,/customer-moat-ui/,'work assistant remains available on demand');
assert.match(html,/customer-enterprise-ux/,'Education OS UX must remain represented in the audited inert manifest');
assert.match(lazy,/groupPromises=new Map/,'concurrent group requests must be deduplicated');
assert.doesNotMatch(lazy,/role-dashboard(?:-polish)?\.css/,'lazy features must not reintroduce role CSS into customer admin');

assert.match(autopilot,/kp-autopilot-primary/,'Autopilot must be a prominent first-level navigation action');
assert.match(autopilot,/kp-autopilot-header/,'Autopilot must also be directly reachable from the customer page header');
assert.match(autopilot,/loadGroup\?\.\('autopilot'\)/,'one click must load only the dedicated Autopilot fast path');
assert.match(autopilot,/\.eo-os-nav \[data-pane="intent"\]/,'direct entry must land immediately in the Autopilot intent pane');
assert.doesNotMatch(autopilot,/MutationObserver/,'prominent Autopilot entry must be event-driven');

assert.match(dropdown,/closest\('#kp-customer-more-toggle'\)/,'dropdown toggle click must not close itself');
assert.match(dropdown,/Escape/,'customer dropdown must close with Escape');
assert.doesNotMatch(dropdown,/MutationObserver/,'navigation dropdown must be event-driven, not mutation-driven');

console.log('Customer admin left rail, one-click Autopilot, 13-language shell, lazy loading, planning and intent UX checks: OK');
