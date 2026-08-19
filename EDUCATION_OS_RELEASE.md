# Education OS – Produktionsabnahme

Dieser Kandidat darf erst nach den folgenden Gates als **produktiv abgenommen** bezeichnet werden. Source-/Regressionstests ersetzen keine reale Browser-, Zahlungs- oder externe Signaturabnahme.

## 1. Build & Migration

- TypeScript vollständig grün
- vollständige Regressionen grün
- alle Browser-JavaScript-Dateien syntaktisch gültig
- Release-Readiness grün
- D1-Migrationen 0075–0077 lokal in Reihenfolge erfolgreich
- Remote-D1-Migrationen vor Worker-Stand angewendet
- keine destruktive Migration an bestehenden Kunden-/VFA13-Daten

## 2. Rollen-/Datenschutzabnahme

### Teilnehmer
- sieht nur eigene private Aufgaben-/Notiz-/Berichtsheftdaten
- Lernkompass wertet keine Daten anderer Teilnehmer aus
- Proof-/Twin-Betriebsmodell gibt keine Peer-Daten aus

### Klassenadmin
- bleibt Schüler mit Zusatzrechten
- keine Peer-Noten, individuellen Anwesenheiten, Abgaben oder privaten Notizen
- keinerlei indirekte Freigabe über Twin/Readiness/Radar

### Dozent
- Unterrichtsradar nur für explizit zugeordnete Klasse
- keine privaten Schülernotizen oder Noten im Betriebsradar
- individueller Anwesenheitszugriff bleibt ausschließlich in der bestehenden zweckgebundenen Dozentenfunktion
- kein Autopilot-Approve/Execute

### Fachbereichsleitung
- nur erlaubte Org-/Kursbereiche
- Twin-Quellen serverseitig auf erlaubte Kurse beschränkt
- keine Rollen-/Teilnehmerverwaltung durch Education OS
- kein Autopilot-Execute

### Kundenadmin
- Autopilot-Policy, Freigabe und Ausführung nur mit MFA/OIDC
- hohes Risiko benötigt zwei verschiedene Kundenadmins
- kritischer Plan nicht ausführbar

### Plattformadmin
- Plattform-Admin-UI unverändert
- Plattformadmin kann Tenant-Autopilot nicht als Ersatz-Kundenadmin ausführen

## 3. Live Education Twin

Mindestens mit zwei Klassen testen:
- korrekte Kurs-/Dozenten-/Raum-/Unterrichtszahlen
- Teilnehmer ausschließlich als Aggregat
- Lehrplan-/Klassenbuch-/Prüfungs-/Praxis-/Frist-/Berichtsheftaggregate plausibel
- delegierter Nutzer sieht ausschließlich erlaubte Kurse
- Snapshot unveränderlich
- nach Produktivänderung neuer Digest
- alter Snapshot bleibt unverändert

## 4. Scenario Lab

### Dozent fällt aus
- betroffene Stunden vollständig erkannt
- ungeeignete/abwesende/doppelt belegte Vertretung ausgeschlossen
- konfigurierte Fachqualifikation berücksichtigt
- Selbstlernphase nur bei expliziter Erlaubnis
- Schülerbenachrichtigung nur im gewählten Szenario

### Raum fällt aus
- alternative Räume frei und ausreichend groß
- gesperrte/belegte Räume ausgeschlossen
- Remote-Variante nur bei expliziter Erlaubnis

### Prüfung verschieben
- Unterrichts-/Prüfungskollision blockiert
- hohe Risikostufe / Vier-Augen-Prinzip

### Lehrplanrückstand
- Lücke nachvollziehbar
- Adaptive Recovery erzeugt nur Draft
- Draft läuft erneut durch erweiterte Stundenplanprüfung

## 5. Intent-first

- „Herr/Frau X ist morgen krank“ löst Mandanten-Zeitzone korrekt auf
- doppelte Namen erzeugen Auswahl statt Guess
- unbekannter Name erzeugt keine Simulation
- DST-Lücke/-Doppelstunde fail-closed
- unbekannte Absicht verändert nichts
- Freitext erzeugt nie direkt produktive Writes

## 6. Autopilot-Sicherheitsabnahme

