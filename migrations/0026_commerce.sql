-- Kommerzieller Automatisierungskern: Preise, Angebote, Buchungen, Rechnungen,
-- Klassenkontingente und Self-Service-Erweiterungen.

CREATE TABLE IF NOT EXISTS plan_commerce_rules (
  plan_id TEXT PRIMARY KEY,
  included_courses INTEGER,
  max_courses INTEGER,
  extra_course_monthly_cents INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  offer_valid_days INTEGER NOT NULL DEFAULT 14,
  self_service_expansion INTEGER NOT NULL DEFAULT 1,
  pricing_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO plan_commerce_rules(plan_id,included_courses,max_courses,extra_course_monthly_cents,currency,offer_valid_days,self_service_expansion,pricing_enabled,updated_at)
SELECT id,NULL,NULL,NULL,'EUR',14,1,0,CURRENT_TIMESTAMP FROM plans;

CREATE TABLE IF NOT EXISTS seller_billing_profile (
  id INTEGER PRIMARY KEY CHECK(id=1),
  legal_name TEXT,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'Deutschland',
  email TEXT,
  phone TEXT,
  website TEXT,
  tax_number TEXT,
  vat_id TEXT,
  iban TEXT,
  bic TEXT,
  invoice_prefix TEXT NOT NULL DEFAULT 'KP',
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO seller_billing_profile(id,country,invoice_prefix,updated_at) VALUES(1,'Deutschland','KP',CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS tenant_entitlements (
  tenant_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  course_limit INTEGER,
  currency TEXT NOT NULL DEFAULT 'EUR',
  recurring_monthly_cents INTEGER NOT NULL DEFAULT 0,
  setup_cents INTEGER NOT NULL DEFAULT 0,
  pricing_snapshot_json TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);

CREATE TABLE IF NOT EXISTS commercial_quotes (
  id TEXT PRIMARY KEY,
  quote_number TEXT NOT NULL UNIQUE,
  onboarding_invitation_id TEXT,
  tenant_id TEXT,
  plan_id TEXT NOT NULL,
  requested_courses INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  recurring_monthly_cents INTEGER NOT NULL,
  setup_cents INTEGER NOT NULL,
  first_total_cents INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','offered','accepted','expired','cancelled')),
  valid_until TEXT NOT NULL,
  pricing_snapshot_json TEXT NOT NULL,
  accepted_at TEXT,
  accepted_ip TEXT,
  accepted_user_agent TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(onboarding_invitation_id) REFERENCES onboarding_invitations(id) ON DELETE SET NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE SET NULL,
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);
CREATE INDEX IF NOT EXISTS idx_commercial_quotes_onboarding ON commercial_quotes(onboarding_invitation_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commercial_quotes_tenant ON commercial_quotes(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS commercial_orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  quote_id TEXT,
  plan_id TEXT NOT NULL,
  course_limit INTEGER,
  status TEXT NOT NULL CHECK(status IN ('pending_payment','active','cancelled','ended')),
  currency TEXT NOT NULL DEFAULT 'EUR',
  recurring_monthly_cents INTEGER NOT NULL,
  setup_cents INTEGER NOT NULL,
  booked_at TEXT NOT NULL,
  activated_at TEXT,
  cancelled_at TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(quote_id) REFERENCES commercial_quotes(id) ON DELETE SET NULL,
  FOREIGN KEY(plan_id) REFERENCES plans(id)
);
CREATE INDEX IF NOT EXISTS idx_commercial_orders_tenant ON commercial_orders(tenant_id,booked_at DESC);

CREATE TABLE IF NOT EXISTS commercial_invoices (
  id TEXT PRIMARY KEY,
  invoice_number TEXT NOT NULL UNIQUE,
  tenant_id TEXT NOT NULL,
  order_id TEXT,
  change_id TEXT,
  type TEXT NOT NULL CHECK(type IN ('initial','recurring','upgrade','credit')),
  status TEXT NOT NULL CHECK(status IN ('draft','pending_provider','open','paid','void','failed')),
  currency TEXT NOT NULL DEFAULT 'EUR',
  net_cents INTEGER NOT NULL,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  gross_cents INTEGER NOT NULL,
  external_provider TEXT,
  external_invoice_id TEXT,
  external_payment_id TEXT,
  due_at TEXT,
  paid_at TEXT,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(order_id) REFERENCES commercial_orders(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_commercial_invoices_tenant ON commercial_invoices(tenant_id,created_at DESC);

CREATE TABLE IF NOT EXISTS subscription_changes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  from_plan_id TEXT NOT NULL,
  to_plan_id TEXT NOT NULL,
  from_course_limit INTEGER,
  to_course_limit INTEGER,
  old_monthly_cents INTEGER NOT NULL,
  new_monthly_cents INTEGER NOT NULL,
  immediate_charge_cents INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('quoted','pending_payment','active','cancelled','failed')),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  activated_at TEXT,
  pricing_snapshot_json TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(from_plan_id) REFERENCES plans(id),
  FOREIGN KEY(to_plan_id) REFERENCES plans(id)
);
CREATE INDEX IF NOT EXISTS idx_subscription_changes_tenant ON subscription_changes(tenant_id,requested_at DESC);

CREATE TABLE IF NOT EXISTS billing_provider_state (
  id INTEGER PRIMARY KEY CHECK(id=1),
  provider TEXT NOT NULL DEFAULT 'none',
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK(status IN ('not_connected','test','active','disabled')),
  automatic_collection INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO billing_provider_state(id,provider,status,automatic_collection,updated_at) VALUES(1,'none','not_connected',0,CURRENT_TIMESTAMP);
