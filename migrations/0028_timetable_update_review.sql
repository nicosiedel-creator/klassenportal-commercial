-- Intelligente Stundenplan-Aktualisierungen mit drei Bestätigungsmodi.
CREATE TABLE IF NOT EXISTS timetable_update_preferences (
  tenant_id TEXT PRIMARY KEY,
  confirmation_mode TEXT NOT NULL DEFAULT 'batch' CHECK(confirmation_mode IN ('individual','batch','automatic')),
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS timetable_update_decisions (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  change_key TEXT NOT NULL,
  change_type TEXT NOT NULL CHECK(change_type IN ('add','update','remove')),
  before_json TEXT,
  after_json TEXT,
  decision TEXT NOT NULL CHECK(decision IN ('applied','rejected')),
  decided_by TEXT,
  decided_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(run_id) REFERENCES timetable_import_runs(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_timetable_update_decisions_run ON timetable_update_decisions(run_id, decision, change_type);
CREATE INDEX IF NOT EXISTS idx_timetable_update_decisions_tenant ON timetable_update_decisions(tenant_id, decided_at DESC);
