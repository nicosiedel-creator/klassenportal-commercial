-- Ein Termin ausserhalb der zugesagten Arbeitszeiten braucht einen eigenen Konflikttyp.
--
-- "teacher_unavailable" meint etwas anderes: eine gemeldete Abwesenheit. Hier geht es um
-- Honorarkraefte, die angegeben haben, wann sie ueberhaupt arbeiten moechten. Beides in einen
-- Topf zu werfen wuerde dem Kunden die Ursache verschleiern.
--
-- Aufbau wie in 0074: SQLite kann eine CHECK-Bedingung nicht aendern, die Tabelle wird also neu
-- angelegt und die vorhandenen Zeilen werden unveraendert uebernommen.
PRAGMA foreign_keys = OFF;

CREATE TABLE timetable_plan_conflicts_v3 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  conflicting_entry_id TEXT,
  conflict_type TEXT NOT NULL CHECK(conflict_type IN (
    'course_overlap','teacher_overlap','room_overlap','outside_course_period','missing_teacher','missing_subject',
    'course_time_window','weekend_not_allowed','planning_blackout','teacher_unavailable','resource_inactive','resource_capacity',
    'resource_unavailable','resource_overlap','course_daily_limit','teacher_daily_limit','teacher_weekly_limit',
    'teacher_outside_availability','other'
  )),
  severity TEXT NOT NULL DEFAULT 'error' CHECK(severity IN ('info','warning','error')),
  message TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES timetable_plan_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(entry_id) REFERENCES timetable_plan_entries(id) ON DELETE CASCADE,
  FOREIGN KEY(conflicting_entry_id) REFERENCES timetable_plan_entries(id) ON DELETE CASCADE
);

INSERT INTO timetable_plan_conflicts_v3(id,tenant_id,plan_id,entry_id,conflicting_entry_id,conflict_type,severity,message,detected_at,resolved_at)
SELECT id,tenant_id,plan_id,entry_id,conflicting_entry_id,conflict_type,severity,message,detected_at,resolved_at FROM timetable_plan_conflicts;

DROP TABLE timetable_plan_conflicts;
ALTER TABLE timetable_plan_conflicts_v3 RENAME TO timetable_plan_conflicts;
CREATE INDEX IF NOT EXISTS idx_timetable_plan_conflicts ON timetable_plan_conflicts(tenant_id,plan_id,resolved_at,severity);

PRAGMA foreign_keys = ON;
