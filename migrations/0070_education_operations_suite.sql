PRAGMA foreign_keys = ON;

-- Integrated education operations: curriculum, practice phases, examination workflows,
-- deadlines, teacher qualifications, substitution, quality and course lifecycle.

CREATE TABLE IF NOT EXISTS curriculum_frameworks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  authority_type TEXT NOT NULL DEFAULT 'internal' CHECK(authority_type IN ('ihk','hwk','vak','school','internal','custom','other')),
  version TEXT,
  valid_from TEXT,
  valid_until TEXT,
  source_reference TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','retired')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_curriculum_frameworks_tenant ON curriculum_frameworks(tenant_id,status,name);

CREATE TABLE IF NOT EXISTS curriculum_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  framework_id TEXT NOT NULL,
  parent_id TEXT,
  code TEXT,
  title TEXT NOT NULL,
  description TEXT,
  learning_objectives TEXT,
  target_minutes INTEGER NOT NULL DEFAULT 0 CHECK(target_minutes>=0),
  exam_relevant INTEGER NOT NULL DEFAULT 0 CHECK(exam_relevant IN (0,1)),
  mandatory INTEGER NOT NULL DEFAULT 1 CHECK(mandatory IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(framework_id) REFERENCES curriculum_frameworks(id) ON DELETE CASCADE,
  FOREIGN KEY(parent_id) REFERENCES curriculum_items(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_curriculum_items_framework ON curriculum_items(tenant_id,framework_id,sort_order,title);

CREATE TABLE IF NOT EXISTS course_curriculum_bindings (
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  framework_id TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 1 CHECK(is_primary IN (0,1)),
  assigned_by TEXT NOT NULL,
  assigned_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,course_id,framework_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(framework_id) REFERENCES curriculum_frameworks(id) ON DELETE CASCADE,
  FOREIGN KEY(assigned_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_course_curriculum_primary ON course_curriculum_bindings(tenant_id,course_id,is_primary);

CREATE TABLE IF NOT EXISTS curriculum_session_links (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  curriculum_item_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL DEFAULT 0 CHECK(planned_minutes>=0),
  actual_minutes INTEGER NOT NULL DEFAULT 0 CHECK(actual_minutes>=0),
  coverage_status TEXT NOT NULL DEFAULT 'covered' CHECK(coverage_status IN ('planned','partial','covered','review_required')),
  evidence_note TEXT,
  linked_by TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(curriculum_item_id) REFERENCES curriculum_items(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(linked_by) REFERENCES users(id),
  UNIQUE(tenant_id,course_id,curriculum_item_id,session_id)
);
CREATE INDEX IF NOT EXISTS idx_curriculum_session_links_course ON curriculum_session_links(tenant_id,course_id,curriculum_item_id);

CREATE TABLE IF NOT EXISTS practice_phases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  participant_user_id TEXT,
  host_name TEXT NOT NULL,
  host_contact_name TEXT,
  host_contact_email TEXT,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  objectives TEXT,
  activities_summary TEXT,
  evidence_status TEXT NOT NULL DEFAULT 'open' CHECK(evidence_status IN ('open','requested','received','reviewed','complete')),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','completed','cancelled')),
  visit_due_on TEXT,
  last_reviewed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(participant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_practice_phases_course ON practice_phases(tenant_id,course_id,status,starts_on);
CREATE INDEX IF NOT EXISTS idx_practice_phases_person ON practice_phases(tenant_id,participant_user_id,status);

CREATE TABLE IF NOT EXISTS exam_workflows (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  participant_user_id TEXT,
  authority_name TEXT NOT NULL,
  authority_type TEXT NOT NULL DEFAULT 'other' CHECK(authority_type IN ('ihk','hwk','vak','internal','other')),
  exam_title TEXT NOT NULL,
  registration_deadline TEXT,
  exam_date TEXT,
  status TEXT NOT NULL DEFAULT 'preparing' CHECK(status IN ('preparing','ready','submitted','admitted','rejected','completed','retake_required','cancelled')),
  admission_status TEXT,
  result_summary TEXT,
  retake_date TEXT,
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(participant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_exam_workflows_course ON exam_workflows(tenant_id,course_id,status,registration_deadline);
CREATE INDEX IF NOT EXISTS idx_exam_workflows_person ON exam_workflows(tenant_id,participant_user_id,status);

CREATE TABLE IF NOT EXISTS exam_workflow_requirements (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  workflow_id TEXT NOT NULL,
  requirement_key TEXT,
  title TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','complete','waived','rejected')),
  due_on TEXT,
  evidence_file_id TEXT,
  note TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(workflow_id) REFERENCES exam_workflows(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_file_id) REFERENCES portability_files(id) ON DELETE SET NULL,
  FOREIGN KEY(updated_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_exam_requirements_workflow ON exam_workflow_requirements(tenant_id,workflow_id,status);

CREATE TABLE IF NOT EXISTS operational_deadlines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  participant_user_id TEXT,
  owner_user_id TEXT,
  category TEXT NOT NULL CHECK(category IN ('exam','practice','classbook','curriculum','document','teacher','quality','course','other')),
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT NOT NULL,
  escalation_at TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done','cancelled')),
  source_type TEXT,
  source_id TEXT,
  completed_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(participant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_operational_deadlines_due ON operational_deadlines(tenant_id,status,due_at,priority);
CREATE INDEX IF NOT EXISTS idx_operational_deadlines_course ON operational_deadlines(tenant_id,course_id,status,due_at);

CREATE TABLE IF NOT EXISTS teacher_qualifications (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  teacher_id TEXT NOT NULL,
  subject_id TEXT,
  qualification_type TEXT NOT NULL DEFAULT 'other' CHECK(qualification_type IN ('degree','certificate','trainer','examiner','subject_approval','compliance','other')),
  title TEXT NOT NULL,
  issuer TEXT,
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'valid' CHECK(status IN ('pending','valid','expired','revoked')),
  document_file_id TEXT,
  verified_by TEXT,
  verified_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  FOREIGN KEY(document_file_id) REFERENCES portability_files(id) ON DELETE SET NULL,
  FOREIGN KEY(verified_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_qualifications ON teacher_qualifications(tenant_id,teacher_id,status,valid_until);

CREATE TABLE IF NOT EXISTS substitution_cases (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT,
  absent_teacher_id TEXT,
  substitute_teacher_id TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','assigned','rescheduled','cancelled','completed')),
  reason TEXT,
  replacement_starts_at TEXT,
  replacement_ends_at TEXT,
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE SET NULL,
  FOREIGN KEY(absent_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  FOREIGN KEY(substitute_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_substitution_cases_course ON substitution_cases(tenant_id,course_id,status,replacement_starts_at);

CREATE TABLE IF NOT EXISTS quality_actions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  org_unit_id TEXT,
  owner_user_id TEXT,
  category TEXT NOT NULL DEFAULT 'quality' CHECK(category IN ('quality','classbook','curriculum','exam','practice','teacher','document','complaint','audit','other')),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low','normal','high','critical')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','blocked','resolved','cancelled')),
  due_at TEXT,
  source_type TEXT,
  source_id TEXT,
  resolution TEXT,
  resolved_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(org_unit_id) REFERENCES org_units(id) ON DELETE SET NULL,
  FOREIGN KEY(owner_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_quality_actions_open ON quality_actions(tenant_id,status,priority,due_at);
CREATE INDEX IF NOT EXISTS idx_quality_actions_course ON quality_actions(tenant_id,course_id,status);

CREATE TABLE IF NOT EXISTS course_lifecycle (
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  stage TEXT NOT NULL DEFAULT 'planning' CHECK(stage IN ('planning','onboarding','active','practice','exam','closing','archived')),
  readiness_status TEXT NOT NULL DEFAULT 'attention' CHECK(readiness_status IN ('ready','attention','blocked')),
  stage_started_at TEXT NOT NULL,
  expected_completion_at TEXT,
  archived_at TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,course_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS course_lifecycle_items (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK(stage IN ('planning','onboarding','active','practice','exam','closing','archived')),
  item_key TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'course',
  required INTEGER NOT NULL DEFAULT 1 CHECK(required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','done','waived','blocked')),
  due_at TEXT,
  evidence_file_id TEXT,
  note TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(evidence_file_id) REFERENCES portability_files(id) ON DELETE SET NULL,
  FOREIGN KEY(updated_by) REFERENCES users(id),
  UNIQUE(tenant_id,course_id,item_key)
);
CREATE INDEX IF NOT EXISTS idx_course_lifecycle_items ON course_lifecycle_items(tenant_id,course_id,stage,status);

CREATE TABLE IF NOT EXISTS education_document_registry (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  participant_user_id TEXT,
  teacher_id TEXT,
  category TEXT NOT NULL CHECK(category IN ('curriculum','exam','practice','teacher','approval','quality','contract','certificate','correspondence','other')),
  title TEXT NOT NULL,
  file_id TEXT,
  external_reference TEXT,
  version TEXT,
  valid_from TEXT,
  valid_until TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','expired','superseded','archived')),
  responsible_user_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(participant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
  FOREIGN KEY(file_id) REFERENCES portability_files(id) ON DELETE SET NULL,
  FOREIGN KEY(responsible_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_education_documents ON education_document_registry(tenant_id,course_id,category,status,valid_until);

CREATE TABLE IF NOT EXISTS education_alert_runs (
  tenant_id TEXT NOT NULL,
  alert_key TEXT NOT NULL,
  source_id TEXT NOT NULL,
  last_notified_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,alert_key,source_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
