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
const classAdminEntry=await text('public/class-admin-entry.js');
const classAdminStudentTools=await text('public/class-admin-student-tools.js');
const teacherPortalHtml=await text('public/dozentenportal.html');
const teacherPortal=await text('public/teacher-portal.js');
const teacherAssignmentUi=await text('public/teacher-assignment-ui.js');
const studentRole=await text('src/core/student-role.ts');
const attendanceRouter=await text('src/core/attendance-router.ts');
const customerAdminHtml=await text('public/customer-admin.html');
const platformAdminHtml=await text('public/platform-admin.html');
const platformDirectLogin=await text('public/platform-direct-login.js');
const platformLazy=await text('public/platform-admin-lazy-modules.js');
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
const vfaRefinementCss=await text('public/vfa13-refinement.css');
const brandingAssistant=await text('public/branding-assistant.js');
const users=await text('src/core/users.ts');
const participantImport=await text('src/core/participant-document-import.ts');
const participantImportUi=await text('public/participant-import-ui.js');
const dataSource=await text('src/core/data.ts');
const brandingSchema=await text('src/core/branding-schema.ts');
const dataBrandingGuard=()=>dataSource.includes('WHITE_BACKGROUND_NOT_ALLOWED')&&dataSource.includes('BRANDING_CONTRAST_TOO_LOW')&&dataSource.includes('accent_color')&&dataSource.includes('surface_color')&&dataSource.includes('text_color');

for(const route of ['/api/*','/public/*','/brand/*','/calendar/*','/portal/*','/einrichtung/*','/plattform-admin*','/kunden-admin*','/klassen-admin*','/zahlung/*','/passwort-vergessen*','/passwort-zuruecksetzen*','/konto-aktivieren*','/impressum*','/datenschutz*','/agb*','/avv*'])assert.ok(wrangler.includes(`"${route}"`),`missing worker-first route ${route}`);
for(const asset of ['public/class-portal.html','public/class-portal.js','public/class-portal.css','public/class-admin-student-tools.js','public/class-admin-entry.js','public/portal-compact.css','public/portal-compact.js','public/vfa13-reference.css','public/customer-admin.html','public/customer-compact.css','public/teacher-assignment-ui.js','public/dozentenportal.html','public/teacher-portal.js','public/participant-import-ui.js','public/platform-admin.html','public/platform-direct-login.js','public/platform-owner-ui.js','public/owner-security-ui.js','public/launch-readiness-ui.js','public/auth-mfa-ui.js','public/account-mail-ui.js','public/account-action.html','public/account-action.js','public/legal-footer-ui.js','public/class-admin.html','public/payment-result.html'])await readFile(asset);
assert.ok(index.includes("clean==='/klassen-admin'?'/class-admin.html'"),'class admin route must serve the student-portal entry shell');
assert.ok(index.includes("['/plattform-admin','/kunden-admin','/klassen-admin'].includes(clean)")&&index.includes("'/platform-admin.html'"),'platform admin route must serve the dedicated platform login/admin shell');
assert.ok(platformAdminHtml.includes('/platform-direct-login.js')&&!platformAdminHtml.includes('/boot.js'),'platform admin shell must not race the generic app startup');
assert.ok(platformDirectLogin.includes("if(user?.isPlatformAdmin)await loadPlatform()")&&platformDirectLogin.includes("if(!d?.user?.isPlatformAdmin)")&&platformDirectLogin.includes('await logout()'),'platform direct login must verify owner role before loading privileged modules');

for(const header of ['x-content-type-options','x-frame-options','referrer-policy','permissions-policy','strict-transport-security','content-security-policy'])assert.ok(index.includes(`'${header}'`),`missing production header ${header}`);
assert.ok(index.includes("headers.set('cache-control','no-store')"),'HTML must be no-store');
assert.ok(index.includes("jsonError('INTERNAL_ERROR',500)"),'unhandled request errors must be sanitized');
assert.ok(index.includes('DELETE FROM login_attempts'),'expired login throttling rows must be cleaned');
assert.ok(index.includes('DELETE FROM platform_mfa_challenges'),'expired MFA challenges must be cleaned');
assert.ok(index.includes('cleanupAccountActions'),'expired account-action secrets must be cleaned');
assert.ok(index.includes('verifyPendingBackups'),'scheduled jobs must verify backup object integrity');

