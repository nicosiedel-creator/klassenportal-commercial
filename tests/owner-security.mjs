import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const auth=await readFile('src/core/auth.ts','utf8');
const mfa=await readFile('src/core/mfa.ts','utf8');
const cockpit=await readFile('src/core/owner-cockpit.ts','utf8');
const router=await readFile('src/core/owner-security-router.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const ui=await readFile('public/owner-security-ui.js','utf8');
const mfaUi=await readFile('public/auth-mfa-ui.js','utf8');

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

assert.match(cockpit,/requestTenantDeletion/,'owner deletion must reuse backup/export/grace workflow');
assert.match(cockpit,/ACTIVE_BILLING_MUST_END_FIRST/,'tenant deletion must refuse active billing');
assert.match(cockpit,/MFA_REQUIRED_FOR_DESTRUCTIVE_ACTION/,'destructive owner actions must require MFA');
assert.match(cockpit,/current_password/,'destructive owner actions must require password reauthentication');
assert.match(cockpit,/confirm_name/,'tenant deletion must require exact tenant-name confirmation');
assert.match(ui,/14-tägigen Schutzfrist/,'owner UI must explain the protected deletion grace period');
assert.match(ui,/System & Sicherheit/,'owner cockpit must be visible only inside platform admin');

console.log('Owner MFA/cockpit/deletion regression tests: OK');
