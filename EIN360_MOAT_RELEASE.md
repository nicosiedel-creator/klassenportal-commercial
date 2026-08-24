# EIN360 Moat – Release- und Sicherheitsdefinition

Stand: 2026-08-20

## Ziel
Der Ausbau soll Klassenportal nicht durch eine bloß größere Featureliste differenzieren, sondern durch messbar weniger manuelle Arbeit, bessere Nachweisbarkeit und sichere End-to-End-Automation für deutsche/europäische Bildungsträger.

## Enthaltene Produktblöcke
1. Deutschland-/EU-Compliance-Unterstützung mit versionierten, manuell verifizierten Regelständen.
2. Compliance Evidence Graph auf Basis des bestehenden Education Proof Graph.
3. Action Copilot als einheitlicher Einstieg; zunächst Preview/Simulation, keine direkten kritischen Writes.
4. Persönlicher EU-sicherer Learner Twin, strikt getrennt vom Operations Twin.
5. Persönlicher Lerncoach auf Basis eigener freigegebener Daten.
6. Teilnehmerportal mit 15 Sprachen und RTL-Unterstützung.
7. Zeitlich begrenzte Partnerfreigaben mit Capability-Whitelist.
8. Zero-Touch-Migration-Qualitätsgate und Integrations-Hub.

## Unverhandelbare Sicherheitsgrenzen
- Plattformadmin ist kein Ersatz-Kundenadmin für Tenant-Operationen.
- Compliance-Regelpakete werden nie allein durch Software als rechtlich/förderrechtlich verbindlich bezeichnet.
- Aktivierung eines Compliance-Packs verlangt bestätigten Regelstand und offizielle Quelle.
- Sensible Compliance-, Evidence- und Partner-Mutationen verlangen Kundenadmin + erneute Passwortbestätigung oder OIDC.
- Partner-Tokens werden nur gehasht gespeichert und nur bei Erstellung einmal angezeigt.
- Partnerzugriffe haben eine Positivliste; Noten, individuelle Anwesenheit, Gesundheit, private Notizen, Abrechnung, Rollen und Berechtigungen bleiben ausgeschlossen.
- Learner Twin nutzt nur eigene Teilnehmerdaten, keine Peer-Vergleiche, keine Emotionserkennung, keine Biometrie und keine Persönlichkeitsbewertung.
- Der erste Learner-Twin-Stand verwendet keine offiziellen Noten für automatische Empfehlungen.
- Action Copilot bleibt Preview/Simulation-first; Rollen, Berechtigungen, Zahlungen, Noten, individuelle Anwesenheit und Signaturen bleiben kritische Sperrbereiche.
- Migrationspreflight erlaubt keinen stillen Datenverlust. Blockierte/unsichere Datensätze müssen sichtbar bleiben.

## Messbare 2×-Ziele
- Bildungsträger bis arbeitsfähig: < 2 Stunden.
- automatisch erkannter Altbestand: >= 95 %.
- verbundene Doppeleingaben: 0.
- typische Verwaltungsarbeit: >= 50 % Zeitersparnis.
- Standardvorgang: eine natürliche Eingabe + eine bewusste Freigabe.
- Prüf-/Nachweispaket: < 60 Sekunden.
- Teilnehmerportal: 15 Sprachen.
- Kernaufgaben ohne Hilfe durch Laientester: >= 90 %.
- stiller Datenverlust: 0.
- unnachvollziehbare KI-Entscheidung: 0.
- kritische produktive KI-Änderung ohne Freigabe: 0.

## Abnahme-Gates
Der Block darf erst nach folgenden Prüfungen als produktiv abgenommen gelten:
1. TypeScript-Build und vollständige Regressionen grün.
2. D1-Migration 0083 lokal und remote erfolgreich.
3. Rollenregression Teilnehmer/Klassenadmin/Dozent/Kundenadmin/Plattformadmin.
4. 15 Sprachoptionen sichtbar; Arabisch/Farsi/Dari/Paschtu RTL-Smoke.
5. Learner Twin zeigt keine Peer-Daten und keine verbotenen Hochrisikomerkmale.
6. Partner-Token kann nach Speicherung nicht aus der Datenbank rekonstruiert werden.
7. Partnerzugang zeigt nur explizit freigegebene Capability-Daten.
8. Compliance-Pack lässt sich ohne erneute Passwortbestätigung bzw. ohne Regelstandsbestätigung nicht aktivieren.
9. Evidence Package reproduzierbar über SHA-256.
10. Migration mit Dublette, fehlendem Pflichtfeld und unplausibler E-Mail wird korrekt markiert/blockiert.
11. Action Copilot führt aus Freitext keine direkte kritische Produktivänderung aus.
12. Desktop- und Smartphone-Smoke mit echten Testmandanten Michael/Charleen.

## Noch bewusst nicht behaupten
- keine Aussage „automatisch BAMF-/AZAV-/BA-rechtskonform“;
- keine automatische Förderfähigkeitsentscheidung;
- keine vollständige 100%-Übersetzung aller Alttexte, bevor die Coverage-Prüfung dies belegt;
- kein Ersatz professioneller Buchhaltung/Payroll/Transportsoftware;
- kein psychologisches Profiling von Teilnehmern;
- keine vollautonome pädagogische Hochrisikoentscheidung.