assert.ok(auth.includes('SCRYPT_N=32_768')&&auth.includes('SCRYPT_R=8')&&auth.includes('SCRYPT_P=3'),'new passwords must use the runtime-verified OWASP scrypt profile');
assert.ok(auth.includes('LEGACY_PBKDF2_MIN=100_000')&&auth.includes('LEGACY_PBKDF2_MAX=100_000'),'legacy PBKDF2 support must be narrowly capped at the Worker-supported security floor');
assert.match(auth,/return\s*`scrypt\$\$\{SCRYPT_N\}\$\$\{SCRYPT_R\}\$\$\{SCRYPT_P\}\$/,'new password hashes must be serialized as scrypt');
assert.ok(auth.includes('passwordNeedsUpgrade(u.password_hash)'),'legacy password hashes must upgrade transparently on successful login');
assert.ok(wrangler.includes('nodejs_compat'),'Worker must enable the Node crypto runtime used by scrypt');
assert.ok(auth.includes('PLATFORM_IDLE_MINUTES=30')&&auth.includes('PLATFORM_SESSION_HOURS=12'),'owner sessions must be short and idle-limited');
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
assert.ok(!provision.includes('temporaryPassword:'),'tenant provisioning must not return a temporary admin password');
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
assert.ok(classPortalHtml.includes('/class-admin-student-tools.js'),'class admin extras must be layered into the same participant portal');
assert.ok(publicApi.includes("best==='class_admin'?'participant':best"),'public class portal must expose class admins as participants');
assert.ok(classAdminHtml.includes('/class-portal.css')&&classAdminHtml.includes('/portal-compact.css')&&classAdminHtml.includes('/vfa13-reference.css'),'class admin entry must share participant portal visual system');
assert.ok(classAdminHtml.includes('/class-admin-entry.js')&&!classAdminHtml.includes('/class-admin-portal.js')&&!classAdminHtml.includes('/class-admin-workspace.js'),'class admin route must enter the shared student portal and must not load a separate admin workspace');
assert.ok(classAdminEntry.includes('/portal/')&&classAdminEntry.includes("x.role==='class_admin'"),'class admin entry must resolve its own course and redirect into that portal');
assert.ok(classAdminStudentTools.includes('Klasse verwalten')&&classAdminStudentTools.includes('Noten, Fehlzeiten, Anwesenheiten und Abgaben anderer Schüler sind nicht zugänglich'),'class admin additions must stay safe and in-context');
assert.ok(studentRole.includes('FORBIDDEN_CLASS_ADMIN_STUDENT_DATA')&&studentRole.includes("role:'participant'"),'server-side class admin privacy guard must exist');
assert.ok(teacherPortalHtml.includes('/teacher-portal.js')&&teacherPortal.includes('Unterrichtsklassen')&&teacherPortal.includes('Digitales Klassenbuch'),'dedicated teacher portal must own attendance and classbook workflow');
assert.ok(teacherAssignmentUi.includes('TEACHER_STUDENT_ROLE_CONFLICT')&&customerAdminHtml.includes('/teacher-assignment-ui.js'),'tenant admin must explicitly assign teacher accounts and prevent same-course student/teacher conflicts');
assert.ok(!customerAdminHtml.includes('/attendance-classbook-ui.js'),'customer admin must not host the operational teacher attendance/classbook workspace');
assert.ok(attendanceRouter.includes('teacherAttendanceAuth')&&attendanceRouter.includes('forbidClassAdminStudentData(auth)'),'attendance management must require teacher assignment and explicitly deny class admins');
assert.ok(!classAdminHtml.includes('/boot.js')&&!classAdminHtml.includes('/app.js'),'class admin must not fall back to generic admin SPA');
assert.ok(customerAdminHtml.includes('customer-portal-admin')&&customerAdminHtml.includes('/customer-enterprise.css')&&!customerAdminHtml.includes('/customer-compact.css')&&!customerAdminHtml.includes('/vfa13-reference.css')&&!customerAdminHtml.includes('/role-dashboard.css')&&!customerAdminHtml.includes('/role-dashboard-polish.css'),'customer admin must use its consolidated enterprise admin visual system without student/VFA13 or legacy compact coupling');
assert.ok(vfaReferenceCss.includes('#stundenplan,#aufgaben'),'VFA13 participant priorities must stay intact');
assert.ok(vfaRefinementCss.includes('--portal-surface')&&vfaRefinementCss.includes('--portal-accent'),'portal must consume the complete six-color tenant theme');
assert.ok(dataBrandingGuard(),'six-color branding must reject white backgrounds and unsafe text contrast');
assert.ok(brandingSchema.includes('ensureBrandingSchema')&&brandingSchema.includes('addColumnSafely')&&brandingSchema.includes('ALTER TABLE tenant_settings ADD COLUMN'),'branding schema must self-heal safely when deployment migrations lag');
assert.ok(publicApi.includes('await ensureBrandingSchema(env)')&&dataSource.includes('await ensureBrandingSchema(env)')&&runtimeRouter.includes('/api/platform/system/schema'),'public/settings paths must guard the branding schema and the owner schema endpoint must remain available');
assert.ok(brandingAssistant.includes('Sechs Designvorschläge')&&brandingAssistant.includes('Farben frei zusammenstellen'),'customer branding must offer six suggestions and manual color assembly');
assert.ok(compactUi.includes("section.id==='uebersicht'")&&compactUi.includes('portal-compact-toggle'),'compact portal behavior must stay intact');
assert.ok(compactCss.includes('.portal-stats,.portal-nav{display:none!important}'),'duplicate portal navigation/stats must stay removed');
assert.ok(customerCompactCss.includes('flex-wrap:wrap')&&!customerCompactCss.includes('overflow-x:auto;white-space:nowrap'),'customer navigation must wrap instead of forcing one long row');
assert.ok(!areaMode.includes('Zur Plattform-Adminseite'),'no customer/class/student UI may advertise the owner platform route');

assert.ok(
  users.includes("hasPermission(auth,'participants.manage')")&&
  users.includes("!['participant','guest'].includes(role)")&&
  users.includes("m.role IN ('participant','guest')"),
  'delegated participant managers must stay course-scoped and may create/update only participant or guest memberships, never admin roles'
);
assert.ok(users.includes('CLASS_ADMIN_PARTICIPANT_MANAGED')&&users.includes("ca.role='class_admin'"),'class admin companion student membership must not be independently removed or repurposed');
assert.ok(users.includes("NOT (m.role='participant' AND EXISTS"),'tenant administration must hide the technical duplicate participant row for class admins');
assert.ok(participantImport.includes('PARTICIPANT_IMPORT_PREVIEW_CHANGED')&&participantImport.includes('SPECIAL_CATEGORY_DATA_DETECTED_NOT_IMPORTED'),'participant document imports must be immutable and data-minimising');
assert.ok(participantImportUi.includes('vendor/pdfjs/pdf.mjs')&&participantImportUi.includes('Markierte Teilnehmer übernehmen & einladen'),'customer participant imports must locally extract PDF text and require explicit confirmation');

assert.ok(platformDirectLogin.includes("import('/platform-admin-lazy-modules.js")&&platformDirectLogin.includes("if(user?.isPlatformAdmin)await loadPlatform()"),'verified platform session must install the privileged lazy-module controller');
for(const privileged of ['platform-owner-ui','owner-security-ui','launch-readiness-ui'])assert.ok(platformLazy.includes(`'${privileged}'`),`verified platform lazy controller must retain ${privileged}`);
for(const privileged of ['platform-owner-ui','owner-security-ui','launch-readiness-ui'])assert.ok(!platformDirectLogin.includes(`import('/${privileged}.js`),`heavy privileged module must stay out of platform first paint: ${privileged}`);
assert.ok(runtimeRouter.includes('/api/platform/owner/demo-fixture')&&runtimeRouter.includes('platformTenantDetail')&&runtimeRouter.includes('updatePlatformTenant'),'owner APIs must expose tenant editing and demo fixture creation');
assert.ok(platformOwnerUi.includes('owner-edit')&&platformOwnerUi.includes('data-demo-build'),'owner UI must provide customer editing and demo generation');
assert.equal((platformOwner.match(/\['VFA 26\/|\['Kaufleute Büromanagement|\['Fachinformatik Systemintegration|\['Sozialverwaltung/g)||[]).length,20,'demo fixture must define exactly 20 classes');
assert.ok(platformOwner.includes('j<20')&&platformOwner.includes('week<6'),'demo fixture must keep 20 participants per class and six timetable weeks');

assert.ok(String(pkg.scripts?.test||'').includes('tests/security-roles.mjs')&&String(pkg.scripts?.test||'').includes('tests/enterprise-hierarchy-sso-scim-api.mjs')&&String(pkg.scripts?.test||'').includes('tests/participant-document-import.mjs')&&String(pkg.scripts?.test||'').includes('tests/owner-security.mjs')&&String(pkg.scripts?.test||'').includes('tests/custom-domains.mjs')&&String(pkg.scripts?.test||'').includes('tests/launch-readiness.mjs')&&String(pkg.scripts?.test||'').includes('tests/password-kdf-runtime.mjs'),'full security/enterprise/import/launch/password regression suite must run in CI');
const migrations=(await readdir('migrations')).filter(x=>/^\d+_.*\.sql$/.test(x)).sort();
for(const required of ['0035_notifications.sql','0038_module_cancellations.sql','0039_owner_security.sql','0040_custom_domains.sql','0041_launch_readiness.sql','0042_branding_palette.sql','0048_enterprise_hierarchy_sso_scim_api.sql','0049_participant_document_import.sql','0064_class_admin_student_teacher_portal.sql'])assert.ok(migrations.includes(required),`required migration missing: ${required}`);
for(let i=1;i<migrations.length;i++)assert.ok(migrations[i]>migrations[i-1],'migration order must be deterministic');

console.log('Release readiness checks: OK');