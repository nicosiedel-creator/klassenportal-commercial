PRAGMA foreign_keys = ON;

ALTER TABLE accounting_settings ADD COLUMN auto_post_bank_matches INTEGER NOT NULL DEFAULT 0 CHECK(auto_post_bank_matches IN (0,1));
ALTER TABLE accounting_settings ADD COLUMN auto_prepare_dunning INTEGER NOT NULL DEFAULT 1 CHECK(auto_prepare_dunning IN (0,1));
ALTER TABLE accounting_settings ADD COLUMN auto_send_dunning INTEGER NOT NULL DEFAULT 0 CHECK(auto_send_dunning IN (0,1));

CREATE TABLE IF NOT EXISTS accounting_bank_transactions (
  id TEXT PRIMARY KEY,
  fingerprint TEXT NOT NULL UNIQUE,
  booking_date TEXT NOT NULL,
  value_date TEXT,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  counterparty_name TEXT,
  counterparty_iban TEXT,
  purpose TEXT,
  end_to_end_id TEXT,
  source_filename TEXT,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK(status IN ('unmatched','matched','ignored','conflict')),
  commercial_invoice_id TEXT,
  accounting_entry_id TEXT,
  match_reason TEXT,
  imported_by TEXT NOT NULL,
  imported_at TEXT NOT NULL,
  matched_at TEXT,
  FOREIGN KEY(commercial_invoice_id) REFERENCES commercial_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY(accounting_entry_id) REFERENCES accounting_entries(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_accounting_bank_status ON accounting_bank_transactions(status,booking_date DESC);
CREATE INDEX IF NOT EXISTS idx_accounting_bank_amount ON accounting_bank_transactions(amount_cents,booking_date);

CREATE TABLE IF NOT EXISTS accounting_dunning_cases (
  id TEXT PRIMARY KEY,
  commercial_invoice_id TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  stage INTEGER NOT NULL DEFAULT 0 CHECK(stage BETWEEN 0 AND 4),
  status TEXT NOT NULL DEFAULT 'prepared' CHECK(status IN ('prepared','sent','paused','resolved','cancelled')),
  due_date TEXT NOT NULL,
  next_action_at TEXT,
  last_sent_at TEXT,
  recipient_email TEXT,
  amount_cents INTEGER NOT NULL,
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(commercial_invoice_id) REFERENCES commercial_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_accounting_dunning_due ON accounting_dunning_cases(status,next_action_at,due_date);

CREATE TABLE IF NOT EXISTS accounting_close_checks (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ready','blocked')),
  blockers_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  checked_by TEXT NOT NULL,
  checked_at TEXT NOT NULL,
  CHECK(period_start <= period_end)
);
CREATE INDEX IF NOT EXISTS idx_accounting_close_checks_period ON accounting_close_checks(period_end DESC,checked_at DESC);

CREATE TABLE IF NOT EXISTS accounting_autopilot_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  detail_json TEXT,
  actor_user_id TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounting_autopilot_events ON accounting_autopilot_events(event_type,created_at DESC);
