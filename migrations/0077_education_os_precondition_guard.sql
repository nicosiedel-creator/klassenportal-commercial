PRAGMA foreign_keys = ON;

-- Deliberately empty guard table. Autopilot preconditions execute
-- `INSERT ... SELECT 2 WHERE NOT EXISTS(...)`. The CHECK constraint rejects 2,
-- which aborts the surrounding D1 batch atomically if a precondition is stale.
CREATE TABLE IF NOT EXISTS education_autopilot_precondition_guard (
  id INTEGER PRIMARY KEY CHECK(id=1)
);
