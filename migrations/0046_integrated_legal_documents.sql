-- Integrierte, versionierte Rechtsdokumente. Pflichtangaben werden vor Veröffentlichung geprüft.
ALTER TABLE legal_configuration ADD COLUMN legal_form TEXT;
ALTER TABLE legal_configuration ADD COLUMN content_responsible TEXT;
ALTER TABLE legal_configuration ADD COLUMN supervisory_authority_name TEXT;
ALTER TABLE legal_configuration ADD COLUMN supervisory_authority_url TEXT;
ALTER TABLE legal_configuration ADD COLUMN documents_enabled INTEGER NOT NULL DEFAULT 0 CHECK(documents_enabled IN (0,1));
ALTER TABLE legal_configuration ADD COLUMN document_version TEXT;
ALTER TABLE seller_billing_profile ADD COLUMN business_id TEXT;
ALTER TABLE commercial_offer_acceptances ADD COLUMN terms_version TEXT;
ALTER TABLE commercial_offer_acceptances ADD COLUMN dpa_version TEXT;
ALTER TABLE commercial_offer_acceptances ADD COLUMN privacy_version TEXT;

CREATE TABLE IF NOT EXISTS legal_document_events (
  id TEXT PRIMARY KEY,
  document_version TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('enabled','disabled','updated')),
  actor_user_id TEXT,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS legal_content_reports (
  id TEXT PRIMARY KEY,
  reporter_name TEXT NOT NULL,
  reporter_email TEXT NOT NULL,
  affected_url TEXT NOT NULL,
  description TEXT NOT NULL,
  legal_reason TEXT,
  good_faith INTEGER NOT NULL CHECK(good_faith IN (0,1)),
  status TEXT NOT NULL DEFAULT 'received' CHECK(status IN ('received','reviewing','resolved','rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_legal_content_reports_status ON legal_content_reports(status,created_at DESC);
