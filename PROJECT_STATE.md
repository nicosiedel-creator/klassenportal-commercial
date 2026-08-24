# PROJECT STATE – Klassenportal Commercial

Stand: 2026-08-24

## Verbindliche Abgrenzung

Dieses Repository enthält inzwischen **zwei strikt getrennte Entwicklungslinien**:

- `main` = **Commercial Klassenportal**. Dieser Branch ist die einzige Quelle für die kommerzielle Plattform.
- `vfa13-beta-pilot` = getrennte **VFA-13-Integrations-/Pilotlinie**. Änderungen dort dürfen nicht als Commercial-Produktstand interpretiert werden.

Das produktive VFA-13-Portal wird separat aus seiner freigegebenen VFA-Linie bzw. den ausdrücklich erzeugten Uploadpaketen veröffentlicht. Ein VFA-Uploadpaket ist nicht automatisch durch den Stand von `main` oder `vfa13-beta-pilot` ersetzt.

**Aktueller Commercial-main:** `cb6b9bc8b6b0b6eb9c21d4b1d3608aa2e492a0b1` (Merge PR #148).

## Verbindliche Produktprinzipien

- Oberfläche grundsätzlich **Deutsch**; englische Begriffe nur, wenn fachlich oder technisch sinnvoll.
- **Automation first:** hochladen statt nachbauen, erkennen statt konfigurieren, prüfen statt erneut eingeben.
- Normalfälle müssen mit möglichst wenigen Klicks funktionieren.
- Kunden sollen ihren Bildungsträger weitgehend selbst betreiben können; keine individuellen Codeänderungen pro Kunde als Normalfall.
- Plattformbetrieb und Kundenbetrieb bleiben getrennt.
- Plattform-Admin ist **kein Ersatz-Kundenadmin** für laufenden Unterrichts-/Klassenbetrieb.
- Verkauf, Angebot, Buchung, gebuchter Umfang, Erweiterung und Abrechnungsstatus werden soweit möglich systemseitig geführt.
- Datenschutz und Berechtigungen werden serverseitig erzwungen; Komfortfunktionen dürfen Rollenrechte niemals erweitern.

## Rollenmodell Commercial

- Plattform-Admin
- Kunden-/Mandanten-Admin
- Klassen-/Kurs-Admin bzw. Klassenverantwortliche/r
- Dozent/in
- Teilnehmer/in
- Gast

Verbindlich:

- **Klassenadmin bleibt Teilnehmer mit Zusatzrechten.** Eigene Teilnehmeransicht und eigene persönliche Daten bleiben wie bei jedem anderen Teilnehmer.
- Klassenadmin erhält keine fremden Noten, individuellen Anwesenheiten, Abgaben, privaten Notizen oder Berichtsheftdaten.
- Klassenadmin darf nur die ihm zugewiesenen Klassen/Kurse operativ pflegen.
- Dozenten sehen ausschließlich explizit zugeordnete Klassen/Kurse und die dafür vorgesehenen zweckgebundenen Funktionen.
- Kunden-Admins verwalten ausschließlich den eigenen Mandanten.
- Plattform-Admin darf Tenant-Autopilot oder laufende Kundenpflege nicht als Ersatz-Kundenadmin ausführen.

## Kernplattform – umgesetzt

- Cloudflare Workers + Static Assets
- Cloudflare D1 und R2
- strikte `tenant_id`-/`course_id`-Trennung
- serverseitige Sessions und Autorisierung
- Zugriff pro Kurs: öffentlich / Link-Code / Login / Hybrid
- gehashte Zugangscodes
- automatisiertes Kunden-Provisioning
- Klassen/Kurse, Benutzer/Rollen, Branding, Inhalte, Aufgaben, Prüfungen und private persönliche Noten
- CSV-/XLSX-/PDF-Import und Export
- vollständiger Kundenexport inklusive Originaldateien
- Backups, Restore-Sicherheitsablauf, Vertragsende- und Löschworkflow
- Audit-/Provisionierungsprotokoll
- Microsoft-/Teams-Integrationsschema; keine eigene Office-Suite, kein eigener Chat- oder Videokonferenzersatz

## Branding und Datenimport

Produktbestand umfasst:

- Logo-Upload nach R2
- automatische Farberkennung
- Brandingvarianten und Live-Vorschau
- mandantenbezogene Speicherung
- Einzel- und Massenupload von Stundenplänen
- PDF/XLSX/CSV
- automatische Zuordnung von Klassen, Fächern, Fachkürzeln, Dozenten, Räumen und Unterrichtsformen soweit eindeutig
- Vorschau/Validierung vor Übernahme
- Dublettenprüfung und sicherer Abgleich
- Archivierung von Originaldateien

## Angebot, Pilot und Onboarding

Umgesetzt:

- Angebotsmanager im Plattformbereich
- fortlaufende Angebotsnummern
- individuelle Monats-/Einrichtungspreise und Rabatte
- Pilotangebote mit 0 EUR, frei wählbarer Dauer und ohne automatische Umwandlung in ein kostenpflichtiges Abo
- nicht erratbare Angebotslinks; serverseitig nur Token-Hash
- Annahme mit Versionierung von AGB/AVV/Datenschutz
- aus angenommenem Angebot wird ein Einrichtungslink erzeugt
- Angebot und Einrichtungslink können über die konfigurierte Transaktions-E-Mail versendet werden
- PR #148 ergänzt den **automatischen Versand** bei Angebotsfreigabe/Linkrotation, Angebotsannahme und erneuter Ausstellung eines Einrichtungslinks sowie eine sichtbare Versand-/Readiness-Rückmeldung
- Versandfehler dürfen nicht als erfolgreicher E-Mailversand dargestellt werden; ein gültiger kopierbarer Link bleibt erhalten

## Commercial CI / Browserstand 24.08.2026

Der finale PR-Head von #148 war `66c7c4decc1dafcce4427c446a0f7705d8e8f931`.

Auf diesem exakten Head waren erfolgreich:

- Klassenportal CI
- Education OS release gate
- Education OS privacy and storage security
- Education OS deep security
- Education OS circuit breaker
- Commercial browser E2E

Der Browser-E2E prüft öffentlich die Commercial-Einstiegspunkte und geschützte/ungültige Onboarding-/Angebotsrouten fail-closed.

**Wichtige Einschränkung:** Der angemeldete Plattformadmin-Browserpfad wird nur ausgeführt, wenn `E2E_PLATFORM_EMAIL` und `E2E_PLATFORM_PASSWORD` als GitHub-Actions-Secrets gesetzt sind. Ohne diese Secrets meldet der Test ausdrücklich, dass dieser Teil übersprungen wurde. Deshalb darf der vollständige reale Ablauf `Plattformadmin-Login -> Angebot -> reale E-Mail -> Annahme -> Einrichtungs-Mail -> Einrichtung` noch nicht allein aus dem grünen öffentlichen Browserlauf als vollständig praktisch bewiesen bezeichnet werden.

## Commercial Live-Smoke

Auf `main` existiert ein eigener Live-Smoke gegen:

`https://klassenportal-commercial.nicosiedel.workers.dev`

Er wartet über `/build-meta.json` auf den **exakten Main-Commit** und prüft anschließend:

- `/produkt`
- `/plattform-admin`
- `/kunden-admin`
- `/dozentenportal`
- geschützte Plattform-Onboardingroute
- öffentliche ungültige Onboardingroute fail-closed

Der Workflow ist damit gegen den alten, nicht mehr gültigen Preview-Host abgesichert. Der konkrete Push-Run des Merge-Commits muss weiterhin als eigener Live-Nachweis betrachtet werden und darf nicht aus PR-CI abgeleitet werden.

## Education OS / 5000x-Ziel

Verbindliche Richtung:

- Live Education Twin
- Scenario Lab
- Education Autopilot
- Future Radar
- Proof Graph
- Intent-first Administration
- Adaptive Recovery
- Self-healing Data

Produktgesetze:

1. einmal erfassen, überall korrekt weiterverwenden;
2. erst simulieren, dann verändern;
3. Regelwerk vor KI;
4. kritische Änderungen nur mit nachvollziehbarer menschlicher Freigabe;
5. alles erklärbar und auditierbar;
6. Privacy by role;
7. Import statt Nachbau.

Der Education-OS-Stand ist als **feature-complete candidate** zu behandeln, nicht als vollständig produktiv abgenommen, solange reale externe Browser-/Smartphone-/Provider- und kundenspezifische Abnahmen fehlen.

## Sicherheitsgrenzen

- keine Peer-Daten im Learner Twin
- keine Emotionserkennung/Biometrie/Persönlichkeitsbewertung
- keine kritischen produktiven KI-Schreibrechte ohne Freigabe
- keine Rollen-/Berechtigungs-/Zahlungs-/Noten-/individuellen Anwesenheitsaktionen über den Autopilot
- High-Risk-Aktionen mit MFA/OIDC und vorgesehenem Vier-Augen-Prinzip
- Partnerzugänge nur per Capability-Whitelist
- kein stiller Datenverlust bei Migration
- keine Behauptung automatischer BAMF-/AZAV-/BA-Rechtskonformität

## Zahlung / externe Produktionsgates

Sandbox-Grundpfade für erfolgreiche Karte und verzögertes SEPA sind im Projektstand dokumentiert. Vor echter Live-Zahlungsfreigabe bleibt insbesondere der absichtlich fehlgeschlagene Zahlungsfall mit sauberem Retry als realer Pflichtnachweis relevant.

Provider-/Produktionswerte wie echte Stripe-Live-Secrets, Webhook-Secrets, Eigentümer-MFA-Schlüssel, verifizierte Mail-/Domainkonfiguration oder rechtliche Anbieterangaben dürfen niemals erfunden werden. Soweit diese Werte für einen konkreten Live-Start erforderlich sind, bleibt die jeweilige Funktion fail-closed, bis reale Werte und Abnahmen vorliegen.

## VFA-13 – verbindlicher, davon getrennter Sollstand

VFA-13 ist **kein Commercial-Testmandant**, sondern die eigene produktive Klassenportal-Linie.

Aktuell verbindlich:

- allgemeine Klasseninformationen dürfen weiterhin ohne Login nutzbar sein;
- **Login und Registrierung sind ausdrücklich vorgesehen**, weil persönliche und administrative Funktionen einen authentifizierten Benutzer benötigen;
- Selbstregistrierung erzeugt ausschließlich ein Teilnehmerkonto;
- persönliche Noten, eigene Anwesenheit, eigene Abgaben und eigenes Berichtsheft bleiben geschützt;
- Klassenadmin/Klassensprecher ist Teilnehmer mit Zusatzrechten;
- Klassenadmin darf öffentliche Klasseninhalte, Lerninhalte/Lernziele, Materialien, Aufgaben, Prüfungen, Prüfungsvorbereitung, Kalender, Klassenbuch-Themen, Umfragen und Mitteilungen verwalten;
- Mitteilungen/Meldungen können auch an einzelne Teilnehmer gerichtet sein;
- Umfragen müssen vollständig anlegbar, bearbeitbar, erweiterbar, schließbar und löschbar sein;
- Klassenadmin erhält keine fremden persönlichen Noten, individuellen Anwesenheiten, Abgaben oder Berichtshefte;
- Schüler tragen nach einer geschriebenen Prüfung ausschließlich ihre eigene persönliche Note ein;
- Dozentenfunktionen bleiben technisch separat und dürfen keine Klassenadmin-Privilegien über Fremddaten erzeugen;
- Normalunterricht: ein Präsenzblock `08:15–11:30` oder `12:15–15:30` plus der jeweils andere Block als Individuallernphase/Homeoffice; `11:30–12:15` bleibt frei; Prüfung/Exkursion sind Ausnahmen.

### VFA-13 Rollenverwaltung – Korrektur 24.08.2026

Der geschützte Verwaltungszugang muss bestehende registrierte Konten verwalten können. Dazu gehört:

- Rolle bestehender Konten `Teilnehmer <-> Dozent` ändern;
- bei Teilnehmern Klassenadmin/Klassensprecher-Zusatzrecht setzen oder entfernen;
- Wechsel auf Dozent entfernt das Klassenadmin-Zusatzrecht;
- diese Rollenänderung bleibt hinter dem Verwaltungsschlüssel und ist **kein Teilnehmer-Self-Service**.

Der aktuell lokal geprüfte Uploadkandidat für diese Korrektur ist **VFA-13 Release `20260824-10`**. Er muss nach Upload noch live gegen Health, Login/Registrierung und die tatsächliche Rollenänderung geprüft werden.

## Aktuelle offene Abnahme – Priorität

### VFA-13

1. Release `20260824-10` hochladen.
2. `/api/v2/health` auf exakt `20260824-10` prüfen.
3. Registrierung und Login eines Teilnehmerkontos prüfen.
4. Im geschützten Verwaltungszugang dasselbe Konto unter `Konten & Rollen` zu `Teilnehmer + Klassenadmin/Klassensprecher` ändern.
5. Portal neu laden und Klassenbetrieb prüfen.
6. Negativtests: keine fremden Noten/Anwesenheiten/Abgaben/Berichtshefte.
7. Umfrage-CRUD, gezielte Einzelmeldung, Prüfungsvorbereitung und Kalenderblocklogik live prüfen.

### Commercial

1. exakten Main-Deploy des Merge-Commits über den Main-Live-Smoke bestätigen;
2. GitHub-Secrets für den authentifizierten Commercial-Browserpfad setzen bzw. dessen realen Lauf anderweitig vollständig nachweisen;
3. echten Plattformadmin-E2E: Angebot -> Versand -> Annahme -> Einrichtungslink -> Versand -> Einrichtung;
4. anschließend die großen Rollen-/Mandanten-/Import-/Education-OS-/Backup-/Restore-/Stripe-Negativtests mit den vorbereiteten Testpaketen durchführen;
5. Testunterlagen vom alten Preview-Host auf den kanonischen Worker `klassenportal-commercial.nicosiedel.workers.dev` aktualisieren.

## Bereinigungsstand GitHub

Am 24.08.2026 wurden die veralteten offenen VFA-PRs #133, #134 und der ausdrücklich nicht zu mergende Diagnose-PR #147 geschlossen. Nach dieser Bereinigung bestehen keine offenen eigenen Pull Requests im Repository.
