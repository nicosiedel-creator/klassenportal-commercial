import {strict as assert} from 'node:assert';
import {readFile} from 'node:fs/promises';

const [html,direct,core,i18n,lazy]=await Promise.all([
  readFile('public/platform-admin.html','utf8'),
  readFile('public/platform-direct-login.js','utf8'),
  readFile('public/platform-admin-ui.js','utf8'),
  readFile('public/platform-admin-i18n.js','utf8'),
  readFile('public/platform-admin-lazy-modules.js','utf8')
]);

assert.doesNotMatch(html,/src="\/localization\.js/,'platform admin must not load the generic document-observer localization runtime');
assert.match(html,/platform-direct-login\.js\?v=20260822-platform-perf-1/,'platform shell must use the performance-hardened direct login entry');
assert.doesNotMatch(direct,/import\('\/localization\.js/,'platform direct login must never instantiate a generic localization module');
for(const name of ['boot.js','platform-admin-ui.js','platform-admin-i18n.js','platform-admin-lazy-modules.js'])assert.ok(direct.includes(name),`platform critical path missing ${name}`);
for(const heavy of ['platform-owner-ui','platform-offers-ui','platform-accounting-ui','platform-accounting-autopilot-ui','legal-owner-ui','owner-security-ui','launch-readiness-ui','custom-domain-ui','branding-assistant','timetable-assistant'])assert.ok(!direct.includes(`import('/${heavy}.js`),`heavy platform module must not be eager-loaded: ${heavy}`);
assert.doesNotMatch(core,/MutationObserver/,'platform core must be event-driven instead of observing the entire app subtree');
assert.match(core,/kp:app-rendered/,'platform core must follow deterministic app render events');
assert.match(core,/kp:platform-ui-applied/,'platform core must emit a stable mounting event for lazy modules and localization');
assert.doesNotMatch(core,/\balert\(|\bconfirm\(|\bprompt\(/,'platform critical core must not use blocking browser dialogs');

for(const group of ['owner','offers','legal','release','security','finance','integrations','operations'])assert.match(lazy,new RegExp(`\\b${group}:\\[`),`platform lazy group missing ${group}`);
assert.match(lazy,/Array\.from\(\{length:2\}/,'platform module loading must use bounded concurrency');
assert.match(lazy,/groupPromises=new Map/,'platform group requests must be deduplicated');
assert.doesNotMatch(lazy,/MutationObserver/,'platform lazy loader must remain event-driven');
assert.match(lazy,/kp:app-rendered/,'platform lazy loader must mount from deterministic application render events');

for(const locale of ['en','fr','es','it','nl','pl','tr','uk','ro','cs','pt','ar'])assert.match(i18n,new RegExp(`\\b${locale}:\\{`),`platform language pack missing ${locale}`);
for(const key of ['platform_summary','customers','customer_setup','offers','legal_privacy','live_release','system_security','accounting_finance','logout'])assert.ok(i18n.includes(`${key}:`),`platform language pack missing ${key}`);
assert.match(i18n,/window\.KP_I18N=/,'platform language runtime must provide the shared locale API itself');
assert.match(i18n,/kp-language-select/,'platform language runtime must own its selector without generic localization');
assert.match(i18n,/kp:localechange/,'platform shell must react immediately to locale changes');
assert.match(i18n,/kp:app-rendered/,'platform translations must refresh after application renders');
assert.doesNotMatch(i18n,/MutationObserver/,'platform language switching must be event-driven');

console.log('Platform admin dedicated observer-free locale runtime, event-driven core and on-demand loading checks: OK');
