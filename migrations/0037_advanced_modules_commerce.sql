-- Erweiterungsmodule + buchbare Modul-Abos.

CREATE TABLE IF NOT EXISTS module_commerce_rules (
  feature_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'Erweiterungen',
  monthly_price_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  pricing_enabled INTEGER NOT NULL DEFAULT 1,
  customer_self_service INTEGER NOT NULL DEFAULT 1,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO module_commerce_rules(feature_key,display_name,description,category,monthly_price_cents,currency,pricing_enabled,customer_self_service,is_active,sort_order,updated_at) VALUES
  ('microsoft_365','Microsoft 365 / Outlook','Automatisch aktualisierbarer Klassenkalender als Outlook-/Microsoft-365-Abonnement.','Integrationen',1900,'EUR',1,1,1,10,CURRENT_TIMESTAMP),
  ('microsoft_teams','Microsoft Teams','Meldungen und Änderungen automatisch über einen Teams-Workflow in einen Kanal oder Chat senden.','Integrationen',2900,'EUR',1,1,1,20,CURRENT_TIMESTAMP),
  ('statistics','Statistiken','Auswertungen zu Klassen, Teilnehmenden, Inhalten und Nutzung.','Auswertung',3900,'EUR',1,1,1,30,CURRENT_TIMESTAMP),
  ('surveys','Umfragen','Klassenbezogene Umfragen mit einmaliger Stimmabgabe pro angemeldetem Teilnehmenden.','Lernen & Kommunikation',1900,'EUR',1,1,1,40,CURRENT_TIMESTAMP),
  ('substitution_updates','Vertretungsänderungen','Vertretungs-, Raum- und Stundenplanänderungen gezielt an Klassen veröffentlichen.','Portal & Kommunikation',2900,'EUR',1,1,1,50,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS tenant_module_entitlements (
  tenant_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending_payment','active','failed','cancelled')),
  monthly_price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','annual')),
  external_subscription_item_id TEXT,
  activated_at TEXT,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id,feature_key),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(feature_key) REFERENCES module_commerce_rules(feature_key)
);

CREATE TABLE IF NOT EXISTS module_subscription_changes (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('pending_payment','active','failed','cancelled')),
  monthly_price_cents INTEGER NOT NULL,
  immediate_charge_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','annual')),
  external_invoice_id TEXT,
  external_subscription_item_id TEXT,
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  activated_at TEXT,
  snapshot_json TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(feature_key) REFERENCES module_commerce_rules(feature_key)
);
CREATE INDEX IF NOT EXISTS idx_module_changes_tenant ON module_subscription_changes(tenant_id,status,requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_module_changes_invoice ON module_subscription_changes(external_invoice_id);

CREATE TABLE IF NOT EXISTS stripe_module_prices (
  feature_key TEXT NOT NULL,
  billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly','annual')),
  stripe_mode TEXT NOT NULL CHECK(stripe_mode IN ('test','live')),
  currency TEXT NOT NULL,
  product_id TEXT NOT NULL,
  price_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  tax_behavior TEXT NOT NULL DEFAULT 'exclusive',
  tax_code TEXT NOT NULL DEFAULT 'txcd_10103001',
  updated_at TEXT NOT NULL,
  PRIMARY KEY(feature_key,billing_cycle,stripe_mode),
  FOREIGN KEY(feature_key) REFERENCES module_commerce_rules(feature_key)
);

CREATE TABLE IF NOT EXISTS surveys (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  title TEXT NOT NULL,
  question TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('draft','open','closed')) DEFAULT 'open',
  closes_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_surveys_course ON surveys(tenant_id,course_id,status,created_at DESC);

CREATE TABLE IF NOT EXISTS survey_options (
  id TEXT PRIMARY KEY,
  survey_id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS survey_votes (
  survey_id TEXT NOT NULL,
  option_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  voted_at TEXT NOT NULL,
  PRIMARY KEY(survey_id,user_id),
  FOREIGN KEY(survey_id) REFERENCES surveys(id) ON DELETE CASCADE,
  FOREIGN KEY(option_id) REFERENCES survey_options(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_survey_votes_option ON survey_votes(survey_id,option_id);

CREATE TABLE IF NOT EXISTS substitution_updates (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  original_text TEXT,
  replacement_text TEXT NOT NULL,
  room TEXT,
  note TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_substitution_course_time ON substitution_updates(tenant_id,course_id,starts_at);

CREATE TABLE IF NOT EXISTS calendar_feeds (
  tenant_id TEXT NOT NULL,
  course_id TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  rotated_at TEXT,
  PRIMARY KEY(tenant_id,course_id),
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
);
