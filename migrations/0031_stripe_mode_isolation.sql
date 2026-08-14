-- Stripe Test- und Live-Modus strikt trennen.
-- Bestehende Provider-IDs gelten als Live-Daten. Beim bewussten Moduswechsel werden sie ersetzt,
-- damit niemals Test-IDs mit Live-Schlüsseln (oder umgekehrt) verwendet werden.

ALTER TABLE stripe_plan_prices ADD COLUMN stripe_mode TEXT NOT NULL DEFAULT 'live';
ALTER TABLE tenant_payment_accounts ADD COLUMN stripe_mode TEXT NOT NULL DEFAULT 'live';
ALTER TABLE payment_provider_events ADD COLUMN stripe_mode TEXT NOT NULL DEFAULT 'live';

CREATE TABLE IF NOT EXISTS stripe_provider_modes (
  stripe_mode TEXT PRIMARY KEY CHECK(stripe_mode IN ('test','live')),
  external_config_id TEXT,
  last_verified_webhook_at TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO stripe_provider_modes(stripe_mode,external_config_id,last_verified_webhook_at,updated_at)
VALUES('test',NULL,NULL,CURRENT_TIMESTAMP),('live',NULL,NULL,CURRENT_TIMESTAMP);

UPDATE stripe_provider_modes
SET external_config_id=(SELECT external_config_id FROM billing_provider_state WHERE id=1),updated_at=CURRENT_TIMESTAMP
WHERE stripe_mode='live' AND external_config_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_provider_events_mode_received
ON payment_provider_events(provider,stripe_mode,received_at DESC);
