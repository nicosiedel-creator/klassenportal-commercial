CREATE TABLE IF NOT EXISTS communication_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('info','normal','important','urgent')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','published','closed','cancelled')),
  starts_at TEXT,
  ends_at TEXT,
  require_read INTEGER NOT NULL DEFAULT 0 CHECK(require_read IN (0,1)),
  require_ack INTEGER NOT NULL DEFAULT 0 CHECK(require_ack IN (0,1)),
  ack_due_at TEXT,
  recipient_count INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_comm_messages_tenant ON communication_messages(tenant_id,status,starts_at,created_at DESC);

CREATE TABLE IF NOT EXISTS communication_targets (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('tenant','org_unit','course','user')),
  target_id TEXT,
  include_descendants INTEGER NOT NULL DEFAULT 1 CHECK(include_descendants IN (0,1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(message_id) REFERENCES communication_messages(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  CHECK((target_type='tenant' AND target_id IS NULL) OR (target_type<>'tenant' AND target_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_comm_targets_message ON communication_targets(message_id,target_type,target_id);

CREATE TABLE IF NOT EXISTS communication_recipients (
  message_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  delivered_at TEXT NOT NULL,
  read_at TEXT,
  acknowledged_at TEXT,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  last_reminded_at TEXT,
  PRIMARY KEY(message_id,user_id),
  FOREIGN KEY(message_id) REFERENCES communication_messages(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comm_recipients_user ON communication_recipients(tenant_id,user_id,read_at,acknowledged_at);

CREATE TABLE IF NOT EXISTS communication_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','published','read','acknowledged','reminder','closed','cancelled')),
  user_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(message_id) REFERENCES communication_messages(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_comm_events_message ON communication_events(message_id,created_at DESC);
