-- Integrierte Rechtsdokumente und sicherer Pilotbetrieb.
-- Anbieteridentität wird aus seller_billing_profile + legal_configuration gerendert.

ALTER TABLE legal_configuration ADD COLUMN representative TEXT;
ALTER TABLE legal_configuration ADD COLUMN register_name TEXT;
ALTER TABLE legal_configuration ADD COLUMN register_number TEXT;
ALTER TABLE legal_configuration ADD COLUMN dpo_name TEXT;
ALTER TABLE legal_configuration ADD COLUMN dpo_email TEXT;
ALTER TABLE legal_configuration ADD COLUMN dsa_contact_email TEXT;
ALTER TABLE legal_configuration ADD COLUMN effective_date TEXT;

CREATE TABLE IF NOT EXISTS pilot_programs (
  tenant_id TEXT PRIMARY KEY,
  customer_name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  read_only_ends_at TEXT NOT NULL,
  course_limit INTEGER NOT NULL DEFAULT 3,
  status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','active','read_only','completed','cancelled')),
  payment_required INTEGER NOT NULL DEFAULT 0 CHECK(payment_required IN (0,1)),
  auto_convert INTEGER NOT NULL DEFAULT 0 CHECK(auto_convert IN (0,1)),
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_pilot_programs_status_end ON pilot_programs(status,ends_at,read_only_ends_at);

CREATE TRIGGER IF NOT EXISTS trg_pilot_no_auto_paid_insert
BEFORE INSERT ON pilot_programs
WHEN NEW.payment_required<>0 OR NEW.auto_convert<>0
BEGIN
  SELECT RAISE(ABORT,'PILOT_MUST_NOT_AUTO_CONVERT');
END;

CREATE TRIGGER IF NOT EXISTS trg_pilot_no_auto_paid_update
BEFORE UPDATE OF payment_required,auto_convert ON pilot_programs
WHEN NEW.payment_required<>0 OR NEW.auto_convert<>0
BEGIN
  SELECT RAISE(ABORT,'PILOT_MUST_NOT_AUTO_CONVERT');
END;
