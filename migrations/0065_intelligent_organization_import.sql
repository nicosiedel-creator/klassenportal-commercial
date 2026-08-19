PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS organization_import_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_kind TEXT NOT NULL DEFAULT 'structured',
  preview_digest TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','applied','expired')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  applied_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_org_import_batches_tenant ON organization_import_batches(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS organization_import_results (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  candidate_index INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES organization_import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_org_import_results_batch ON organization_import_results(batch_id,candidate_index);
