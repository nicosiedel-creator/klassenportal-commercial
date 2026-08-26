import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { provisionTenantFromOnboarding } from '../dist/core/provision.js';

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
assert.match(provision,/sqlite_master[\s\S]*tenant_users/,'provisioning must detect optional tenant-user schema at runtime');
assert.match(provision,/NOT EXISTS\(SELECT 1 FROM memberships WHERE user_id=\?\)/,'orphan-user cleanup must not delete users still used by another tenant');
assert.match(provision,/NOT EXISTS\(SELECT 1 FROM tenant_users WHERE user_id=\?\)/,'orphan-user cleanup must respect tenant lifecycle links when that table exists');

function provisioningEnv(hasTenantUsers){
  const batched=[];
  const prepared=[];
  const DB={
    prepare(sql){
      prepared.push(sql);
      if(!hasTenantUsers&&/\btenant_users\b/i.test(sql)&&!/sqlite_master/i.test(sql))throw new Error('NO_SUCH_TABLE_TENANT_USERS');
      return{
        sql,args:[],
        bind(...args){this.args=args;return this;},
        async first(){
          if(/sqlite_master/i.test(sql))return hasTenantUsers?{ok:1}:null;
          if(/SELECT id FROM tenants WHERE slug/i.test(sql))return null;
          if(/SELECT id FROM plans/i.test(sql))return{id:'provider'};
          if(/SELECT id FROM users WHERE email/i.test(sql))return null;
          return null;
        },
        async run(){return{success:true,meta:{changes:1}};},
      };
    },
    async batch(statements){batched.push(...statements);return statements.map(()=>({success:true,meta:{changes:1}}));},
  };
  return{env:{DB},batched,prepared};
}

for(const hasTenantUsers of [false,true]){
  const fixture=provisioningEnv(hasTenantUsers);
  const result=await provisionTenantFromOnboarding(fixture.env,'onboarding:test',{
    name:hasTenantUsers?'Schema Current GmbH':'Schema Fallback GmbH',
    portal_name:'Testportal',
    admin_name:'Test Admin',
    admin_email:hasTenantUsers?'admin-current@example.invalid':'admin-fallback@example.invalid',
    admin_password:'Mindestens-10-Zeichen!',
    plan_id:'provider',
  });
  assert.ok(result.tenantId.startsWith('ten_'),'provisioning must create a tenant');
  assert.ok(fixture.batched.some(statement=>/INSERT INTO memberships/i.test(statement.sql)),'membership fallback must always be written');
  assert.equal(fixture.batched.some(statement=>/INSERT INTO tenant_users/i.test(statement.sql)),hasTenantUsers,'tenant_users write must follow actual runtime schema availability');
}

console.log('Onboarding activation rollback + runtime-schema provisioning regression: OK');
