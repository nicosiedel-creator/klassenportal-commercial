-- Einmalige Verarbeitung eines Onboarding-Links ohne Änderung bereits angewendeter CHECK-Constraints.
CREATE TABLE IF NOT EXISTS onboarding_claims (
  invitation_id TEXT PRIMARY KEY,
  nonce TEXT NOT NULL,
  claimed_at TEXT NOT NULL
);
