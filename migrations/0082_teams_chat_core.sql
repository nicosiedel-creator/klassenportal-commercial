PRAGMA foreign_keys = ON;

-- Microsoft 365 / Teams is a core capability of the flagship product.
-- Existing module commerce rows and feature_flags are protected by historical
-- billing / entitlement triggers in production and must not be rewritten by a
-- schema migration. Runtime/product policy treats these capabilities as core;
-- historical commerce and feature-flag rows remain untouched for audit.
--
-- Important: production contains a stricter FEATURE_NOT_ENTITLED trigger in
-- addition to the legacy MODULE_MANAGED_BY_BILLING guard. Even plan-managed
-- feature_flags writes can therefore be rejected for historical paid-module keys.
-- 0082 is a schema migration only and intentionally performs no feature_flags
-- INSERT/UPDATE for Microsoft 365 or Teams.

-- One-time OAuth state. Only a SHA-256 digest of the browser state is stored.
CREATE TABLE IF NOT EXISTS microsoft_oauth_states (
  state_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  course_id TEXT,
  verifier_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_microsoft_oauth_state_expiry ON microsoft_oauth_states(expires_at);

-- Delegated Microsoft account per tenant/user. Tokens are AES-GCM encrypted by tenant-secrets.ts.
CREATE TABLE IF NOT EXISTS microsoft_graph_accounts (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  microsoft_tenant_id TEXT,
  microsoft_user_id TEXT,
  display_name TEXT,
  email TEXT,
  scopes TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  refresh_token_ciphertext TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','error')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_microsoft_graph_accounts_tenant ON microsoft_graph_accounts(tenant_id,status);

-- A lesson has at most one active meeting link. Participant access is always course-scoped in code.
CREATE TABLE IF NOT EXISTS lesson_online_meetings (
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  organizer_user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('microsoft_teams_graph','microsoft_teams_manual')),
  external_event_id TEXT,
  join_url TEXT,
  web_url TEXT,
  subject TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled','error')),
  last_synced_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,lesson_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY(organizer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_lesson_online_meetings_course_time
  ON lesson_online_meetings(tenant_id,course_id,starts_at,status);
