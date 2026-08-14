-- Automatischer Stundenplan-Import mit Vorschau, Abgleich und nachvollziehbarer Herkunft.
CREATE TABLE IF NOT EXISTS timetable_import_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mode TEXT NOT NULL CHECK(mode IN ('sync','append')),
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  date_from TEXT,
  date_to TEXT,
  status TEXT NOT NULL CHECK(status IN ('staging','completed','failed')),
  created_by TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_timetable_import_runs_tenant ON timetable_import_runs(tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS timetable_import_rows (
  run_id TEXT NOT NULL,
  row_no INTEGER NOT NULL,
  row_json TEXT NOT NULL,
  PRIMARY KEY(run_id, row_no)
);
CREATE INDEX IF NOT EXISTS idx_timetable_import_rows_run ON timetable_import_rows(run_id);

CREATE TABLE IF NOT EXISTS timetable_import_lessons (
  run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  source_row_no INTEGER,
  PRIMARY KEY(run_id, lesson_id),
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_timetable_import_lessons_range ON timetable_import_lessons(tenant_id, course_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_timetable_import_lessons_lesson ON timetable_import_lessons(lesson_id);
