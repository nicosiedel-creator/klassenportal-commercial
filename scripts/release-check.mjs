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
const launchRouter=await text('src/core/launch-readiness-router.ts');
const launchReadiness=await text('src/core/launch-readiness.ts');
const accountRecovery=await text('src/core/account-recovery.ts');
const accountRouter=await text('src/core/account-recovery-router.ts');
const mail=await text('src/core/mail.ts');
const legal=await text('src/core/legal.ts');
const backupVerification=await text('src/core/backup-verification.ts');
const provision=await text('src/core/provision.ts');
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
const launchReadinessUi=await text('public/launch-readiness-ui.js');
const authMfaUi=await text('public/auth-mfa-ui.js');
const accountMailUi=await text('public/account-mail-ui.js');
const accountActionHtml=await text('public/account-action.html');
const accountActionJs=await text('public/account-action.js');
const legalFooter=await text('public/legal-footer-ui.js');
const areaMode=await text('public/area-mode.js');
const compactUi=await text('public/portal-compact.js');
const compactCss=await text('public/portal-compact.css');
const customerCompactCss=await text('public/customer-compact.css');
const vfaReferenceCss=await text('public/vfa13-reference.css');
const users=await text('src/core/users.ts');

for(const route of ['/api/*','/public/*','/brand/*','/calendar/*','/portal/*','/einrichtung/*','/plattform-admin*','/kunden-admin*','/klassen-admin*','/zahlung/*','/passwort-vergessen*','/passwort-zuruecksetzen*','/konto-aktivieren*','/impressum*','/datenschutz*','/agb*','/avv*'])assert.ok(wrangler.includes(`"${route}"`),`missing worker-first route ${route}`);
for(const asset of ['public/class-portal.html','public/class-portal.js','public/class-portal.css','public/portal-compact.css','public/portal-compact.js','public/vfa13-reference.css','public/customer-admin.html','public/customer-compact.css','public/platform-admin.html','public/platform-owner-ui.js','public/owner-security-ui.js','public/launch-readiness-ui.js','public/auth-mfa-ui.js','public/account-mail-ui.js','public/account-action.html','public/account-action.js','public/legal-footer-ui.js','public/class-admin.html','public/class-admin-portal.js','public/class-admin-portal.css','public/class-admin-workspace.js','public/payment-result.html'])await readFile(asset);
assert.ok(index.includes("clean==='/klassen-admin'?'/class-admin.html'"),'class admin route must serve class-admin.html');
assert.ok(index.includes("if(clean==='/plattform-admin')")&&index.includes("if(!session?.isPlatformAdmin)return new Response('Nicht gefunden'"),'platform admin HTML must be owner-gated server-side');

for(const header of ['x-content-type-options','x-frame-options','referrer-policy','permissions-policy','strict-transport-security','content-security-policy'])assert.ok(index.includes(`'${header}'`),`missing production header ${header}`);
assert.ok(index.includes("headers.set('cache-control','no-store')"),'HTML must be no-store');
assert.ok(index.includes("jsonError('INTERNAL_ERROR',500)"),'unhandled request errors must be sanitized');
assert.ok(index.includes('DELETE FROM login_attempts'),'expired login throttling rows must be cleaned');
assert.ok(index.includes('DELETE FROM platform_mfa_challenges'),'expired MFA challenges must be cleaned');
assert.ok(index.includes('cleanupAccountActions'),'expired account-action secrets must be cleaned');
assert.ok(index.includes('verifyPendingBackups'),'scheduled jobs must verify backup object integrity');

