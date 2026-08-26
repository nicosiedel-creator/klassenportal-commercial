import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { provisionTenantFromOnboarding } from '../dist/core/provision.js';
import { createPaidBookingFromAcceptedOffer } from '../dist/core/accepted-offer-fulfillment.js';

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

function sqliteD1(db){
  function statement(sql,args=[]){
    return{
      sql,args,
      bind(...bound){return statement(sql,bound);},
      async first(){return db.prepare(sql).get(...args)??null;},
      async all(){return{success:true,results:db.prepare(sql).all(...args)};},
      async run(){const info=db.prepare(sql).run(...args);return{success:true,meta:{changes:Number(info.changes)}};},
    };
  }
  return{
    prepare(sql){return statement(sql);},
    async batch(statements){
      db.exec('BEGIN IMMEDIATE');
      try{
        const results=statements.map(item=>{const info=db.prepare(item.sql).run(...item.args);return{success:true,meta:{changes:Number(info.changes)}};});
        db.exec('COMMIT');
        return results;
      }catch(error){db.exec('ROLLBACK');throw error;}
    },
  };
}

// Exercise the real persistence statements against the schema produced by every current migration.
const db=new DatabaseSync(':memory:');
db.exec('PRAGMA foreign_keys=ON');
for(const filename of (await readdir('migrations')).filter(name=>name.endsWith('.sql')).sort()){
  db.exec(await readFile(`migrations/${filename}`,'utf8'));
}
const fullEnv={DB:sqliteD1(db),PAYMENTS_ENABLED:'false'};
const fullProvision=await provisionTenantFromOnboarding(fullEnv,'onboarding:full-schema',{
  name:'Full Schema GmbH',portal_name:'Full Schema Portal',admin_name:'Full Admin',admin_email:'full-admin@example.invalid',admin_password:'Mindestens-10-Zeichen!',plan_id:'provider',
});
assert.ok(db.prepare('SELECT 1 FROM tenant_users WHERE tenant_id=? AND user_id=?').get(fullProvision.tenantId,fullProvision.adminUserId),'current schema must persist the tenant-user relationship');
assert.ok(db.prepare("SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='tenant_admin'").get(fullProvision.tenantId,fullProvision.adminUserId),'current schema must persist the tenant-admin membership');

const now=new Date().toISOString(),later=new Date(Date.now()+86400000).toISOString();
db.prepare("INSERT INTO onboarding_invitations(id,token_hash,customer_email,plan_id,status,expires_at,created_by,created_at) VALUES(?,?,?,?, 'open',?,?,?)")
  .run('oni_full_schema','hash-full-schema','customer@example.invalid','provider',later,'platform-test',now);
db.prepare(`INSERT INTO commercial_quotes(id,quote_number,onboarding_invitation_id,tenant_id,plan_id,requested_courses,currency,recurring_monthly_cents,setup_cents,first_total_cents,status,valid_until,pricing_snapshot_json,accepted_at,created_at,updated_at,offer_kind,billing_cycle)
  VALUES(?,?,NULL,NULL,?,?,?,?,?,?,'accepted',?,?,?,?,?,'paid','monthly')`)
  .run('quo_full_schema','ANG-FULL-SCHEMA','provider',7,'EUR',12900,4900,17800,later,JSON.stringify({offerKind:'paid',recurringMonthlyCents:12900,managedSetupCents:4900,firstTotalCents:17800,manualPricing:false}),now,now,now);
const fulfilled=await createPaidBookingFromAcceptedOffer(fullEnv,{tenantId:fullProvision.tenantId,quoteId:'quo_full_schema',invitationId:'oni_full_schema',actorId:'onboarding:full-schema'});
assert.equal(fulfilled.status,'active');
assert.equal(fulfilled.paymentProcessing,'disabled');
assert.equal(db.prepare('SELECT status FROM commercial_orders WHERE quote_id=?').get('quo_full_schema').status,'active');
assert.equal(db.prepare('SELECT status FROM commercial_invoices WHERE tenant_id=?').get(fullProvision.tenantId).status,'draft');
assert.equal(db.prepare('SELECT status FROM subscriptions WHERE tenant_id=?').get(fullProvision.tenantId).status,'active');
assert.equal(db.prepare('SELECT tenant_id FROM commercial_quotes WHERE id=?').get('quo_full_schema').tenant_id,fullProvision.tenantId);
db.close();

console.log('Onboarding activation rollback + schema-drift fallback + full migrated-schema persistence regression: OK');
