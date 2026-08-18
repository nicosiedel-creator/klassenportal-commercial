-- Kunden dürfen nur bereits freigeschaltete Module ein-/ausblenden.
-- Die kommerzielle Freigabe bleibt in feature_flags; die Kundenpräferenz
-- wird getrennt gespeichert und verändert die Tarif-/Freigabequelle nicht.

CREATE TABLE IF NOT EXISTS tenant_module_preferences (
  tenant_id TEXT NOT NULL,
  feature_key TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(tenant_id, feature_key),
  FOREIGN KEY(tenant_id, feature_key)
    REFERENCES feature_flags(tenant_id, feature_key)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tenant_module_preferences_tenant
  ON tenant_module_preferences(tenant_id, enabled);
