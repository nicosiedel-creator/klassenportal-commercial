import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';

const text=async path=>readFile(path,'utf8');
const wrangler=await text('wrangler.jsonc');
const index=await text('src/index.ts');
const router=await text('src/core/router.ts');
const publicApi=await text('src/core/public.ts');
const classPortalHtml=await text('public/class-portal.html');
const classAdminHtml=await text('public/class-admin.html');
const classAdminPortal=await text('public/class-admin-portal.js');
const customerAdminHtml=await text('public/customer-admin.html');
const compactUi=await text('public/portal-compact.js');
const compactCss=await text('public/portal-compact.css');
const customerCompactCss=await text('public/customer-compact.css');
const users=await text('src/core/users.ts');

assert.match(wrangler,/"\/portal\/\*"/,'/portal/* must run worker-first');
for(const route of ['/api/*','/public/*','/brand/*','/calendar/*','/einrichtung/*','/plattform-admin*','/kunden-admin*','/klassen-admin*','/zahlung/*'])assert.ok(wrangler.includes(`"${route}"`),`missing worker-first route ${route}`);
for(const asset of ['public/class-portal.html','public/class-portal.js','public/class-portal.css','public/portal-compact.css','public/portal-compact.js','public/customer-admin.html','public/customer-compact.css','public/platform-admin.html','public/class-admin.html','public/class-admin-portal.js','public/class-admin-portal.css','public/payment-result.html'])await readFile(asset);
assert.ok(index.includes("adminPath==='/klassen-admin'?'/class-admin.html'"),'class admin route must serve class-admin.html');

for(const header of ['x-content-type-options','x-frame-options','referrer-policy','permissions-policy','strict-transport-security','content-security-policy'])assert.ok(index.includes(`'${header}'`),`missing production header ${header}`);
assert.ok(index.includes("headers.set('cache-control','no-store')"),'HTML must be no-store');
assert.ok(index.includes("jsonError('INTERNAL_ERROR',500)"),'unhandled request errors must be sanitized');
assert.ok(index.includes('DELETE FROM login_attempts'),'expired login throttling rows must be cleaned');

assert.ok(!router.includes('/api/bootstrap'),'public bootstrap route must stay removed');
assert.ok(!index.includes('BOOTSTRAP_SECRET'),'runtime must not use BOOTSTRAP_SECRET');
assert.ok(!publicApi.includes('access_code_hash:row.access_code_hash'),'access code hash must never be serialized deliberately');

assert.ok(classPortalHtml.includes('/portal-compact.css'),'participant portal must use compact visual system');
assert.ok(classPortalHtml.includes('/portal-compact.js'),'participant portal must collapse detail-heavy cards by default');
assert.ok(classAdminHtml.includes('/class-portal.css'),'Klassen-Admin must share the participant portal visual system');
assert.ok(classAdminHtml.includes('/portal-compact.css')&&classAdminHtml.includes('/portal-compact.js'),'Klassen-Admin must use the same compact tile behavior as participant portal');
assert.ok(classAdminHtml.includes('/class-admin-portal.js'),'Klassen-Admin must use its dedicated portal controller');
assert.ok(!classAdminHtml.includes('/boot.js'),'Klassen-Admin must not fall back to the generic admin SPA');
assert.ok(!classAdminHtml.includes('/app.js'),'Klassen-Admin must not load the generic admin SPA directly');
assert.ok(customerAdminHtml.includes('customer-portal-admin')&&customerAdminHtml.includes('/customer-compact.css'),'customer admin must use the compact portal-style shell');
assert.ok(compactUi.includes("section.id==='uebersicht'"),'Klassenbereich quick-access card must stay expanded');
assert.ok(compactUi.includes('portal-compact-toggle'),'compact portal cards must remain expandable');
assert.ok(compactCss.includes('.portal-stats,.portal-nav{display:none!important}'),'duplicate portal navigation and stat strips must stay removed');
assert.ok(customerCompactCss.includes('.customer-portal-admin .side{position:sticky'),'customer admin navigation must stay compact and horizontal');
assert.ok(classAdminPortal.includes("payload.role='participant'"),'Klassen-Admin UI must only create participants');
assert.ok(classAdminPortal.includes('exactRows'),'Klassen-Admin must keep displayed class data inside one exact course scope');
assert.ok(classAdminPortal.includes("payload.course_id=state.course.id"),'Klassen-Admin writes must be pinned to its selected course');
assert.ok(classAdminPortal.includes('Noch nicht aktiv'),'Klassen-Admin extensions must include benefit teasers');
assert.ok(!classAdminPortal.includes('newCourse'),'Klassen-Admin must never expose course creation');
assert.ok(users.includes("m.role='participant'"),'class-admin user listing must exclude privileged and guest roles');
assert.ok(users.includes("if(role!=='participant')throw new Error('FORBIDDEN_ROLE_ASSIGNMENT')"),'class-admin backend must only assign participant role');

const migrations=(await readdir('migrations')).filter(x=>/^\d+_.*\.sql$/.test(x)).sort();
assert.ok(migrations.includes('0035_notifications.sql'),'Block 7 notification migration missing');
for(let i=1;i<migrations.length;i++)assert.ok(migrations[i]>migrations[i-1],'migration order must be deterministic');

console.log('Release readiness checks: OK');
