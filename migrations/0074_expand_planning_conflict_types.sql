PRAGMA foreign_keys = OFF;

CREATE TABLE timetable_plan_conflicts_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  conflicting_entry_id TEXT,
  conflict_type TEXT NOT NULL CHECK(conflict_type IN (
    'course_overlap','teacher_overlap','room_overlap','outside_course_period','missing_teacher','missing_subject',
    'course_time_window','weekend_not_allowed','planning_blackout','teacher_unavailable','resource_inactive','resource_capacity',
    'resource_unavailable','resource_overlap','course_daily_limit','teacher_daily_limit','teacher_weekly_limit','other'
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

INSERT INTO timetable_plan_conflicts_v2(id,tenant_id,plan_id,entry_id,conflicting_entry_id,conflict_type,severity,message,detected_at,resolved_at)
SELECT id,tenant_id,plan_id,entry_id,conflicting_entry_id,conflict_type,severity,message,detected_at,resolved_at FROM timetable_plan_conflicts;

DROP TABLE timetable_plan_conflicts;
ALTER TABLE timetable_plan_conflicts_v2 RENAME TO timetable_plan_conflicts;
CREATE INDEX IF NOT EXISTS idx_timetable_plan_conflicts ON timetable_plan_conflicts(tenant_id,plan_id,resolved_at,severity);

PRAGMA foreign_keys = ON;
