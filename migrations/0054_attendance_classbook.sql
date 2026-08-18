CREATE TABLE IF NOT EXISTS attendance_sessions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  session_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  subject TEXT,
  room TEXT,
  instructor_text TEXT,
  delivery_mode TEXT NOT NULL DEFAULT 'onsite' CHECK(delivery_mode IN ('onsite','remote','hybrid')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','held','cancelled')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','timetable','api','import')),
  source_ref TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  CHECK(starts_at < ends_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_session_source ON attendance_sessions(tenant_id,course_id,source,source_ref) WHERE source_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attendance_sessions_course_date ON attendance_sessions(tenant_id,course_id,session_date,starts_at);

CREATE TABLE IF NOT EXISTS attendance_records (
  session_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('present','remote_present','late','excused_absent','unexcused_absent','not_recorded')),
  minutes_late INTEGER NOT NULL DEFAULT 0 CHECK(minutes_late BETWEEN 0 AND 1440),
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(session_id,user_id),
  FOREIGN KEY(session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(recorded_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_records_user ON attendance_records(tenant_id,user_id,course_id,status);

CREATE TABLE IF NOT EXISTS absence_notices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','accepted','rejected','cancelled')),
  submitted_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewed_by) REFERENCES users(id),
  CHECK(starts_on <= ends_on)
);
CREATE INDEX IF NOT EXISTS idx_absence_notices_course ON absence_notices(tenant_id,course_id,status,starts_on,ends_on);
CREATE INDEX IF NOT EXISTS idx_absence_notices_user ON absence_notices(tenant_id,user_id,course_id,starts_on);

CREATE TABLE IF NOT EXISTS classbook_entries (
  session_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  topic TEXT,
  content_summary TEXT,
  homework_summary TEXT,
  substitute_instructor TEXT,
  completed INTEGER NOT NULL DEFAULT 0 CHECK(completed IN (0,1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS attendance_policies (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 0 CHECK(enabled IN (0,1)),
  unexcused_session_threshold INTEGER CHECK(unexcused_session_threshold BETWEEN 1 AND 100),
  late_session_threshold INTEGER CHECK(late_session_threshold BETWEEN 1 AND 100),
  attendance_percent_threshold INTEGER CHECK(attendance_percent_threshold BETWEEN 1 AND 100),
  lookback_days INTEGER NOT NULL DEFAULT 90 CHECK(lookback_days BETWEEN 7 AND 365),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_policy_scope ON attendance_policies(tenant_id,COALESCE(course_id,''));

CREATE TABLE IF NOT EXISTS attendance_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  session_id TEXT,
  user_id TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('session_created','session_updated','recorded','absence_submitted','absence_reviewed','classbook_updated','threshold_attention')),
  detail_json TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_attendance_events_course ON attendance_events(tenant_id,course_id,created_at DESC);
