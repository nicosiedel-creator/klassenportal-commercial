-- Plattform-Angebote: echte Entwürfe/Angebote vor der Buchung, individuelle Preise/Rabatte,
-- öffentlicher Annahmelink und Preisbindung bis in das Onboarding.

ALTER TABLE commercial_quotes ADD COLUMN subject TEXT;
ALTER TABLE commercial_quotes ADD COLUMN offer_kind TEXT NOT NULL DEFAULT 'paid' CHECK(offer_kind IN ('paid','pilot'));
ALTER TABLE commercial_quotes ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly' CHECK(billing_cycle IN ('monthly','annual'));
ALTER TABLE commercial_quotes ADD COLUMN customer_name TEXT;
ALTER TABLE commercial_quotes ADD COLUMN customer_contact_name TEXT;
ALTER TABLE commercial_quotes ADD COLUMN customer_email TEXT;
ALTER TABLE commercial_quotes ADD COLUMN customer_street TEXT;
ALTER TABLE commercial_quotes ADD COLUMN customer_postal_code TEXT;
ALTER TABLE commercial_quotes ADD COLUMN customer_city TEXT;
ALTER TABLE commercial_quotes ADD COLUMN customer_country TEXT;
ALTER TABLE commercial_quotes ADD COLUMN monthly_list_cents INTEGER;
ALTER TABLE commercial_quotes ADD COLUMN setup_list_cents INTEGER;
ALTER TABLE commercial_quotes ADD COLUMN monthly_override_cents INTEGER;
ALTER TABLE commercial_quotes ADD COLUMN setup_override_cents INTEGER;
ALTER TABLE commercial_quotes ADD COLUMN recurring_discount_type TEXT CHECK(recurring_discount_type IN ('none','percent','fixed'));
ALTER TABLE commercial_quotes ADD COLUMN recurring_discount_value INTEGER;
ALTER TABLE commercial_quotes ADD COLUMN recurring_discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE commercial_quotes ADD COLUMN setup_discount_type TEXT CHECK(setup_discount_type IN ('none','percent','fixed'));
ALTER TABLE commercial_quotes ADD COLUMN setup_discount_value INTEGER;
ALTER TABLE commercial_quotes ADD COLUMN setup_discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE commercial_quotes ADD COLUMN manual_pricing INTEGER NOT NULL DEFAULT 0 CHECK(manual_pricing IN (0,1));
ALTER TABLE commercial_quotes ADD COLUMN notes TEXT;
ALTER TABLE commercial_quotes ADD COLUMN public_token_hash TEXT;
ALTER TABLE commercial_quotes ADD COLUMN offered_at TEXT;
ALTER TABLE commercial_quotes ADD COLUMN accepted_name TEXT;
ALTER TABLE commercial_quotes ADD COLUMN accepted_email TEXT;
ALTER TABLE commercial_quotes ADD COLUMN accepted_terms INTEGER NOT NULL DEFAULT 0 CHECK(accepted_terms IN (0,1));
ALTER TABLE commercial_quotes ADD COLUMN accepted_dpa INTEGER NOT NULL DEFAULT 0 CHECK(accepted_dpa IN (0,1));

CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_quotes_public_token ON commercial_quotes(public_token_hash) WHERE public_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commercial_quotes_status_created ON commercial_quotes(status,created_at DESC);

ALTER TABLE onboarding_invitations ADD COLUMN quote_id TEXT;
CREATE INDEX IF NOT EXISTS idx_onboarding_invitations_quote ON onboarding_invitations(quote_id);

CREATE TABLE IF NOT EXISTS commercial_offer_acceptances (
  quote_id TEXT PRIMARY KEY,
  accepted_name TEXT NOT NULL,
  accepted_email TEXT NOT NULL,
  accepted_at TEXT NOT NULL,
  accepted_ip TEXT,
  accepted_user_agent TEXT,
  terms_accepted INTEGER NOT NULL CHECK(terms_accepted IN (0,1)),
  dpa_accepted INTEGER NOT NULL CHECK(dpa_accepted IN (0,1)),
  snapshot_json TEXT NOT NULL,
  FOREIGN KEY(quote_id) REFERENCES commercial_quotes(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS commercial_offer_events (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','published','viewed','accepted','cancelled','expired','onboarding_created')),
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(quote_id) REFERENCES commercial_quotes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_offer_events_quote ON commercial_offer_events(quote_id,created_at DESC);
