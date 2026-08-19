PRAGMA foreign_keys = ON;

-- Customer-specific examination/documentation requirements. Built-in authority templates
-- live in application code; this table stores customer/authority-specific overrides only.
CREATE TABLE IF NOT EXISTS exam_authority_profiles (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  authority_type TEXT NOT NULL DEFAULT 'custom' CHECK(authority_type IN ('ihk','hwk','vak','internal','custom','other')),
  settings_json TEXT NOT NULL,
  notes TEXT,
  source_reference TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_exam_profiles_tenant ON exam_authority_profiles(tenant_id,is_active,name);

CREATE TABLE IF NOT EXISTS course_exam_authority_profiles (
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  profile_ref TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,course_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id)
);

-- Audit trail only. The export deliberately stores no attendance/grade/person rows.
-- The exact profile snapshot is retained so later profile changes cannot make an old
-- export impossible to reconstruct or explain.
CREATE TABLE IF NOT EXISTS classbook_export_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  profile_ref TEXT NOT NULL,
  profile_snapshot_json TEXT NOT NULL,
  period_from TEXT,
  period_to TEXT,
  format TEXT NOT NULL CHECK(format IN ('preview','csv','html')),
  row_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  content_digest TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_classbook_export_runs ON classbook_export_runs(tenant_id,course_id,created_at DESC);

-- Fachbereich/Qualitätssicherung can review a classbook entry without changing the
-- teacher's original record and without needing participant attendance/grade data.
CREATE TABLE IF NOT EXISTS classbook_entry_reviews (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'reviewed' CHECK(status IN ('reviewed','approved','revision_required')),
  review_note TEXT,
  reviewed_by TEXT NOT NULL,
  reviewed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewed_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_classbook_reviews_course ON classbook_entry_reviews(tenant_id,course_id,status,reviewed_at DESC);
