PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS education_autopilot_circuit_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  execution_id TEXT,
  previous_mode TEXT,
  new_mode TEXT NOT NULL DEFAULT 'recommend_only',
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(execution_id) REFERENCES education_autopilot_executions(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_autopilot_circuit_events ON education_autopilot_circuit_events(tenant_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_autopilot_circuit_event_immutable_update
BEFORE UPDATE ON education_autopilot_circuit_events BEGIN SELECT RAISE(ABORT,'AUTOPILOT_CIRCUIT_EVENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_autopilot_circuit_event_immutable_delete
BEFORE DELETE ON education_autopilot_circuit_events BEGIN SELECT RAISE(ABORT,'AUTOPILOT_CIRCUIT_EVENT_IMMUTABLE'); END;

-- Three failed executions inside 15 minutes switch the tenant back to
-- recommend-only mode. A human tenant admin with MFA must deliberately re-enable
-- assisted execution after the root cause is understood.
CREATE TRIGGER IF NOT EXISTS trg_autopilot_failure_circuit_breaker
AFTER UPDATE OF status ON education_autopilot_executions
WHEN NEW.status='failed' AND OLD.status<>NEW.status
 AND (SELECT COUNT(*) FROM education_autopilot_executions e
       WHERE e.tenant_id=NEW.tenant_id AND e.status='failed'
         AND COALESCE(e.completed_at,e.started_at)>=datetime('now','-15 minute'))>=3
BEGIN
  INSERT INTO education_autopilot_circuit_events(id,tenant_id,reason,execution_id,previous_mode,new_mode,created_at)
  SELECT 'circuit_'||lower(hex(randomblob(16))),NEW.tenant_id,'three_failed_executions_15m',NEW.id,p.mode,'recommend_only',datetime('now')
    FROM education_autopilot_policies p
   WHERE p.tenant_id=NEW.tenant_id AND p.mode<>'recommend_only';
  UPDATE education_autopilot_policies
     SET mode='recommend_only',updated_at=datetime('now')
   WHERE tenant_id=NEW.tenant_id AND mode<>'recommend_only';
END;

-- A rollback is a strong signal that automation assumptions were wrong or the
-- outcome was unacceptable. Freeze further assisted execution immediately.
CREATE TRIGGER IF NOT EXISTS trg_autopilot_rollback_circuit_breaker
AFTER UPDATE OF status ON education_autopilot_executions
WHEN NEW.status='rolled_back' AND OLD.status<>NEW.status
BEGIN
  INSERT INTO education_autopilot_circuit_events(id,tenant_id,reason,execution_id,previous_mode,new_mode,created_at)
  SELECT 'circuit_'||lower(hex(randomblob(16))),NEW.tenant_id,'execution_rolled_back',NEW.id,p.mode,'recommend_only',datetime('now')
    FROM education_autopilot_policies p
   WHERE p.tenant_id=NEW.tenant_id AND p.mode<>'recommend_only';
  UPDATE education_autopilot_policies
     SET mode='recommend_only',updated_at=datetime('now')
   WHERE tenant_id=NEW.tenant_id AND mode<>'recommend_only';
END;
