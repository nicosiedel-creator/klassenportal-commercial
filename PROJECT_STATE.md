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
- **Verkauf und Abrechnung sollen weitgehend selbsttätig laufen:** Angebot, Buchung, gebuchter Umfang, spätere Erweiterung und Abrechnungsstatus werden systemseitig geführt.

## Plattform-Admin / Kunden-Onboarding
Verbindlicher Zielablauf:
1. Plattform-Admin startet eine Kunden-Einrichtung und wählt nur Kunden-E-Mail, vorgesehenes Paket und Gültigkeit des Einrichtungslinks.
2. Das System erzeugt einen einmaligen, zeitlich begrenzten Einrichtungslink.
3. Der Kunde trägt seine Stammdaten und die gewünschte **Anzahl Klassen/Kurse** selbst ein.
4. Wenn der Tarif preislich freigegeben ist, berechnet das System daraus automatisch das konkrete Angebot und zeigt es vor der Buchung an.
5. Der Kunde bestätigt das Angebot; das System erzeugt Buchungs-/Abrechnungsdatensätze und provisioniert Mandant, Kunden-Admin, Kontingent und optional die erste Klasse.
6. Danach übernimmt der Kunden-Admin die Einrichtung seines Bildungsträgers; laufende Klassenpflege kann an Klassenverantwortliche delegiert werden.

Der Plattform-Admin sieht im normalen Betrieb nur noch:
- Plattformübersicht / Kundenbestand
- Kunden/Mandanten und Vertrags-/Statusbezug
- Kunden-Einrichtungen / Einrichtungslinks
- Tarife & Abrechnung / eigene Rechnungsdaten
- später erforderliche System- und Zahlungsproviderfunktionen

Operative Bereiche wie Klassen/Kurse, Benutzerpflege innerhalb des Kunden, Inhalte, Prüfungen, Branding, Module und Datenpflege werden in der Plattform-Admin-Oberfläche ausgeblendet. Die zugrunde liegenden Kundenfunktionen bleiben für Kunden-Admins und berechtigte Klassenverantwortliche erhalten.

Kundenformular – Pflichtangaben:
- Name des Bildungsträgers
- **Anzahl der zunächst benötigten Klassen/Kurse**
- Ansprechpartner/in und E-Mail
- Geschäftsanschrift (Straße, PLZ, Ort, Land)
- erster Portal-Administrator (standardmäßig identisch mit Ansprechpartner)
- eigenes Passwort für den ersten Kunden-Admin
- Angebotsannahme, sobald automatische Tarifpreise freigeschaltet sind

Kundenformular – optionale Angaben:
- eigener Portalname
- Webseite / Telefon
- abweichende Rechnungs-E-Mail
- USt-IdNr.
- erste Klasse / erster Kurs und Kürzel

Bewusst **nicht** im Verkaufsformular abgefragt werden einzelne Namen aller Klassen, Fächer, Dozenten oder Stundenplandaten. Diese Informationen werden später importiert bzw. im Kundenbetrieb gepflegt.

## Kommerzielle Automatisierung
### Tarifregeln
Der Plattform-Admin kann je Paket zentral konfigurieren:
- monatlichen Grundpreis
- einmaligen Einrichtungspreis
- enthaltene Klassen/Kurse
- optional maximale Klassen/Kurse
- Preis je zusätzlicher Klasse/Kurs pro Monat
- Angebotsgültigkeit
- Freigabe automatischer Preisberechnung
- Freigabe von Self-Service-Erweiterungen

Die bisher im Datenbestand vorhandenen Preise gelten nicht automatisch als final bestätigte Verkaufspreise. `pricing_enabled` muss bewusst freigegeben werden.

### Angebot / Buchung / Kontingent
- gewünschte Klassenanzahl wird im Onboarding erfasst
- Live-Preisberechnung im Einrichtungsformular
- keine erfundenen Preise, wenn eine Tarifregel noch nicht freigegeben ist
- angenommenes Preisangebot wird als nachvollziehbarer Angebotsdatensatz gespeichert
- Buchungsdatensatz und Abrechnungsentwurf werden automatisch erzeugt
- das gebuchte Klassenkontingent wird als `tenant_entitlements.course_limit` gespeichert
- neue Klassen können nicht über das gebuchte Kontingent hinaus angelegt werden

### Self-Service-Erweiterung
Kunden-Admins erhalten **„Paket & Abrechnung“**:
- aktuelles Paket und Klassenkontingent sehen
- größeren Klassenumfang wählen
- auf einen preislich höheren/freigegebenen Tarif wechseln
- Mehrpreis vor Bestätigung sehen
- keine spontane Self-Service-Verkleinerung; Reduzierungen werden getrennt behandelt
- Erweiterungs-, Abrechnungs- und Auditdatensätze werden automatisch angelegt

### Zahlungsdienstleister
Die Plattform enthält eine anbieterneutrale Zahlungs-/Abrechnungsstatusschicht. Echte automatische Karten-/SEPA-Abbuchung und steuerlich finale Rechnungsstellung werden **erst nach Verbindung eines externen Zahlungs-/Abrechnungsdienstleisters** freigeschaltet. Bis dahin werden keine erfolgreichen Zahlungen behauptet und keine ungeprüfte Steuerlogik hardcodiert.

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
- Anzahl Klassen/Kurse + Live-Angebot im Kunden-Onboarding
- Tarife-&-Abrechnung-Konfiguration im Plattform-Admin
- Kundenbereich „Paket & Abrechnung“ / Self-Service-Erweiterung
- Stundenplan-Einzelimport PDF/XLSX/CSV
- Stundenplan-Massenupload
- automatisches Einlesen von Fachbezeichnungen/Fachkürzeln/Dozenten
- Punkt-22-Import/Export/Backup/Restore als kompletter End-to-End-Smoke-Test

## Sicherheitsstand
Der öffentliche Bootstrap-/Setup-Endpunkt wurde nach der Ersteinrichtung aus dem Code entfernt. Das Cloudflare-Secret `BOOTSTRAP_SECRET` wird vom laufenden Code nicht mehr benötigt und soll im Worker gelöscht sein, sobald die Ersteinrichtung abgeschlossen ist.
