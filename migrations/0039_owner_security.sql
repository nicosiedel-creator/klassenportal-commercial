CREATE TABLE IF NOT EXISTS platform_mfa (
  user_id TEXT PRIMARY KEY,
  secret_ciphertext TEXT NOT NULL,
  secret_iv TEXT NOT NULL,
  enabled_at TEXT,
  last_counter INTEGER,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS platform_mfa_recovery_codes (
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,code_hash),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_platform_mfa_recovery_active ON platform_mfa_recovery_codes(user_id,used_at);

CREATE TABLE IF NOT EXISTS platform_mfa_challenges (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_platform_mfa_challenges_expiry ON platform_mfa_challenges(expires_at);
