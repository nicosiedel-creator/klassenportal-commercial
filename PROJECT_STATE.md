# PROJECT STATE – Klassenportal Commercial

Stand: 2026-08-14

## Warum dieser Stand neu aufgebaut wurde
Der kommerzielle Codebestand des Vortags war nicht dauerhaft als vollständiger Quellbaum verfügbar. Deshalb wurde die Plattform aus den verbindlich festgelegten Anforderungen neu aufgebaut und ab jetzt direkt im privaten GitHub-Repository versioniert.

## Schutzregel
Das produktive VFA13-Portal gehört nicht zu diesem Repository und wird durch dieses Projekt nicht verändert.

## Neu aufgebauter Kern (rekonstruierte Punkte vor 22)
- kommerzielle eigenständige Cloudflare-Plattform
- Mandantentrennung über `tenant_id`
- vollständige Klassentrennung über `course_id`
- Plattform-Admin, Mandanten-Admin, Klassenverantwortliche/Klassensprecher (technisch `class_admin`), Teilnehmer, Gast
- serverseitige Klassen-/Kursberechtigungen; Klassenverantwortliche sehen und verändern nur zugewiesene Klassen
- Login/Sessions und serverseitige Autorisierung
- Zugriffsarten öffentlich / Link-Code / Login / Hybrid
- Zugriffscodes gehasht gespeichert
- automatisiertes Kunden-Provisioning
- Kunden können eigene Klassen/Kurse verwalten
- eigene Admin-/Rollenstrukturen je Kunde/Klasse
- Branding und White-Label-Vorbereitung
- Module/Feature Flags, Paket-/Upsell-Grundlage
- Stundenplan
- Hausaufgaben/Aufgaben
- Termine
- Informationen/Meldungen
- Links
- Dateispeicherung über R2
- Prüfungen & Lernfortschritt
- `visible_to_students` je Prüfung
- persönliche, private, selbst eingetragene Noten
- Integrationsschema für Microsoft Teams / Microsoft 365 ohne eigene Office-Suite
- Audit- und Provisionierungsprotokoll
- D1-Datenmodell und Basis-Migration
- responsive Admin-Oberfläche für Mandanten, Kurse, Benutzer, Branding, Module, Inhalte und Datenverwaltung

## Verbindlicher Betriebsmodus für Klassen
- Der Bildungsträger/Kunden-Admin richtet Mandant, Klassen und zentrale Einstellungen ein.
- Die laufende Klassenpflege soll möglichst dezentral durch eine Klassenverantwortliche/einen Klassenverantwortlichen erfolgen, z. B. Klassensprecher.
- Diese Rolle darf nur die zugewiesene Klasse bearbeiten: Stundenplan, Inhalte, Aufgaben, Termine, Meldungen, Links und Prüfungen sowie Teilnehmer/Gäste der eigenen Klasse.
- Keine Mandanten-, Branding-, Modul-, Tarif-, Backup- oder klassenübergreifende Verwaltung für Klassenverantwortliche.
- Technischer Rollenwert bleibt aus Kompatibilitätsgründen `class_admin`; sichtbar wird die Rolle deutsch bezeichnet.
- Die Kundenoberfläche ist grundsätzlich deutsch. Englische Begriffe bleiben nur dort, wo sie fachlich/produktseitig sinnvoll oder etablierte Eigennamen sind.

## Branding-Automatik
- Logo-Upload direkt im Branding
- PNG/JPG/WebP/SVG bis 5 MB
- automatische Farberkennung im Browser
- Vorschläge: Originalgetreu, Modern, Kontrastreich
- Primär-, Sekundär- und Hintergrundfarbe mit Live-Vorschau
- manuelle Nachbearbeitung bleibt möglich
- Logo wird in R2 gespeichert und über `portability_files` in Backup/Voll-Export einbezogen
- echter Cloudflare-Praxistest am 14.08.2026 erfolgreich

## Automatischer Stundenplan-Import
- Excel/XLSX und CSV
- PDF-Upload ist Teil desselben Assistenten
- PDF.js wird lokal aus dem eigenen Deployment geladen, keine externe CDN-Laufzeitabhängigkeit
- Text-/Tabellen-PDFs werden im Browser strukturiert ausgelesen und danach durch dieselbe Vorschau/Validierung geschickt
- reine Scan-/Bild-PDFs werden nicht mit erfundenen Daten übernommen; fehlende Textschicht wird klar gemeldet
- automatische Spaltenerkennung für Datum, Beginn, Ende, Fach/Modul, Dozent/Lehrkraft, Raum/Ort, Hinweise, Klasse/Kurs und Unterrichtsart
- Vorschau und korrigierbare Spaltenzuordnung vor der Übernahme
- Dublettenerkennung
- Modus „Abgleichen“ ersetzt nur frühere automatisch importierte Unterrichtseinträge im betroffenen Zeitraum; manuelle Einträge bleiben bestehen
- Klassenverantwortliche dürfen den Stundenplan ihrer eigenen Klasse importieren
- Originaldatei (PDF/XLSX/CSV) wird nach erfolgreicher Übernahme in R2 archiviert und in `portability_files` registriert, damit sie in Backup/Voll-Export enthalten ist

## Punkt 22 – Import, Export und Backups
- CSV-Import
- XLSX-Import
- PDF-Originalimport nach R2
- Import-Vorschau / Validierung / Staging
- mandantenweite Import-/Export-/Backup-Funktionen nur für Mandanten-Admin bzw. Plattform-Admin
- klassenbezogene Uploads/Imports dürfen zusätzlich durch die jeweils berechtigte Klassenverantwortung erfolgen
- CSV-/XLSX-/PDF-Export
- vollständiger Kundenexport als streamendes ZIP mit Originaldateien
- manuelle und automatische Mandantenbackups
- Restore mit Pre-Restore-Sicherheitsbackup
- Pflicht-/Systemspalten und Zeitstempel werden bei Import/Restore berücksichtigt
- Vertragsende-Backup und Export
- Löschantrag, Karenz, Abbruch und endgültige Löschung
- Audit-Ereignisse

## GitHub-Sicherung
Repository: `nicosiedel-creator/klassenportal-commercial` (privat)
Branch: `main`
Seit dem Neuaufbau werden Änderungen direkt versioniert; der Projektstand liegt nicht mehr nur im Chat.

## Prüfstand
Cloudflare D1, R2, Login, Rollen-/Mandantentrennung, erzwungener Erstpasswortwechsel und Branding-Logo/Farben wurden im echten Deployment praktisch getestet. Der neue automatische Stundenplan-Import inklusive PDF-Pfad und Klassenverantwortlichen-Workflow muss nach dem aktuellen Build noch im echten Worker mit Testdateien verifiziert werden.

## Noch zu verifizieren
- aktueller Cloudflare-Build nach Stundenplan-/PDF-Erweiterung
- XLSX/CSV-Stundenplan in echter Runtime
- Text-/Tabellen-PDF in echter Runtime
- Scan-PDF-Fehlermeldung
- Login als Klassenverantwortliche/r und Nachweis der reinen Klassensicht
- Originaldatei in R2/Backup-Zuordnung

## Nicht behauptet
Der Stundenplan-/PDF-Pfad gilt erst nach diesen echten Smoke-Tests als produktiv verifiziert.
