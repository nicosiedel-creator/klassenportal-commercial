PRAGMA foreign_keys = ON;

INSERT OR IGNORE INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at)
VALUES('system_workflow_service','system-workflow@localhost.invalid','Automationsdienst','!disabled-system-account!',0,0,'disabled',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS certificate_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  document_type TEXT NOT NULL DEFAULT 'participation' CHECK(document_type IN ('participation','completion','achievement','custom')),
  title_template TEXT NOT NULL,
  body_template TEXT NOT NULL,
  min_attendance_percent REAL CHECK(min_attendance_percent IS NULL OR (min_attendance_percent BETWEEN 0 AND 100)),
  require_progress_complete INTEGER NOT NULL DEFAULT 0 CHECK(require_progress_complete IN (0,1)),
  approval_mode TEXT NOT NULL DEFAULT 'manual' CHECK(approval_mode IN ('manual','objective_auto')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK(version>=1),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(updated_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_certificate_templates_tenant ON certificate_templates(tenant_id,is_active,name);

CREATE TABLE IF NOT EXISTS certificate_records (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','approved','issued','revoked')),
  serial_number TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL,
  prepared_by TEXT NOT NULL,
  prepared_at TEXT NOT NULL,
  approved_by TEXT,
  approved_at TEXT,
  issued_by TEXT,
  issued_at TEXT,
  revoked_by TEXT,
  revoked_at TEXT,
  revocation_reason TEXT,
  verification_token_hash TEXT UNIQUE,
  verification_issued_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(template_id) REFERENCES certificate_templates(id),
  FOREIGN KEY(prepared_by) REFERENCES users(id),
  FOREIGN KEY(approved_by) REFERENCES users(id),
  FOREIGN KEY(issued_by) REFERENCES users(id),
  FOREIGN KEY(revoked_by) REFERENCES users(id),
  UNIQUE(tenant_id,course_id,user_id,template_id,template_version)
);
CREATE INDEX IF NOT EXISTS idx_certificate_records_user ON certificate_records(tenant_id,user_id,status,issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_certificate_records_course ON certificate_records(tenant_id,course_id,status,prepared_at DESC);

CREATE TABLE IF NOT EXISTS certificate_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  certificate_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('prepared','approved','issued','verification_rotated','revoked')),
  actor_user_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(certificate_id) REFERENCES certificate_records(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_certificate_events_certificate ON certificate_events(certificate_id,created_at DESC);

-- Only allowlisted triggers/actions are supported by application code. No arbitrary script, SQL or webhook execution.
CREATE TABLE IF NOT EXISTS workflow_rules (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  trigger_type TEXT NOT NULL CHECK(trigger_type IN ('course_ending','participant_joined','attention_task')),
  action_type TEXT NOT NULL CHECK(action_type IN ('create_task','notify_responsibles','prepare_certificate')),
  course_id TEXT,
  org_unit_id TEXT,
  config_json TEXT NOT NULL DEFAULT '{}',
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  cooldown_minutes INTEGER NOT NULL DEFAULT 1440 CHECK(cooldown_minutes BETWEEN 5 AND 525600),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(updated_by) REFERENCES users(id),
  CHECK((course_id IS NULL) OR (org_unit_id IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_workflow_rules_tenant ON workflow_rules(tenant_id,enabled,trigger_type);

CREATE TABLE IF NOT EXISTS workflow_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  rule_id TEXT NOT NULL,
  trigger_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('started','completed','skipped','failed')),
  result_json TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(rule_id) REFERENCES workflow_rules(id) ON DELETE CASCADE,
  UNIQUE(rule_id,trigger_key)
);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_rule ON workflow_runs(rule_id,started_at DESC);
