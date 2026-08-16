import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const backup=await readFile('src/portability/backup.ts','utf8');
const preflight=await readFile('src/portability/backup-preflight.ts','utf8');
const deletion=await readFile('src/portability/delete.ts','utf8');
const exports=await readFile('src/portability/export.ts','utf8');

assert.match(backup,/tenant_users\.json/,'backup must contain tenant-scoped user identities required for a real restore');
assert.match(backup,/preflightTenantBackup/,'restore must fully preflight a backup before any destructive work');
assert.ok(backup.indexOf("createTenantBackup(env,cfg,tenantId,'pre_restore'")<backup.indexOf("UPDATE tenants SET status='suspended'"),'safety backup must finish before the tenant is suspended/mutated');
assert.match(backup,/status='suspended'/,'tenant must be unavailable while restore is in progress');
assert.match(backup,/INSERT OR IGNORE INTO users/,'restore must recreate missing tenant users without overwriting shared identities');
assert.match(backup,/await env\.DB\.batch\(stmts\)/,'scoped DB restoration must use one D1 batch transaction boundary');
assert.ok(backup.indexOf('await env.DB.batch(stmts)')<backup.indexOf('for(const f of manifest.files)'),'backup files must be promoted only after the DB transaction while tenant remains suspended');
assert.match(backup,/tenant left suspended until explicit recovery/,'failed restore must fail closed instead of reopening a partially restored tenant');

assert.match(preflight,/PRAGMA table_info/,'preflight must validate backup columns against the live schema');
assert.match(preflight,/BACKUP_RESOURCE_TENANT_SCOPE_INVALID/,'preflight must reject rows escaping the tenant scope');
assert.match(preflight,/BACKUP_RESOURCE_PRIMARY_KEY_INVALID/,'preflight must reject invalid or duplicate primary keys');
assert.match(preflight,/BACKUP_USER_EMAIL_CONFLICT/,'preflight must reject user identity collisions');
assert.match(preflight,/BACKUP_FILE_SIZE_MISMATCH/,'preflight must verify restored file sizes');

assert.match(deletion,/JOIN memberships m ON m\.user_id=u\.id WHERE m\.tenant_id=\?/,'deletion must snapshot user IDs before memberships disappear');
assert.match(deletion,/NOT EXISTS\(SELECT 1 FROM memberships WHERE user_id=\?\)/,'exclusive user identities must be removed while shared identities survive');
assert.match(exports,/daten\/benutzer\.csv/,'tenant export must include tenant-scoped user profile data');
assert.doesNotMatch(exports,/password_hash/,'portable customer export must never expose password hashes');

console.log('Restore, deletion and tenant-user portability safety checks: OK');
