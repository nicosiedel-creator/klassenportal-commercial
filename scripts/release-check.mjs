import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';

const text=async path=>readFile(path,'utf8');
const wrangler=await text('wrangler.jsonc');
const index=await text('src/index.ts');
const router=await text('src/core/router.ts');
const runtimeRouter=await text('src/core/runtime-schema-router.ts');
const publicApi=await text('src/core/public.ts');
const platformOwner=await text('src/core/platform-owner.ts');
const ownerCockpit=await text('src/core/owner-cockpit.ts');
const ownerSecurityRouter=await text('src/core/owner-security-router.ts');
const mfa=await text('src/core/mfa.ts');
const auth=await text('src/core/auth.ts');
const utils=await text('src/core/utils.ts');
const pkg=JSON.parse(await text('package.json'));
const classPortalHtml=await text('public/class-portal.html');
const classAdminHtml=await text('public/class-admin.html');
const classAdminPortal=await text('public/class-admin-portal.js');
const classWorkspace=await text('public/class-admin-workspace.js');
const customerAdminHtml=await text('public/customer-admin.html');
const platformAdminHtml=await text('public/platform-admin.html');
const platformOwnerUi=await text('public/platform-owner-ui.js');
const ownerSecurityUi=await text('public/owner-security-ui.js');
const authMfaUi=await text('public/auth-mfa-ui.js');
const areaMode=await text('public/area-mode.js');
const compactUi=await text('public/portal-compact.js');
const compactCss=await text('public/portal-compact.css');
const customerCompactCss=await text('public/customer-compact.css');
const vfaReferenceCss=await text('public/vfa13-reference.css');
const users=await text('src/core/users.ts');

assert.match(wrangler,/"\/portal\/\*"/,'/portal/* must run worker-first');
for(const route of ['/api/*','/public/*','/brand/*','/calendar/*','/einrichtung/*','/plattform-admin*','/kunden-admin*','/klassen-admin*','/zahlung/*'])assert.ok(wrangler.includes(`"${route}"`),`missing worker-first route ${route}`);
for(const asset of ['public/class-portal.html','public/class-portal.js','public/class-portal.css','public/portal-compact.css','public/portal-compact.js','public/vfa13-reference.css','public/customer-admin.html','public/customer-compact.css','public/platform-admin.html','public/platform-owner-ui.js','public/owner-security-ui.js','public/auth-mfa-ui.js','public/class-admin.html','public/class-admin-portal.js','public/class-admin-portal.css','public/class-admin-workspace.js','public/payment-result.html'])await readFile(asset);
assert.ok(index.includes("adminPath==='/klassen-admin'?'/class-admin.html'"),'class admin route must serve class-admin.html');
assert.ok(index.includes("if(adminPath==='/plattform-admin')")&&index.includes("if(!session?.isPlatformAdmin)return new Response('Nicht gefunden'"),'platform admin HTML must be owner-gated server-side');

for(const header of ['x-content-type-options','x-frame-options','referrer-policy','permissions-policy','strict-transport-security','content-security-policy'])assert.ok(index.includes(`'${header}'`),`missing production header ${header}`);
assert.ok(index.includes("headers.set('cache-control','no-store')"),'HTML must be no-store');
assert.ok(index.includes("jsonError('INTERNAL_ERROR',500)"),'unhandled request errors must be sanitized');
assert.ok(index.includes('DELETE FROM login_attempts'),'expired login throttling rows must be cleaned');
assert.ok(index.includes('DELETE FROM platform_mfa_challenges'),'expired MFA challenges must be cleaned');

assert.ok(auth.includes('CURRENT_ITERATIONS = 600_000'),'new passwords must use hardened PBKDF2 cost');
assert.ok(auth.includes('MIN_ACCEPTED_ITERATIONS = 100_000'),'legacy hashes must have a strict lower security floor');
assert.ok(auth.includes('PLATFORM_IDLE_MINUTES = 30')&&auth.includes('PLATFORM_SESSION_HOURS = 12'),'owner sessions must be short and idle-limited');
assert.ok(auth.includes('passwordIterations(u.password_hash)<CURRENT_ITERATIONS'),'legacy password hashes must upgrade transparently on successful login');
assert.ok(auth.includes("DELETE FROM sessions WHERE user_id=? AND token_hash<>?"),'password change must revoke other sessions');
assert.ok(auth.includes('ownerMfaEnabled')&&auth.includes('mfaRequired:true'),'enabled owner MFA must block session creation until challenge completion');
assert.ok(mfa.includes("AES-GCM")&&mfa.includes('OWNER_MFA_ENCRYPTION_KEY'),'owner TOTP seed must use dedicated encrypted-at-rest storage');
assert.ok(mfa.includes('last_counter')&&mfa.includes('used_at IS NULL'),'TOTP/recovery verification must be replay resistant');
assert.ok(ownerSecurityRouter.includes('/api/auth/mfa/verify'),'owner MFA verification endpoint must exist');
assert.ok(ownerCockpit.includes('ACTIVE_BILLING_MUST_END_FIRST'),'tenant deletion must refuse active billing');
assert.ok(ownerCockpit.includes('requestTenantDeletion')&&ownerCockpit.includes('MFA_REQUIRED_FOR_DESTRUCTIVE_ACTION'),'tenant deletion must reuse backup/grace workflow and require step-up MFA');
assert.ok(ownerSecurityUi.includes('System & Sicherheit')&&ownerSecurityUi.includes('14-tägigen Schutzfrist'),'owner cockpit must expose protected security/deletion controls');
assert.ok(authMfaUi.includes('challenge_token'),'login UI must finish owner MFA before the normal application continues');
assert.ok(utils.includes("fetchSite && fetchSite!=='same-origin'"),'cross-site browser mutations must be rejected');
assert.ok(String(pkg.scripts?.test||'').includes('tests/security-roles.mjs'),'security role tests must run in CI');
assert.ok(String(pkg.scripts?.test||'').includes('tests/owner-security.mjs'),'owner security tests must run in CI');

