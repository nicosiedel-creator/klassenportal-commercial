# Klassenportal 5000x – Education Operating System

## Ziel

Klassenportal soll nicht nur ein weiteres Schulportal, LMS, Klassenbuch oder Planungstool sein. Es soll ein **Education Operating System** werden: ein System, das den realen Bildungsbetrieb als digitalen Zwilling versteht, Auswirkungen vor einer Änderung simuliert, sichere Handlungsoptionen vorschlägt und nach Freigabe alle abhängigen Schritte durchgängig ausführt.

Der Differenzierungsmaßstab ist nicht die Anzahl der Funktionen. Entscheidend ist, wie viele manuelle Übergaben, Doppeleingaben, vergessene Folgeschritte und unverbundene Einzellösungen vollständig verschwinden.

## Produktgesetze

1. **Einmal erfassen, überall korrekt weiterverwenden.** Dieselbe Information darf nicht in Stundenplan, Klassenbuch, Lehrplan, Berichtsheft, Kommunikation und Nachweis erneut eingegeben werden.
2. **Erst simulieren, dann verändern.** Größere Änderungen werden gegen den digitalen Zwilling geprüft. Das System zeigt Folgen und Alternativen, bevor Produktivdaten verändert werden.
3. **Regelwerk vor KI.** KI darf verstehen, zusammenfassen und Vorschläge erzeugen. Berechtigungen, Fristen, Konflikte, Signaturen, Datenzugriff und produktive Änderungen werden deterministisch durch Regeln abgesichert.
4. **Automatisierung mit menschlicher Kontrolle.** Kritische Änderungen werden als nachvollziehbarer Plan vorgeschlagen und erst nach Freigabe ausgeführt. Niedrigrisiko-Folgeschritte können automatisch erfolgen.
5. **Alles ist erklärbar und rückverfolgbar.** Jede Empfehlung nennt Datenbasis, Gründe, betroffene Objekte, Risiken und erwartete Folgen.
6. **Privacy by role.** Klassenadmin bleibt Schüler mit eigenen Daten. Dozenten sehen nur explizit zugeordnete Kurse. Personenbezogene Daten anderer Teilnehmer werden nie zur Komfortfunktion einer Rolle freigegeben.
7. **Import statt Nachbau.** Bestehende Systeme und Altbestände sollen hochgeladen, erkannt, abgeglichen und übernommen werden können.

## Der Kern: Live Education Twin

Der digitale Zwilling ist keine Kopie der Datenbank, sondern ein verknüpftes Betriebsmodell. Er verbindet unter anderem:

- Kurse, Teilnehmer, Dozenten, Räume und Ressourcen
- Stundenplan, Lernform, Vertretung und Ausfall
- Klassenbuch, Anwesenheit, Selbstlernphase und Exkursion
- Lehr-/Ausbildungsrahmenplan und reale Lehrplanabdeckung
- Aufgaben, Prüfungen, Praxisphasen und Leistungsnachweise
- Berichtshefte und digitale Bestätigungen
- Fristen, Qualifikationen, QM-Vorgänge und Dokumentationspflichten
- Benachrichtigungen, Nachweise und Audit-Historie

Jede Änderung kann dadurch als Auswirkungskette betrachtet werden, statt nur eine Tabelle zu aktualisieren.

## Education Autopilot

Der Autopilot arbeitet mit **Szenarien**. Beispiel: `Dozent fällt morgen aus`.

Das System soll automatisch:

1. alle betroffenen Unterrichtseinheiten und abhängigen Prozesse finden;
2. verfügbare und fachlich passende Vertretungen, zulässige Selbstlernphasen oder Verschiebungen berechnen;
3. Raum-, Ressourcen-, Arbeitszeit-, Lehrplan- und Kursregeln prüfen;
4. mehrere Lösungsszenarien mit Score, Begründung und Folgen anbieten;
5. vor Freigabe exakt anzeigen, was geändert und wer informiert würde;
6. nach Freigabe alle ausgewählten Änderungen transaktional ausführen;
7. Stundenplan, Vertretung, Lernform, Ressourcen, Benachrichtigungen, Klassenbuch-Vorbereitung, Berichtsheft-Vorbefüllung und Audit konsistent aktualisieren;
8. anschließend erneut prüfen, ob neue Konflikte entstanden sind.

Weitere Autopilot-Ereignisse:

- Raum fällt aus
- Teilnehmer tritt später ein
- Prüfung wird verschoben
- Exkursion wird geplant oder abgesagt
- Klasse liegt im Lehrplan zurück
- Dozentenqualifikation läuft aus
- Kurs wird mitten im Jahr übernommen
- Selbstlernphase wird erforderlich
- fehlende Berichtshefte oder Signaturen
- Stundenplan muss wegen Ferien/Schließzeiten neu verteilt werden

## Scenario Lab – Was-wäre-wenn ohne Risiko

Admins erhalten eine Sandbox auf Basis des aktuellen digitalen Zwillings. Dort können Änderungen simuliert werden, ohne Produktivdaten anzufassen.

Beispiele:

- Was passiert, wenn Dozent A zwei Wochen ausfällt?
- Was passiert, wenn wir Raum 204 schließen?
- Schaffen wir den Lehrplan bis Kursende mit dem aktuellen Stundenplan?
- Welche Folgen hat eine zusätzliche Selbstlernwoche?
- Welche Stunden müssten verschoben werden, wenn samstags kein Unterricht mehr stattfinden darf?

Die Simulation bewertet mindestens:

- Unterrichtsausfall
- Lehrplan-Soll/Ist und prognostizierte Reststunden
- Teilnehmerbetroffenheit
- Dozentenbelastung
- Raum-/Ressourcenkonflikte
- Prüfungs- und Fristrisiken
- erforderliche Nachweise/Bestätigungen
- Anzahl nötiger manueller Entscheidungen

