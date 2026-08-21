import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const migration=await readFile('migrations/0082_teams_chat_core.sql','utf8');
const prefix=migration.split('-- One-time OAuth state.')[0];

assert.ok(!/INSERT\s+INTO\s+feature_flags/i.test(prefix),'0082 must not insert entitlement-protected feature flags');
assert.ok(!/UPDATE\s+feature_flags/i.test(prefix),'0082 must not update entitlement-protected feature flags');
assert.ok(prefix.includes('FEATURE_NOT_ENTITLED'),'production strict entitlement guard must remain documented in migration rationale');

// Reproduce both historical production guards. Any attempt to turn the legacy
// Teams/M365 feature keys on without an active entitlement must fail closed,
// regardless of whether the write claims to be manual or plan-managed.
const db=new DatabaseSync(':memory:');
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE tenants(id TEXT PRIMARY KEY);
  CREATE TABLE feature_flags(
    tenant_id TEXT NOT NULL,
    feature_key TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    source TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(tenant_id,feature_key)
  );
  CREATE TABLE tenant_module_entitlements(
    tenant_id TEXT NOT NULL,
    feature_key TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TABLE module_subscription_changes(
    tenant_id TEXT NOT NULL,
    feature_key TEXT NOT NULL,
    status TEXT NOT NULL
  );
  CREATE TRIGGER trg_paid_module_feature_insert
  BEFORE INSERT ON feature_flags
  WHEN NEW.enabled=1
   AND NEW.source='manual'
   AND NEW.feature_key IN ('microsoft_365','microsoft_teams','statistics','surveys','substitution_updates')
  BEGIN
    SELECT RAISE(ABORT,'MODULE_MANAGED_BY_BILLING');
  END;
  CREATE TRIGGER trg_feature_entitlement_insert
  BEFORE INSERT ON feature_flags
  WHEN NEW.enabled=1
   AND NEW.feature_key IN ('microsoft_365','microsoft_teams')
   AND NOT EXISTS (
     SELECT 1 FROM tenant_module_entitlements e
     WHERE e.tenant_id=NEW.tenant_id AND e.feature_key=NEW.feature_key AND e.status='active'
   )
  BEGIN
    SELECT RAISE(ABORT,'FEATURE_NOT_ENTITLED');
  END;
  CREATE TRIGGER trg_feature_entitlement_update
  BEFORE UPDATE OF enabled,source ON feature_flags
  WHEN NEW.enabled=1
   AND NEW.feature_key IN ('microsoft_365','microsoft_teams')
   AND NOT EXISTS (
     SELECT 1 FROM tenant_module_entitlements e
     WHERE e.tenant_id=NEW.tenant_id AND e.feature_key=NEW.feature_key AND e.status='active'
   )
  BEGIN
    SELECT RAISE(ABORT,'FEATURE_NOT_ENTITLED');
  END;
  INSERT INTO tenants(id) VALUES('tenant-a');
  INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at)
  VALUES('tenant-a','microsoft_teams',0,'manual','old'),
        ('tenant-a','microsoft_365',0,'manual','old');
`);

assert.throws(()=>db.exec("UPDATE feature_flags SET enabled=1,source='plan' WHERE tenant_id='tenant-a' AND feature_key='microsoft_teams'"),/FEATURE_NOT_ENTITLED/);
assert.throws(()=>db.exec("INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES('tenant-b','microsoft_365',1,'plan','now')"),/FEATURE_NOT_ENTITLED/);

// The schema prefix itself must remain executable in that production-like state,
// precisely because it no longer touches feature_flags.
db.exec(prefix);

for(const featureKey of ['microsoft_365','microsoft_teams']){
  const row=db.prepare('SELECT enabled,source FROM feature_flags WHERE tenant_id=? AND feature_key=?').get('tenant-a',featureKey);
  assert.equal(row?.enabled,0,`${featureKey} historical flag must remain untouched by schema migration`);
  assert.equal(row?.source,'manual',`${featureKey} historical source must remain untouched for audit`);
}

console.log('Teams/M365 core migration avoids both legacy billing and strict production entitlement triggers: OK');
