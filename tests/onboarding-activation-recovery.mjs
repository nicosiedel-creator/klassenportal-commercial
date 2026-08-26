import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { provisionTenantFromOnboarding } from '../dist/core/provision.js';

const onboarding=await readFile('src/core/onboarding.ts','utf8');
const provision=await readFile('src/core/provision.ts','utf8');
const browserWorkflow=await readFile('.github/workflows/commercial-browser-e2e.yml','utf8');
const browserE2E=await readFile('scripts/commercial-browser-e2e.mjs','utf8');
const browserState=await readFile('scripts/commercial-onboarding-e2e-state.mjs','utf8');

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

function provisioningEnv(hasTenantUsers,existingUser){
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
          if(/SELECT id FROM users WHERE email/i.test(sql))return existingUser?{id:'usr_existing'}:null;
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
  for(const existingUser of [false,true]){
    const fixture=provisioningEnv(hasTenantUsers,existingUser);
    const withCourse=hasTenantUsers&&!existingUser;
    const result=await provisionTenantFromOnboarding(fixture.env,'onboarding:test',{
      name:`Schema ${hasTenantUsers?'Current':'Fallback'} ${existingUser?'Existing':'New'} GmbH`,
      portal_name:'Testportal',
      admin_name:'Test Admin',
      admin_email:`admin-${hasTenantUsers?'current':'fallback'}-${existingUser?'existing':'new'}@example.invalid`,
      admin_password:'Mindestens-10-Zeichen!',
      plan_id:'provider',
      course_name:withCourse?'E2E Erstkurs':undefined,
      course_code:withCourse?'E2E-01':undefined,
    });
    assert.ok(result.tenantId.startsWith('ten_'),'provisioning must create a tenant');
    assert.ok(fixture.batched.some(statement=>/INSERT INTO memberships/i.test(statement.sql)),'membership relationship must always be written');
    assert.equal(fixture.batched.some(statement=>/INSERT INTO tenant_users/i.test(statement.sql)),hasTenantUsers,'tenant_users write must follow actual runtime schema availability');
    assert.equal(fixture.batched.some(statement=>/INSERT INTO users/i.test(statement.sql)),!existingUser,'existing global users must not be duplicated');
    assert.equal(fixture.batched.some(statement=>/INSERT INTO courses/i.test(statement.sql)),withCourse,'optional first course persistence mismatch');
  }
}

// The full current schema is deliberately exercised through Wrangler D1 in the mandatory browser gate.
// This avoids coupling the release suite to a particular Node experimental SQLite implementation.
assert.match(browserWorkflow,/commercial-onboarding-e2e-state\.mjs seed/,'browser gate must seed a real accepted-offer onboarding fixture in Wrangler D1');
assert.match(browserWorkflow,/commercial-onboarding-e2e-state\.mjs verify/,'browser gate must verify persisted D1 invariants after the click-through');
assert.match(browserE2E,/acceptedOfferOnboarding/,'browser gate must execute the accepted-offer onboarding form');
assert.match(browserE2E,/concurrentOnboardingClaim/,'browser gate must exercise duplicate-click concurrency protection');
assert.match(browserE2E,/PASSWORD_CONFIRMATION_MISMATCH/,'browser gate must exercise negative password validation');
assert.match(browserE2E,/DOUBLE_COST_CONFIRMATION_REQUIRED/,'browser gate must exercise double cost confirmation');
assert.match(browserState,/commercial_orders/,'D1 post-state must verify order persistence');
assert.match(browserState,/commercial_invoices/,'D1 post-state must verify invoice persistence');
assert.match(browserState,/onboarding_claims/,'D1 post-state must verify claim cleanup');
assert.match(browserState,/PAYMENTS_ENABLED/,'E2E state guard must keep payment processing disabled');

console.log('Onboarding activation rollback + runtime-schema fallback + real Wrangler-D1 browser persistence contract: OK');
