PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT,
  auth_secret TEXT,
  user_agent TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','invalid','revoked')),
  created_at TEXT NOT NULL,
  last_success_at TEXT,
  last_failure_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(tenant_id,user_id,status);

CREATE TABLE IF NOT EXISTS push_outbox (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  notification_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','cancelled')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_push_outbox_pending ON push_outbox(status,next_attempt_at);

CREATE TABLE IF NOT EXISTS discussion_settings (
  tenant_id TEXT PRIMARY KEY,
  course_forums_enabled INTEGER NOT NULL DEFAULT 1 CHECK(course_forums_enabled IN (0,1)),
  direct_messages_enabled INTEGER NOT NULL DEFAULT 0 CHECK(direct_messages_enabled IN (0,1)),
  participant_thread_creation INTEGER NOT NULL DEFAULT 0 CHECK(participant_thread_creation IN (0,1)),
  retention_days INTEGER NOT NULL DEFAULT 365 CHECK(retention_days BETWEEN 30 AND 3650),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS discussion_threads (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('course_forum','direct')),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','locked','archived')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_discussion_threads_course ON discussion_threads(tenant_id,course_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS discussion_participants (
  thread_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY(thread_id,user_id),
  FOREIGN KEY(thread_id) REFERENCES discussion_threads(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS discussion_messages (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden','deleted')),
  moderation_reason TEXT,
  moderated_by TEXT,
  created_at TEXT NOT NULL,
  edited_at TEXT,
  FOREIGN KEY(thread_id) REFERENCES discussion_threads(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_discussion_messages_thread ON discussion_messages(thread_id,created_at);

CREATE TABLE IF NOT EXISTS report_definitions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  dataset TEXT NOT NULL CHECK(dataset IN ('participants','attendance','assignments','grades','courses','communications','certificates')),
  columns_json TEXT NOT NULL,
  filters_json TEXT NOT NULL DEFAULT '{}',
  group_by_json TEXT NOT NULL DEFAULT '[]',
  sort_json TEXT NOT NULL DEFAULT '[]',
  visibility TEXT NOT NULL DEFAULT 'private' CHECK(visibility IN ('private','tenant_admin','shared')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_reports_tenant ON report_definitions(tenant_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS report_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  report_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('completed','failed')),
  row_count INTEGER NOT NULL DEFAULT 0,
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  error_code TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(report_id) REFERENCES report_definitions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS integration_exports (
  id TEXT PRIMARY KEY,
  owner_scope TEXT NOT NULL CHECK(owner_scope IN ('platform','tenant')),
  tenant_id TEXT,
  kind TEXT NOT NULL CHECK(kind IN ('ledger_csv','datev_csv','participants_csv','attendance_csv','grades_csv','courses_csv','custom_report_csv')),
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','downloaded','expired','failed')),
  parameters_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  downloaded_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_integration_exports_tenant ON integration_exports(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS integration_outbox (
  id TEXT PRIMARY KEY,
  owner_scope TEXT NOT NULL CHECK(owner_scope IN ('platform','tenant')),
  tenant_id TEXT,
  event_type TEXT NOT NULL,
  destination_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sent','failed','dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_integration_outbox_pending ON integration_outbox(status,next_attempt_at);
