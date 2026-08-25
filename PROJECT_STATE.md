# PROJECT STATE – Klassenportal Commercial

Stand: 2026-08-25

## Verbindliche Abgrenzung

- `main` ist ausschließlich die Quelle für das **Commercial Klassenportal**.
- VFA-13 ist eine getrennte Entwicklungs-/Pilotlinie und ist **kein Bestandteil der Commercial-Fertigstellung oder Commercial-Livefreigabe**, solange dies nicht ausdrücklich anders beauftragt wird.

## Commercial – produktiver Ausgangsstand

Der letzte vollständig nachgewiesene Produktionsrelease vor diesem Abschlussblock ist `28581eff98f3b0a91d1dae3b6c89c1c83b282480` (Merge PR #158). Auf dem zugehörigen PR-Head waren alle sechs Pflichtgates grün; der anschließende `main`-Live-Smoke bestätigte den exakten produktiven Commit auf `klassenportal.app` sowie EU-D1-, Release-Lock-, Onboarding- und Payment-Freeze-Verträge.

## Produktprinzipien

- Oberfläche grundsätzlich Deutsch; englische Fachbegriffe nur, wenn technisch sinnvoll.
- Automation first: hochladen statt nachbauen, erkennen statt konfigurieren, prüfen statt erneut eingeben.
- Privacy by role und serverseitige Mandanten-/Rollen-/Kursgrenzen.
- Kritische Änderungen bleiben erklärbar, auditierbar und fail-closed.
- Plattformadmin ist kein Ersatz-Kundenadmin für laufenden Kundenbetrieb.
- Klassenadmin bleibt Teilnehmer mit Zusatzrechten und erhält keine fremden persönlichen Leistungs-, Anwesenheits-, Abgabe- oder privaten Notizdaten.
- Dozenten sehen ausschließlich explizit zugeordnete Klassen/Kurse.
- Zahlungsverarbeitung bleibt bis zur ausdrücklichen späteren Zahlungsfreigabe deaktiviert (`PAYMENTS_ENABLED=false`).

## Kernplattform – umgesetzt

- Cloudflare Workers + Static Assets
- D1 und R2 mit produktiven EU-Bindings
- strikte `tenant_id`-/`course_id`-Trennung
- serverseitige Sessions und Autorisierung
- Zugriff pro Kurs: öffentlich / Link-Code / Login / Hybrid
- automatisiertes Kunden-Provisioning
- Rollen-, Branding-, Inhalts-, Aufgaben-, Prüfungs-, Kalender-, Anwesenheits-, Klassenbuch-, Lern- und Reportingfunktionen
- CSV-/XLSX-/PDF-Import und Export
- vollständige Datenportabilität inklusive Originaldateien
- starke Backups mit SHA-256 bzw. R2-ETag/Größenprüfung
- Restore-Sicherheitsablauf, Löschworkflow und Auditierung
- Microsoft-/Teams-Integrationsschema
- Education-Twin-/Scenario-/Autopilot-/Guardrail-Bausteine mit bestehenden Security-/Privacy-/Circuit-Breaker-Gates

## Evidence-driven Production Acceptance

Der Abschlussblock `PRODUCTION_ACCEPTANCE_2026-08-25.md` ersetzt veraltete manuelle Freigabeannahmen durch technische Evidenz:

- Backup-EU-Speichergrenze wird aus dem tatsächlich genutzten produktiven EU-`FILES`-Binding abgeleitet; die Backup-Implementierung schreibt Backupdateien und Manifeste ausschließlich über dieses Binding.
- Der reale Legacy-R2-Bestand wird gegen den EU-R2-Bestand anhand Schlüssel, Größe und ETag geprüft.
- Fehlende oder abweichende Objekte werden automatisch in begrenzten, idempotenten, **nicht-destruktiven** Batches nach EU kopiert und unmittelbar per Readback geprüft.
- Die Legacy-Quelle wird durch den Selbstheilungszyklus niemals gelöscht.
- Kundenschreib-Automationen bleiben nur solange pausiert, wie reale R2-Parität noch nicht bewiesen ist; ein veraltetes Flag kann den Zustand nicht mehr falsch darstellen.
- Nach realer Parität laufen die normalen Automationen wieder; starke aktuelle Kundenbackups bleiben zusätzliches Readiness-Gate.
- Der Commercial-Browser-E2E prüft Desktop **und** mobile Touch-Viewport-Oberflächen für Plattformzugang, Produkt, Kundenadmin und Dozentenportal sowie Browser-/Serverfehler und dokumentweiten horizontalen Overflow.

## Education OS – verbindliche Abnahme

Die Education-OS-Funktionen gelten nicht allein wegen vorhandenen Codes als freigegeben. Verbindlich bleiben auf jedem Releasekandidaten:

1. Education OS release gate
2. Education OS deep security
3. Education OS privacy and storage security
4. Education OS circuit breaker
5. Klassenportal CI
6. Commercial browser E2E einschließlich Mobile-Viewport

Kritische KI-/Autopilot-Schreibrechte, Rollen-, Zahlungs-, Noten- und individuelle Anwesenheitsaktionen bleiben außerhalb autonomer Freigaben. Simulation, Regelwerk, Auditierbarkeit und menschliche Freigabe bleiben Produktgesetz.

## Sicherheitsgrenzen

- keine Peer-Daten im Learner Twin
- keine Emotionserkennung, Biometrie oder Persönlichkeitsbewertung
- keine kritischen produktiven KI-Schreibrechte ohne vorgesehene Freigabe
- keine Rollen-/Berechtigungs-/Zahlungs-/Noten-/individuellen Anwesenheitsaktionen über unkontrollierten Autopilot
- High-Risk-Aktionen mit Passwort-Step-up bzw. vorgesehenem Vier-Augen-Prinzip
- kein stiller Datenverlust bei Migration oder Restore
- keine erfundene Provider-, Rechts- oder Compliance-Konfiguration

## Produktionsfreigabe

Die Plattformadmin-Livefreigabe bleibt absichtlich versionsgebunden. Sie verlangt aktuellen Passwort-Step-up und die exakte Bestätigungsphrase `LIVE FREIGEBEN`. Administrator-Zugangsdaten werden nicht in PR-/CI-Workflows hinterlegt. Das ist ein Sicherheitsinvariant und kein offener Entwicklungsfehler.

Die technische Release-Regel lautet weiterhin:

**unveränderter PR-Head → 6/6 Pflichtgates grün → Merge → produktiver Cloudflare-Build → EU-D1/Migrationen → exakter Live-Commit → Commercial-Main-Live-Smoke.**

Kein Gate darf durch Abschalten von WAF, Rollen-, Datenschutz-, Backup-, Payment-Freeze- oder Step-up-Schutz umgangen werden.
