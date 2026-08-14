# PROJECT STATE – Klassenportal Commercial

Stand: 2026-08-14

## Schutzregel
Das produktive VFA13-Portal gehört nicht zu diesem Repository und wird durch dieses Projekt nicht verändert.

## Verbindliche Produktprinzipien
- Oberfläche grundsätzlich **Deutsch**; englische Begriffe nur dort, wo sie fachlich üblich oder technisch sinnvoll sind.
- **Automation first:** Hochladen statt Nachbauen, erkennen statt konfigurieren, prüfen statt erneut eingeben.
- Der Normalfall muss mit möglichst wenigen Klicks funktionieren. Erweiterte Zuordnungen und technische Optionen werden nur bei Sonderfällen gezeigt.
- Kunden sollen das Portal weitgehend selbst bedienen können, ohne dass für jeden Bildungsträger individuelle Codeänderungen nötig sind.
- Laufende Klassenpflege kann an **Klassenverantwortliche (z. B. Klassensprecher)** delegiert werden.
- Bildungsträger/Kunden-Admins dürfen dieselben Pflegeaufgaben weiterhin zentral und auch für mehrere Klassen durchführen.
- Technische Rollen- und Feature-Schlüssel bleiben intern stabil; sichtbar werden verständliche deutsche Bezeichnungen verwendet.
- **Plattformbetrieb und Kundenbetrieb sind getrennt:** Der Plattform-Admin soll keine laufende Stundenplan-, Inhalts-, Prüfungs- oder Brandingpflege für Kunden übernehmen.

## Plattform-Admin / Kunden-Onboarding
Verbindlicher Zielablauf:
1. Plattform-Admin startet eine Kunden-Einrichtung und wählt nur Kunden-E-Mail, gebuchtes Paket und Gültigkeit des Einrichtungslinks.
2. Das System erzeugt einen einmaligen, zeitlich begrenzten Einrichtungslink.
3. Der Kunde trägt seine Stammdaten selbst ein.
4. Das System provisioniert daraus automatisch Mandant, Kunden-Admin, Tarif/Feature-Grundlage und optional die erste Klasse.
5. Danach übernimmt der Kunden-Admin die Einrichtung seines Bildungsträgers; laufende Klassenpflege kann an Klassenverantwortliche delegiert werden.

Der Plattform-Admin sieht im normalen Betrieb nur noch:
- Plattformübersicht / Kundenbestand
- Kunden/Mandanten und Vertrags-/Statusbezug
- Kunden-Einrichtungen / Einrichtungslinks
- später erforderliche Abrechnungs-/Systemfunktionen

Operative Bereiche wie Klassen/Kurse, Benutzerpflege innerhalb des Kunden, Inhalte, Prüfungen, Branding, Module und Datenpflege werden in der Plattform-Admin-Oberfläche ausgeblendet. Die zugrunde liegenden Kundenfunktionen bleiben für Kunden-Admins und berechtigte Klassenverantwortliche erhalten.

Kundenformular – Pflichtangaben:
- Name des Bildungsträgers
- Ansprechpartner/in und E-Mail
- Geschäftsanschrift (Straße, PLZ, Ort, Land)
- erster Portal-Administrator (standardmäßig identisch mit Ansprechpartner)
- eigenes Passwort für den ersten Kunden-Admin

Kundenformular – optionale Angaben:
- eigener Portalname
- Webseite / Telefon
- abweichende Rechnungs-E-Mail
- erste Klasse / erster Kurs und Kürzel

Das gebuchte Paket wird vom Plattform-Admin vorgegeben und kann im öffentlichen Einrichtungsformular nicht vom Kunden hochgestuft werden.

## Kernplattform
- eigenständige kommerzielle Cloudflare-Plattform
- Mandantentrennung über `tenant_id`
- Klassentrennung über `course_id`
- Rollen: Plattform-Admin, Kunden-Admin, Klassenverantwortliche/r, Teilnehmer/in, Gast
- Klassenverantwortliche dürfen nur zugewiesene Klassen bearbeiten
- Kunden-Admins verwalten den eigenen Bildungsträger und alle zugehörigen Klassen
- Login/Sessions und serverseitige Autorisierung
- Zugriff öffentlich / Link-Zugangscode / Anmeldung / Hybrid
- Zugriffscodes gehasht gespeichert
- automatisiertes Kunden-Provisioning
- Klassen/Kurse, Benutzer/Rollen, Inhalte, Prüfungen und private persönliche Noten
- Microsoft-Teams-/Microsoft-365-Integrationsschema, keine eigene Office-Suite, kein eigener Chat und keine eigene Videokonferenz
- Audit- und Provisionierungsprotokoll

## Branding-Automatik
Produktiv getestet:
- Logo-Upload nach R2
- automatische Farberkennung aus dem Logo
- Varianten Originalgetreu / Modern / Kontrastreich
- Live-Vorschau
- manuelle Nachbearbeitung bleibt möglich
- Logo und Branding werden mandantenbezogen gespeichert
- Branding-Dateien sind Bestandteil von Backup/Voll-Export

