# Große fiktive Test-Bildungsträger

Diese Vorgabe gehört zum End-to-End-Test. Alle Daten sind fiktiv. Niemals echte Personen oder echte Kundendaten verwenden. Für E-Mail-Adressen ausschließlich `example.invalid` nutzen.

## Zielgröße je Tester

Jeder Tester erzeugt **einen eigenen, voneinander unabhängigen Bildungsträger**. Die Testdaten sollen groß genug sein, damit Tabellen, Navigation, Filter, Berechtigungen, Importe, Konflikte und Automationen realistisch belastet werden.

Mindestumfang je Bildungsträger:

- 2–4 Standorte bzw. Organisationseinheiten
- 8–12 Klassen/Kurse
- 12–20 Beschäftigte, davon mindestens 8 Dozenten
- 80–140 Teilnehmer
- 8–15 Räume/Ressourcen
- Stundenplan für mindestens 4 Wochen
- Jahresgrundplan für mindestens 9 Monate
- mindestens 12 Aufgaben/Hausaufgaben
- mindestens 8 Termine
- mindestens 10 Meldungen/Informationen
- mindestens 6 Prüfungen/Bewertungsvorgänge
- mindestens 3 Umfragen/Feedbackfälle, soweit im Testsystem verfügbar
- mindestens 3 Chatkanäle und mehrere Testnachrichten, soweit freigegeben
- mehrere Teams-Termine, sobald die Microsoft-Testintegration verfügbar und autorisiert ist

## Unterschiedliche Testprofile

Die drei Tester sollen bewusst unterschiedliche Organisationen erzeugen. Es dürfen keine identischen Daten übernommen werden.

### Tester A – komplexer Umschulungs-/Weiterbildungsträger

Beispielrichtung: kaufmännisch, Verwaltung, IT, Logistik oder gemischt. Mehrere parallele Kurse, Praktikumsphasen, Prüfungsblöcke, wechselnde Dozenten und Räume.

### Tester B – berufliche Akademie mit mehreren Fachbereichen

Beispielrichtung: Pflege/Soziales, Technik, Medien oder Dienstleistung. Mehrere Organisationseinheiten, zentrale Räume/Ressourcen und unterschiedliche Kurslaufzeiten.

### Tester C – größerer Weiterbildungsverbund

Beispielrichtung: mehrere Standorte, gemischte Präsenz-/Onlinephasen, viele Termine, Vertretungen, Raumkonflikte und Kurswechsel.

Die Richtungen sind nur Orientierung. Die eigene KI darf andere plausible Strukturen erfinden.

## Pflicht-Sonderfälle

In jedem Testdatensatz müssen mindestens folgende Fälle vorkommen:

- 2 Krankmeldungen von Teilnehmern in unterschiedlichen Kursen
- 2 sonstige Abwesenheiten
- 1 mehrdeutige Abwesenheitsmeldung, die nicht automatisch geraten werden darf
- 2 Kurswechsel
- 2 Dubletten bzw. fehlerhafte Importzeilen
- 2 Dozentenausfälle
- 2 Raumausfälle
- 2 geplante Terminverschiebungen
- 1 Jahresplan-/Stundenplankollision
- 1 Prüfungstermin mit bewusstem Konflikt
- 1 ablaufende oder problematische Qualifikation, soweit die Funktion verfügbar ist
- 1 Curriculum-/Lernstandsrisiko
- 1 Datenwiderspruch für Self-Healing/Datenqualitätsprüfung
- 1 unberechtigter Zugriffsversuch je getesteter Rolle
- 1 Chat-/Kommunikationsfall mit nicht berechtigtem Benutzer
- 1 Teams-Terminänderung bzw. -absage, sobald die externe Microsoft-Testintegration verfügbar ist

## Prompt für die eigene KI

> Erzeuge einen vollständig fiktiven deutschen Bildungsträger für einen sehr ausführlichen Software-End-to-End-Test. Verwende keinerlei reale personenbezogene Daten. Alle E-Mail-Adressen müssen auf `example.invalid` enden. Erzeuge 2–4 Standorte/Organisationseinheiten, 8–12 Klassen/Kurse, 12–20 Beschäftigte einschließlich mindestens 8 Dozenten, 80–140 Teilnehmer, 8–15 Räume/Ressourcen, einen konsistenten Stundenplan für mindestens vier Wochen und einen Jahresgrundplan für mindestens neun Monate. Ergänze Aufgaben, Termine, Meldungen, Prüfungen, Feedback-/Umfragefälle und Kommunikationsfälle. Baue alle in `docs/TESTDATEN_GROSS.md` genannten Pflicht-Sonderfälle ein. Gib Stammdaten und alle Listen zusätzlich in kopierbaren CSV-Tabellen aus. Erfinde Struktur und Namen selbstständig und achte auf interne Konsistenz.
>
> Verwende für Organigramm mindestens die Spalten `external_id,parent_external_id,type,name,code,course_code,course_name,responsible_name,responsible_email,profile`.
>
> Verwende für Teilnehmer mindestens `Vorname,Nachname,E-Mail,Teilnehmernummer,Klasse,Klassencode,Beginn,Ende`.
>
> Verwende für Stundenplan mindestens `Klasse,Datum,Beginn,Ende,Fach,Fachkürzel,Dozent,Raum,Unterricht,Hinweise`.
>
> Verwende für Jahresgrundplan mindestens `Klasse,Von,Bis,Typ,Titel,Unterricht_sperren,Hinweise`.
>
> Markiere in einer separaten Tabelle, welche Datensätze absichtlich fehlerhaft, doppelt, konfliktbehaftet oder für einen Berechtigungstest vorgesehen sind, damit ich später weiß, welches Verhalten ich prüfen muss.

## Datenmengen nicht blind auf einmal importieren

Auch bei einem großen Testdatensatz zuerst die Vorschau kontrollieren. Bei absichtlich fehlerhaften Zeilen muss das System verständlich reagieren. Ein Import gilt erst als bestanden, wenn richtige Daten korrekt übernommen und problematische Daten erkennbar zurückgewiesen oder zur Korrektur markiert wurden.
