# Klassenportal · Full Suite Release 2026-08-19

## Produktumfang im Release-Kandidaten

- [x] Rollenmodell: Klassenadmin bleibt Teilnehmer mit ausschließlich eigenen personenbezogenen Schülerdaten.
- [x] Dozentenportal nur über explizite Dozent→Kurs-Zuordnung; MFA-Schutz für privilegierte Arbeitsbereiche.
- [x] Fachbereichsleitung ohne individuelle Noten-/Anwesenheits-/Fehlzeitensicht.
- [x] Lehr-/Ausbildungsrahmenpläne, Lernfelder, Sollzeiten und reale Abdeckung aus Klassenbuchdokumentation.
- [x] Praxis-/Praktikumsphasen und Prüfungsvorgänge einschließlich Unterlagenstatus und Fristen.
- [x] QM, Wiedervorlagen, Kurslebenszyklus, Dokumentenregister und Dozentenqualifikationen.
- [x] Lernformen: Präsenz, Live-Online, Hybrid, Selbstlernphase Homeoffice, Selbstlernphase Schule, sonstige Selbstlernphase, Exkursion, Projekt, Workshop, Prüfung, Praxis.
- [x] Lernformen sichtbar in Teilnehmer- und Dozentenkalendern.
- [x] Stundenplanplanung mit Entwurf, Serienblöcken, Prüfung und Veröffentlichung.
- [x] Ressourcen/Räume mit Kapazität, Sperrzeiten und Reservierungen.
- [x] Ferien/Schließzeiten/kursbezogene Sperrblöcke.
- [x] Dozenten-Abwesenheiten; betroffene veröffentlichte Stunden erzeugen automatisch Vertretungsfälle.
- [x] Kurs-Zeitfenster, Tages-/Wochenendregeln und Dozenten-Belastungsregeln.
- [x] Erweiterte Konfliktprüfung vor Stundenplanveröffentlichung.
- [x] Automatische Vorschläge für freie/fachlich geeignete Dozenten und passende Räume.
- [x] Vertretungsvorschläge nach Verfügbarkeit, Qualifikation, Kurserfahrung und aktueller Belastung.
- [x] Digitales Berichtsheft mit automatischer Vorbefüllung aus Stundenplan/Klassenbuch.
- [x] Korrektur-/Freigabeprozess und digitale Teilnehmer-/Dozentenbestätigung.
- [x] Portalbestätigungen mit unveränderlichem Snapshot, SHA-256, Signierreihenfolge, Auth-Methode und MFA-Nachweis.
- [x] Teilnehmer-Inbox für offene digitale Bestätigungen.
- [x] Externe fortgeschrittene/QES-Stufen fail-closed, solange kein vertrauenswürdiger Provider angebunden ist.
- [x] Altbestandsübernahme für Start mitten im laufenden Jahr: CSV/XLSX-Klassenbuch strukturiert; PDF/sonstige Quellen als Originalarchiv mit Hash.
- [x] Importierte Historie technisch als Import gekennzeichnet und einer Importcharge zugeordnet.
- [x] Persönlicher Aufgaben-Arbeitsbereich mit Offen/In Arbeit/Erledigt und privaten Notizen.
- [x] Private Aufgabennotizen weder im Admin-Response noch im Audit-Inhalt.
- [x] Stripe failed-payment/retry serverseitig regressionsgesichert.
- [x] Plattform-Admin-UI wird durch die neuen Kunden-/Rollenmodule nicht geladen oder umgestaltet.

## Automatisierung

- [x] Stundenplan-Serienerzeugung.
- [x] Stundenplan-Konfliktprüfung.
- [x] Dozenten-/Raumvorschläge.
- [x] Vertretungsfälle aus Dozenten-Abwesenheit.
- [x] Klassenbuch→Lehrplanabdeckung.
- [x] Stundenplan/Klassenbuch→Berichtsheft-Vorbefüllung.
- [x] Fristwarnungen.
- [x] Warnung vor ablaufenden Dozentenqualifikationen.
- [x] QM-Vorgang für länger offene Klassenbucheinträge.
- [x] Signaturerinnerungen.
- [x] Push-Outbox für neue Benachrichtigungen.
- [x] Importvorschau vor struktureller Übernahme.

## CI / technische Releaseprüfung

Der Repository-Workflow `.github/workflows/ci.yml` prüft auf finalen Pull Requests:

1. `npm ci`
2. TypeScript-Typecheck
3. vollständige Regressionen (`npm test`)
4. Syntax aller Browser-JavaScript-Dateien
5. `scripts/release-check.mjs`
6. sämtliche D1-Migrationen lokal über Wrangler

Zusätzliche Regressionen dieses Ausbaus:

- `tests/full-education-operations.mjs`
- `tests/planning-constraints.mjs`
- erweiterte `tests/assignments-gradebook.mjs`
- erweiterte `tests/billing-lifecycle.mjs`

## Externe Abnahmen, die nicht durch Repository-Tests ersetzt werden

Diese Punkte dürfen bis zur echten externen Durchführung **nicht als erledigt behauptet werden**:

- [ ] Absichtlich fehlgeschlagene Stripe-Sandboxzahlung: keine Freischaltung; danach sauberer erfolgreicher Retry.
- [ ] Externe fortgeschrittene/qualifizierte elektronische Signatur: Anbieter auswählen/anbinden und Provider-Callback/Beweisführung mit echtem Testvorgang abnehmen. Bis dahin bleiben diese Signaturstufen technisch gesperrt.
- [ ] Letzter Smoke-Test auf der tatsächlich bereitgestellten Cloudflare-URL mit je einem Teilnehmer-, Klassenadmin-, Dozenten-, Fachbereichs- und Kundenadmin-Konto.
- [ ] Test einer realen Altbestandsdatei eines ersten Kunden vor einer Massenübernahme; Mappingvorschau bestätigen.

## Go-live-Regel

`main` wird erst als produktionsbereit betrachtet, wenn der exakte Release-Head die Repository-CI/Deployment-Prüfung bestanden hat und die für den konkreten Go-live relevanten externen Abnahmen dokumentiert sind. Ein fehlgeschlagener Build oder ein älterer Bot-Kommentar darf nicht als Erfolg interpretiert werden.
