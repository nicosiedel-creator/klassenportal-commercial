-- B2B-Preislogik: Listenpreise sind netto; Steuer wird von Stripe Tax zusätzlich berechnet.
ALTER TABLE stripe_plan_prices ADD COLUMN tax_behavior TEXT NOT NULL DEFAULT 'exclusive';
ALTER TABLE stripe_plan_prices ADD COLUMN tax_code TEXT NOT NULL DEFAULT 'txcd_10103001';