## Automatischer Stundenplan
### Einzel- und Massenupload
- PDF, XLSX und CSV
- bis zu 100 Dateien in einem Auswahl-/Drag-and-drop-Vorgang in der Oberfläche
- Dateien werden nacheinander verarbeitet, damit auch größere Uploads übersichtlich bleiben
- Bildungsträger/Kunden-Admins können Dateien für mehrere Klassen gemeinsam hochladen
- Klassenverantwortliche können dieselbe Funktion ausschließlich innerhalb ihrer zugewiesenen Klassen nutzen
- Klasse/Kurs wird soweit möglich automatisch aus Dateiname oder Dateiinhalten erkannt
- bei nur einer verfügbaren Klasse wird diese automatisch gewählt
- fremde Klassenbezeichnungen in Quelldateien sind kein Abbruchgrund, wenn eine eindeutige Zielklasse vorgegeben ist
- nur unsichere Dateien erfordern eine manuelle Auswahl oder Einzelprüfung

### Automatische Stammdatenerkennung
Erkannt bzw. zugeordnet werden insbesondere:
- Datum
- Beginn und Ende
- Klasse/Kurs
- Fach
- Fachbezeichnung / Fachname
- Fachkürzel / Kurzbezeichnung / Fachcode
- Dozent/in / Lehrkraft / Trainer/in / Referent/in
- Raum / Ort
- Unterrichtsart / Format
- Hinweise / Informationen

Fächer und Dozenten werden beim Import vorhandenen Stammdaten zugeordnet oder bei Bedarf automatisch angelegt. Fachbezeichnungen und Fachkürzel werden gemeinsam in den Fachstammdaten gepflegt.

### PDF
- PDF.js wird lokal aus dem Portal ausgeliefert; keine externe CDN-Abhängigkeit für die PDF-Erkennung
- textbasierte/tabellarische PDFs werden lokal im Browser strukturiert ausgelesen
- die Originaldatei wird nach erfolgreicher Übernahme in R2 archiviert
- Scan-/Bild-PDFs ohne Textschicht werden nicht geraten; sie werden als nicht automatisch auslesbar gekennzeichnet
- reale Stundenpläne mit Doppelstunden-Matrix, Fach/Raum-Zeile und separater Dozenten-Zeile werden als eigener Erkennungsfall berücksichtigt

### Sicherer Abgleich
- Vorschau und Validierung vor der Übernahme
- Dubletten werden erkannt
- Modus „Abgleichen“ ersetzt im betroffenen Zeitraum nur zuvor automatisch importierte Stundenplanzeilen
- manuell angelegte Unterrichtseinträge bleiben unangetastet
- Originaldateien werden archiviert und in Backup/Voll-Export aufgenommen

## Punkt 22 – Import, Export und Backups
- CSV-Import
- XLSX-Import
- PDF-Originalimport nach R2
- Import-Vorschau / Validierung / Staging
- CSV-/XLSX-/PDF-Export
- vollständiger Kundenexport als ZIP mit Originaldateien
- manuelle und automatische Mandantenbackups
- Restore mit Pre-Restore-Sicherheitsbackup
- Vertragsende-Backup und Export
- Löschworkflow mit Karenz, Abbruch und endgültiger Löschung
- Audit-Ereignisse

## GitHub / Produktion
Repository: `nicosiedel-creator/klassenportal-commercial` (privat)
Branch: `main`
Produktiver Worker: `klassenportal-commercial.nicosiedel.workers.dev`
D1 und R2 sind eingerichtet und die Kernmigrationen wurden produktiv angewendet.

Produktiv bereits praktisch bestätigt:
- Plattform-Admin-Login
- automatisches Kunden-Provisioning
- Mandanten-/Klassentrennung im Kunden-Login
- erzwungener Passwortwechsel beim ersten Login
- Branding-/Logo-Automatik inklusive Speicherung

Noch praktisch zu bestätigen nach dem jeweils aktuellen Deployment:
- neue schlanke Plattform-Admin-Oberfläche
- Einrichtungslink und Kunden-Selbstregistrierung Ende-zu-Ende
- Stundenplan-Einzelimport PDF/XLSX/CSV
- Stundenplan-Massenupload
- automatisches Einlesen von Fachbezeichnungen/Fachkürzeln/Dozenten
- Punkt-22-Import/Export/Backup/Restore als kompletter End-to-End-Smoke-Test

## Sicherheitsstand
Der öffentliche Bootstrap-/Setup-Endpunkt wurde nach der Ersteinrichtung aus dem Code entfernt. Das Cloudflare-Secret `BOOTSTRAP_SECRET` wird vom laufenden Code nicht mehr benötigt und soll im Worker gelöscht sein, sobald die Ersteinrichtung abgeschlossen ist.
