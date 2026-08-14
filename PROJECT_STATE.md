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
- Plattform-Admin, Mandanten-Admin, Klassen-Admin, Teilnehmer, Gast
- serverseitige Klassen-/Kursberechtigungen; Klassen-Admins sehen und verändern nur zugewiesene Klassen
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

## Punkt 22 – Import, Export und Backups
- CSV-Import
- XLSX-Import
- PDF-Originalimport nach R2
- Import-Vorschau / Validierung / Staging
- Import nur für Mandanten-Admin bzw. Plattform-Admin
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
Die Import-/Export-Dateifunktionen und Migrationen wurden im Aufbau bereits lokal geprüft. Danach wurden zusätzliche Sicherheits- und D1-Kompatibilitätskorrekturen vorgenommen. Deshalb gilt für den **aktuellen finalen Commit**: vor Produktivfreigabe nochmals TypeScript-Build/Tests sowie ein echter Cloudflare-D1/R2-Smoke-Test ausführen. Erst danach wird der Stand als produktiv verifiziert markiert.

## Vor echtem Produktiv-Deploy noch erforderlich
- Cloudflare D1-Datenbank und R2-Bucket im Account erzeugen/zuordnen
- echte D1-ID in `wrangler.jsonc` eintragen
- `BOOTSTRAP_SECRET` als Cloudflare-Secret setzen
- Migrationen auf die echte D1-Datenbank anwenden
- Cloudflare-GitHub-Deployment verbinden
- TypeScript-/Dateitests des finalen GitHub-Stands ausführen
- Smoke-Test im Cloudflare-Preview/Produktivruntime

## Nicht behauptet
Ohne echten Cloudflare-Runtime-Deploy ist noch keine 100%-Aussage über das Verhalten im produktiven Worker möglich. Produktivfreigabe erfolgt erst nach erfolgreichem D1/R2- und Login/Rollen-Smoke-Test.
