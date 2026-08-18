-- Production is deliberately locked per Cloudflare Worker version until the owner
-- completes all launch-readiness checks and performs a password + MFA step-up.
CREATE TABLE IF NOT EXISTS production_release_approvals (
  version_id TEXT PRIMARY KEY,
  version_tag TEXT,
  version_timestamp TEXT,
  app_origin TEXT NOT NULL,
  approved_by TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  readiness_json TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT,
  FOREIGN KEY(approved_by) REFERENCES users(id),
  FOREIGN KEY(revoked_by) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_production_release_approvals_active
ON production_release_approvals(app_origin, revoked_at, approved_at DESC);
