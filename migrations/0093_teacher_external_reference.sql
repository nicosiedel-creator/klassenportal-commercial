-- Ein eingeworfener Stundenplan nennt die Dozentin als Kennung ("D001"), nicht als Namen.
-- Ohne eine Spalte fuer genau diese Kennung laesst sich die Zeile keinem Dozentenstamm
-- zuordnen: die Unterrichtsstunde entstand bisher ohne teacher_id, und damit konnte weder
-- das Dozentenportal sie zeigen noch eine Pruefung "diese Person ist gleichzeitig zweimal
-- verplant" ueberhaupt greifen.
ALTER TABLE teachers ADD COLUMN external_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_teachers_external ON teachers(tenant_id, external_id) WHERE external_id IS NOT NULL;
