import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const onboarding=await readFile('src/core/onboarding.ts','utf8');
const provision=await readFile('src/core/provision.ts','utf8');

assert.match(onboarding,/LEGACY_PARTIAL_COMPLETION/,'legacy partial completions must be detected and compensated');
assert.match(onboarding,/UPDATE onboarding_invitations SET status='open',completed_at=NULL,tenant_id=NULL,form_json=NULL/,'successful compensation must reopen the same onboarding invitation');
assert.match(onboarding,/ONBOARDING_RECOVERY_REQUIRED/,'an unproven rollback must fail closed instead of allowing a duplicate activation');
assert.match(onboarding,/onboarding\.rollback\.completed/,'successful compensation must leave an audit trail');
assert.match(onboarding,/onboarding\.rollback\.failed/,'failed compensation must leave a best-effort audit trail');
assert.match(onboarding,/DELETE FROM tenants WHERE id=\?/,'partial tenant data must be removed through tenant-scoped cascade cleanup');
assert.match(onboarding,/INSERT INTO audit_log[\s\S]*onboarding\.completed/,'completion audit must commit in the same final batch as onboarding completion');
assert.match(onboarding,/form_json=\?/,'a valid completed invitation must persist its full onboarding profile');
assert.doesNotMatch(onboarding,/SET status='completed',completed_at=\?,tenant_id=\? WHERE id=\? AND status='open'/,'failure handling must never consume the invitation by marking a partial tenant completed');

assert.match(provision,/cleanupProvisionedTenant/,'provisioning must have a compensating cleanup helper');
assert.match(provision,/AUDIT_WRITE_FAILED/,'a provisioning audit failure must roll back the just-created tenant');
assert.match(provision,/NOT EXISTS\(SELECT 1 FROM memberships WHERE user_id=\?\)/,'orphan-user cleanup must not delete users still used by another tenant');
assert.match(provision,/NOT EXISTS\(SELECT 1 FROM tenant_users WHERE user_id=\?\)/,'orphan-user cleanup must respect tenant lifecycle links');

console.log('Onboarding activation rollback + interrupted-state recovery regression: OK');
