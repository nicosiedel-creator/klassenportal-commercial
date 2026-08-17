PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS responsibility_assignments (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  org_unit_id TEXT,
  course_id TEXT,
  responsibility_kind TEXT NOT NULL CHECK(responsibility_kind IN ('primary','co_responsible','deputy')),
  inherit_descendants INTEGER NOT NULL DEFAULT 0 CHECK(inherit_descendants IN (0,1)),
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','import','scim')),
  granted_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(granted_by) REFERENCES users(id) ON DELETE SET NULL,
  CHECK((org_unit_id IS NOT NULL AND course_id IS NULL) OR (org_unit_id IS NULL AND course_id IS NOT NULL)),
  CHECK(valid_from IS NULL OR valid_until IS NULL OR valid_from < valid_until)
);
CREATE INDEX IF NOT EXISTS idx_responsibility_user ON responsibility_assignments(tenant_id,user_id,status,valid_from,valid_until);
CREATE INDEX IF NOT EXISTS idx_responsibility_org ON responsibility_assignments(tenant_id,org_unit_id,status,responsibility_kind);
CREATE INDEX IF NOT EXISTS idx_responsibility_course ON responsibility_assignments(tenant_id,course_id,status,responsibility_kind);
