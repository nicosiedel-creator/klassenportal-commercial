PRAGMA foreign_keys = ON;

-- Learning/activity context for regular lessons and classbook sessions.
CREATE TABLE IF NOT EXISTS instruction_activity_details (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT,
  session_id TEXT,
  activity_type TEXT NOT NULL DEFAULT 'classroom' CHECK(activity_type IN ('classroom','live_remote','hybrid_live','self_study_home','self_study_school','self_study_other','excursion','project','workshop','exam','practice','other')),
  location_label TEXT,
  supervision_mode TEXT NOT NULL DEFAULT 'instructor' CHECK(supervision_mode IN ('instructor','remote_instructor','self_directed','external_supervisor','mixed','none')),
  attendance_expected INTEGER NOT NULL DEFAULT 1 CHECK(attendance_expected IN (0,1)),
  evidence_required INTEGER NOT NULL DEFAULT 0 CHECK(evidence_required IN (0,1)),
  task_text TEXT,
  expected_outcome TEXT,
  safety_notes TEXT,
  external_contact TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE CASCADE,
  FOREIGN KEY(session_id) REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  CHECK(lesson_id IS NOT NULL OR session_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_instruction_activity_lesson ON instruction_activity_details(tenant_id,lesson_id) WHERE lesson_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_instruction_activity_session ON instruction_activity_details(tenant_id,session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_instruction_activity_course ON instruction_activity_details(tenant_id,course_id,activity_type);

-- Extra excursion details that can be attached to a planned or published event.
CREATE TABLE IF NOT EXISTS excursion_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  lesson_id TEXT,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  meeting_point TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  responsible_teacher_id TEXT,
  external_contact TEXT,
  transport TEXT,
  learning_objective TEXT,
  safety_notes TEXT,
  consent_required INTEGER NOT NULL DEFAULT 0 CHECK(consent_required IN (0,1)),
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','confirmed','completed','cancelled')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(lesson_id) REFERENCES lessons(id) ON DELETE SET NULL,
  FOREIGN KEY(responsible_teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id),
  CHECK(starts_at < ends_at)
);
CREATE INDEX IF NOT EXISTS idx_excursion_course_time ON excursion_events(tenant_id,course_id,starts_at,status);

-- Draftable timetable planning before publishing into lessons.
CREATE TABLE IF NOT EXISTS timetable_plan_versions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','review','published','archived')),
  notes TEXT,
  published_at TEXT,
  published_by TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(published_by) REFERENCES users(id),
  FOREIGN KEY(created_by) REFERENCES users(id),
  CHECK(starts_on <= ends_on)
);
CREATE INDEX IF NOT EXISTS idx_timetable_plan_versions ON timetable_plan_versions(tenant_id,status,starts_on,ends_on);

CREATE TABLE IF NOT EXISTS timetable_plan_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  subject_id TEXT,
  subject_text TEXT,
  teacher_id TEXT,
  teacher_text TEXT,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  room TEXT,
  activity_type TEXT NOT NULL DEFAULT 'classroom' CHECK(activity_type IN ('classroom','live_remote','hybrid_live','self_study_home','self_study_school','self_study_other','excursion','project','workshop','exam','practice','other')),
  location_label TEXT,
  supervision_mode TEXT NOT NULL DEFAULT 'instructor' CHECK(supervision_mode IN ('instructor','remote_instructor','self_directed','external_supervisor','mixed','none')),
  attendance_expected INTEGER NOT NULL DEFAULT 1 CHECK(attendance_expected IN (0,1)),
  task_text TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','copy','import','template','automation')),
  recurrence_group TEXT,
  published_lesson_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES timetable_plan_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(subject_id) REFERENCES subjects(id) ON DELETE SET NULL,
  FOREIGN KEY(teacher_id) REFERENCES teachers(id) ON DELETE SET NULL,
  FOREIGN KEY(published_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id),
  CHECK(starts_at < ends_at)
);
CREATE INDEX IF NOT EXISTS idx_timetable_plan_entries_plan ON timetable_plan_entries(tenant_id,plan_id,starts_at);
CREATE INDEX IF NOT EXISTS idx_timetable_plan_entries_teacher ON timetable_plan_entries(tenant_id,teacher_id,starts_at,ends_at);
CREATE INDEX IF NOT EXISTS idx_timetable_plan_entries_course ON timetable_plan_entries(tenant_id,course_id,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS timetable_plan_conflicts (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,
  conflicting_entry_id TEXT,
  conflict_type TEXT NOT NULL CHECK(conflict_type IN ('course_overlap','teacher_overlap','room_overlap','outside_course_period','missing_teacher','missing_subject','other')),
  severity TEXT NOT NULL DEFAULT 'error' CHECK(severity IN ('info','warning','error')),
  message TEXT NOT NULL,
  detected_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES timetable_plan_versions(id) ON DELETE CASCADE,
  FOREIGN KEY(entry_id) REFERENCES timetable_plan_entries(id) ON DELETE CASCADE,
  FOREIGN KEY(conflicting_entry_id) REFERENCES timetable_plan_entries(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_timetable_plan_conflicts ON timetable_plan_conflicts(tenant_id,plan_id,resolved_at,severity);

-- Electronic confirmation/signature ledger. "platform_authenticated" is deliberately not called QES.
CREATE TABLE IF NOT EXISTS signature_documents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  document_type TEXT NOT NULL CHECK(document_type IN ('report_book','excursion_consent','classbook_evidence','practice_evidence','certificate_acknowledgement','custom')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  title TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  signature_level TEXT NOT NULL DEFAULT 'platform_authenticated' CHECK(signature_level IN ('platform_authenticated','external_advanced','external_qualified')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','partially_signed','complete','cancelled','superseded')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id),
  UNIQUE(tenant_id,document_type,entity_type,entity_id,status)
);
CREATE INDEX IF NOT EXISTS idx_signature_documents ON signature_documents(tenant_id,course_id,status,document_type);

CREATE TABLE IF NOT EXISTS signature_requests (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  signer_user_id TEXT,
  signer_role TEXT NOT NULL,
  signing_order INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','signed','declined','cancelled')),
  due_at TEXT,
  reminder_after TEXT,
  signed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(document_id) REFERENCES signature_documents(id) ON DELETE CASCADE,
  FOREIGN KEY(signer_user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_signature_requests_user ON signature_requests(tenant_id,signer_user_id,status,due_at);
CREATE INDEX IF NOT EXISTS idx_signature_requests_document ON signature_requests(tenant_id,document_id,signing_order,status);

CREATE TABLE IF NOT EXISTS digital_signatures (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  request_id TEXT NOT NULL UNIQUE,
  signer_user_id TEXT NOT NULL,
  signer_display_name TEXT NOT NULL,
  signer_role TEXT NOT NULL,
  method TEXT NOT NULL CHECK(method IN ('platform_authenticated','external_advanced','external_qualified')),
  document_sha256 TEXT NOT NULL,
  declaration_text TEXT NOT NULL,
  signed_at TEXT NOT NULL,
  auth_method TEXT,
  mfa_verified INTEGER NOT NULL DEFAULT 0 CHECK(mfa_verified IN (0,1)),
  provider TEXT,
  provider_reference TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(document_id) REFERENCES signature_documents(id) ON DELETE CASCADE,
  FOREIGN KEY(request_id) REFERENCES signature_requests(id) ON DELETE CASCADE,
  FOREIGN KEY(signer_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_digital_signatures_document ON digital_signatures(tenant_id,document_id,signed_at);

-- Digital report book / Ausbildungsnachweis.
CREATE TABLE IF NOT EXISTS report_book_periods (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  participant_user_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','revision_required','approved','signed','archived')),
  total_minutes INTEGER NOT NULL DEFAULT 0 CHECK(total_minutes>=0),
  submitted_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  signature_document_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(participant_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reviewed_by) REFERENCES users(id),
  FOREIGN KEY(signature_document_id) REFERENCES signature_documents(id) ON DELETE SET NULL,
  CHECK(period_start <= period_end),
  UNIQUE(tenant_id,course_id,participant_user_id,period_start,period_end)
);
CREATE INDEX IF NOT EXISTS idx_report_book_periods_user ON report_book_periods(tenant_id,participant_user_id,course_id,period_start DESC);
CREATE INDEX IF NOT EXISTS idx_report_book_periods_review ON report_book_periods(tenant_id,course_id,status,period_end);

CREATE TABLE IF NOT EXISTS report_book_entries (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_id TEXT NOT NULL,
  entry_date TEXT NOT NULL,
  activity_type TEXT NOT NULL DEFAULT 'classroom' CHECK(activity_type IN ('classroom','live_remote','hybrid_live','self_study_home','self_study_school','self_study_other','excursion','project','workshop','exam','practice','other')),
  location_label TEXT,
  subject_text TEXT,
  minutes INTEGER NOT NULL DEFAULT 0 CHECK(minutes BETWEEN 0 AND 1440),
  activity_text TEXT NOT NULL,
  learning_outcome TEXT,
  source_type TEXT NOT NULL DEFAULT 'manual' CHECK(source_type IN ('manual','lesson','self_study','practice','excursion','legacy_import')),
  source_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(period_id) REFERENCES report_book_periods(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_report_book_entries_period ON report_book_entries(tenant_id,period_id,entry_date);

-- Mid-year rollout / legacy history import.
CREATE TABLE IF NOT EXISTS legacy_import_batches (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  resource_type TEXT NOT NULL CHECK(resource_type IN ('classbook','timetable','curriculum','report_book','attendance_summary','documents','mixed')),
  mode TEXT NOT NULL DEFAULT 'merge' CHECK(mode IN ('merge','archive_only','baseline')),
  original_name TEXT NOT NULL,
  source_file_id TEXT,
  source_sha256 TEXT,
  status TEXT NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','validated','applied','archived','failed','cancelled')),
  row_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  started_mid_course INTEGER NOT NULL DEFAULT 0 CHECK(started_mid_course IN (0,1)),
  notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT,
  error_message TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(source_file_id) REFERENCES portability_files(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_legacy_import_batches ON legacy_import_batches(tenant_id,course_id,created_at DESC);

CREATE TABLE IF NOT EXISTS legacy_import_rows (
  batch_id TEXT NOT NULL,
  row_no INTEGER NOT NULL,
  row_json TEXT NOT NULL,
  normalized_json TEXT,
  status TEXT NOT NULL DEFAULT 'ready' CHECK(status IN ('ready','warning','error','applied','skipped')),
  message TEXT,
  target_type TEXT,
  target_id TEXT,
  PRIMARY KEY(batch_id,row_no),
  FOREIGN KEY(batch_id) REFERENCES legacy_import_batches(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_legacy_import_rows_status ON legacy_import_rows(batch_id,status,row_no);

CREATE TABLE IF NOT EXISTS legacy_baselines (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  baseline_type TEXT NOT NULL CHECK(baseline_type IN ('curriculum_minutes','attendance_summary','classbook_count','other')),
  baseline_date TEXT NOT NULL,
  data_json TEXT NOT NULL,
  source_batch_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(source_batch_id) REFERENCES legacy_import_batches(id) ON DELETE SET NULL,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_legacy_baselines_course ON legacy_baselines(tenant_id,course_id,baseline_type,baseline_date);
