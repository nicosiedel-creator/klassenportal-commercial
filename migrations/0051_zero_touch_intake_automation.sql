-- Zero-touch intake: secure web/email submission without granting participant-data read access.
CREATE TABLE IF NOT EXISTS tenant_intake_settings (
  tenant_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  processing_mode TEXT NOT NULL DEFAULT 'safe_auto' CHECK(processing_mode IN ('review_only','safe_auto')),
  acknowledge_sender INTEGER NOT NULL DEFAULT 1 CHECK(acknowledge_sender IN (0,1)),
  notify_responsibles INTEGER NOT NULL DEFAULT 1 CHECK(notify_responsibles IN (0,1)),
  default_retention_days INTEGER NOT NULL DEFAULT 14 CHECK(default_retention_days BETWEEN 1 AND 30),
  updated_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS intake_channels (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  org_unit_id TEXT,
  label TEXT NOT NULL,
  local_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE CASCADE,
  CHECK((course_id IS NULL) OR (org_unit_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_intake_channels_tenant ON intake_channels(tenant_id,status);

CREATE TABLE IF NOT EXISTS intake_submitters (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  email TEXT,
  email_domain TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CHECK((email IS NOT NULL AND email_domain IS NULL) OR (email IS NULL AND email_domain IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_submitter_email ON intake_submitters(tenant_id,email) WHERE email IS NOT NULL AND status='active';
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_submitter_domain ON intake_submitters(tenant_id,email_domain) WHERE email_domain IS NOT NULL AND status='active';

CREATE TABLE IF NOT EXISTS intake_upload_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  org_unit_id TEXT,
  label TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  max_uploads INTEGER NOT NULL DEFAULT 500 CHECK(max_uploads BETWEEN 1 AND 10000),
  upload_count INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE CASCADE,
  CHECK((course_id IS NULL) OR (org_unit_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_intake_upload_links_tenant ON intake_upload_links(tenant_id,expires_at);

CREATE TABLE IF NOT EXISTS intake_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  channel_id TEXT,
  source TEXT NOT NULL CHECK(source IN ('email','web','api')),
  source_sender TEXT,
  source_message_id TEXT,
  source_subject TEXT,
  sender_authenticated INTEGER NOT NULL DEFAULT 0 CHECK(sender_authenticated IN (0,1)),
  default_course_id TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','quarantined','extracting','review','auto_ready','processing','completed','partial','failed','expired')),
  participant_import_batch_id TEXT,
  document_count INTEGER NOT NULL DEFAULT 0,
  accepted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(channel_id) REFERENCES intake_channels(id) ON DELETE SET NULL,
  FOREIGN KEY(default_course_id) REFERENCES courses(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_intake_message_id ON intake_batches(tenant_id,source_message_id) WHERE source_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_intake_batches_tenant_status ON intake_batches(tenant_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS intake_documents (
  id TEXT PRIMARY KEY,
  batch_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  r2_key TEXT,
  extraction_state TEXT NOT NULL DEFAULT 'stored' CHECK(extraction_state IN ('stored','server_text','client_pdf','ocr_required','unsupported','purged','failed')),
  extracted_text TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(batch_id) REFERENCES intake_batches(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_intake_documents_batch ON intake_documents(batch_id);
CREATE INDEX IF NOT EXISTS idx_intake_documents_expiry ON intake_documents(expires_at,extraction_state);
CREATE INDEX IF NOT EXISTS idx_intake_documents_hash ON intake_documents(tenant_id,sha256);

CREATE TABLE IF NOT EXISTS intake_webhook_events (
  svix_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  provider_object_id TEXT,
  received_at TEXT NOT NULL,
  processed_at TEXT,
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','ignored','processed','failed')),
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS automation_tasks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  task_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'normal' CHECK(severity IN ('info','normal','important','urgent')),
  title TEXT NOT NULL,
  detail_json TEXT,
  source_type TEXT,
  source_id TEXT,
  org_unit_id TEXT,
  course_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done','dismissed')),
  due_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_automation_tasks_open ON automation_tasks(tenant_id,status,severity,due_at,created_at DESC);

CREATE TABLE IF NOT EXISTS automation_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_automation_events_tenant ON automation_events(tenant_id,created_at DESC);