assert.ok(auth.includes('CURRENT_ITERATIONS = 600_000'),'new passwords must use hardened PBKDF2 cost');
assert.ok(auth.includes('MIN_ACCEPTED_ITERATIONS = 100_000'),'legacy hashes must have a strict lower security floor');
assert.ok(auth.includes('PLATFORM_IDLE_MINUTES = 30')&&auth.includes('PLATFORM_SESSION_HOURS = 12'),'owner sessions must be short and idle-limited');
assert.ok(auth.includes('passwordIterations(u.password_hash)<CURRENT_ITERATIONS'),'legacy password hashes must upgrade transparently on successful login');
assert.ok(auth.includes("DELETE FROM sessions WHERE user_id=? AND token_hash<>?"),'password change must revoke other sessions');
assert.ok(auth.includes('ownerMfaEnabled')&&auth.includes('mfaRequired:true'),'enabled owner MFA must block session creation until challenge completion');
assert.ok(mfa.includes('AES-GCM')&&mfa.includes('OWNER_MFA_ENCRYPTION_KEY'),'owner TOTP seed must use dedicated encrypted-at-rest storage');
assert.ok(mfa.includes('last_counter')&&mfa.includes('used_at IS NULL'),'TOTP/recovery verification must be replay resistant');
assert.ok(ownerSecurityRouter.includes('/api/auth/mfa/verify'),'owner MFA verification endpoint must exist');
assert.ok(ownerCockpit.includes('ACTIVE_BILLING_MUST_END_FIRST'),'tenant deletion must refuse active billing');
assert.ok(ownerCockpit.includes('requestTenantDeletion')&&ownerCockpit.includes('MFA_REQUIRED_FOR_DESTRUCTIVE_ACTION'),'tenant deletion must reuse backup/grace workflow and require step-up MFA');
assert.ok(ownerSecurityUi.includes('System & Sicherheit')&&ownerSecurityUi.includes('14-tägigen Schutzfrist'),'owner cockpit must expose protected security/deletion controls');
assert.ok(authMfaUi.includes('challenge_token'),'login UI must finish owner MFA before the normal application continues');
assert.ok(utils.includes("fetchSite && fetchSite!=='same-origin'"),'cross-site browser mutations must be rejected');

assert.ok(accountRecovery.includes('sha256Text(raw)'),'account action tokens must be stored hashed');
assert.ok(accountRecovery.includes('RESET_MINUTES=30')&&accountRecovery.includes('ACTIVATION_HOURS=48'),'account links must expire');
assert.ok(accountRecovery.includes("is_platform_admin===1)return{accepted:true}"),'public password reset must exclude owner accounts without enumeration');
assert.ok(accountRouter.includes('SELECT id FROM memberships WHERE tenant_id=? AND user_id=?'),'activation resends must stay tenant-scoped');
assert.ok(users.includes('createActivationForUser')&&users.includes('createAdminPasswordReset'),'user lifecycle must use emailed activation/reset links');
assert.ok(!users.includes('temporary_password:'),'user APIs must not return temporary passwords');
assert.ok(!provision.includes('temporaryPassword:'),'tenant provisioning must not return temporary admin passwords');
assert.ok(mail.includes('https://api.resend.com/emails')&&mail.includes('user-agent')&&mail.includes('idempotency-key'),'transactional email must use authenticated, identifiable, idempotent provider calls');
assert.ok(accountActionHtml.includes('/account-action.js')&&accountActionJs.includes('/api/auth/password-reset/request'),'secure account action page must exist');
assert.ok(accountMailUi.includes('/passwort-vergessen'),'login surfaces must expose secure password recovery');

for(const field of ['legal_notice_url','privacy_url','terms_url','dpa_url','support_email'])assert.ok(legal.includes(field),`legal configuration field missing: ${field}`);
assert.ok(legal.includes("u.protocol!=='https:'"),'legal document URLs must be HTTPS');
assert.ok(legalFooter.includes('/impressum')&&legalFooter.includes('/datenschutz')&&legalFooter.includes('/agb')&&legalFooter.includes('/avv'),'public surfaces must expose legal links');
assert.ok(launchRouter.includes('/api/platform/release-readiness')&&launchReadinessUi.includes('Live-Freigabe'),'owner must have an explicit release readiness cockpit');
for(const blocker of ['Stripe läuft noch nicht mit Live-Schlüssel','Eigentümer-MFA ist nicht aktiviert','Transaktions-E-Mail ist nicht vollständig konfiguriert','Rechtliche Unterlagen','Backup-Sicherheit nicht erfüllt'])assert.ok(launchReadiness.includes(blocker),`launch gate missing blocker: ${blocker}`);
assert.ok(backupVerification.includes('manifest.resources.map')&&backupVerification.includes('manifest.files.map'),'backup verification must cover every manifest object');

assert.ok(!router.includes('/api/bootstrap'),'public bootstrap route must stay removed');
assert.ok(!index.includes('BOOTSTRAP_SECRET'),'runtime must not use BOOTSTRAP_SECRET');
assert.ok(!publicApi.includes('access_code_hash:row.access_code_hash'),'access code hash must never be serialized deliberately');

