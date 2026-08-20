CREATE TABLE IF NOT EXISTS assignment_participant_state (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  homework_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT 'open' CHECK(progress IN ('open','in_progress','completed')),
  private_note TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(homework_id) REFERENCES homework(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,homework_id,user_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_participant_state_user
  ON assignment_participant_state(tenant_id,course_id,user_id,progress,updated_at DESC);
