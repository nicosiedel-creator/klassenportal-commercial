import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';

const auth=await readFile('src/core/auth.ts','utf8');
const enterprise=await readFile('src/core/enterprise-access.ts','utf8');
const provision=await readFile('src/core/provision.ts','utf8');
const tenantUserBackfill=await readFile('migrations/0063_tenant_user_access_integrity.sql','utf8');
const cockpit=await readFile('src/core/owner-cockpit.ts','utf8');
const router=await readFile('src/core/owner-security-router.ts','utf8');
const teacherCore=await readFile('src/core/teacher-portal.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const ui=await readFile('public/owner-security-ui.js','utf8');
const customerHtml=await readFile('public/customer-admin.html','utf8');
const classHtml=await readFile('public/class-admin.html','utf8');
const classPortalHtml=await readFile('public/class-portal.html','utf8');
const teacherHtml=await readFile('public/dozentenportal.html','utf8');
const platformHtml=await readFile('public/platform-admin.html','utf8');
const platformLogin=await readFile('public/platform-direct-login.js','utf8');

for(const file of ['src/core/mfa.ts','public/auth-mfa-ui.js','public/admin-mfa-enrollment-ui.js']){let exists=true;try{await access(file);}catch{exists=false;}assert.equal(exists,false,`${file} must be removed`);}
for(const [name,text] of Object.entries({auth,router,teacherCore,index,customerHtml,classHtml,teacherHtml,platformHtml})){
  assert.doesNotMatch(text,/\bmfa\b|MFA_|mfaRequired|platform_mfa|TOTP|recovery code/i,`${name} must not retain an MFA runtime/UI dependency`);
}
assert.match(auth,/return issueSession\(env,u\.id,!!u\.is_platform_admin,'password',undefined,request\)/,'successful password login must issue the session directly');
assert.match(auth,/PLATFORM_ORIGIN_MISMATCH/,'platform-admin sessions must remain bound to the configured platform origin');
assert.match(auth,/checkLoginRate/,'password login must remain rate limited');
assert.match(auth,/SCRYPT_N=32_768/,'password hashing must use the hardened scrypt configuration');
assert.match(auth,/constantTimeEqual/,'password verification must use constant-time comparison');

assert.match(auth,/tableExists\(env,'tenant_users'\)/,'modern tenant access must be detected explicitly before any legacy fallback');
assert.match(auth,/if\(!tenantUsersTable\)\{const m=await env\.DB\.prepare\('SELECT tenant_id,course_id,role FROM memberships WHERE user_id=\?'/,'legacy membership fallback is allowed only when tenant_users is proven absent');
assert.doesNotMatch(auth,/\}catch\{\s*const m=await env\.DB\.prepare\('SELECT tenant_id,course_id,role FROM memberships WHERE user_id=\?'/,'tenant access query failures must never silently downgrade to legacy memberships');
assert.match(auth,/FROM memberships m JOIN tenant_users tu ON tu\.tenant_id=m\.tenant_id AND tu\.user_id=m\.user_id WHERE m\.user_id=\? AND tu\.status='active'/,'modern membership access must require an explicit active tenant relationship');
assert.match(auth,/FROM org_permission_grants g JOIN tenant_users tu ON tu\.tenant_id=g\.tenant_id AND tu\.user_id=g\.user_id/,'delegated grants must require an explicit tenant relationship');
assert.doesNotMatch(auth,/COALESCE\(tu\.status,'active'\)/,'missing tenant-user rows must never be interpreted as active');
assert.match(auth,/Promise\.all\(\['org_permission_grants','org_units','course_org_units'\]\.map\(name=>tableExists\(env,name\)\)\)/,'delegated access must explicitly detect its schema before use');
assert.match(auth,/if\(orgTables\.every\(Boolean\)\)/,'missing delegated-access schema must grant no extra delegated roles');
assert.match(auth,/if\(!await tableExists\(env,'tenant_sso_configs'\)\)return/,'legacy databases may skip SSO only when the SSO table is proven absent');
assert.doesNotMatch(auth,/enforceTenantSso[\s\S]{0,700}catch\(e\)/,'SSO query failures must propagate');
assert.match(auth,/if\(tenantId\)\{if\(!a\.isPlatformAdmin&&!await tenantUserActive\(env,tenantId,s\.userId\)\)throw new Error\('TENANT_ACCESS_SUSPENDED'\)/,'platform admins must not require tenant_users membership for selected tenant administration');
assert.match(enterprise,/sqlite_master WHERE type='table' AND name='tenant_users'/,'tenant status fallback requires proven legacy schema');
assert.doesNotMatch(enterprise,/tenantUserActive[\s\S]{0,350}catch\{return true;\}/,'tenant access query failures must never be treated as active');
assert.match(enterprise,/return !!x&&x\.status==='active'/,'modern tenant access must require active tenant_users row');
const provisionTenantUser=provision.indexOf('INSERT INTO tenant_users'),provisionMembership=provision.indexOf('INSERT INTO memberships');
assert.ok(provisionTenantUser>=0&&provisionMembership>provisionTenantUser,'tenant provisioning must establish tenant_users before membership');
assert.match(provision,/ON CONFLICT\(tenant_id,user_id\) DO UPDATE SET status='active'/,'tenant provisioning must reconcile relationship explicitly');
assert.match(tenantUserBackfill,/INSERT OR IGNORE INTO tenant_users/,'access migration must backfill idempotently');
assert.doesNotMatch(tenantUserBackfill,/UPDATE tenant_users SET status='active'/,'backfill must never reactivate suspended relationship');

assert.match(teacherCore,/FORBIDDEN_TEACHER_COURSE/,'teacher course assignment remains the authorization gate');
assert.doesNotMatch(teacherCore,/platform_mfa|MFA_|authMethod!=='mfa'/,'teacher portal must be password-only with no MFA dependency');
assert.match(index,/handleOwnerSecurityApi/,'owner security router must remain wired');
assert.match(index,/handleCloudflareInboundEmail/,'Cloudflare inbound email handler must be wired');

assert.match(index,/const asset=clean==='\/kunden-admin'\?'\/customer-admin\.html':clean==='\/klassen-admin'\?'\/class-admin\.html':'\/platform-admin\.html'/,'platform admin route must serve dedicated shell');
assert.doesNotMatch(platformHtml,/src="\/boot\.js/,'platform shell must not boot generic app before authentication');
assert.match(platformHtml,/platform-direct-login\.js/,'platform shell must use direct-login entry');
assert.match(platformLogin,/Dieses Konto hat keinen Plattform-Admin-Zugang/,'direct platform login must reject customer accounts');
assert.match(platformLogin,/\/api\/auth\/logout/,'direct login must replace a non-platform browser session');
assert.match(platformLogin,/await import\('\/boot\.js/,'platform UI may start only after verified platform session');
assert.doesNotMatch(platformLogin,/location\.replace\('\/kunden-admin'\)/,'platform entry must not bounce to customer admin');

assert.match(cockpit,/verifyOwnerPassword/,'destructive platform actions must reauthenticate using the current password');
assert.match(cockpit,/CURRENT_PASSWORD_REQUIRED/,'missing current password must fail closed');
assert.match(cockpit,/CURRENT_PASSWORD_INVALID/,'wrong current password must fail closed');
assert.match(cockpit,/confirm_name/,'tenant deletion must require exact tenant-name confirmation');
assert.match(cockpit,/confirm_phrase/,'final deletion must require an action-specific confirmation phrase');
assert.match(cockpit,/ACTIVE_BILLING_MUST_END_FIRST/,'tenant deletion must refuse active billing');
assert.match(cockpit,/DELETE:\$\{tenantId\}/,'final deletion must retain the exact destructive confirmation token');
assert.match(ui,/14-tägigen Schutzfrist/,'owner UI must explain deletion grace period');
assert.match(ui,/System & Sicherheit/,'owner cockpit must remain visible only inside platform admin');
assert.match(ui,/confirm_phrase/,'owner UI must submit the exact final-deletion phrase');
assert.doesNotMatch(ui,/second factor|authenticator|recovery code/i,'owner UI must remain password-only');
assert.match(classPortalHtml,/portal-lazy-runtime\.js/,'shared student portal must retain audited lazy runtime');

console.log('Owner/admin/teacher password-only security, no-MFA contract, tenant isolation, SSO fail-closed, destructive re-auth and platform-origin regression tests: OK');
