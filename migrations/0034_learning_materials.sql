-- Block 5: vorhandenes R2-/Backup-Dateiregister für Lernmaterialien erweitern.
ALTER TABLE portability_files ADD COLUMN purpose TEXT NOT NULL DEFAULT 'source';
ALTER TABLE portability_files ADD COLUMN course_id TEXT;
ALTER TABLE portability_files ADD COLUMN title TEXT;
ALTER TABLE portability_files ADD COLUMN description TEXT;
ALTER TABLE portability_files ADD COLUMN visible INTEGER NOT NULL DEFAULT 1;
ALTER TABLE portability_files ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_portability_files_materials
ON portability_files(tenant_id,purpose,course_id,visible,created_at DESC);
