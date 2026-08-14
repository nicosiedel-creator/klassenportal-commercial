-- Point 22: Import, Export, PDF storage, tenant backups, restore and deletion workflow.
CREATE TABLE IF NOT EXISTS portability_files (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, object_key TEXT NOT NULL UNIQUE, original_name TEXT NOT NULL,
  content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0, uploaded_by TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portability_files_tenant ON portability_files(tenant_id, created_at);
CREATE TABLE IF NOT EXISTS portability_import_runs (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, resource_key TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('append','replace')), original_name TEXT NOT NULL, row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('staging','completed','failed')), created_by TEXT, created_at TEXT NOT NULL, completed_at TEXT, error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_portability_import_runs_tenant ON portability_import_runs(tenant_id, created_at);
CREATE TABLE IF NOT EXISTS portability_import_rows (run_id TEXT NOT NULL,row_no INTEGER NOT NULL,row_json TEXT NOT NULL,PRIMARY KEY(run_id,row_no));
CREATE INDEX IF NOT EXISTS idx_portability_import_rows_run ON portability_import_rows(run_id);
CREATE TABLE IF NOT EXISTS portability_restore_rows (restore_id TEXT NOT NULL,resource_key TEXT NOT NULL,row_no INTEGER NOT NULL,row_json TEXT NOT NULL,PRIMARY KEY(restore_id,resource_key,row_no));
CREATE INDEX IF NOT EXISTS idx_portability_restore_rows_restore ON portability_restore_rows(restore_id);
CREATE TABLE IF NOT EXISTS portability_backups (
  id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL, reason TEXT NOT NULL CHECK(reason IN ('manual','pre_restore','contract_end','automatic')),
  status TEXT NOT NULL CHECK(status IN ('creating','ready','failed')), object_prefix TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0,
  created_by TEXT, created_at TEXT NOT NULL, completed_at TEXT, error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_portability_backups_tenant ON portability_backups(tenant_id, created_at DESC);
CREATE TABLE IF NOT EXISTS portability_deletion_requests (
  id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,reason TEXT NOT NULL CHECK(reason IN ('contract_end','manual')),
  status TEXT NOT NULL CHECK(status IN ('pending','cancelled','completed')),final_backup_id TEXT,final_export_key TEXT,scheduled_for TEXT NOT NULL,
  requested_by TEXT,created_at TEXT NOT NULL,cancelled_at TEXT,cancelled_by TEXT,completed_at TEXT,completed_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_portability_deletion_tenant ON portability_deletion_requests(tenant_id,status,scheduled_for);
CREATE TABLE IF NOT EXISTS portability_audit_events (
  id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,actor_id TEXT,action TEXT NOT NULL,object_type TEXT,object_id TEXT,details_json TEXT,created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_portability_audit_tenant ON portability_audit_events(tenant_id,created_at DESC);
CREATE TABLE IF NOT EXISTS portability_scheduler_state (key TEXT PRIMARY KEY,value TEXT,updated_at TEXT NOT NULL);
