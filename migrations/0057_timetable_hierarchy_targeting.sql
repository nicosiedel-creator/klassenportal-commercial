PRAGMA foreign_keys = ON;

-- Confirmed mappings for timetable source labels. These are only written after an explicit admin decision;
-- the automatic resolver never learns from an ambiguous/fuzzy guess.
CREATE TABLE IF NOT EXISTS timetable_target_aliases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  source_value_normalized TEXT NOT NULL,
  org_context_normalized TEXT NOT NULL DEFAULT '',
  course_id TEXT NOT NULL,
  org_unit_id TEXT,
  confirmed_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE CASCADE,
  FOREIGN KEY(confirmed_by) REFERENCES users(id),
  UNIQUE(tenant_id,source_value_normalized,org_context_normalized)
);
CREATE INDEX IF NOT EXISTS idx_timetable_target_aliases_course ON timetable_target_aliases(tenant_id,course_id);

CREATE TRIGGER IF NOT EXISTS trg_timetable_target_alias_insert_guard
BEFORE INSERT ON timetable_target_aliases
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM courses c WHERE c.id=NEW.course_id AND c.tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'COURSE_TENANT_MISMATCH') END;
  SELECT CASE WHEN NEW.org_unit_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM org_units o WHERE o.id=NEW.org_unit_id AND o.tenant_id=NEW.tenant_id)
    THEN RAISE(ABORT,'ORG_UNIT_TENANT_MISMATCH') END;
END;
