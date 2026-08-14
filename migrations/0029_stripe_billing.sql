-- Stripe-Zahlungsanbindung: provider-spezifische IDs bleiben getrennt vom kommerziellen Kern.

CREATE TABLE IF NOT EXISTS stripe_plan_prices (
  plan_id TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','annual')),
  currency TEXT NOT NULL DEFAULT 'EUR',
  base_product_id TEXT NOT NULL,
  base_price_id TEXT NOT NULL,
  base_amount_cents INTEGER NOT NULL,
  extra_product_id TEXT,
  extra_price_id TEXT,
  extra_amount_cents INTEGER,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(plan_id,billing_cycle),
  FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS tenant_payment_accounts (
  tenant_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL DEFAULT 'stripe',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_checkout_session_id TEXT,
  stripe_subscription_status TEXT,
  billing_cycle TEXT CHECK(billing_cycle IN ('monthly','annual')),
  current_plan_id TEXT,
  current_course_limit INTEGER,
  current_period_end TEXT,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  last_invoice_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(current_plan_id) REFERENCES plans(id)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_payment_customer ON tenant_payment_accounts(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_payment_subscription ON tenant_payment_accounts(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payment_provider_events (
  event_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('processing','processed','ignored','failed')),
  received_at TEXT NOT NULL,
  processed_at TEXT,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_payment_provider_events_received ON payment_provider_events(provider,received_at DESC);

ALTER TABLE commercial_orders ADD COLUMN external_checkout_id TEXT;
ALTER TABLE commercial_orders ADD COLUMN external_subscription_id TEXT;
ALTER TABLE commercial_invoices ADD COLUMN external_invoice_url TEXT;
ALTER TABLE commercial_invoices ADD COLUMN external_invoice_pdf_url TEXT;
ALTER TABLE subscription_changes ADD COLUMN external_invoice_id TEXT;
ALTER TABLE billing_provider_state ADD COLUMN external_config_id TEXT;

UPDATE billing_provider_state
SET provider='stripe',status='not_connected',automatic_collection=0,updated_at=CURRENT_TIMESTAMP
WHERE id=1 AND provider='none';
