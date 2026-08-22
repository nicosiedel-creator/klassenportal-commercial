import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const boot=await readFile('public/boot.js','utf8');
const i18n=await readFile('public/localization.js','utf8');
const customerUi=await readFile('public/customer-admin-ui.js','utf8');
const customerLazy=await readFile('public/customer-admin-lazy-modules.js','utf8');
const moat=await readFile('public/customer-moat-ui.js','utf8');
const preparation=await readFile('public/setup-preparation-ui.js','utf8');
const support=await readFile('public/customer-support-mode.js','utf8');
const enterprise=await readFile('public/customer-enterprise.css','utf8');
const enterpriseUx=await readFile('public/customer-enterprise-ux.js','utf8');
const serviceWorker=await readFile('public/service-worker.js','utf8');
const pwa=await readFile('public/pwa-client.js','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const student=await readFile('public/class-portal.html','utf8');
const teacher=await readFile('public/dozentenportal.html','utf8');
const department=await readFile('public/department-lead.html','utf8');
const departmentAdmin=await readFile('public/department-lead-admin-ui.js','utf8');

assert.doesNotMatch(boot,/app\.js\?v=\$\{Date\.now\(\)\}/,'app shell must not defeat browser caching with a timestamp URL');
assert.match(boot,/APP_ASSET_VERSION/,'app shell must use a stable deployment asset key');

for(const locale of ['de','en','fr','es','it','nl','pl','tr','uk','ro','cs','pt','ar']) assert.ok(i18n.includes(`${locale}:`)||i18n.includes(`${locale}:'`)||i18n.includes(`${locale}:"`),`missing locale ${locale}`);
assert.match(i18n,/localStorage\.setItem\(STORAGE_KEY/,'selected locale must persist');
assert.match(i18n,/m\.addedNodes/,'localization observer must process only added DOM nodes instead of rescanning the full document on every mutation');
assert.match(i18n,/document\.documentElement\.dir=RTL\.has\(locale\)/,'RTL locale support must set document direction');
assert.match(i18n,/window\.KP_I18N/,'localization API must be shared across portals');

assert.ok(customer.includes('/localization.js?v=20260821-1'),'customer admin must load the locale layer');
assert.ok(student.includes('/localization.js?v=20260821-1'),'student portal must load the locale layer');
assert.ok(teacher.includes('/localization.js?v=20260821-1'),'teacher portal must load the locale layer');
assert.ok(department.includes('/localization.js?v=20260821-1'),'department lead portal must load the locale layer');

// Test the files that are actually wired into /kunden-admin. A dead patch file must never make CI green.
assert.ok(customer.includes('/customer-admin-ui.js?v=20260822-1'),'customer admin must load the audited active customer UI');
assert.ok(customer.includes('/customer-moat-ui.js?v=20260822-1'),'customer admin must load the audited work assistant directly');
assert.doesNotMatch(customer,/customer-pretest-polish\.js/,'customer runtime must not rely on the former unwired pretest patch file');
assert.doesNotMatch(customer,/vfa13-reference\.css/,'commercial customer admin must not inherit VFA13-specific layout rules');

assert.match(customerUi,/Planung & Daten/,'completed customer setup must become an operational planning/data area in the active runtime');
assert.match(customerUi,/showOperationsHub/,'active customer UI must own the completed-setup transition');
assert.match(customerUi,/requiredReady/,'active customer UI must recognize a ready self-service setup');
assert.match(customerUi,/requestAnimationFrame/,'active customer observer must be frame-coalesced');
assert.doesNotMatch(customerUi,/queueMicrotask\(\(\)=>\{scheduled=false;apply\(\);\}\)/,'the former customer-admin microtask feedback loop must not return');

assert.match(customerLazy,/Array\.from\(\{length:6\}/,'customer modules must use bounded parallelism instead of five serial loading barriers');
assert.match(customerLazy,/kp:customer-modules-loaded/,'each finished module must become visible to the navigation immediately');
assert.match(customerLazy,/kp:customer-modules-ready/,'customer module loader must expose a deterministic completion signal');
assert.doesNotMatch(customerLazy,/for\(const group of groups\)await loadGroup\(group\)/,'serial module groups must not return');

assert.match(moat,/Education & Training OS · Arbeitsassistent/,'assistant must use its final product name without post-render patching');
assert.match(moat,/supportPlatformAdmin/,'assistant must explicitly recognize the platform support projection');
assert.match(moat,/Plattform-Supportansicht · nur lesend/,'platform support must get a safe read-only assistant view');
assert.match(moat,/Promise\.allSettled/,'one failed assistant panel must not blank the complete modal');
assert.match(moat,/TENANT_ADMIN_REQUIRED:/,'tenant-admin denial must have a human-readable message');
assert.match(moat,/AUTOPILOT_TENANT_ADMIN_REQUIRED:/,'autopilot tenant-admin denial must have a human-readable message');
assert.doesNotMatch(moat,/host\.innerHTML=note\(e\.message/,'raw backend errors must never replace the entire assistant body');
assert.doesNotMatch(moat,/out\.textContent=e\.message/,'raw backend errors must never be printed into assistant actions');
const supportStart=moat.indexOf('if(me?.supportPlatformAdmin){'),supportEnd=moat.indexOf('return;',supportStart),supportBranch=moat.slice(supportStart,supportEnd);
assert.ok(supportStart>=0&&supportEnd>supportStart,'support assistant branch must be structurally detectable');
assert.doesNotMatch(supportBranch,/\/api\/moat\/compliance\/overview|\/api\/moat\/partners\/grants/,'platform support must not call tenant-admin-only assistant endpoints');

assert.match(preparation,/function customerSetupReady\(/,'setup preparation must understand the completed customer state');
assert.match(preparation,/content\.querySelector\('#kp-operations-hub'\)/,'the preparation checklist must never be reinserted beside the operational hub');
assert.match(preparation,/content\.querySelector\('#kp-setup-preparation'\)\?\.remove\(\);return;/,'a completed customer setup must actively remove a stale preparation checklist');
assert.match(preparation,/requestAnimationFrame/,'setup preparation observer must be frame-coalesced to prevent DOM mutation storms');
assert.doesNotMatch(preparation,/new MutationObserver\(\(\)=>queueMicrotask\(apply\)\)/,'the former setup preparation microtask feedback loop must not return');

assert.match(support,/const TTL=8000/,'customer bootstrap reads need a bounded short-lived response cache');
assert.match(support,/const responseCache=new Map/,'customer bootstrap should reuse identical startup responses');
assert.match(support,/supportPlatformAdmin:true/,'platform support projection must remain explicitly marked as support rather than becoming server-side tenant admin');
assert.match(support,/\/api\/platform\/tenants/,'tenant bootstrap must be warmable before app startup');
assert.match(support,/\/api\/courses/,'remembered tenant courses must be warmed in parallel');
assert.match(support,/\/api\/billing\/setup-progress/,'setup progress should be warmed in parallel for the remembered tenant');
assert.match(support,/clearBootstrapCache\(\)/,'writes must invalidate the short-lived bootstrap cache');

assert.match(enterprise,/Final desktop information architecture/,'the last-loaded customer stylesheet must own the desktop information architecture');
assert.match(enterprise,/grid-template-columns:260px minmax\(0,1fr\)!important/,'desktop customer admin must keep a stable left operations rail');
assert.match(enterprise,/\.customer-portal-admin \.side\{position:static!important/,'final enterprise CSS must neutralize the later sticky top-navigation override');
assert.match(enterprise,/backdrop-filter:none!important/,'final customer navigation must not spend main-thread/GPU work on a sticky blur layer');

assert.ok(customer.includes('/customer-enterprise.css?v=20260821-2'),'customer enterprise CSS must keep its deployment cache key');
assert.ok(customer.includes('/customer-enterprise-ux.js?v=20260821-2'),'customer enterprise UX must keep its observer-fix cache key');
assert.ok(customer.includes('/pwa-client.js?v=20260821-2'),'customer admin must bootstrap the deployment-aware PWA client');
assert.match(serviceWorker,/kp-shell-v2-20260821/,'service worker cache version must rotate so stale shell assets are deleted');
assert.match(serviceWorker,/destination==='script'\|\|destination==='style'/,'scripts and styles must use the deployment-safe network path');
assert.match(serviceWorker,/cache:'no-cache'/,'deployment-critical scripts and styles must revalidate with the network');
assert.match(pwa,/updateViaCache:'none'/,'service-worker update checks must bypass stale HTTP cache state');
assert.match(pwa,/reg\.update\(\)/,'PWA client must actively check for a new service worker');
assert.match(pwa,/controllerchange/,'a newly activated service worker must refresh the controlled page once');
assert.match(enterpriseUx,/if\(next!==current\)n\.textContent=next/,'intent humanization must be idempotent and never write unchanged text back into the DOM');
assert.match(enterpriseUx,/ms\.some\(touchesIntent\)/,'intent observer must ignore unrelated customer-admin DOM mutations');
assert.match(enterpriseUx,/requestAnimationFrame/,'intent observer work must be frame-coalesced');
assert.doesNotMatch(enterpriseUx,/n\.textContent=n\.textContent\.replace/,'unconditional intent text rewrites must not return');

assert.match(departmentAdmin,/\/department-lead\.html\?tenant_id=/,'department lead assignment must generate the real portal URL');
assert.doesNotMatch(departmentAdmin,/\/fachbereichsleitung\.html\?tenant_id=/,'stale department lead portal path must not be emitted');

console.log('Final pre-test active-runtime, support-boundary, performance, multilingual and routing checks: OK');
