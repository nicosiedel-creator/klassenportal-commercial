PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS gradebook_categories (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  name TEXT NOT NULL,
  weight_basis_points INTEGER NOT NULL DEFAULT 0 CHECK(weight_basis_points BETWEEN 0 AND 10000),
  drop_lowest INTEGER NOT NULL DEFAULT 0 CHECK(drop_lowest BETWEEN 0 AND 20),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,course_id,name),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS grading_scales (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS grading_scale_items (
  id TEXT PRIMARY KEY,
  scale_id TEXT NOT NULL,
  label TEXT NOT NULL,
  min_percent REAL NOT NULL CHECK(min_percent BETWEEN 0 AND 100),
  max_percent REAL NOT NULL CHECK(max_percent BETWEEN 0 AND 100),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE(scale_id,label),
  FOREIGN KEY(scale_id) REFERENCES grading_scales(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quiz_banks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS quiz_questions (
  id TEXT PRIMARY KEY,
  bank_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('single_choice','multiple_choice','true_false','short_text','long_text','numeric')),
  prompt TEXT NOT NULL,
  explanation TEXT,
  max_points REAL NOT NULL DEFAULT 1 CHECK(max_points > 0),
  answer_key_json TEXT,
  grading_mode TEXT NOT NULL DEFAULT 'manual' CHECK(grading_mode IN ('automatic','manual')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(bank_id) REFERENCES quiz_banks(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS quiz_question_options (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL,
  label TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK(is_correct IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS quizzes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed','archived')),
  opens_at TEXT,
  closes_at TEXT,
  time_limit_minutes INTEGER CHECK(time_limit_minutes IS NULL OR time_limit_minutes BETWEEN 1 AND 1440),
  max_attempts INTEGER NOT NULL DEFAULT 1 CHECK(max_attempts BETWEEN 1 AND 20),
  randomize_questions INTEGER NOT NULL DEFAULT 1 CHECK(randomize_questions IN (0,1)),
  randomize_options INTEGER NOT NULL DEFAULT 1 CHECK(randomize_options IN (0,1)),
  show_results_mode TEXT NOT NULL DEFAULT 'after_close' CHECK(show_results_mode IN ('never','after_submit','after_close')),
  gradebook_item_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(gradebook_item_id) REFERENCES gradebook_items(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_quizzes_course ON quizzes(tenant_id,course_id,status,created_at DESC);
CREATE TABLE IF NOT EXISTS quiz_question_links (
  quiz_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  points_override REAL CHECK(points_override IS NULL OR points_override > 0),
  PRIMARY KEY(quiz_id,question_id),
  FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  quiz_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  attempt_number INTEGER NOT NULL CHECK(attempt_number >= 1),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress','submitted','grading','graded','expired')),
  question_order_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  deadline_at TEXT,
  submitted_at TEXT,
  auto_points REAL NOT NULL DEFAULT 0,
  manual_points REAL NOT NULL DEFAULT 0,
  total_points REAL,
  graded_at TEXT,
  graded_by TEXT,
  UNIQUE(quiz_id,user_id,attempt_number),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_quiz_attempts_user ON quiz_attempts(tenant_id,course_id,user_id,quiz_id,attempt_number DESC);
CREATE TABLE IF NOT EXISTS quiz_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  answer_json TEXT,
  auto_points REAL,
  manual_points REAL,
  feedback TEXT,
  graded_by TEXT,
  graded_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(attempt_id,question_id),
  FOREIGN KEY(attempt_id) REFERENCES quiz_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY(question_id) REFERENCES quiz_questions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS course_templates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  source_course_id TEXT,
  snapshot_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','archived')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(source_course_id) REFERENCES courses(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_course_templates_tenant ON course_templates(tenant_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS course_clone_jobs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  target_course_id TEXT,
  target_name TEXT NOT NULL,
  target_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','completed','failed')),
  detail_json TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(template_id) REFERENCES course_templates(id) ON DELETE CASCADE,
  FOREIGN KEY(target_course_id) REFERENCES courses(id) ON DELETE SET NULL
);
