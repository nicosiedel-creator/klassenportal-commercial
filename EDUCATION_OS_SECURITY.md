# Education OS – Security & Trust Model

## Grundsatz

Der Education OS Autopilot ist **kein privilegierter Chatbot**. Freitext, Heuristik oder künftig ein Sprachmodell dürfen ausschließlich Absichten verstehen, Informationen strukturieren und simulationsfähige Vorschläge erzeugen. Produktive Daten werden nur über deterministische, serverseitig erlaubte Aktionen verändert.

Das System behauptet keine absolute Unverwundbarkeit. Sicherheitsziel ist ein konsequent **fail-closed** konstruiertes System mit Least Privilege, unveränderlicher Provenienz, expliziter Autorisierung, deterministischen Guardrails und reproduzierbaren Entscheidungen.

## Trust Boundaries

### Teilnehmer / Klassenadmin
- Klassenadmin bleibt technisch und fachlich Schüler mit Zusatzrechten.
- Kein Autopilot- oder Twin-Zugriff auf personenbezogene Daten anderer Teilnehmer.
- Eigene private Notizen, eigene Aufgabenstände und eigene Lern-/Berichtsheftdaten bleiben außerhalb des Betriebszwillings.

### Dozent
- Dozentenfunktion nur über explizite `teacher_portal_assignments`.
- Unterrichtsradar nur für den konkret zugeordneten Kurs.
- Education Twin für Dozenten enthält keine Noten, privaten Teilnehmernotizen oder individuellen Anwesenheitsdaten.
- Kein Dozent darf Tenant-Autopilot genehmigen oder ausführen.

### Fachbereichsleitung
- Nur fachlich/organisatorische Delegation (`org.view`, `courses.view`, `content.view`, `reports.view`).
- Twin wird serverseitig auf erlaubte Kurse/Organisationseinheiten reduziert.
- Keine implizite Teilnehmer-, Rollen- oder Notenverwaltung.

### Kundenadmin
- Einziger menschlicher Akteur für produktive Tenant-Autopilot-Ausführung.
- MFA ist für Freigabe, Policy-Änderung, Risikostatus und Ausführung verpflichtend.
- Hohes Risiko benötigt zwei verschiedene Kundenadmins.

### Plattformadmin
- Kann die Plattform betreiben, ist aber **ausdrücklich kein Ersatz-Kundenadmin im Autopiloten**.
- `requireAutopilotTenantAdminMfa` blockiert Plattformadmin als Tenant-Autopilot-Akteur.
- Plattformadmin-UI wird durch Education OS nicht umgebaut.

## Datenminimierung im Live Education Twin

Der Betriebszwilling enthält:
- Kurs-/Organisationsstruktur
- aggregierte Teilnehmerzahl je Kurs
- Dozenten/Fächer, soweit für den erlaubten Kurskontext erforderlich
- Unterricht, Lernform, Räume/Ressourcen
- Klassenbuch-Vollständigkeit und fachliche Dokumentation
- Lehrplanabdeckung
- aggregierte Berichtsheft-/Signaturstatus
- Prüfungs-/Praxis-/Frist-/QM-Status
- Vertretung, Qualifikation und Verfügbarkeit

Der Betriebszwilling enthält standardmäßig **nicht**:
- Teilnehmernamen im Betriebsmodell
- individuelle Anwesenheitsdatensätze
- persönliche Noten
- keine privaten Teilnehmernotizen
- persönliche Aufgaben-Notiztexte
- Signaturgeheimnisse oder Zahlungsdaten

Delegierte Nutzer erhalten zusätzlich nur den Kurs-/Org-Ausschnitt, für den sie serverseitig berechtigt sind.

## Simulation vor Mutation

Jede ausführbare Änderung folgt dieser Kette:

1. Aktuellen Education Twin erfassen.
2. Unveränderlichen Twin-Snapshot speichern.
3. Szenario deterministisch berechnen.
4. Aktionen gegen positive Whitelist und negative Sicherheits-Namespaces prüfen.
5. Aktionsplan stabil serialisieren und SHA-256 bilden.
6. Guardrails vor Freigabe ausführen.
7. Freigabe an Snapshot-SHA und Plan-SHA binden.
8. Bei hohem Risiko zweite unabhängige Freigabe verlangen.
9. Unmittelbar vor Ausführung Guardrails erneut ausführen.
10. Live-Twin erneut berechnen; bei Abweichung Plan als `stale` verwerfen.
11. Tenant-weiten Execution Lock setzen.
12. Datenbank-Vorbedingungen im D1-Batch erzwingen.
13. Aktionen atomar ausführen, soweit D1-Batch dies erlaubt.
14. Für jeden Schritt Vorher/Nachher und ein append-only Twin Event speichern.
15. Post-State erneut prüfen und protokollieren.
16. Reversible Aktionen nur innerhalb eines kurzen Rollback-Fensters rücknehmbar machen.
17. Nach Rollback altes Szenario auf `stale` setzen; neue Simulation und neue Freigaben erzwingen.

## Verbotene Autopilot-Domänen

Der produktive Autopilot darf keine Aktion in folgenden Domänen ausführen:
- Authentifizierung
- Konten-/Rollen-/Membership-/Berechtigungsänderungen
- Billing/Zahlungen/Entitlements
- Noten
- individuelle Anwesenheitsdatensätze
- Signieren im Namen einer Person
- Plattformverwaltung
- destructive Tenant-/Kurslöschung

