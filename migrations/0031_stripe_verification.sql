-- Mode-sichere Stripe-Freigabe: Zahlungen werden erst nach einem erfolgreich
-- verifizierten Webhook im selben Stripe-Modus (test/live) freigeschaltet.

ALTER TABLE billing_provider_state ADD COLUMN webhook_verified_mode TEXT;
ALTER TABLE billing_provider_state ADD COLUMN last_webhook_at TEXT;
ALTER TABLE billing_provider_state ADD COLUMN last_webhook_event TEXT;
ALTER TABLE billing_provider_state ADD COLUMN last_error TEXT;
