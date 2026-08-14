# PROJECT STATE – Klassenportal Commercial

Stand: 2026-08-14

## Projekt
Kommerzielle Klassenportal-Plattform für Bildungsträger, Kurse und Klassen.

## Schutzregel
Das VFA13-Liveportal gehört nicht zu diesem Repository und wird durch diese Arbeiten nicht verändert.

## Fortschritt
Punkte 1–21: laut Projektverlauf bereits bearbeitet.
Punkt 22: Import, Export und Backups – Kernmodul vorhanden.

## Punkt 22 – enthalten
- CSV-Import mit Vorschau, Feldzuordnung, Validierung und Staging
- XLSX-Import ohne externen XLSX-Runtime-Zwang
- PDF-Originaldatei-Upload nach R2 mit Signatur-/Größenprüfung
- manuelle Eingabe bleibt Bestandteil der regulären CRUD-Funktionen der Plattform
- CSV-, XLSX- und PDF-Export pro Ressource
- vollständiger Mandantenexport als streamendes ZIP
- Originaldateien/PDFs im Vollständigen Kundenexport
- Mandantenbackups nach R2
- automatische Backups mit rotierendem Tenant-Cursor
- Restore mit Pre-Restore-Sicherheitsbackup
- Vertragsende-Backup
- Löschanforderung, Karenz, Plattform-Admin-Bestätigung und endgültige Mandantenlöschung
- Audit-Protokoll
- D1-Migration für Importjobs, Staging, Backups, Dateien, Löschworkflow und Audit

## Noch an den existierenden Gesamtcode anzuschließen
- tatsächliches bestehendes Auth-/RBAC-System an `AuthContext`
- tatsächliche Tabellen- und Spaltennamen der kommerziellen Plattform in `src/portability/config.ts`
- D1/R2-Bindings im produktiven Wrangler-Setup
- UI des Verkaufsportals für Import-/Export-/Backup-Buttons
- produktive Migration erst nach Abgleich mit dem echten Schema ausführen

## Datenhaltung
D1: strukturierte Mandantendaten und Metadaten
R2: PDFs, Originaldateien, Backup-Objekte und Exportbestandteile

## Sicherheitsprinzipien
- jede Operation tenant-gebunden
- Restore nur Plattform-Admin
- endgültige Löschung nur nach separater Bestätigung und Karenz
- Sicherheitsbackup vor Restore
- Abschlussbackup vor Vertragsende/Löschung
- Originaldateien nicht stillschweigend umwandeln
