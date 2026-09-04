-- Ein Bildungstraeger wirft mehrere Dateien auf einmal ein, und sie verweisen ueber SEINE
-- Kennungen aufeinander: die Kursliste fuehrt "CLS-001"/"COURSE-001", die Teilnehmerliste und der
-- Stundenplan verweisen genau darauf. Das Portal hat diese Kennungen beim Anlegen bisher
-- weggeworfen und nur Code und Name behalten - danach zeigte jeder Verweis ins Leere.
--
-- Gemessen am Paket eines Kunden: 96 Kurse entstanden, und trotzdem fand keine einzige seiner
-- 1537 Teilnehmerzeilen ihre Klasse. Auf dem Bildschirm stand ueberall "Kein Kurs erkannt".
ALTER TABLE courses ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_courses_external ON courses(tenant_id, external_id) WHERE external_id IS NOT NULL;
