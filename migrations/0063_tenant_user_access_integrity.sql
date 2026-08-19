-- Repair tenant relationships created by provisioning paths that historically wrote
-- memberships without creating the corresponding tenant_users row.
-- Idempotent and non-destructive: existing active/suspended relationships are preserved.
INSERT OR IGNORE INTO tenant_users(
  tenant_id,user_id,status,external_id,source,created_at,updated_at
)
SELECT DISTINCT
  m.tenant_id,
  m.user_id,
  'active',
  NULL,
  'manual',
  m.created_at,
  m.created_at
FROM memberships m;