assert.ok(!router.includes('/api/bootstrap'),'public bootstrap route must stay removed');
assert.ok(!index.includes('BOOTSTRAP_SECRET'),'runtime must not use BOOTSTRAP_SECRET');
assert.ok(!publicApi.includes('access_code_hash:row.access_code_hash'),'access code hash must never be serialized deliberately');

assert.ok(classPortalHtml.includes('/portal-compact.css'),'participant portal must use compact visual system');
assert.ok(classPortalHtml.includes('/portal-compact.js'),'participant portal must collapse detail-heavy cards by default');
assert.ok(classPortalHtml.includes('/vfa13-reference.css'),'participant portal must load VFA13 reference styling');
assert.ok(classAdminHtml.includes('/class-portal.css'),'Klassen-Admin must share the participant portal visual system');
assert.ok(classAdminHtml.includes('/portal-compact.css')&&classAdminHtml.includes('/portal-compact.js'),'Klassen-Admin must use the same compact tile behavior as participant portal');
assert.ok(classAdminHtml.includes('/vfa13-reference.css'),'Klassen-Admin must load the same VFA13 reference styling');
assert.ok(classAdminHtml.includes('/class-admin-workspace.js'),'Klassen-Admin must load the scoped timetable/account policy');
assert.ok(classAdminHtml.includes('/class-admin-portal.js'),'Klassen-Admin must use its dedicated portal controller');
assert.ok(!classAdminHtml.includes('/boot.js'),'Klassen-Admin must not fall back to the generic admin SPA');
assert.ok(!classAdminHtml.includes('/app.js'),'Klassen-Admin must not load the generic admin SPA directly');
assert.ok(customerAdminHtml.includes('customer-portal-admin')&&customerAdminHtml.includes('/customer-compact.css'),'customer admin must use the compact portal-style shell');
assert.ok(customerAdminHtml.includes('/vfa13-reference.css'),'customer admin must share the VFA13 visual language');
assert.ok(vfaReferenceCss.includes('#stundenplan,#aufgaben'),'VFA13 priority cards must emphasize timetable and homework');
assert.ok(vfaReferenceCss.includes('flex-wrap:wrap'),'VFA13 customer navigation must wrap safely');
assert.ok(compactUi.includes("section.id==='uebersicht'"),'Klassenbereich quick-access card must stay expanded');
assert.ok(compactUi.includes('portal-compact-toggle'),'compact portal cards must remain expandable');
assert.ok(compactCss.includes('.portal-stats,.portal-nav{display:none!important}'),'duplicate portal navigation and stat strips must stay removed');
assert.ok(customerCompactCss.includes('flex-wrap:wrap')&&!customerCompactCss.includes('overflow-x:auto;white-space:nowrap'),'customer admin navigation must wrap instead of forcing one long row');
assert.ok(!areaMode.includes('Zur Plattform-Adminseite'),'no customer/class/student UI may advertise the owner platform route');

assert.ok(classAdminPortal.includes('exactRows'),'Klassen-Admin must keep displayed class data inside one exact course scope');
assert.ok(classAdminPortal.includes('Noch nicht aktiv'),'Klassen-Admin extensions must include benefit teasers');
assert.ok(!classAdminPortal.includes('newCourse'),'Klassen-Admin must never expose course creation');
assert.ok(classWorkspace.includes('[data-action="add-participant"]')&&classWorkspace.includes('[data-user-reset]')&&classWorkspace.includes('[data-member-remove]'),'Klassen-Admin must remove participant account mutation controls');
assert.ok(classWorkspace.includes('/api/timetable/preview')&&classWorkspace.includes('/api/timetable/apply'),'Klassen-Admin must support scoped timetable upload and apply');
assert.ok(classWorkspace.includes('/api/content/lessons/'),'Klassen-Admin must support editing existing timetable entries');
assert.ok(users.includes("requireRole(auth,'tenant_admin')"),'participant account mutations must require customer-admin or platform owner');
assert.ok(users.includes("m.role='participant'"),'class-admin user listing must remain participant-only');

assert.ok(platformAdminHtml.includes('/platform-owner-ui.js')&&platformAdminHtml.includes('/owner-security-ui.js'),'owner administration/security UI must be loaded only in platform admin');
assert.ok(runtimeRouter.includes('/api/platform/owner/demo-fixture')&&runtimeRouter.includes('platformTenantDetail')&&runtimeRouter.includes('updatePlatformTenant'),'owner APIs must expose tenant editing and demo fixture creation');
assert.ok(platformOwnerUi.includes('owner-edit')&&platformOwnerUi.includes('data-demo-build'),'owner UI must provide customer editing and demo generation');
assert.equal((platformOwner.match(/\['VFA 26\/|\['Kaufleute Büromanagement|\['Fachinformatik Systemintegration|\['Sozialverwaltung/g)||[]).length,20,'demo fixture must define exactly 20 classes');
assert.ok(platformOwner.includes('j<20'),'demo fixture must create 20 participants per class');
assert.ok(platformOwner.includes('week<6'),'demo fixture timetable must cover six weeks');

const migrations=(await readdir('migrations')).filter(x=>/^\d+_.*\.sql$/.test(x)).sort();
for(const required of ['0035_notifications.sql','0038_module_cancellations.sql','0039_owner_security.sql'])assert.ok(migrations.includes(required),`required migration missing: ${required}`);
for(let i=1;i<migrations.length;i++)assert.ok(migrations[i]>migrations[i-1],'migration order must be deterministic');

console.log('Release readiness checks: OK');
