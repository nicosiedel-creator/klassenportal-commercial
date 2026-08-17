CREATE TABLE IF NOT EXISTS participant_import_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_name TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('structured','contract_text','pdf_text','pasted_text','api')),
  course_id TEXT,
  preview_digest TEXT NOT NULL,
  preview_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','applied','cancelled','expired')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  applied_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_participant_import_batches_tenant_status ON participant_import_batches(tenant_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS participant_import_results (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  user_id TEXT,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  external_id TEXT,
  action TEXT NOT NULL CHECK(action IN ('created_invited','existing_added','existing_unchanged','skipped')),
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES participant_import_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_participant_import_results_batch ON participant_import_results(batch_id,created_at);