## Proof Graph – lückenloser Bildungsnachweis

Jede durchgeführte Bildungsaktivität soll eine nachvollziehbare Beweiskette bilden:

`Planung → veröffentlichter Termin → Lernform → tatsächliche Durchführung → Anwesenheit/Nachweis → Klassenbucheintrag → Lehrplanbezug → Aufgabe/Prüfung/Praxis → Berichtsheft → digitale Bestätigung → Export/Audit`

Das System kann daraus automatisch einen Prüf-/Förder-/QM-Nachweis erzeugen und für jede Aussage zeigen, aus welchen Originaldaten sie entstanden ist.

Importierte Altbestände werden dabei als historische Quelle markiert und nicht so dargestellt, als wären sie nativ im System entstanden.

## Future Radar – Probleme erkennen, bevor sie entstehen

Der digitale Zwilling wird regelmäßig in die Zukunft gerechnet. Das System meldet nicht nur aktuelle Fehler, sondern zukünftige Risiken, zum Beispiel:

- Lehrplan wird voraussichtlich nicht vollständig erreicht
- benötigte Unterrichtsstunden fehlen
- Raumkapazität reicht bei geplantem Teilnehmerzuwachs nicht
- Dozentenqualifikation läuft vor einer geplanten Einheit ab
- Berichtshefte werden voraussichtlich nicht rechtzeitig unterschrieben
- Prüfungsvorbereitung kollidiert mit Praxisphase
- zu viele Vertretungen/Belastung bei einer Lehrkraft
- Nachweiskette ist für einzelne Zeiträume unvollständig

Zu jedem Risiko werden konkrete, simulierte Gegenmaßnahmen angeboten.

## Intent-first Administration

Langfristig soll der Nutzer nicht mehr wissen müssen, in welchem Modul eine Aufgabe erledigt wird. Er beschreibt das Ziel, zum Beispiel:

- `Frau Müller ist morgen krank.`
- `Diese Klasse startet am 1. Oktober, die bisherigen Klassenbücher liegen hier.`
- `Plane die nächsten sechs Wochen so, dass Lernfeld 3 aufgeholt wird und niemand überlastet wird.`
- `Erzeuge alle Nachweise für die Prüfungsvorbereitung im November.`

Das System übersetzt die Absicht in einen **prüfbaren Ausführungsplan**. Freitext oder KI dürfen niemals direkt unkontrolliert Daten ändern.

## Adaptive Recovery

Wenn Unterricht ausfällt oder Lehrplanlücken entstehen, schlägt das System nicht nur Ersatztermine vor. Es kann zulässige Kompensationspakete bilden:

- Vertretungsunterricht
- Selbstlernphase Homeoffice/Schule
- gezielte Aufgabe oder Lernpaket
- Verschiebung späterer Stunden
- Zusammenlegung geeigneter Lernziele

Dabei werden Lehrplan, Stundenumfang, Betreuungsanforderung, Nachweisbedarf und Teilnehmerinformation gemeinsam betrachtet.

## Self-healing Data

Das System sucht nach Widersprüchen und fehlenden Verknüpfungen, etwa:

- Stundenplan sagt Präsenz, Klassenbuch sagt Selbstlernphase
- Berichtsheft enthält Termin, der im Kurs nicht existiert
- Dozent ist einer Stunde zugeordnet, aber zum Zeitpunkt als abwesend markiert
- Lehrplanstunden wurden mehrfach gezählt
- importierter Altbestand kollidiert mit bereits vorhandenen nativen Einträgen

Es repariert solche Fälle nicht blind. Es erzeugt einen Lösungsvorschlag mit Vertrauensgrad und nachvollziehbarer Differenz.

## Priorität der Umsetzung

### P0 – Fundament

- Education-Twin-Snapshot pro Tenant/Kurs
- standardisiertes Ereignis-/Auswirkungsmodell
- Scenario-Engine ohne produktive Änderung
- nachvollziehbare Scoring-/Begründungsstruktur
- Permission- und Privacy-Tests

### P1 – erster echter Autopilot

- Szenario `Dozent fällt aus`
- Vertretung / Selbstlernphase / Verschiebung vergleichen
- Folgeänderungen als Vorschau
- Freigabe und transaktionale Ausführung
- automatische zielgruppengenaue Benachrichtigung

### P2 – Future Radar

- Lehrplan-Endprognose
- Qualifikations-/Fristrisiken
- Signatur-/Berichtsheft-Risiken
- Ressourcen-/Workload-Prognose
- konkrete Abhilfeszenarien

### P3 – Proof Graph

- vollständige Provenienz für Unterrichts- und Nachweisketten
- Ein-Klick-Prüfpaket mit Quellenbezug und Prüfsummen
- Altbestand/Nativdaten klar getrennt

### P4 – Intent-first UX

- natürliche Sprache als Eingabe
- deterministische Planerstellung
- niemals direkte LLM-Schreibrechte auf Produktivdaten
- Freigabe, Vorschau und Undo/Recovery

## Was bewusst nicht als Innovation verkauft wird

Normale Chatbots, Stundenplananzeige, digitales Klassenbuch, Aufgabenlisten, Push, einfache KI-Zusammenfassungen, elektronische Anwesenheitslisten oder ein gewöhnliches Dashboard sind nützliche Standardfunktionen, aber kein nachhaltiger Produktvorsprung.

Der Vorsprung entsteht durch die **geschlossene Schleife aus digitalem Zwilling, Simulation, Autopilot, Nachweisgraph und vorausschauender Betriebssteuerung**.
