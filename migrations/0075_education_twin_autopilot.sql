PRAGMA foreign_keys = ON;

-- Immutable snapshots of the operational education state. The payload deliberately
-- contains operational/aggregate information only; personal grades and private notes
-- are never part of the twin.
CREATE TABLE IF NOT EXISTS education_twin_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'tenant' CHECK(scope_type IN ('tenant','course','org')),
  scope_id TEXT,
  schema_version INTEGER NOT NULL DEFAULT 1,
  captured_at TEXT NOT NULL,
  captured_by TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  entity_counts_json TEXT NOT NULL,
  source_clock_json TEXT NOT NULL,
  expires_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(captured_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_twin_snapshot_scope ON education_twin_snapshots(tenant_id,scope_type,scope_id,captured_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_twin_snapshot_digest ON education_twin_snapshots(tenant_id,payload_sha256,captured_at);
CREATE TRIGGER IF NOT EXISTS trg_twin_snapshot_immutable
BEFORE UPDATE ON education_twin_snapshots BEGIN SELECT RAISE(ABORT,'TWIN_SNAPSHOT_IMMUTABLE'); END;

-- Every simulation is bound to exactly one immutable twin snapshot.
CREATE TABLE IF NOT EXISTS education_scenarios (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'tenant' CHECK(scope_type IN ('tenant','course','org')),
  scope_id TEXT,
  scenario_type TEXT NOT NULL,
  intent_text TEXT,
  input_json TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'simulated' CHECK(status IN ('draft','simulated','approved','executing','executed','rejected','stale','failed','cancelled')),
  risk_level TEXT NOT NULL DEFAULT 'medium' CHECK(risk_level IN ('low','medium','high','critical')),
  recommended_option_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(snapshot_id) REFERENCES education_twin_snapshots(id),
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_scenario_tenant_status ON education_scenarios(tenant_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scenario_scope ON education_scenarios(tenant_id,scope_type,scope_id,created_at DESC);

CREATE TABLE IF NOT EXISTS education_scenario_options (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  label TEXT NOT NULL,
  score_total REAL NOT NULL,
  score_components_json TEXT NOT NULL,
  rationale_json TEXT NOT NULL,
  consequences_json TEXT NOT NULL,
  action_plan_json TEXT NOT NULL,
  plan_sha256 TEXT NOT NULL,
  risk_level TEXT NOT NULL CHECK(risk_level IN ('low','medium','high','critical')),
  requires_dual_approval INTEGER NOT NULL DEFAULT 0 CHECK(requires_dual_approval IN (0,1)),
  executable INTEGER NOT NULL DEFAULT 1 CHECK(executable IN (0,1)),
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_id) REFERENCES education_scenarios(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,scenario_id,strategy)
);
CREATE INDEX IF NOT EXISTS idx_scenario_options_score ON education_scenario_options(tenant_id,scenario_id,score_total DESC);
CREATE TRIGGER IF NOT EXISTS trg_scenario_option_immutable
BEFORE UPDATE ON education_scenario_options BEGIN SELECT RAISE(ABORT,'SCENARIO_OPTION_IMMUTABLE'); END;

-- Approval records are append-only and cryptographically bound to snapshot + plan.
CREATE TABLE IF NOT EXISTS education_scenario_approvals (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  approver_user_id TEXT NOT NULL,
  decision TEXT NOT NULL CHECK(decision IN ('approve','reject')),
  approval_role TEXT NOT NULL,
  snapshot_sha256 TEXT NOT NULL,
  plan_sha256 TEXT NOT NULL,
  comment TEXT,
  decided_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_id) REFERENCES education_scenarios(id) ON DELETE CASCADE,
  FOREIGN KEY(option_id) REFERENCES education_scenario_options(id) ON DELETE CASCADE,
  FOREIGN KEY(approver_user_id) REFERENCES users(id),
  UNIQUE(tenant_id,scenario_id,option_id,approver_user_id)
);
CREATE INDEX IF NOT EXISTS idx_scenario_approvals ON education_scenario_approvals(tenant_id,scenario_id,option_id,decision);
CREATE TRIGGER IF NOT EXISTS trg_scenario_approval_immutable_update
BEFORE UPDATE ON education_scenario_approvals BEGIN SELECT RAISE(ABORT,'SCENARIO_APPROVAL_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_scenario_approval_immutable_delete
BEFORE DELETE ON education_scenario_approvals BEGIN SELECT RAISE(ABORT,'SCENARIO_APPROVAL_IMMUTABLE'); END;

CREATE TABLE IF NOT EXISTS education_autopilot_executions (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scenario_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','executing','complete','failed','rolled_back','partial')),
  requested_by TEXT NOT NULL,
  precondition_snapshot_sha256 TEXT NOT NULL,
  plan_sha256 TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  result_json TEXT,
  error_code TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_id) REFERENCES education_scenarios(id),
  FOREIGN KEY(option_id) REFERENCES education_scenario_options(id),
  FOREIGN KEY(requested_by) REFERENCES users(id),
  UNIQUE(tenant_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_autopilot_execution ON education_autopilot_executions(tenant_id,status,started_at DESC);

CREATE TABLE IF NOT EXISTS education_autopilot_execution_steps (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  execution_id TEXT NOT NULL,
  step_no INTEGER NOT NULL,
  action_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  before_json TEXT,
  after_json TEXT,
  reversible INTEGER NOT NULL DEFAULT 0 CHECK(reversible IN (0,1)),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','executing','complete','failed','rolled_back','skipped')),
  error_code TEXT,
  executed_at TEXT,
  rolled_back_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(execution_id) REFERENCES education_autopilot_executions(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,execution_id,step_no)
);
CREATE INDEX IF NOT EXISTS idx_autopilot_steps ON education_autopilot_execution_steps(tenant_id,execution_id,step_no);

-- One tenant may have at most one active execution lease. Leases expire automatically
-- in code and protect against concurrent autopilot writes.
CREATE TABLE IF NOT EXISTS education_autopilot_locks (
  tenant_id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL,
  acquired_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(execution_id) REFERENCES education_autopilot_executions(id) ON DELETE CASCADE
);

-- Fail-closed by default. Critical plans are never auto-executed; high plans use dual control.
CREATE TABLE IF NOT EXISTS education_autopilot_policies (
  tenant_id TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'recommend_only' CHECK(mode IN ('recommend_only','assisted','safe_auto')),
  max_auto_risk TEXT NOT NULL DEFAULT 'low' CHECK(max_auto_risk IN ('low','medium')),
  require_mfa INTEGER NOT NULL DEFAULT 1 CHECK(require_mfa IN (0,1)),
  dual_approval_from_risk TEXT NOT NULL DEFAULT 'high' CHECK(dual_approval_from_risk IN ('medium','high','critical')),
  max_actions_per_execution INTEGER NOT NULL DEFAULT 100 CHECK(max_actions_per_execution BETWEEN 1 AND 500),
  max_courses_per_execution INTEGER NOT NULL DEFAULT 10 CHECK(max_courses_per_execution BETWEEN 1 AND 100),
  allow_automatic_notifications INTEGER NOT NULL DEFAULT 1 CHECK(allow_automatic_notifications IN (0,1)),
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(updated_by) REFERENCES users(id)
);

-- Future Radar. Findings are operational and never contain private grades/notes.
CREATE TABLE IF NOT EXISTS education_risks (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  risk_key TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','low','medium','high','critical')),
  horizon_date TEXT,
  title TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  suggested_scenario_type TEXT,
  suggested_input_json TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','acknowledged','snoozed','resolved')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,risk_key)
);
CREATE INDEX IF NOT EXISTS idx_education_risks_open ON education_risks(tenant_id,status,severity,horizon_date);
CREATE INDEX IF NOT EXISTS idx_education_risks_course ON education_risks(tenant_id,course_id,status,severity);

-- Self-healing is proposal-first: inconsistencies are detected and explained. A fix may
-- only be executed through a scenario/autopilot plan, never silently.
CREATE TABLE IF NOT EXISTS education_consistency_findings (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  finding_key TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL CHECK(severity IN ('info','low','medium','high','critical')),
  title TEXT NOT NULL,
  expected_json TEXT,
  actual_json TEXT,
  suggested_fix_json TEXT,
  confidence REAL NOT NULL DEFAULT 1 CHECK(confidence>=0 AND confidence<=1),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','accepted','rejected','resolved')),
  detected_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  UNIQUE(tenant_id,finding_key)
);
CREATE INDEX IF NOT EXISTS idx_consistency_findings ON education_consistency_findings(tenant_id,status,severity,course_id);

-- Proof packages are immutable evidence graphs. Their source entities remain in the
-- operational tables; the package freezes the exact graph and digest used for an export.
CREATE TABLE IF NOT EXISTS education_proof_packages (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  package_type TEXT NOT NULL DEFAULT 'education_proof' CHECK(package_type IN ('education_proof','exam_readiness','funding_audit','quality_audit','custom')),
  title TEXT NOT NULL,
  from_date TEXT,
  to_date TEXT,
  twin_snapshot_sha256 TEXT,
  graph_json TEXT NOT NULL,
  graph_sha256 TEXT NOT NULL,
  completeness_json TEXT NOT NULL,
  generated_by TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(generated_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_proof_packages_course ON education_proof_packages(tenant_id,course_id,generated_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_proof_package_immutable
BEFORE UPDATE ON education_proof_packages BEGIN SELECT RAISE(ABORT,'PROOF_PACKAGE_IMMUTABLE'); END;

-- Append-only event stream used for impact tracing and provenance.
CREATE TABLE IF NOT EXISTS education_twin_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT,
  correlation_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  source_type TEXT NOT NULL,
  source_id TEXT,
  payload_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_twin_events_tenant_time ON education_twin_events(tenant_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_twin_events_course_time ON education_twin_events(tenant_id,course_id,occurred_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_twin_event_immutable_update
BEFORE UPDATE ON education_twin_events BEGIN SELECT RAISE(ABORT,'TWIN_EVENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_twin_event_immutable_delete
BEFORE DELETE ON education_twin_events BEGIN SELECT RAISE(ABORT,'TWIN_EVENT_IMMUTABLE'); END;