assert.ok(classPortalHtml.includes('/portal-compact.css')&&classPortalHtml.includes('/vfa13-reference.css'),'participant portal must use compact VFA13 visual system');
assert.ok(classAdminHtml.includes('/class-portal.css')&&classAdminHtml.includes('/portal-compact.css')&&classAdminHtml.includes('/vfa13-reference.css'),'Klassen-Admin must share participant portal visual system');
assert.ok(classAdminHtml.includes('/class-admin-workspace.js')&&classAdminHtml.includes('/class-admin-portal.js'),'Klassen-Admin must use dedicated scoped controllers');
assert.ok(!classAdminHtml.includes('/boot.js')&&!classAdminHtml.includes('/app.js'),'Klassen-Admin must not fall back to generic admin SPA');
assert.ok(customerAdminHtml.includes('customer-portal-admin')&&customerAdminHtml.includes('/customer-compact.css')&&customerAdminHtml.includes('/vfa13-reference.css'),'customer admin must share compact VFA13 visual language');
assert.ok(vfaReferenceCss.includes('#stundenplan,#aufgaben')&&vfaReferenceCss.includes('flex-wrap:wrap'),'VFA13 priorities and wrapped customer navigation must stay intact');
assert.ok(compactUi.includes("section.id==='uebersicht'")&&compactUi.includes('portal-compact-toggle'),'compact portal behavior must stay intact');
assert.ok(compactCss.includes('.portal-stats,.portal-nav{display:none!important}'),'duplicate portal navigation/stats must stay removed');
assert.ok(customerCompactCss.includes('flex-wrap:wrap')&&!customerCompactCss.includes('overflow-x:auto;white-space:nowrap'),'customer navigation must wrap instead of forcing one long row');
assert.ok(!areaMode.includes('Zur Plattform-Adminseite'),'no customer/class/student UI may advertise the owner platform route');

assert.ok(classAdminPortal.includes('exactRows')&&classAdminPortal.includes('Noch nicht aktiv'),'Klassen-Admin must keep exact class scope and extension teasers');
assert.ok(!classAdminPortal.includes('newCourse'),'Klassen-Admin must never expose course creation');
assert.ok(classWorkspace.includes('[data-action="add-participant"]')&&classWorkspace.includes('[data-user-reset]')&&classWorkspace.includes('[data-member-remove]'),'Klassen-Admin must strip participant-account mutation controls');
assert.ok(classWorkspace.includes('/api/timetable/preview')&&classWorkspace.includes('/api/timetable/apply')&&classWorkspace.includes('/api/content/lessons/'),'Klassen-Admin must support scoped timetable management');
assert.ok(users.includes("requireRole(auth,'tenant_admin')")&&users.includes("m.role='participant'"),'participant account mutations/listing must retain correct admin scope');

assert.ok(platformAdminHtml.includes('/platform-owner-ui.js')&&platformAdminHtml.includes('/owner-security-ui.js')&&platformAdminHtml.includes('/launch-readiness-ui.js'),'owner admin/security/release UI must load only in platform admin');
assert.ok(runtimeRouter.includes('/api/platform/owner/demo-fixture')&&runtimeRouter.includes('platformTenantDetail')&&runtimeRouter.includes('updatePlatformTenant'),'owner APIs must expose tenant editing and demo fixture creation');
assert.ok(platformOwnerUi.includes('owner-edit')&&platformOwnerUi.includes('data-demo-build'),'owner UI must provide customer editing and demo generation');
assert.equal((platformOwner.match(/\['VFA 26\/|\['Kaufleute Büromanagement|\['Fachinformatik Systemintegration|\['Sozialverwaltung/g)||[]).length,20,'demo fixture must define exactly 20 classes');
assert.ok(platformOwner.includes('j<20')&&platformOwner.includes('week<6'),'demo fixture must keep 20 participants per class and six timetable weeks');

assert.ok(String(pkg.scripts?.test||'').includes('tests/security-roles.mjs')&&String(pkg.scripts?.test||'').includes('tests/owner-security.mjs')&&String(pkg.scripts?.test||'').includes('tests/custom-domains.mjs')&&String(pkg.scripts?.test||'').includes('tests/launch-readiness.mjs'),'full security/launch regression suite must run in CI');
const migrations=(await readdir('migrations')).filter(x=>/^\d+_.*\.sql$/.test(x)).sort();
for(const required of ['0035_notifications.sql','0038_module_cancellations.sql','0039_owner_security.sql','0040_custom_domains.sql','0041_launch_readiness.sql'])assert.ok(migrations.includes(required),`required migration missing: ${required}`);
for(let i=1;i<migrations.length;i++)assert.ok(migrations[i]>migrations[i-1],'migration order must be deterministic');

console.log('Release readiness checks: OK');
