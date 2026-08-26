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
assert.match(provision,/PRAGMA table_info\(tenant_users\)/,'provisioning must inspect the actual tenant_users column shape');
assert.match(provision,/TENANT_USERS_SCHEMA_INCOMPATIBLE/,'an unusable tenant_users shape must fail with a stable symbolic error');
assert.match(provision,/tenantUserStatement/,'tenant_users persistence must adapt to compatible partial schemas');
assert.match(provision,/NOT EXISTS\(SELECT 1 FROM memberships WHERE user_id=\?\)/,'orphan-user cleanup must not delete users still used by another tenant');
assert.match(provision,/NOT EXISTS\(SELECT 1 FROM tenant_users WHERE user_id=\?\)/,'orphan-user cleanup must respect tenant lifecycle links when that table exists');

const CURRENT_TENANT_USERS=['tenant_id','user_id','status','external_id','source','created_at','updated_at'];
const LEGACY_TENANT_USERS=['tenant_id','user_id','status','created_at','updated_at'];

function provisioningEnv(tenantUsersColumns,existingUser){
  const batched=[];
  const prepared=[];
  const DB={
    prepare(sql){
      prepared.push(sql);
      const hasTenantUsers=Array.isArray(tenantUsersColumns);
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
        async all(){
          if(/PRAGMA table_info\(tenant_users\)/i.test(sql))return{results:(tenantUsersColumns??[]).map((name,index)=>({name,notnull:['tenant_id','user_id','status','source','created_at','updated_at'].includes(name)?1:0,dflt_value:name==='status'?"'active'":name==='source'?"'manual'":null,pk:name==='tenant_id'||name==='user_id'?index+1:0}))};
          return{results:[]};
        },
        async run(){return{success:true,meta:{changes:1}};},
      };
    },
    async batch(statements){batched.push(...statements);return statements.map(()=>({success:true,meta:{changes:1}}));},
  };
  return{env:{DB},batched,prepared};
}

for(const tenantUsersColumns of [null,LEGACY_TENANT_USERS,CURRENT_TENANT_USERS]){
  for(const existingUser of [false,true]){
    const fixture=provisioningEnv(tenantUsersColumns,existingUser);
    const hasTenantUsers=Array.isArray(tenantUsersColumns);
    const withCourse=hasTenantUsers&&!existingUser;
    const label=tenantUsersColumns===CURRENT_TENANT_USERS?'Current':tenantUsersColumns===LEGACY_TENANT_USERS?'Legacy':'Fallback';
    const result=await provisionTenantFromOnboarding(fixture.env,'onboarding:test',{
      name:`Schema ${label} ${existingUser?'Existing':'New'} GmbH`,
      portal_name:'Testportal',
      admin_name:'Test Admin',
      admin_email:`admin-${label.toLowerCase()}-${existingUser?'existing':'new'}@example.invalid`,
      admin_password:'Mindestens-10-Zeichen!',
      plan_id:'provider',
      course_name:withCourse?'E2E Erstkurs':undefined,
      course_code:withCourse?'E2E-01':undefined,
    });
    assert.ok(result.tenantId.startsWith('ten_'),'provisioning must create a tenant');
    assert.ok(fixture.batched.some(statement=>/INSERT INTO memberships/i.test(statement.sql)),'membership relationship must always be written');
    const tenantUserInsert=fixture.batched.find(statement=>/INSERT INTO tenant_users/i.test(statement.sql));
    assert.equal(!!tenantUserInsert,hasTenantUsers,'tenant_users write must follow actual runtime schema availability');
    if(tenantUsersColumns===LEGACY_TENANT_USERS){
      assert.doesNotMatch(tenantUserInsert.sql,/external_id|source/,'legacy-compatible tenant_users writes must not reference columns that are absent');
      assert.match(tenantUserInsert.sql,/tenant_id,user_id,status,created_at,updated_at/,'legacy-compatible tenant_users write must preserve the required lifecycle relationship');
    }
    if(tenantUsersColumns===CURRENT_TENANT_USERS)assert.match(tenantUserInsert.sql,/external_id,source,created_at,updated_at/,'current tenant_users write must persist the full lifecycle shape');
    assert.equal(fixture.batched.some(statement=>/INSERT INTO users/i.test(statement.sql)),!existingUser,'existing global users must not be duplicated');
    assert.equal(fixture.batched.some(statement=>/INSERT INTO courses/i.test(statement.sql)),withCourse,'optional first course persistence mismatch');
  }
}

const incompatible=provisioningEnv(['tenant_id','user_id'],false);
await assert.rejects(()=>provisionTenantFromOnboarding(incompatible.env,'onboarding:test',{
  name:'Schema Incompatible GmbH',portal_name:'Testportal',admin_name:'Test Admin',admin_email:'schema-incompatible@example.invalid',admin_password:'Mindestens-10-Zeichen!',plan_id:'provider',
}),/TENANT_USERS_SCHEMA_INCOMPATIBLE/,'missing lifecycle columns must fail before any tenant batch is written');
assert.equal(incompatible.batched.length,0,'incompatible tenant_users schema must not partially provision a tenant');

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

console.log('Onboarding activation rollback + partial runtime-schema compatibility + real Wrangler-D1 browser persistence contract: OK');
