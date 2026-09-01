-- Ein Traeger liefert seine Pruefungen in zwei Dateien: eine Pruefungsliste (Pruefung_ID: P001)
-- und einen Pruefungskalender, dessen Termin dieselbe Kennung traegt (UID P001@...). Ohne eine
-- Spalte fuer genau diese Kennung waeren das zwei Pruefungen statt einer - und eine spaetere
-- Verschiebung derselben Pruefung legte eine dritte an, statt die bestehende zu aendern.
ALTER TABLE exams ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_exams_external ON exams(tenant_id, external_id) WHERE external_id IS NOT NULL;
