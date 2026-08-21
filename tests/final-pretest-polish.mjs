import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const boot=await readFile('public/boot.js','utf8');
const i18n=await readFile('public/localization.js','utf8');
const polish=await readFile('public/customer-pretest-polish.js','utf8');
const preparation=await readFile('public/setup-preparation-ui.js','utf8');
const support=await readFile('public/customer-support-mode.js','utf8');
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

assert.ok(customer.includes('/localization.js?v=20260821-1'),'customer admin must load the new locale layer');
assert.ok(student.includes('/localization.js?v=20260821-1'),'student portal must load the locale layer');
assert.ok(teacher.includes('/localization.js?v=20260821-1'),'teacher portal must load the locale layer');
assert.ok(department.includes('/localization.js?v=20260821-1'),'department lead portal must load the locale layer');

assert.match(polish,/Planung & Daten/,'completed customer setup must be replaced by an operational planning/data area');
assert.match(polish,/progress\.dataset\.setupReady='1'/,'completed setup state must be marked before the preparation checklist is removed');
assert.match(polish,/requestAnimationFrame/,'customer polish observer must be frame-coalesced instead of running a microtask feedback loop');
assert.match(polish,/Arbeitsassistent/,'floating Vorsprung action must use the clearer assistant name');
assert.match(polish,/TENANT_ADMIN_REQUIRED/,'raw tenant-admin context error must be humanized');
assert.match(polish,/const inflight=new Map/,'customer admin must deduplicate concurrent identical GET boot requests');
assert.match(polish,/department-lead\.html/,'legacy department-lead links must be repaired defensively');

assert.match(preparation,/function customerSetupReady\(/,'setup preparation must understand the completed customer state');
assert.match(preparation,/content\.querySelector\('#kp-operations-hub'\)/,'the preparation checklist must never be reinserted beside the operational hub');
assert.match(preparation,/content\.querySelector\('#kp-setup-preparation'\)\?\.remove\(\);return;/,'a completed customer setup must actively remove a stale preparation checklist');
assert.match(preparation,/requestAnimationFrame/,'setup preparation observer must be frame-coalesced to prevent DOM mutation storms');
assert.doesNotMatch(preparation,/new MutationObserver\(\(\)=>queueMicrotask\(apply\)\)/,'the former setup preparation microtask feedback loop must not return');

assert.match(support,/const TTL=8000/,'customer bootstrap reads need a bounded short-lived response cache');
assert.match(support,/const responseCache=new Map/,'customer bootstrap should reuse identical startup responses');
assert.match(support,/\/api\/platform\/tenants/,'tenant bootstrap must be warmable before app startup');
assert.match(support,/\/api\/courses/,'remembered tenant courses must be warmed in parallel');
assert.match(support,/\/api\/billing\/setup-progress/,'setup progress should be warmed in parallel for the remembered tenant');
assert.match(support,/clearBootstrapCache\(\)/,'writes must invalidate the short-lived bootstrap cache');

assert.match(departmentAdmin,/\/department-lead\.html\?tenant_id=/,'department lead assignment must generate the real portal URL');
assert.doesNotMatch(departmentAdmin,/\/fachbereichsleitung\.html\?tenant_id=/,'stale department lead portal path must not be emitted');

console.log('Final pre-test performance, multilingual, customer-ops and department-lead routing checks: OK');