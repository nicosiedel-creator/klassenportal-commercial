-- Kunden-Onboarding: Plattform-Admin erzeugt einen einmaligen Einrichtungslink,
-- der Kunde pflegt seine Stammdaten selbst und löst danach die automatische Mandantenanlage aus.
CREATE TABLE IF NOT EXISTS onboarding_invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  customer_email TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed','revoked','expired')),
  expires_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  tenant_id TEXT,
  form_json TEXT,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_onboarding_status ON onboarding_invitations(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_onboarding_email ON onboarding_invitations(customer_email, created_at DESC);

CREATE TABLE IF NOT EXISTS tenant_profiles (
  tenant_id TEXT PRIMARY KEY,
  legal_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  phone TEXT,
  website TEXT,
  street TEXT,
  postal_code TEXT,
  city TEXT,
  country TEXT NOT NULL DEFAULT 'Deutschland',
  billing_email TEXT,
  onboarding_invitation_id TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(onboarding_invitation_id) REFERENCES onboarding_invitations(id) ON DELETE SET NULL
);
