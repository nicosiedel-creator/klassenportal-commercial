import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const users=await readFile('src/core/users.ts','utf8');
const provision=await readFile('src/core/provision.ts','utf8');
const recovery=await readFile('src/core/account-recovery.ts','utf8');
const recoveryRouter=await readFile('src/core/account-recovery-router.ts','utf8');
const mail=await readFile('src/core/mail.ts','utf8');
const legal=await readFile('src/core/legal.ts','utf8');
const backups=await readFile('src/core/backup-verification.ts','utf8');
const readiness=await readFile('src/core/launch-readiness.ts','utf8');
const releaseState=await readFile('src/core/production-release-state.ts','utf8');
const index=await readFile('src/index.ts','utf8');
const wrangler=await readFile('wrangler.jsonc','utf8');
const accountPage=await readFile('public/account-action.js','utf8');

assert.doesNotMatch(users,/temporary_password\s*:/,'user creation/reset must never return temporary passwords');
assert.doesNotMatch(provision,/temporaryPassword\s*:/,'tenant provisioning must never return a temporary admin password');
assert.match(users,/createActivationForUser/,'new users must use activation links');
assert.match(users,/createAdminPasswordReset/,'admin password reset must use a reset link');
assert.match(provision,/MAIL_PROVIDER_NOT_CONFIGURED/,'manual tenant provisioning must fail closed if activation mail cannot be delivered');

assert.match(recovery,/sha256Text\(raw\)/,'account action tokens must be stored only as hashes');
assert.match(recovery,/RESET_MINUTES=30/,'password reset token must expire quickly');
assert.match(recovery,/ACTIVATION_HOURS=48/,'activation link must have a finite expiry');
assert.match(recovery,/is_platform_admin===1\)return\{accepted:true\}/,'owner password reset must not be exposed through public email recovery');
assert.match(recovery,/DELETE FROM sessions WHERE user_id=\?/,'password reset must revoke active sessions');
assert.match(recoveryRouter,/SELECT id FROM memberships WHERE tenant_id=\? AND user_id=\?/,'tenant admin may only resend activation for a user in the selected tenant');
assert.match(accountPage,/Aus Sicherheitsgründen zeigen wir nicht an/,'forgot-password UI must explain non-enumerating response behavior');

assert.match(mail,/https:\/\/api\.resend\.com\/emails/,'transactional mail must use the provider HTTPS endpoint');
assert.match(mail,/Bearer \$\{key\}/,'mail provider token must be sent as bearer authorization');
assert.match(mail,/user-agent/,'direct mail API calls must send a User-Agent');
assert.match(mail,/idempotency-key/,'transactional mail must be idempotency protected');
assert.ok(!mail.includes('console.log(key)')&&!mail.includes('RESEND_API_KEY:'),'mail API secret must never be logged or serialized');

assert.match(legal,/u\.protocol!=='https:'/,'legal URLs must be HTTPS');
for(const f of ['legal_notice_url','privacy_url','terms_url','dpa_url','support_email'])assert.ok(legal.includes(f),`required legal field missing: ${f}`);

assert.match(backups,/manifest\.version!==1/,'backup verification must validate manifest identity/version');
assert.match(backups,/manifest\.resources\.map/,'backup verification must verify every resource object');
assert.match(backups,/manifest\.files\.map/,'backup verification must verify every backed-up file object');
assert.match(backups,/Last|./); // keeps file parsed before readiness assertions
assert.match(readiness,/Stripe läuft noch nicht mit Live-Schlüssel/,'production readiness must require live Stripe');
assert.match(readiness,/Eigentümer-MFA ist nicht aktiviert/,'production readiness must require owner MFA');
assert.match(readiness,/Transaktions-E-Mail ist nicht vollständig konfiguriert/,'production readiness must require transactional mail');
assert.match(readiness,/Rechtliche Unterlagen/,'production readiness must require legal configuration');
assert.match(readiness,/Backup-Sicherheit nicht erfüllt/,'production readiness must require verified current backups');
assert.match(releaseState,/\.workers\.dev/,'preview Worker origin must never count as production-ready');
assert.match(readiness,/CLOUDFLARE_SAAS_CNAME_TARGET/,'production readiness must require custom-domain provider when that module is sold');

for(const route of ['/passwort-vergessen','/passwort-zuruecksetzen','/konto-aktivieren','/impressum','/datenschutz','/agb','/avv'])assert.ok(index.includes(`'${route}'`)||wrangler.includes(`"${route}*"`),`launch route missing: ${route}`);
assert.match(index,/verifyPendingBackups/,'scheduled job must automatically verify backups');
assert.match(index,/cleanupAccountActions/,'scheduled job must clean expired account actions');

console.log('Launch readiness, account recovery and backup verification tests: OK');
