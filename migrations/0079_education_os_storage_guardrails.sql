PRAGMA foreign_keys = ON;

-- Defense-in-depth against accidental or abusive scenario/snapshot generation.
-- These limits are intentionally generous for legitimate operations but fail
-- before one tenant can create unbounded operational evidence in a short window.
CREATE TRIGGER IF NOT EXISTS trg_twin_snapshot_rate_guard
BEFORE INSERT ON education_twin_snapshots
WHEN (SELECT COUNT(*) FROM education_twin_snapshots WHERE tenant_id=NEW.tenant_id AND captured_at>=datetime('now','-1 hour'))>=1000
BEGIN SELECT RAISE(ABORT,'EDUCATION_OS_SNAPSHOT_RATE_LIMIT'); END;

CREATE TRIGGER IF NOT EXISTS trg_scenario_rate_guard
BEFORE INSERT ON education_scenarios
WHEN (SELECT COUNT(*) FROM education_scenarios WHERE tenant_id=NEW.tenant_id AND created_at>=datetime('now','-1 hour'))>=500
BEGIN SELECT RAISE(ABORT,'EDUCATION_OS_SCENARIO_RATE_LIMIT'); END;

CREATE TRIGGER IF NOT EXISTS trg_proof_package_rate_guard
BEFORE INSERT ON education_proof_packages
WHEN (SELECT COUNT(*) FROM education_proof_packages WHERE tenant_id=NEW.tenant_id AND course_id=NEW.course_id AND generated_at>=datetime('now','-1 hour'))>=100
BEGIN SELECT RAISE(ABORT,'EDUCATION_OS_PROOF_RATE_LIMIT'); END;

-- Bound stored JSON payloads. A giant Twin or action plan should be split or
-- narrowed to a smaller scope instead of becoming an unbounded D1 row.
CREATE TRIGGER IF NOT EXISTS trg_twin_snapshot_size_guard
BEFORE INSERT ON education_twin_snapshots
WHEN length(NEW.payload_json)>12582912
BEGIN SELECT RAISE(ABORT,'EDUCATION_OS_TWIN_TOO_LARGE'); END;

CREATE TRIGGER IF NOT EXISTS trg_scenario_input_size_guard
BEFORE INSERT ON education_scenarios
WHEN length(NEW.input_json)>262144 OR length(COALESCE(NEW.intent_text,''))>10000
BEGIN SELECT RAISE(ABORT,'EDUCATION_OS_SCENARIO_INPUT_TOO_LARGE'); END;

CREATE TRIGGER IF NOT EXISTS trg_scenario_option_size_guard
BEFORE INSERT ON education_scenario_options
WHEN length(NEW.action_plan_json)>2097152 OR length(NEW.consequences_json)>1048576 OR length(NEW.rationale_json)>262144
BEGIN SELECT RAISE(ABORT,'EDUCATION_OS_SCENARIO_PLAN_TOO_LARGE'); END;

CREATE TRIGGER IF NOT EXISTS trg_twin_event_size_guard
BEFORE INSERT ON education_twin_events
WHEN length(NEW.payload_json)>1048576
BEGIN SELECT RAISE(ABORT,'EDUCATION_OS_EVENT_TOO_LARGE'); END;

CREATE TRIGGER IF NOT EXISTS trg_proof_package_size_guard
BEFORE INSERT ON education_proof_packages
WHEN length(NEW.graph_json)>12582912 OR length(NEW.completeness_json)>262144
BEGIN SELECT RAISE(ABORT,'EDUCATION_OS_PROOF_TOO_LARGE'); END;
