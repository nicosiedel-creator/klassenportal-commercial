CREATE TABLE IF NOT EXISTS portability_files (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  original_name TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT,
  size INTEGER NOT NULL,
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_portability_files_tenant ON portability_files(tenant_id);
CREATE INDEX IF NOT EXISTS idx_portability_files_resource ON portability_files(tenant_id, resource_type, resource_id);

CREATE TABLE IF NOT EXISTS portability_import_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_key TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_name TEXT,
  status TEXT NOT NULL,
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_valid INTEGER NOT NULL DEFAULT 0,
  rows_invalid INTEGER NOT NULL DEFAULT 0,
  issues_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_portability_import_jobs_tenant ON portability_import_jobs(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS portability_import_stage (
  job_id TEXT NOT NULL,
  row_no INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(job_id, row_no)
);

CREATE TABLE IF NOT EXISTS portability_backups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  manifest_key TEXT NOT NULL,
  status TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_portability_backups_tenant ON portability_backups(tenant_id, created_at);

CREATE TABLE IF NOT EXISTS portability_delete_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  execute_after TEXT NOT NULL,
  final_export_backup_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  confirmed_by TEXT,
  confirmed_at TEXT,
  completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_portability_delete_requests_tenant ON portability_delete_requests(tenant_id, status);

CREATE TABLE IF NOT EXISTS portability_audit (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  details_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_portability_audit_tenant ON portability_audit(tenant_id, created_at);
