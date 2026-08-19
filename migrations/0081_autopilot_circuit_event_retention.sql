PRAGMA foreign_keys = OFF;

-- Circuit-breaker evidence must outlive routine execution retention. Keep the
-- execution id as an immutable historical reference rather than an FK that could
-- force an UPDATE/NULL on the append-only event.
CREATE TABLE education_autopilot_circuit_events_v2 (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  reason TEXT NOT NULL,
  execution_id TEXT,
  previous_mode TEXT,
  new_mode TEXT NOT NULL DEFAULT 'recommend_only',
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
INSERT INTO education_autopilot_circuit_events_v2(id,tenant_id,reason,execution_id,previous_mode,new_mode,created_at)
SELECT id,tenant_id,reason,execution_id,previous_mode,new_mode,created_at FROM education_autopilot_circuit_events;
DROP TABLE education_autopilot_circuit_events;
ALTER TABLE education_autopilot_circuit_events_v2 RENAME TO education_autopilot_circuit_events;
CREATE INDEX IF NOT EXISTS idx_autopilot_circuit_events ON education_autopilot_circuit_events(tenant_id,created_at DESC);
CREATE TRIGGER IF NOT EXISTS trg_autopilot_circuit_event_immutable_update
BEFORE UPDATE ON education_autopilot_circuit_events BEGIN SELECT RAISE(ABORT,'AUTOPILOT_CIRCUIT_EVENT_IMMUTABLE'); END;
CREATE TRIGGER IF NOT EXISTS trg_autopilot_circuit_event_immutable_delete
BEFORE DELETE ON education_autopilot_circuit_events BEGIN SELECT RAISE(ABORT,'AUTOPILOT_CIRCUIT_EVENT_IMMUTABLE'); END;

PRAGMA foreign_keys = ON;
