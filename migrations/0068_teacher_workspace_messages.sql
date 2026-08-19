CREATE TABLE IF NOT EXISTS teacher_messages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source_label TEXT NOT NULL DEFAULT 'Schulleitung',
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('info','normal','important','urgent')),
  starts_at TEXT,
  ends_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_messages_scope ON teacher_messages(tenant_id,course_id,starts_at,ends_at,created_at DESC);

CREATE TABLE IF NOT EXISTS teacher_message_reads (
  message_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  read_at TEXT NOT NULL,
  PRIMARY KEY(message_id,user_id),
  FOREIGN KEY(message_id) REFERENCES teacher_messages(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_teacher_message_reads_user ON teacher_message_reads(user_id,read_at DESC);
