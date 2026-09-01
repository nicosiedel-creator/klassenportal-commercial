-- Der Angebotsversand schrieb seit jeher ein Ereignis vom Typ 'email_sent' bzw. 'email_failed'
-- (platform-offer-mail.ts). Die Bedingung dieser Tabelle kennt beide nicht - sie erlaubt nur
-- 'created','published','viewed','accepted','cancelled','expired','onboarding_created'.
--
-- Damit scheiterte jeder Versand eines Angebots an der Datenbank. Im Browser gemessen, beim
-- Erstellen eines Angebots über die Plattformverwaltung:
--
--   "Angebot erstellt, aber der E-Mailversand ist fehlgeschlagen (D1_ERROR: CHECK constraint
--    failed: event_type IN ('created','published','viewed','accepted','cancelled','expired',
--    'onboa... SQLITE_CONSTRAINT). Der gültige Link wurde zum Kopieren bereitgestellt."
--
-- Das Angebot selbst entstand, der Versand nicht. Betroffen ist damit der erste Schritt mit
-- jedem neuen Kunden. Aufgefallen ist es nie, weil offer-schema.ts dieselbe Tabelle als
-- Rückfallebene ohne Bedingung anlegt: wo die Rückfallebene griff, ging es gut.
--
-- SQLite kann eine CHECK-Bedingung nicht ändern; die Tabelle wird deshalb neu gebaut und der
-- Inhalt vollständig übernommen.
PRAGMA foreign_keys=OFF;

CREATE TABLE IF NOT EXISTS commercial_offer_events_neu (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('created','published','viewed','accepted','cancelled','expired','onboarding_created','email_sent','email_failed')),
  detail_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(quote_id) REFERENCES commercial_quotes(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO commercial_offer_events_neu(id,quote_id,event_type,detail_json,created_at)
  SELECT id,quote_id,event_type,detail_json,created_at FROM commercial_offer_events;

DROP TABLE commercial_offer_events;
ALTER TABLE commercial_offer_events_neu RENAME TO commercial_offer_events;
CREATE INDEX IF NOT EXISTS idx_offer_events_quote ON commercial_offer_events(quote_id,created_at DESC);

PRAGMA foreign_keys=ON;
