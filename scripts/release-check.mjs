import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';

const text=async path=>readFile(path,'utf8');
const wrangler=await text('wrangler.jsonc');
const index=await text('src/index.ts');
const router=await text('src/core/router.ts');
const publicApi=await text('src/core/public.ts');
const classAdminHtml=await text('public/class-admin.html');
const classAdminUi=await text('public/class-admin-ui.js');
const classScopeGuard=await text('public/class-admin-scope-guard.js');
const users=await text('src/core/users.ts');

assert.match(wrangler,/"\/portal\/\*"/,'/portal/* must run worker-first');
for(const route of ['/api/*','/public/*','/brand/*','/calendar/*','/einrichtung/*','/plattform-admin*','/kunden-admin*','/klassen-admin*','/zahlung/*'])assert.ok(wrangler.includes(`"${route}"`),`missing worker-first route ${route}`);
for(const asset of ['public/class-portal.html','public/class-portal.js','public/class-portal.css','public/customer-admin.html','public/platform-admin.html','public/class-admin.html','public/class-admin-scope-guard.js','public/payment-result.html'])await readFile(asset);
assert.ok(index.includes("adminPath==='/klassen-admin'?'/class-admin.html'"),'class admin route must serve class-admin.html');

for(const header of ['x-content-type-options','x-frame-options','referrer-policy','permissions-policy','strict-transport-security','content-security-policy'])assert.ok(index.includes(`'${header}'`),`missing production header ${header}`);
assert.ok(index.includes("headers.set('cache-control','no-store')"),'HTML must be no-store');
assert.ok(index.includes("jsonError('INTERNAL_ERROR',500)"),'unhandled request errors must be sanitized');
assert.ok(index.includes('DELETE FROM login_attempts'),'expired login throttling rows must be cleaned');

assert.ok(!router.includes('/api/bootstrap'),'public bootstrap route must stay removed');
assert.ok(!index.includes('BOOTSTRAP_SECRET'),'runtime must not use BOOTSTRAP_SECRET');
assert.ok(!publicApi.includes('access_code_hash:row.access_code_hash'),'access code hash must never be serialized deliberately');

assert.ok(classAdminHtml.includes('[data-v="courses"]'),'class-admin shell must hide course administration');
assert.ok(classAdminHtml.includes('class-admin-scope-guard.js'),'class-admin shell must load the scope guard before boot');
assert.ok(classAdminUi.includes("for(const key of ['tenants','courses','branding','modules','data'])"),'class-admin navigation must exclude tenant/course/customer settings');
assert.ok(classAdminUi.includes("if(o.value!=='participant')o.remove()"),'class-admin UI must only offer participant management');
assert.ok(classAdminUi.includes('Noch nicht aktiv'),'class-admin extensions must include inactive teasers');
assert.ok(classScopeGuard.includes("'/api/surveys','/api/substitutions'"),'class-admin support preview must scope advanced class data');
assert.ok(users.includes("m.role='participant'"),'class-admin user listing must exclude privileged and guest roles');
assert.ok(users.includes("if(role!=='participant')throw new Error('FORBIDDEN_ROLE_ASSIGNMENT')"),'class-admin backend must only assign participant role');

const migrations=(await readdir('migrations')).filter(x=>/^\d+_.*\.sql$/.test(x)).sort();
assert.ok(migrations.includes('0035_notifications.sql'),'Block 7 notification migration missing');
for(let i=1;i<migrations.length;i++)assert.ok(migrations[i]>migrations[i-1],'migration order must be deterministic');

console.log('Release readiness checks: OK');
