-- EIN360 moat foundations: EU training compliance, learner twin, multilingual portal,
-- partner access and migration quality. All regulatory packs are advisory/configurable;
-- no row represents a final legal determination.
CREATE TABLE IF NOT EXISTS tenant_compliance_programs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  program_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','paused','retired')),
  rules_version TEXT,
  source_reference TEXT,
  verified_at TEXT,
  verified_by TEXT,
  configured_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(tenant_id,program_key)
);
CREATE INDEX IF NOT EXISTS idx_tenant_compliance_programs_tenant ON tenant_compliance_programs(tenant_id,status);

CREATE TABLE IF NOT EXISTS compliance_requirements(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  program_key TEXT NOT NULL,
  course_id TEXT,
  participant_user_id TEXT,
  requirement_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  due_at TEXT,
  evidence_type TEXT NOT NULL DEFAULT 'document',
  source_reference TEXT,
  rule_version TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','fulfilled','not_applicable','needs_review')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_requirements_scope ON compliance_requirements(tenant_id,course_id,status,due_at);

CREATE TABLE IF NOT EXISTS compliance_evidence(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  requirement_id TEXT NOT NULL,
  course_id TEXT,
  participant_user_id TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  source_sha256 TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(requirement_id) REFERENCES compliance_requirements(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_compliance_evidence_requirement ON compliance_evidence(tenant_id,requirement_id,created_at);

CREATE TABLE IF NOT EXISTS compliance_findings(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  participant_user_id TEXT,
  program_key TEXT,
  severity TEXT NOT NULL CHECK(severity IN ('info','low','medium','high','critical')),
  finding_type TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  source_reference TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','resolved','ignored')),
  detected_at TEXT NOT NULL,
  resolved_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_compliance_findings_open ON compliance_findings(tenant_id,status,severity,detected_at);

CREATE TABLE IF NOT EXISTS compliance_evidence_packages(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  period_from TEXT,
  period_to TEXT,
  graph_sha256 TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_compliance_packages_course ON compliance_evidence_packages(tenant_id,course_id,created_at);

CREATE TABLE IF NOT EXISTS portal_language_preferences(
  tenant_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  locale TEXT NOT NULL,
  explanation_level TEXT NOT NULL DEFAULT 'standard' CHECK(explanation_level IN ('simple','standard','advanced')),
  rtl INTEGER NOT NULL DEFAULT 0 CHECK(rtl IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,user_id)
);

CREATE TABLE IF NOT EXISTS learner_twin_snapshots(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  participant_user_id TEXT NOT NULL,
  captured_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learner_twin_user ON learner_twin_snapshots(tenant_id,participant_user_id,course_id,captured_at);

CREATE TRIGGER IF NOT EXISTS trg_learner_twin_snapshot_immutable_update
BEFORE UPDATE ON learner_twin_snapshots BEGIN SELECT RAISE(ABORT,'LEARNER_TWIN_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_learner_twin_snapshot_immutable_delete
BEFORE DELETE ON learner_twin_snapshots BEGIN SELECT RAISE(ABORT,'LEARNER_TWIN_SNAPSHOT_IMMUTABLE'); END;

CREATE TABLE IF NOT EXISTS learner_coach_plans(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  participant_user_id TEXT NOT NULL,
  target_json TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  source_twin_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','dismissed','superseded')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_learner_coach_user ON learner_coach_plans(tenant_id,participant_user_id,course_id,status,created_at);

CREATE TABLE IF NOT EXISTS partner_access_grants(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  partner_type TEXT NOT NULL,
  partner_name TEXT NOT NULL,
  partner_email TEXT,
  course_id TEXT,
  participant_user_id TEXT,
  capabilities_json TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','revoked','expired')),
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_partner_grants_tenant ON partner_access_grants(tenant_id,status,expires_at);

CREATE TABLE IF NOT EXISTS migration_quality_runs(
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  batch_key TEXT,
  total_records INTEGER NOT NULL,
  accepted_records INTEGER NOT NULL,
  warning_records INTEGER NOT NULL,
  rejected_records INTEGER NOT NULL,
  confidence REAL NOT NULL,
  findings_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_migration_quality_tenant ON migration_quality_runs(tenant_id,created_at);
