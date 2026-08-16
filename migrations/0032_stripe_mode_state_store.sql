-- Block 2: Stripe Test- und Live-Zustände dauerhaft getrennt speichern.
-- Die bestehenden Tabellen bleiben als aktiver Kompatibilitäts-Cache erhalten.
-- Vor Stripe-Zugriffen wird der aktuelle Modus in diesen Cache geladen und danach wieder archiviert.

CREATE TABLE IF NOT EXISTS stripe_plan_prices_modes (
  plan_id TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','annual')),
  stripe_mode TEXT NOT NULL CHECK(stripe_mode IN ('test','live')),
  currency TEXT NOT NULL DEFAULT 'EUR',
  base_product_id TEXT NOT NULL,
  base_price_id TEXT NOT NULL,
  base_amount_cents INTEGER NOT NULL,
  extra_product_id TEXT,
  extra_price_id TEXT,
  extra_amount_cents INTEGER,
  tax_behavior TEXT NOT NULL DEFAULT 'exclusive',
  tax_code TEXT NOT NULL DEFAULT 'txcd_10103001',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(plan_id,billing_cycle,stripe_mode),
  FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE CASCADE
);

INSERT INTO stripe_plan_prices_modes(
  plan_id,billing_cycle,stripe_mode,currency,base_product_id,base_price_id,base_amount_cents,
  extra_product_id,extra_price_id,extra_amount_cents,tax_behavior,tax_code,updated_at
)
SELECT plan_id,billing_cycle,stripe_mode,currency,base_product_id,base_price_id,base_amount_cents,
       extra_product_id,extra_price_id,extra_amount_cents,tax_behavior,tax_code,updated_at
FROM stripe_plan_prices
ON CONFLICT(plan_id,billing_cycle,stripe_mode) DO NOTHING;

CREATE TABLE IF NOT EXISTS tenant_payment_accounts_modes (
  tenant_id TEXT NOT NULL,
  stripe_mode TEXT NOT NULL CHECK(stripe_mode IN ('test','live')),
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
  PRIMARY KEY(tenant_id,stripe_mode),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(current_plan_id) REFERENCES plans(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_payment_modes_customer
ON tenant_payment_accounts_modes(stripe_mode,stripe_customer_id)
WHERE stripe_customer_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_payment_modes_subscription
ON tenant_payment_accounts_modes(stripe_mode,stripe_subscription_id)
WHERE stripe_subscription_id IS NOT NULL;

INSERT INTO tenant_payment_accounts_modes(
  tenant_id,stripe_mode,provider,stripe_customer_id,stripe_subscription_id,stripe_checkout_session_id,
  stripe_subscription_status,billing_cycle,current_plan_id,current_course_limit,current_period_end,
  cancel_at_period_end,last_invoice_id,updated_at
)
SELECT tenant_id,stripe_mode,provider,stripe_customer_id,stripe_subscription_id,stripe_checkout_session_id,
       stripe_subscription_status,billing_cycle,current_plan_id,current_course_limit,current_period_end,
       cancel_at_period_end,last_invoice_id,updated_at
FROM tenant_payment_accounts
ON CONFLICT(tenant_id,stripe_mode) DO NOTHING;
