PRAGMA foreign_keys = ON;

ALTER TABLE homework ADD COLUMN submission_mode TEXT NOT NULL DEFAULT 'info' CHECK(submission_mode IN ('info','text','file','text_file'));
ALTER TABLE homework ADD COLUMN max_points REAL CHECK(max_points IS NULL OR max_points >= 0);
ALTER TABLE homework ADD COLUMN allow_late INTEGER NOT NULL DEFAULT 0 CHECK(allow_late IN (0,1));
ALTER TABLE homework ADD COLUMN allow_resubmission INTEGER NOT NULL DEFAULT 1 CHECK(allow_resubmission IN (0,1));
ALTER TABLE homework ADD COLUMN max_submission_files INTEGER NOT NULL DEFAULT 3 CHECK(max_submission_files BETWEEN 0 AND 10);
ALTER TABLE homework ADD COLUMN visible_from TEXT;

CREATE TABLE IF NOT EXISTS assignment_submissions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  homework_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','returned','graded','withdrawn')),
  text_content TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK(version >= 1),
  submitted_at TEXT,
  withdrawn_at TEXT,
  returned_at TEXT,
  returned_by TEXT,
  return_note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(homework_id) REFERENCES homework(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(returned_by) REFERENCES users(id),
  UNIQUE(tenant_id,homework_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_course ON assignment_submissions(tenant_id,course_id,status,submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_user ON assignment_submissions(tenant_id,user_id,course_id,updated_at DESC);

CREATE TABLE IF NOT EXISTS assignment_submission_files (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes > 0 AND size_bytes <= 15728640),
  sha256 TEXT NOT NULL,
  uploaded_at TEXT NOT NULL,
  FOREIGN KEY(submission_id) REFERENCES assignment_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_assignment_submission_files_submission ON assignment_submission_files(submission_id,uploaded_at);

CREATE TABLE IF NOT EXISTS gradebook_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('assignment','exam','manual')),
  source_id TEXT,
  title TEXT NOT NULL,
  max_points REAL CHECK(max_points IS NULL OR max_points >= 0),
  weight REAL NOT NULL DEFAULT 1 CHECK(weight >= 0),
  category TEXT,
  visible_to_participants INTEGER NOT NULL DEFAULT 1 CHECK(visible_to_participants IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  FOREIGN KEY(updated_by) REFERENCES users(id),
  UNIQUE(tenant_id,course_id,source_type,source_id)
);
CREATE INDEX IF NOT EXISTS idx_gradebook_items_course ON gradebook_items(tenant_id,course_id,created_at DESC);

CREATE TABLE IF NOT EXISTS gradebook_scores (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  points REAL,
  grade_value TEXT,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','revoked')),
  graded_by TEXT NOT NULL,
  graded_at TEXT NOT NULL,
  published_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES gradebook_items(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(graded_by) REFERENCES users(id),
  UNIQUE(item_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_gradebook_scores_user ON gradebook_scores(tenant_id,course_id,user_id,status,graded_at DESC);
CREATE INDEX IF NOT EXISTS idx_gradebook_scores_item ON gradebook_scores(item_id,status,graded_at DESC);

CREATE TABLE IF NOT EXISTS gradebook_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  item_id TEXT,
  submission_id TEXT,
  user_id TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN ('submission_saved','submission_submitted','submission_withdrawn','submission_returned','score_saved','score_published','score_revoked')),
  actor_user_id TEXT,
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(item_id) REFERENCES gradebook_items(id) ON DELETE CASCADE,
  FOREIGN KEY(submission_id) REFERENCES assignment_submissions(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_gradebook_events_course ON gradebook_events(tenant_id,course_id,created_at DESC);
