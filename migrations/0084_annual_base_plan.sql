PRAGMA foreign_keys = ON;

-- Annual base plans are imported as planning_blackouts / planning phases so the
-- existing planner, Live Education Twin and Future Radar share one source of truth.
CREATE TABLE IF NOT EXISTS annual_plan_import_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'sync' CHECK(mode IN ('sync','append')),
  row_count INTEGER NOT NULL DEFAULT 0,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'staging' CHECK(status IN ('staging','completed','failed')),
  date_from TEXT,
  date_to TEXT,
  error_message TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_annual_plan_runs_tenant
  ON annual_plan_import_runs(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS annual_plan_import_blackouts (
  run_id TEXT NOT NULL,
  tenant_id TEXT NOT NULL,
  blackout_id TEXT NOT NULL,
  source_row_no INTEGER NOT NULL,
  PRIMARY KEY(run_id,blackout_id),
  FOREIGN KEY(run_id) REFERENCES annual_plan_import_runs(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(blackout_id) REFERENCES planning_blackouts(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_annual_plan_blackouts_scope
  ON annual_plan_import_blackouts(tenant_id,blackout_id);
