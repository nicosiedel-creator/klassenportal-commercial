import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const auth=await readFile('src/core/auth.ts','utf8');
const mfa=await readFile('src/core/mfa.ts','utf8');
const cockpit=await readFile('src/core/owner-cockpit.ts','utf8');
const router=await readFile('src/core/owner-security-router.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const ui=await readFile('public/owner-security-ui.js','utf8');
const mfaUi=await readFile('public/auth-mfa-ui.js','utf8');
const platformHtml=await readFile('public/platform-admin.html','utf8');
const platformLogin=await readFile('public/platform-direct-login.js','utf8');

assert.match(auth,/ownerMfaEnabled/,'owner login must check MFA state before issuing a session');
assert.match(auth,/mfaRequired:true/,'owner login must return an MFA challenge instead of a session when MFA is enabled');
assert.match(mfa,/AES-GCM/,'TOTP seed must be encrypted at rest');
assert.match(mfa,/OWNER_MFA_ENCRYPTION_KEY/,'MFA encryption must use a dedicated server secret');
assert.match(mfa,/TOTP_STEP=30/,'TOTP must use a 30 second step');
assert.match(mfa,/last_counter/,'TOTP verification must track last accepted counter to reject replay');
assert.match(mfa,/MAX_CHALLENGE_ATTEMPTS=5/,'MFA challenge must be rate limited');
assert.match(mfa,/used_at IS NULL/,'recovery codes must be single-use');
assert.match(router,/\/api\/auth\/mfa\/verify/,'MFA verification endpoint must be routed before generic auth');
assert.match(index,/handleOwnerSecurityApi/,'owner security router must be wired into the worker');
assert.match(mfaUi,/challenge_token/,'login UI must complete the MFA challenge before normal app startup');
assert.match(mfaUi,/requested==='\/plattform-admin'&&!user\?\.isPlatformAdmin/,'non-platform users must not be redirected into platform admin');

assert.match(index,/const asset=clean==='\/kunden-admin'\?'\/customer-admin\.html':clean==='\/klassen-admin'\?'\/class-admin\.html':'\/platform-admin\.html'/,'platform admin route must serve its login shell without requiring a pre-existing owner session');
assert.doesNotMatch(platformHtml,/src="\/boot\.js/,'platform admin shell must not start generic boot before platform authentication is resolved');
assert.match(platformHtml,/platform-direct-login\.js/,'platform admin shell must use the dedicated direct-login entry');
assert.match(platformLogin,/Dieses Konto hat keinen Plattform-Admin-Zugang/,'direct platform login must reject customer accounts');
assert.match(platformLogin,/\/api\/auth\/logout/,'direct platform login must replace an existing non-platform browser session');
assert.match(platformLogin,/await import\('\/boot\.js/,'platform UI may only start after a verified platform session');
assert.doesNotMatch(platformLogin,/location\.replace\('\/kunden-admin'\)/,'platform entry must never bounce back to customer admin');

assert.match(cockpit,/requestTenantDeletion/,'owner deletion must reuse backup/export/grace workflow');
assert.match(cockpit,/ACTIVE_BILLING_MUST_END_FIRST/,'tenant deletion must refuse active billing');
assert.match(cockpit,/MFA_REQUIRED_FOR_DESTRUCTIVE_ACTION/,'destructive owner actions must require MFA');
assert.match(cockpit,/current_password/,'destructive owner actions must require password reauthentication');
assert.match(cockpit,/confirm_name/,'tenant deletion must require exact tenant-name confirmation');
assert.match(ui,/14-tägigen Schutzfrist/,'owner UI must explain the protected deletion grace period');
assert.match(ui,/System & Sicherheit/,'owner cockpit must be visible only inside platform admin');

console.log('Owner MFA/cockpit/direct-platform-login regression tests: OK');