- Standardpolicy `recommend_only`
- ohne MFA keine Freigabe/Ausführung
- mit nur einem Kundenadmin kein High-Risk-Execute
- veränderter Live-Zustand nach Approval → `stale` / Resimulation
- Idempotency-Key verhindert doppelte Ausführung
- parallele Ausführung desselben Tenants wird gelockt
- Rollen-, Berechtigungs-, Zahlungs-, Noten-, individuelle Anwesenheits- und Signaturaktionen werden serverseitig abgelehnt
- Guardrail-Blocker verhindert Approval und Execute
- Guardrail-Evidenz append-only + SHA
- D1-Precondition-Fehler rollt Batch zurück
- Rollback nur innerhalb Sicherheitsfenster
- nach Rollback altes Szenario `stale`; alte Approvals nicht wiederverwendbar
- nicht reversible Folgen werden sichtbar angegeben

## 7. Future Radar

Kontrolliert auslösen:
- Lehrplanlücke
- fehlendes Klassenbuch
- Dozent abwesend trotz Termin
- auslaufende Qualifikation
- Raumkapazität zu klein
- überfällige Bestätigung/Berichtsheft
- offene Vertretung
- Prüfungsvorgang vor Deadline unvollständig

Prüfen:
- hohe/kritische Warnung nur an echte Kundenadmins
- deduplizierte Benachrichtigung
- Risiko selbst führt keine produktive Änderung aus
- „Lösung simulieren“ startet nur Scenario Lab

## 8. Self-Healing

- widersprüchliche Lernform/Anwesenheit erkannt
- fehlende Session erkannt
- Klassenbuch ohne Curriculum-Link erkannt
- ungültige Berichtsheftquelle erkannt
- Unterricht außerhalb Kurszeitraum erkannt
- Raum/Reservierung-Widerspruch erkannt
- mögliche Altimport-Dublette erkannt
- niemals stilles Löschen/Umschreiben historischer Nachweise
- simulierbare Lösung bleibt freigabepflichtig

## 9. Proof Graph

- Beweiskette Unterricht → Session → Klassenbuch → Curriculum nachvollziehbar
- Lücken korrekt markiert
- keine Teilnehmernamen
- keine individuellen Anwesenheiten
- keine Noten
- keine privaten Notizen
- Proof-Paket SHA reproduzierbar
- Twin-Snapshot-SHA im Paket
- eingefrorenes Paket nach späteren Änderungen unverändert

## 10. Operational Readiness

- Dimensionen nachvollziehbar und aggregiert
- keine Personenbewertung
- tägliche Historie ohne Teilnehmeridentitäten
- blockierte Klasse bei kritischem Prüfungs-/Betriebsrisiko plausibel
- Trend-Snapshots unveränderlich

## 11. Mid-year / Altbestand

- strukturierter CSV-/XLSX-Klassenbuchimport mit Vorschau
- Original-/Altbestand eindeutig als Import markiert
- PDF/Originalquelle unverändert mit Prüfsumme archiviert
- keine Dubletten ohne Prüfhinweis
- Start im laufenden Kurs ohne Überschreiben nativer Historie

## 12. Reale externe Gates

Vor Live-Zahlungsfreigabe zwingend:
- absichtlich fehlgeschlagene Stripe-Sandboxzahlung → keine Freischaltung
- anschließender sauberer Retry → korrekte Freischaltung

Vor Werbeaussage „qualifizierte elektronische Signatur“ zwingend:
- vertrauenswürdigen externen QES-Anbieter auswählen
- technische Provider-Anbindung
- echte Provider-End-to-End-Abnahme
- Rechts-/Prozessprüfung des konkreten Einsatzfalls

Vor allgemeiner Produktivfreigabe:
- Desktop-Browser-Smoke
- Smartphone-Smoke
- realer Kundenadmin-/Dozenten-/Teilnehmer-Rollenlauf
- Backup-/Restore-Smoke
- Datenschutz-/Aufbewahrungsparameter für den konkreten Kunden prüfen

## Definition „Education OS produktiv abgenommen“

Erst wenn Code-Gates **und** die realen externen Abnahmen bestanden sind. Bis dahin darf der Stand als `feature-complete candidate`, nicht als vollständig produktiv abgenommen bezeichnet werden.
