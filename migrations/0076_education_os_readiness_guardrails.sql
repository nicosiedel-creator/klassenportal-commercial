PRAGMA foreign_keys = ON;

-- Readiness history is intentionally aggregate. It allows trend analysis without
-- storing participant identities, individual attendance, grades or private notes.
CREATE TABLE IF NOT EXISTS education_readiness_snapshots (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  score REAL NOT NULL CHECK(score>=0 AND score<=100),
  readiness_status TEXT NOT NULL CHECK(readiness_status IN ('ready','attention','blocked')),
  dimensions_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  generated_by TEXT,
  generated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
  FOREIGN KEY(generated_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_readiness_course_time ON education_readiness_snapshots(tenant_id,course_id,generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_readiness_status ON education_readiness_snapshots(tenant_id,readiness_status,score,generated_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_readiness_snapshot_immutable_update
BEFORE UPDATE ON education_readiness_snapshots BEGIN SELECT RAISE(ABORT,'READINESS_SNAPSHOT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_readiness_snapshot_immutable_delete
BEFORE DELETE ON education_readiness_snapshots
WHEN OLD.generated_at>=datetime('now','-180 day')
BEGIN SELECT RAISE(ABORT,'READINESS_SNAPSHOT_RETENTION'); END;

-- Every productive Autopilot attempt receives a deterministic, append-only
-- guardrail evaluation. This is separate from the execution log so a rejected
-- plan remains explainable even when it never changed a productive row.
CREATE TABLE IF NOT EXISTS education_guardrail_evaluations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  scenario_id TEXT,
  option_id TEXT,
  execution_id TEXT,
  phase TEXT NOT NULL CHECK(phase IN ('pre_approval','pre_execution','post_execution','manual_check')),
  passed INTEGER NOT NULL CHECK(passed IN (0,1)),
  blockers_json TEXT NOT NULL,
  warnings_json TEXT NOT NULL,
  evidence_json TEXT NOT NULL,
  evidence_sha256 TEXT NOT NULL,
  evaluated_by TEXT,
  evaluated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(scenario_id) REFERENCES education_scenarios(id) ON DELETE SET NULL,
  FOREIGN KEY(option_id) REFERENCES education_scenario_options(id) ON DELETE SET NULL,
  FOREIGN KEY(execution_id) REFERENCES education_autopilot_executions(id) ON DELETE SET NULL,
  FOREIGN KEY(evaluated_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_guardrail_eval_scenario ON education_guardrail_evaluations(tenant_id,scenario_id,evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_guardrail_eval_execution ON education_guardrail_evaluations(tenant_id,execution_id,evaluated_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_guardrail_evaluation_immutable_update
BEFORE UPDATE ON education_guardrail_evaluations BEGIN SELECT RAISE(ABORT,'GUARDRAIL_EVALUATION_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_guardrail_evaluation_immutable_delete
BEFORE DELETE ON education_guardrail_evaluations BEGIN SELECT RAISE(ABORT,'GUARDRAIL_EVALUATION_IMMUTABLE'); END;
