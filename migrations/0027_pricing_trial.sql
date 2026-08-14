-- Finales Marktstart-Preismodell, Testphase und Managed-Setup-Katalog.

UPDATE plans SET monthly_price_cents=4900, setup_price_cents=0 WHERE id='starter';
UPDATE plans SET monthly_price_cents=11900, setup_price_cents=0 WHERE id='provider';
UPDATE plans SET monthly_price_cents=22900, setup_price_cents=0 WHERE id='white_label';

INSERT INTO plan_commerce_rules(plan_id,included_courses,max_courses,extra_course_monthly_cents,currency,offer_valid_days,self_service_expansion,pricing_enabled,updated_at)
VALUES
  ('starter',3,NULL,1200,'EUR',14,1,1,CURRENT_TIMESTAMP),
  ('provider',10,NULL,900,'EUR',14,1,1,CURRENT_TIMESTAMP),
  ('white_label',25,NULL,700,'EUR',14,1,1,CURRENT_TIMESTAMP)
ON CONFLICT(plan_id) DO UPDATE SET
  included_courses=excluded.included_courses,
  max_courses=excluded.max_courses,
  extra_course_monthly_cents=excluded.extra_course_monthly_cents,
  currency=excluded.currency,
  offer_valid_days=excluded.offer_valid_days,
  self_service_expansion=excluded.self_service_expansion,
  pricing_enabled=excluded.pricing_enabled,
  updated_at=excluded.updated_at;

CREATE TABLE IF NOT EXISTS commerce_policy (
  id INTEGER PRIMARY KEY CHECK(id=1),
  trial_days INTEGER NOT NULL DEFAULT 30,
  trial_course_limit INTEGER NOT NULL DEFAULT 2,
  read_only_days INTEGER NOT NULL DEFAULT 7,
  annual_months_charged INTEGER NOT NULL DEFAULT 10,
  trial_requires_payment_method INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO commerce_policy(id,trial_days,trial_course_limit,read_only_days,annual_months_charged,trial_requires_payment_method,updated_at)
VALUES(1,30,2,7,10,0,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS managed_setup_options (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  max_courses INTEGER,
  price_cents INTEGER NOT NULL,
  credit_on_later_setup_cents INTEGER NOT NULL DEFAULT 0,
  is_trial_setup INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
INSERT OR REPLACE INTO managed_setup_options(id,name,description,max_courses,price_cents,credit_on_later_setup_cents,is_trial_setup,is_active,sort_order,updated_at) VALUES
  ('self_service','Selbsteinrichtung','Der Kunde richtet sein Portal selbst ein. Automatische Assistenten und Importe stehen vollständig zur Verfügung.',NULL,0,0,0,1,0,CURRENT_TIMESTAMP),
  ('setup_compact','Einrichtung Kompakt','Komplette Grundeinrichtung durch uns für bis zu 3 Klassen/Kurse.',3,29900,0,0,1,10,CURRENT_TIMESTAMP),
  ('setup_complete','Kompletteinrichtung','Komplette Einrichtung durch uns für bis zu 10 Klassen/Kurse.',10,79900,0,0,1,20,CURRENT_TIMESTAMP),
  ('setup_plus','Kompletteinrichtung Plus','Komplette Einrichtung durch uns für bis zu 25 Klassen/Kurse.',25,149000,0,0,1,30,CURRENT_TIMESTAMP),
  ('trial_setup','Test-Einrichtung','Begleitete Einrichtung für die Testphase. Bei anschließender Kompletteinrichtung vollständig anrechenbar.',2,14900,14900,1,1,40,CURRENT_TIMESTAMP);

CREATE TABLE IF NOT EXISTS tenant_trials (
  tenant_id TEXT PRIMARY KEY,
  target_plan_id TEXT NOT NULL,
  requested_course_count INTEGER NOT NULL,
  trial_course_limit INTEGER NOT NULL DEFAULT 2,
  status TEXT NOT NULL CHECK(status IN ('active','read_only','converted','expired')),
  started_at TEXT NOT NULL,
  trial_ends_at TEXT NOT NULL,
  read_only_ends_at TEXT NOT NULL,
  converted_at TEXT,
  setup_option_id TEXT,
  pricing_snapshot_json TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
  FOREIGN KEY(target_plan_id) REFERENCES plans(id),
  FOREIGN KEY(setup_option_id) REFERENCES managed_setup_options(id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_trials_status_time ON tenant_trials(status,trial_ends_at,read_only_ends_at);

ALTER TABLE tenant_entitlements ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE tenant_entitlements ADD COLUMN annual_total_cents INTEGER;
ALTER TABLE commercial_quotes ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE commercial_quotes ADD COLUMN managed_setup_option_id TEXT;
ALTER TABLE commercial_quotes ADD COLUMN annual_total_cents INTEGER;
ALTER TABLE commercial_orders ADD COLUMN billing_cycle TEXT NOT NULL DEFAULT 'monthly';
ALTER TABLE commercial_orders ADD COLUMN managed_setup_option_id TEXT;
ALTER TABLE commercial_orders ADD COLUMN annual_total_cents INTEGER;
