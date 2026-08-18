CREATE TABLE IF NOT EXISTS account_action_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK(type IN ('activation','password_reset')),
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_account_action_tokens_user ON account_action_tokens(user_id,type,expires_at);

CREATE TABLE IF NOT EXISTS account_action_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS legal_configuration (
  id INTEGER PRIMARY KEY CHECK(id=1),
  provider_name TEXT,
  legal_notice_url TEXT,
  privacy_url TEXT,
  terms_url TEXT,
  dpa_url TEXT,
  support_email TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO legal_configuration(id,updated_at) VALUES(1,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS backup_verifications (
  backup_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('verified','failed')),
  checked_at TEXT NOT NULL,
  resource_count INTEGER NOT NULL DEFAULT 0,
  file_count INTEGER NOT NULL DEFAULT 0,
  missing_objects_json TEXT,
  error_message TEXT,
  FOREIGN KEY(backup_id) REFERENCES portability_backups(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_backup_verification_time ON backup_verifications(status,checked_at DESC);
