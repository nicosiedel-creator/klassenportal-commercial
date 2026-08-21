import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';

const migration=await readFile('migrations/0082_teams_chat_core.sql','utf8');
const flagSection=migration.split('-- One-time OAuth state.')[0];

assert.ok(flagSection.includes("'microsoft_365',1,'plan'"),'Microsoft 365 core flag must be plan-managed');
assert.ok(flagSection.includes("'microsoft_teams',1,'plan'"),'Microsoft Teams core flag must be plan-managed');
assert.ok(!flagSection.includes("'microsoft_365',1,'manual'"),'Microsoft 365 must not use legacy billing-blocked manual source');
assert.ok(!flagSection.includes("'microsoft_teams',1,'manual'"),'Microsoft Teams must not use legacy billing-blocked manual source');
assert.ok(flagSection.includes("source='plan'"),'conflict updates must repair legacy manual rows to plan source');

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
   AND NOT EXISTS (
     SELECT 1 FROM tenant_module_entitlements e
     WHERE e.tenant_id=NEW.tenant_id AND e.feature_key=NEW.feature_key AND e.status='active'
   )
   AND NOT EXISTS (
     SELECT 1 FROM module_subscription_changes c
     WHERE c.tenant_id=NEW.tenant_id AND c.feature_key=NEW.feature_key AND c.status='active'
   )
  BEGIN
    SELECT RAISE(ABORT,'MODULE_MANAGED_BY_BILLING');
  END;
  CREATE TRIGGER trg_paid_module_feature_update
  BEFORE UPDATE OF enabled,source ON feature_flags
  WHEN NEW.enabled=1
   AND NEW.source='manual'
   AND NEW.feature_key IN ('microsoft_365','microsoft_teams','statistics','surveys','substitution_updates')
   AND NOT EXISTS (
     SELECT 1 FROM tenant_module_entitlements e
     WHERE e.tenant_id=NEW.tenant_id AND e.feature_key=NEW.feature_key AND e.status='active'
   )
   AND NOT EXISTS (
     SELECT 1 FROM module_subscription_changes c
     WHERE c.tenant_id=NEW.tenant_id AND c.feature_key=NEW.feature_key AND c.status='active'
   )
  BEGIN
    SELECT RAISE(ABORT,'MODULE_MANAGED_BY_BILLING');
  END;
  INSERT INTO tenants(id) VALUES('tenant-a'),('tenant-b');
  INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at)
  VALUES('tenant-a','microsoft_teams',0,'manual','old'),
        ('tenant-a','microsoft_365',0,'manual','old');
`);

db.exec(flagSection);

for(const tenantId of ['tenant-a','tenant-b']){
  for(const featureKey of ['microsoft_365','microsoft_teams']){
    const row=db.prepare('SELECT enabled,source FROM feature_flags WHERE tenant_id=? AND feature_key=?').get(tenantId,featureKey);
    assert.equal(row?.enabled,1,`${tenantId}/${featureKey} must be enabled as core capability`);
    assert.equal(row?.source,'plan',`${tenantId}/${featureKey} must be plan-managed after migration`);
  }
}

console.log('Teams/M365 core migration remains compatible with legacy billing guard: OK');
