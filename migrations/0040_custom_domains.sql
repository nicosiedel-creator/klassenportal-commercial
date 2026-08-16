CREATE TABLE IF NOT EXISTS custom_domain_requests (
  tenant_id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL UNIQUE,
  provider_hostname_id TEXT UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('requested','pending_validation','active','error','removing')) DEFAULT 'requested',
  hostname_status TEXT,
  ssl_status TEXT,
  ownership_txt_name TEXT,
  ownership_txt_value TEXT,
  ssl_validation_json TEXT,
  cname_target TEXT NOT NULL,
  verification_errors_json TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  activated_at TEXT,
  removed_at TEXT,
  last_checked_at TEXT,
  last_error TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_custom_domain_status ON custom_domain_requests(status,updated_at);

CREATE TRIGGER IF NOT EXISTS trg_verified_custom_domain_update
BEFORE UPDATE OF custom_domain ON tenant_settings
WHEN NEW.custom_domain IS NOT NULL
 AND NEW.custom_domain <> ''
 AND NOT EXISTS (
   SELECT 1 FROM custom_domain_requests d
   WHERE d.tenant_id=NEW.tenant_id AND d.hostname=NEW.custom_domain AND d.status='active'
 )
BEGIN
  SELECT RAISE(ABORT,'CUSTOM_DOMAIN_MANAGED_SEPARATELY');
END;

CREATE TRIGGER IF NOT EXISTS trg_verified_custom_domain_insert
BEFORE INSERT ON tenant_settings
WHEN NEW.custom_domain IS NOT NULL
 AND NEW.custom_domain <> ''
 AND NOT EXISTS (
   SELECT 1 FROM custom_domain_requests d
   WHERE d.tenant_id=NEW.tenant_id AND d.hostname=NEW.custom_domain AND d.status='active'
 )
BEGIN
  SELECT RAISE(ABORT,'CUSTOM_DOMAIN_MANAGED_SEPARATELY');
END;
