ALTER TABLE communication_messages ADD COLUMN send_email INTEGER NOT NULL DEFAULT 0 CHECK(send_email IN (0,1));

CREATE TABLE IF NOT EXISTS communication_email_deliveries (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('sent','failed')),
  provider_message_id TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(message_id,user_id),
  FOREIGN KEY(message_id) REFERENCES communication_messages(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_communication_email_delivery_message ON communication_email_deliveries(message_id,status);
CREATE INDEX IF NOT EXISTS idx_communication_email_delivery_tenant ON communication_email_deliveries(tenant_id,created_at DESC);
