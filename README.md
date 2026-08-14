# klassenportal-commercial

Kommerzielle Klassenportal-Plattform für Bildungsträger, Kurse und Klassen.

## Punkt 22 – Import, Export und Backups

Dieses Repository enthält aktuell das Cloudflare-Modul für Punkt 22. Es ist für die kommerzielle Plattform vorgesehen und **nicht** für das VFA13-Portal.

Enthalten:
- CSV-Import
- XLSX-Import
- PDF-Dateiimport
- manuelle Dateneingabe über die bestehenden CRUD-Oberflächen/API
- CSV-/XLSX-/PDF-Export
- vollständiger Mandantenexport als ZIP inklusive Originaldateien
- manuelle und automatische Mandantenbackups
- Wiederherstellung mit Sicherheitsbackup
- Vertragsende-Export
- Löschworkflow mit Karenz und Audit-Log

Siehe `PROJECT_STATE.md` und `src/portability/`.
