PRAGMA foreign_keys = ON;

-- Enterprise organisation model: flexible hierarchy instead of a fixed location->department->course chain.
CREATE TABLE IF NOT EXISTS org_unit_types (
  tenant_id TEXT NOT NULL,
  type_key TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,type_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS org_units (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  parent_id TEXT,
  type_key TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  external_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  sort_order INTEGER NOT NULL DEFAULT 100,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_id) REFERENCES org_units(id) ON DELETE RESTRICT,
  FOREIGN KEY(tenant_id,type_key) REFERENCES org_unit_types(tenant_id,type_key),
  UNIQUE(tenant_id,external_id)
);
CREATE INDEX IF NOT EXISTS idx_org_units_parent ON org_units(tenant_id,parent_id,status,sort_order,name);
CREATE INDEX IF NOT EXISTS idx_org_units_type ON org_units(tenant_id,type_key,status);

CREATE TABLE IF NOT EXISTS course_org_units (
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  org_unit_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY(course_id,org_unit_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_course_org_units_org ON course_org_units(tenant_id,org_unit_id,course_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_org_primary ON course_org_units(course_id) WHERE is_primary=1;

-- Per-tenant lifecycle is separate from the global user account because one person can work for several customers.
CREATE TABLE IF NOT EXISTS tenant_users (
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended')),
  external_id TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','scim','sso','import')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,external_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_users_user ON tenant_users(user_id,tenant_id,status);

-- Fine-grained delegated permissions. A grant can cover exactly one org unit or its whole subtree and can expire automatically.
CREATE TABLE IF NOT EXISTS org_permission_grants (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  org_unit_id TEXT NOT NULL,
  profile TEXT NOT NULL CHECK(profile IN ('responsible','editor','viewer','reporting','custom')),
  permissions_json TEXT NOT NULL,
  inherit_descendants INTEGER NOT NULL DEFAULT 1 CHECK(inherit_descendants IN (0,1)),
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','scim','import')),
  source_ref TEXT,
  granted_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE CASCADE,
  FOREIGN KEY(granted_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_org_grants_user ON org_permission_grants(tenant_id,user_id,status,valid_from,valid_until);
CREATE INDEX IF NOT EXISTS idx_org_grants_unit ON org_permission_grants(tenant_id,org_unit_id,status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_grants_source ON org_permission_grants(tenant_id,user_id,org_unit_id,source,source_ref) WHERE source_ref IS NOT NULL;

-- Preview/apply workflow for automatic structure setup. Nothing is guessed or applied before explicit confirmation.
CREATE TABLE IF NOT EXISTS org_import_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  source_name TEXT,
  rows_json TEXT NOT NULL,
  digest TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'previewed' CHECK(status IN ('previewed','applied','expired','cancelled')),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_org_import_batches ON org_import_batches(tenant_id,status,created_at DESC);

-- Tenant SSO. Client secrets are never stored in plaintext.
CREATE TABLE IF NOT EXISTS tenant_sso_configs (
  tenant_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'oidc' CHECK(provider='oidc'),
  issuer TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_secret_ciphertext TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  enforce_sso INTEGER NOT NULL DEFAULT 0 CHECK(enforce_sso IN (0,1)),
  email_domains_json TEXT NOT NULL DEFAULT '[]',
  break_glass_user_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(break_glass_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS external_identities (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK(provider IN ('oidc','scim')),
  issuer TEXT,
  subject TEXT,
  external_id TEXT,
  email_at_link TEXT,
  created_at TEXT NOT NULL,
  last_login_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,provider,issuer,subject),
  UNIQUE(tenant_id,provider,external_id)
);
CREATE INDEX IF NOT EXISTS idx_external_identity_user ON external_identities(tenant_id,user_id,provider);

CREATE TABLE IF NOT EXISTS oidc_login_states (
  state_hash TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  nonce_hash TEXT NOT NULL,
  code_verifier_ciphertext TEXT NOT NULL,
  return_path TEXT NOT NULL DEFAULT '/',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_oidc_states_expiry ON oidc_login_states(expires_at);

-- Authentication provenance enables enforce_sso without locking out a deliberately configured break-glass admin.
ALTER TABLE sessions ADD COLUMN auth_method TEXT NOT NULL DEFAULT 'password';
ALTER TABLE sessions ADD COLUMN auth_tenant_id TEXT;

-- SCIM 2.0 bearer tokens: only hashes are persisted.
CREATE TABLE IF NOT EXISTS scim_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scim_tokens_tenant ON scim_tokens(tenant_id,revoked_at,expires_at);

CREATE TABLE IF NOT EXISTS scim_groups (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  external_id TEXT,
  display_name TEXT NOT NULL,
  org_unit_id TEXT,
  profile TEXT CHECK(profile IN ('responsible','editor','viewer','reporting')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE SET NULL,
  UNIQUE(tenant_id,external_id)
);
CREATE INDEX IF NOT EXISTS idx_scim_groups_tenant ON scim_groups(tenant_id,active,display_name);

CREATE TABLE IF NOT EXISTS scim_group_members (
  tenant_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(group_id,user_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(group_id) REFERENCES scim_groups(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Server-to-server API tokens: tenant scoped, optional org subtree restriction, scopes and expiry.
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  token_prefix TEXT NOT NULL,
  label TEXT NOT NULL,
  scopes_json TEXT NOT NULL,
  org_unit_id TEXT,
  expires_at TEXT NOT NULL,
  last_used_at TEXT,
  revoked_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_api_tokens_tenant ON api_tokens(tenant_id,revoked_at,expires_at);

CREATE TABLE IF NOT EXISTS integration_rate_limits (
  key_hash TEXT PRIMARY KEY,
  window_started_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0
);

-- Flexible default labels for every existing customer. Customers may rename/add types later.
INSERT OR IGNORE INTO org_unit_types(tenant_id,type_key,label,sort_order,is_active,created_at,updated_at)
SELECT id,'location','Standort',10,1,created_at,updated_at FROM tenants;
INSERT OR IGNORE INTO org_unit_types(tenant_id,type_key,label,sort_order,is_active,created_at,updated_at)
SELECT id,'department','Bereich / Fachbereich',20,1,created_at,updated_at FROM tenants;
INSERT OR IGNORE INTO org_unit_types(tenant_id,type_key,label,sort_order,is_active,created_at,updated_at)
SELECT id,'program','Bildungsgang / Programm',30,1,created_at,updated_at FROM tenants;
INSERT OR IGNORE INTO org_unit_types(tenant_id,type_key,label,sort_order,is_active,created_at,updated_at)
SELECT id,'measure','Maßnahme / Projekt',40,1,created_at,updated_at FROM tenants;
INSERT OR IGNORE INTO org_unit_types(tenant_id,type_key,label,sort_order,is_active,created_at,updated_at)
SELECT id,'group','Gruppe',50,1,created_at,updated_at FROM tenants;

-- Preserve existing simple locations as first-class organisation units and retain course links.
INSERT OR IGNORE INTO org_units(id,tenant_id,parent_id,type_key,name,code,external_id,status,sort_order,metadata_json,created_at,updated_at)
SELECT 'orgloc_'||id,tenant_id,NULL,'location',name,NULL,NULL,'active',100,
       CASE WHEN address IS NULL THEN NULL ELSE json_object('address',address) END,
       created_at,created_at
FROM locations;

INSERT OR IGNORE INTO course_org_units(tenant_id,course_id,org_unit_id,is_primary,created_at)
SELECT c.tenant_id,c.id,'orgloc_'||c.location_id,1,c.created_at
FROM courses c WHERE c.location_id IS NOT NULL;

-- Existing memberships become active tenant-user relations without changing their permissions.
INSERT OR IGNORE INTO tenant_users(tenant_id,user_id,status,external_id,source,created_at,updated_at)
SELECT DISTINCT tenant_id,user_id,'active',NULL,'manual',created_at,created_at FROM memberships;

-- Cross-tenant integrity guards for organisation/course links and grants.
CREATE TRIGGER IF NOT EXISTS trg_course_org_units_insert_guard
BEFORE INSERT ON course_org_units
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM courses c WHERE c.id=NEW.course_id AND c.tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'COURSE_TENANT_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM org_units o WHERE o.id=NEW.org_unit_id AND o.tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'ORG_UNIT_TENANT_MISMATCH') END;
END;

CREATE TRIGGER IF NOT EXISTS trg_org_grants_insert_guard
BEFORE INSERT ON org_permission_grants
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM org_units o WHERE o.id=NEW.org_unit_id AND o.tenant_id=NEW.tenant_id) THEN RAISE(ABORT,'ORG_UNIT_TENANT_MISMATCH') END;
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM tenant_users tu WHERE tu.tenant_id=NEW.tenant_id AND tu.user_id=NEW.user_id AND tu.status='active') THEN RAISE(ABORT,'TENANT_USER_NOT_ACTIVE') END;
END;