Diese Grenze wird nicht nur in der UI, sondern durch serverseitige Namespace-Sperre und positive Aktions-Whitelist durchgesetzt.

## Erlaubte produktive Aktionen

Nur eng begrenzte betriebliche Aktionen sind whitelisted, z. B.:
- Dozenten-Abwesenheit dokumentieren
- geprüfte Vertretung einem Termin zuordnen
- Vertretungsfall aktualisieren
- zielgruppengenaue Kursmeldung erzeugen
- Lernform eines Termins anpassen
- Ressource als nicht verfügbar markieren
- Raum/Reservierung eines Unterrichtstermins anpassen
- Prüfung kontrolliert verlegen
- QM-/Wiedervorlage-Vorgang erzeugen

Auch diese Aktionen benötigen Snapshot, Guardrails, Freigabe, MFA und Precondition Checks.

## Deterministische Guardrails

Vor Freigabe und unmittelbar vor Ausführung werden mindestens geprüft:
- Dozent verfügbar
- keine Dozenten-Doppelbelegung
- konfigurierte Fachqualifikation gültig
- Raum/Ressource aktiv und nicht gesperrt
- keine Ressourcen-Doppelbelegung
- ausreichende Raumkapazität
- Prüfungsverschiebung kollidiert nicht mit Unterricht/anderer Prüfung
- Selbstlernphase hat keinen Präsenz-Anwesenheitswiderspruch
- Selbstlernphase enthält einen konkreten Arbeitsauftrag
- plausible Betreuungsform
- Zeiträume und Scope weiterhin gültig

Guardrail-Ergebnisse werden append-only mit SHA-256-Evidenz gespeichert – auch dann, wenn eine Aktion blockiert wurde.

## Operational Readiness

Readiness ist ein aggregierter Betriebsindikator, kein Personen-Score. Dimensionen:
- Lehrplanabdeckung
- Klassenbuch-Dokumentation
- Prüfungsbereitschaft
- Future-Radar-Risiken
- Datenkonsistenz
- Nachweiskette
- Personal-/Vertretungslage

Keine individuellen Teilnehmerdaten, Noten oder Anwesenheitsscores fließen ein. Readiness-Snapshots sind unveränderlich und bilden Trends ohne Personenprofiling.

## Future Radar

Future Radar darf selbstständig lesen, aggregieren, Risiken anlegen und deduplizierte Warnungen erzeugen. Es darf **keine produktive Autopilot-Lösung selbst ausführen**.

Ein Risiko kann eine Simulation vorschlagen. Die Ausführung bleibt an die normale Freigabekette gebunden.

## Self-Healing

Self-Healing bedeutet hier **finden + erklären + Lösung simulieren**, nicht stille Datenkorrektur.

Besonders historische Nachweise, Altimporte, Klassenbuch, Berichtshefte und Prüfungsdokumente werden niemals blind gelöscht oder umgeschrieben. Unsicherheiten werden als Befund mit Vertrauensgrad sichtbar gemacht.

## Adaptive Recovery

Adaptive Recovery kann aus Lehrplanlücken, Verfügbarkeiten, Fachqualifikation, Kursregeln, Raumkapazität und Sperrzeiten einen Aufholplan berechnen.

Das Ergebnis kann nur als **Stundenplan-Entwurf** erzeugt werden. Ein Recovery-Plan veröffentlicht niemals eigenmächtig Unterricht. Vor Draft-Erzeugung wird der Plan anhand seines SHA-256-Digests erneut berechnet; nach Erzeugung läuft die normale erweiterte Stundenplan-Konfliktprüfung.

## Proof Graph

Der Proof Graph bildet die fachliche Nachweiskette ab:

`Planung → Lernaktivität → Durchführung → Klassenbuch → Lehrplanbezug → Nachweis`

Standard-Prüfpakete sind datensparsam und enthalten keine Teilnehmernamen, individuellen Anwesenheiten, Noten oder privaten Notizen. Twin- und Graph-Digests ermöglichen eine nachträgliche Integritätsprüfung.

## Digitale Bestätigungen / Signaturen

Portal-authentifizierte Bestätigungen werden nicht als fortgeschrittene oder qualifizierte elektronische Signatur ausgegeben. Externe AES/QES-Stufen bleiben fail-closed, solange kein vertrauenswürdiger Anbieter technisch angebunden und real abgenommen wurde.

## Externe Abnahmen, die Code nicht ersetzen kann

Vor einer echten Live-Freigabe bleiben reale End-to-End-Abnahmen erforderlich:
- Browser/Smartphone-Smoke-Tests auf der produktiven Umgebung
- absichtlich fehlgeschlagene Stripe-Sandboxzahlung: keine Freischaltung, danach sauberer Retry
- reale externe Signaturprovider-Abnahme, falls AES/QES angeboten wird
- Datenschutz-/Aufbewahrungskonfiguration des konkreten Kunden
- ggf. fachliche Validierung kundenspezifischer Kammer-/Prüfungsanforderungen

Diese Punkte dürfen durch Unit-/Source-Regressionen nicht als „erledigt“ ausgegeben werden.
