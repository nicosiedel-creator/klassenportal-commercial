CREATE TABLE IF NOT EXISTS module_cancellations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  external_subscription_item_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('scheduled','cancelled','completed','error')) DEFAULT 'scheduled',
  effective_at TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  cancelled_at TEXT,
  completed_at TEXT,
  last_attempt_at TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(feature_key) REFERENCES module_commerce_rules(feature_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_module_cancellations_open
ON module_cancellations(tenant_id,feature_key)
WHERE status IN ('scheduled','error');
CREATE INDEX IF NOT EXISTS idx_module_cancellations_due
ON module_cancellations(status,effective_at);
