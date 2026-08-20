PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS planning_resources (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT 'room' CHECK(resource_type IN ('room','equipment','vehicle','online_room','other')),
  name TEXT NOT NULL,
  code TEXT,
  location TEXT,
  capacity INTEGER CHECK(capacity IS NULL OR capacity>=0),
  features_json TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive','maintenance')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(tenant_id,resource_type,name)
);
CREATE INDEX IF NOT EXISTS idx_planning_resources_tenant ON planning_resources(tenant_id,status,resource_type,name);

CREATE TABLE IF NOT EXISTS planning_resource_unavailability (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','maintenance','external','automation')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(resource_id) REFERENCES planning_resources(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  CHECK(starts_at<ends_at)
);
CREATE INDEX IF NOT EXISTS idx_resource_unavailable_time ON planning_resource_unavailability(tenant_id,resource_id,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS teacher_unavailability (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  reason TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','sickness','vacation','training','external','automation')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  CHECK(starts_at<ends_at)
);
CREATE INDEX IF NOT EXISTS idx_teacher_unavailable_time ON teacher_unavailability(tenant_id,teacher_id,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS planning_blackouts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  title TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  blackout_type TEXT NOT NULL DEFAULT 'closure' CHECK(blackout_type IN ('holiday','closure','exam_block','practice_block','maintenance','other')),
  blocks_teaching INTEGER NOT NULL DEFAULT 1 CHECK(blocks_teaching IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  CHECK(starts_at<ends_at)
);
CREATE INDEX IF NOT EXISTS idx_planning_blackouts_time ON planning_blackouts(tenant_id,course_id,starts_at,ends_at,blocks_teaching);

CREATE TABLE IF NOT EXISTS course_scheduling_rules (
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  earliest_start TEXT,
  latest_end TEXT,
  max_daily_minutes INTEGER CHECK(max_daily_minutes IS NULL OR max_daily_minutes>=0),
  max_consecutive_minutes INTEGER CHECK(max_consecutive_minutes IS NULL OR max_consecutive_minutes>=0),
  min_break_minutes INTEGER CHECK(min_break_minutes IS NULL OR min_break_minutes>=0),
  allow_saturday INTEGER NOT NULL DEFAULT 0 CHECK(allow_saturday IN (0,1)),
  allow_sunday INTEGER NOT NULL DEFAULT 0 CHECK(allow_sunday IN (0,1)),
  default_lesson_minutes INTEGER CHECK(default_lesson_minutes IS NULL OR default_lesson_minutes>0),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,course_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS teacher_workload_rules (
  tenant_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  max_daily_minutes INTEGER CHECK(max_daily_minutes IS NULL OR max_daily_minutes>=0),
  max_weekly_minutes INTEGER CHECK(max_weekly_minutes IS NULL OR max_weekly_minutes>=0),
  max_consecutive_minutes INTEGER CHECK(max_consecutive_minutes IS NULL OR max_consecutive_minutes>=0),
  min_break_minutes INTEGER CHECK(min_break_minutes IS NULL OR min_break_minutes>=0),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,teacher_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS timetable_plan_entry_resources (
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>0),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,entry_id,resource_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES timetable_plan_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(entry_id) REFERENCES timetable_plan_entries(id) ON DELETE CASCADE,
  FOREIGN KEY(resource_id) REFERENCES planning_resources(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_plan_resource_usage ON timetable_plan_entry_resources(tenant_id,resource_id,plan_id,entry_id);

CREATE TABLE IF NOT EXISTS lesson_resource_reservations (
  tenant_id TEXT NOT NULL,
  lesson_id TEXT NOT NULL,
  resource_id TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity>0),
  source_plan_id TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,lesson_id,resource_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY(resource_id) REFERENCES planning_resources(id) ON DELETE CASCADE,
  FOREIGN KEY(source_plan_id) REFERENCES timetable_plan_versions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_lesson_resource_usage ON lesson_resource_reservations(tenant_id,resource_id,lesson_id);
