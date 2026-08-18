PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounting_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  currency TEXT NOT NULL DEFAULT 'EUR',
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK(fiscal_year_start_month BETWEEN 1 AND 12),
  chart_profile TEXT NOT NULL DEFAULT 'custom' CHECK(chart_profile IN ('custom','skr03','skr04')),
  auto_post_final_invoices INTEGER NOT NULL DEFAULT 0 CHECK(auto_post_final_invoices IN (0,1)),
  auto_post_payments INTEGER NOT NULL DEFAULT 0 CHECK(auto_post_payments IN (0,1)),
  auto_post_stripe_fees INTEGER NOT NULL DEFAULT 0 CHECK(auto_post_stripe_fees IN (0,1)),
  updated_by TEXT,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO accounting_settings(id,currency,fiscal_year_start_month,chart_profile,updated_at) VALUES(1,'EUR',1,'custom',CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS accounting_accounts (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('asset','liability','equity','revenue','expense','tax','clearing')),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  system_key TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS accounting_mappings (
  key TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  tax_code TEXT,
  note TEXT,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES accounting_accounts(id)
);

CREATE TABLE IF NOT EXISTS accounting_entries (
  id TEXT PRIMARY KEY,
  entry_number TEXT NOT NULL UNIQUE,
  source_type TEXT NOT NULL CHECK(source_type IN ('invoice','payment','refund','credit','stripe_fee','expense','manual','reversal','opening')),
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','posted','reversed')),
  booking_date TEXT NOT NULL,
  document_date TEXT,
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT NOT NULL,
  tenant_id TEXT,
  commercial_invoice_id TEXT,
  reversal_of TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  posted_by TEXT,
  posted_at TEXT,
  reversed_by TEXT,
  reversed_at TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  FOREIGN KEY(commercial_invoice_id) REFERENCES commercial_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY(reversal_of) REFERENCES accounting_entries(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounting_source_once ON accounting_entries(source_type,source_id) WHERE source_id IS NOT NULL AND source_type NOT IN ('reversal','manual');
CREATE INDEX IF NOT EXISTS idx_accounting_entries_date ON accounting_entries(status,booking_date,entry_number);
CREATE INDEX IF NOT EXISTS idx_accounting_entries_tenant ON accounting_entries(tenant_id,booking_date DESC);

CREATE TABLE IF NOT EXISTS accounting_lines (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  side TEXT NOT NULL CHECK(side IN ('debit','credit')),
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  tax_code TEXT,
  tax_amount_cents INTEGER NOT NULL DEFAULT 0,
  memo TEXT,
  FOREIGN KEY(entry_id) REFERENCES accounting_entries(id) ON DELETE CASCADE,
  FOREIGN KEY(account_id) REFERENCES accounting_accounts(id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_lines_entry ON accounting_lines(entry_id);
CREATE INDEX IF NOT EXISTS idx_accounting_lines_account ON accounting_lines(account_id,entry_id);

CREATE TABLE IF NOT EXISTS accounting_period_locks (
  id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('closed','reopened')),
  reason TEXT,
  closed_by TEXT NOT NULL,
  closed_at TEXT NOT NULL,
  reopened_by TEXT,
  reopened_at TEXT,
  CHECK(period_start <= period_end)
);
CREATE INDEX IF NOT EXISTS idx_accounting_period_locks ON accounting_period_locks(period_start,period_end,status);

CREATE TABLE IF NOT EXISTS accounting_expenses (
  id TEXT PRIMARY KEY,
  document_number TEXT,
  vendor_name TEXT NOT NULL,
  invoice_date TEXT NOT NULL,
  gross_cents INTEGER NOT NULL CHECK(gross_cents > 0),
  net_cents INTEGER,
  tax_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  category_key TEXT,
  account_id TEXT,
  status TEXT NOT NULL DEFAULT 'review' CHECK(status IN ('review','approved','posted','rejected')),
  r2_key TEXT,
  filename TEXT,
  sha256 TEXT,
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  reviewed_by TEXT,
  reviewed_at TEXT,
  accounting_entry_id TEXT,
  FOREIGN KEY(account_id) REFERENCES accounting_accounts(id),
  FOREIGN KEY(accounting_entry_id) REFERENCES accounting_entries(id)
);
CREATE INDEX IF NOT EXISTS idx_accounting_expenses_status ON accounting_expenses(status,invoice_date DESC);

CREATE TABLE IF NOT EXISTS accounting_reconciliation (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_object_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('invoice','payment','refund','fee','payout')),
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  occurred_at TEXT NOT NULL,
  tenant_id TEXT,
  commercial_invoice_id TEXT,
  accounting_entry_id TEXT,
  status TEXT NOT NULL DEFAULT 'unmatched' CHECK(status IN ('unmatched','matched','ignored','conflict')),
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider,provider_object_id,kind),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  FOREIGN KEY(commercial_invoice_id) REFERENCES commercial_invoices(id) ON DELETE SET NULL,
  FOREIGN KEY(accounting_entry_id) REFERENCES accounting_entries(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_accounting_reconciliation_status ON accounting_reconciliation(status,occurred_at DESC);

CREATE TABLE IF NOT EXISTS accounting_export_runs (
  id TEXT PRIMARY KEY,
  format TEXT NOT NULL CHECK(format IN ('ledger_csv','datev_csv','open_items_csv','tax_summary_csv')),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'completed' CHECK(status IN ('completed','failed')),
  row_count INTEGER NOT NULL DEFAULT 0,
  settings_snapshot_json TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  error_code TEXT
);

CREATE TABLE IF NOT EXISTS accounting_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_user_id TEXT,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail_json TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_accounting_events_entity ON accounting_events(entity_type,entity_id,created_at DESC);
