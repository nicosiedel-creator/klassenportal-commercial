# End-to-End-Praxistest – Klassenportal / Education OS

Stand: 20.08.2026

## Für wen ist diese Anleitung?

Diese Testanweisung gilt für **alle drei Tester**. Sie ist absichtlich so geschrieben, dass auch jemand mit sehr wenig oder gar keiner Computererfahrung jeden Schritt durchführen kann. Niemand muss wissen, was „CSV“, „MFA“, „Mandant“, „Import“ oder „Autopilot“ bedeutet. Die nötigen Erklärungen stehen direkt hier.

Michael S. und Charleen J. testen ausschließlich normale Kunden-/Benutzerrollen. Sie brauchen keine Plattformadmin-Rechte. Der Plattformadmin-Test ist ein gesonderter Abschnitt und wird nur von der dafür vorgesehenen Person durchgeführt.

Das vollständige Rollenhandbuch ist zusätzlich unter `docs/BENUTZERHANDBUCH_ROLLEN.md` hinterlegt. Die wichtigsten Rollenhinweise stehen aber **auch direkt in dieser Testanweisung**, damit niemand zwischen Dokumenten wechseln muss.

Große Testdatensätze werden nach `docs/TESTDATEN_GROSS.md` erzeugt. Jeder Tester verwendet einen komplett eigenen fiktiven Bildungsträger.

---

# TEIL 1 – Ganz einfache Grundlagen

## 1.1 Was bedeutet „anklicken“?

Mit der linken Maustaste einmal auf eine Schaltfläche, einen Link oder einen Menüpunkt drücken. Auf dem Smartphone einmal mit dem Finger antippen.

## 1.2 Was bedeutet „Feld“?

Ein Feld ist ein Bereich, in den Du Text eingeben oder etwas auswählen kannst. Beispiel: E-Mail-Adresse, Name, Datum oder Klasse.

## 1.3 Was bedeutet „Datei hochladen“?

1. Klicke auf „Datei auswählen“, „Hochladen“ oder die entsprechende Schaltfläche.
2. Es öffnet sich ein Fenster mit Dateien auf dem Computer.
3. Wähle die gewünschte Testdatei aus.
4. Klicke auf „Öffnen“.
5. Warte, bis der Dateiname im Portal sichtbar ist.
6. Wenn eine Vorschau angeboten wird: **nicht sofort endgültig importieren**. Erst die Vorschau kontrollieren.

## 1.4 Was bedeutet „CSV/XLSX“?

Das sind Tabellen-Dateien. CSV ist eine einfache Texttabelle, XLSX ist eine Excel-Datei. Du musst die Technik dahinter nicht verstehen. Für den Test benutzt Du die von Deiner KI erzeugten Dateien/Tabellen.

## 1.5 Was bedeutet MFA?

MFA ist ein zusätzlicher Sicherheitscode neben dem Passwort. Wenn das Portal einen Code verlangt, folgst Du der angezeigten Anleitung. Codes niemals an andere schicken und niemals in einen Fehler-Screenshot aufnehmen.

## 1.6 Wie markiere ich einen Test als bestanden?

Jeder Prüfschritt hat ein Kästchen:

- `[ ]` noch nicht getestet
- `[x]` getestet und korrekt
- `[FEHLER]` getestet, aber Ergebnis falsch/unklar
- `[NICHT VERFÜGBAR]` Funktion ist im Testsystem noch nicht erreichbar
- `[EXTERN OFFEN]` Funktion ist implementiert/vorbereitet, braucht aber noch einen echten externen Dienst oder dessen Freigabe

Nichts einfach überspringen. Wenn etwas nicht verfügbar ist, genau so markieren.

---

# TEIL 2 – Rollenhandbuch direkt für den Test

## 2.1 Teilnehmer / Schüler

Als Teilnehmer darfst Du Deinen eigenen Unterrichtsalltag benutzen: Stundenplan, Termine, Meldungen, Aufgaben, Lernmaterialien, eigene freigegebene Prüfungs-/Lerninformationen, eigene Abwesenheitsmeldungen, freigegebene Chats und gegebenenfalls Teams-Beitritt.

Du darfst **keine** individuellen Noten, Fehlzeiten oder Anwesenheiten anderer Teilnehmer sehen, keine Rollen vergeben und keine zentrale Verwaltung ändern.

Prüfe nach der Anmeldung:

- [ ] Teilnehmerbereich öffnet sich verständlich.
- [ ] Eigener Stundenplan ist sichtbar.
- [ ] Eigene Aufgaben/Termine/Informationen sind sichtbar.
- [ ] Fremde sensible Teilnehmerdaten sind nicht sichtbar.
- [ ] Abmelden funktioniert.

## 2.2 Klassenadmin / Klassensprecher mit Zusatzrechten

Ein Klassenadmin bleibt Teilnehmer. Er ist **keine Lehrkraft**. Er kann – abhängig von der Freigabe – organisatorische Inhalte seiner eigenen Klasse mitpflegen.

Harte Grenze: Ein Klassenadmin darf niemals individuelle Noten/Bewertungen, Fehlzeiten oder Anwesenheitsdaten seiner Mitschüler sehen.

Prüfe:

- [ ] Normale Teilnehmeransicht bleibt erhalten.
- [ ] Nur erlaubte Zusatzfunktionen erscheinen.
- [ ] Kein Dozentenportal wird allein durch die Klassenadmin-Rolle freigeschaltet.
- [ ] Keine sensiblen Daten von Mitschülern sichtbar.
- [ ] Fremde Klassen sind nicht unzulässig bearbeitbar.

## 2.3 Dozent / Lehrkraft

Dozenten arbeiten über den getrennten Dozentenbereich und nur für ausdrücklich zugeordnete Kurse. Dort können – je nach Freigabe – Unterricht, Klassenbuch, Anwesenheit, Aufgaben, Materialien, Prüfungen/Bewertungen, Kommunikation und Teams-Unterrichtstermine bearbeitet werden.

Prüfe:

- [ ] Nur zugeordnete Kurse erscheinen.
- [ ] Ein nicht zugeordneter Kurs ist nicht erreichbar.
- [ ] Klassenbuch/Unterricht der eigenen Einheit kann bearbeitet werden.
- [ ] Abwesenheitsmeldung ist nur als fachlich zulässiger Hinweis nutzbar und schreibt Anwesenheit nicht unkontrolliert um.
- [ ] Dozentenrolle gibt keine Kundenadmin-/Plattformrechte.

## 2.4 Kundenadmin / Bildungsträger-Admin

Der Kundenadmin verwaltet nur seinen eigenen Bildungsträger: Stammdaten, Branding, Organisation, Kurse, Benutzer/Rollen, Zuordnungen, Importe, Planung, Education OS, Kommunikation, Exporte/Backups und – soweit angeboten – Abrechnung/Umfang.

Prüfe:

- [ ] Eigener Bildungsträger lässt sich vollständig verwalten.
- [ ] Andere Bildungsträger sind nicht sichtbar.
- [ ] Kritische Autopilot-Änderungen benötigen den vorgesehenen Vorschau-/Freigabe-/MFA-Ablauf.
- [ ] Dozenten werden ausdrücklich Kursen zugeordnet.
- [ ] Klassenadmins bleiben von Dozentenrechten getrennt.

## 2.5 Plattformadmin

Diese Rolle ist für den technischen/organisatorischen Plattformbetrieb. Sie ist von Kundenrollen getrennt. Michael S. und Charleen J. testen diesen Bereich nicht.

- [ ] Kunden-/Mandantenbereitstellung funktioniert.
- [ ] Plattformverwaltung ist nicht über normale Kundenkonten erreichbar.
- [ ] Support-/Betriebszugriffe bleiben nachvollziehbar/auditierbar.
- [ ] Plattformadmin wird nicht automatisch Dozent oder Teilnehmer eines Kunden.

## 2.6 Gast / öffentlicher Zugriff

Ein Gast darf nur ausdrücklich öffentliche bzw. per Link/Code freigegebene Inhalte sehen.

- [ ] Öffentliche Inhalte funktionieren wie vorgesehen.
- [ ] Interne Teilnehmer-/Anwesenheits-/Bewertungs-/Admin-/Abrechnungsdaten bleiben verborgen.

---

# TEIL 3 – Testdaten vorbereiten

Jeder Tester erzeugt **einen eigenen größeren fiktiven Bildungsträger** nach `docs/TESTDATEN_GROSS.md`.

Mindestgröße pro Tester:

- [ ] 2–4 Standorte/Organisationseinheiten
- [ ] 8–12 Klassen/Kurse
- [ ] 12–20 Beschäftigte, mindestens 8 Dozenten
- [ ] 80–140 Teilnehmer
- [ ] 8–15 Räume/Ressourcen
- [ ] Stundenplan für mindestens 4 Wochen
- [ ] Jahresgrundplan für mindestens 9 Monate
- [ ] Aufgaben, Termine, Meldungen, Prüfungen, Feedback-/Umfragefälle und Kommunikationsfälle
- [ ] absichtliche Dubletten/Fehler/Konflikte aus der Testdaten-Vorgabe

**Datenschutz im Test:** Nur erfundene Daten verwenden. Für E-Mail-Adressen ausschließlich `example.invalid`. Keine echten Telefonnummern, Adressen, Dokumente, Zahlungsdaten, Diagnosen oder Gesundheitsangaben.

---

# TEIL 4 – Vollständiger Handlungsablauf als Checkliste

## A. Erster Aufruf, Konto und Einrichtung

1. [ ] Browser öffnen.
2. [ ] Einrichtungs-/Onboarding-Link öffnen.
3. [ ] Prüfen: Seite lädt ohne sichtbaren technischen Fehler.
4. [ ] Prüfen: Texte sind verständlich und nicht abgeschnitten.
5. [ ] Namen des fiktiven Bildungsträgers eingeben.
6. [ ] Ansprechpartner und fiktive E-Mail-Adresse eingeben.
7. [ ] Geschäftsanschrift aus den fiktiven Daten eingeben.
8. [ ] gewünschte Zahl der Klassen/Kurse eingeben.
9. [ ] ersten Kundenadmin festlegen.
10. [ ] Passwort im vorgesehenen Webformular setzen; niemals per PDF/E-Mail weitergeben.
11. [ ] angebotene Bedingungen/Bestätigung lesen und im Testablauf bestätigen.
12. [ ] Einrichtung absenden.
13. [ ] Prüfen: verständliche Bestätigung erscheint.
14. [ ] Prüfen: Mandant/Kundenbereich wurde angelegt.
15. [ ] Abmelden.
16. [ ] Mit Kundenadmin neu anmelden.
17. [ ] Falls MFA verlangt wird: vollständig einrichten.
18. [ ] Falsches Passwort einmal absichtlich testen; erwartetes Ergebnis: Anmeldung sicher abgelehnt.
19. [ ] Richtiges Passwort verwenden; erwartetes Ergebnis: Anmeldung erfolgreich.
20. [ ] „Einrichtung vorbereiten“/Einrichtungshilfe vollständig abarbeiten.
21. [ ] Seite neu laden.
22. [ ] Prüfen: abgeschlossene Einrichtungshilfe verschwindet bzw. stört nicht dauerhaft weiter.

## B. Branding und allgemeine Stammdaten

1. [ ] Portalname ändern.
2. [ ] fiktives Logo hochladen.
3. [ ] automatische Farberkennung/Branding-Vorschläge prüfen, soweit angeboten.
4. [ ] Farbvariante auswählen/ändern.
5. [ ] Willkommenstext speichern.
6. [ ] Seite neu laden.
7. [ ] Prüfen: Branding bleibt erhalten.
8. [ ] Smartphone/kleines Fenster öffnen.
9. [ ] Prüfen: Logo, Navigation und Texte werden nicht abgeschnitten.
10. [ ] Optionalen Webseiten-/Telefon-/Rechnungsbereich mit fiktiven Daten prüfen, soweit angeboten.

## C. Organisation, Standorte und Verantwortlichkeiten

1. [ ] Organisations-/Strukturbereich öffnen.
2. [ ] CSV/XLSX mit mehreren Organisationseinheiten hochladen.
3. [ ] Vorschau kontrollieren.
4. [ ] Prüfen: Spalten werden sinnvoll erkannt.
5. [ ] Prüfen: übergeordnete/untergeordnete Einheiten stimmen.
6. [ ] Import bestätigen.
7. [ ] Organigramm/Struktur öffnen.
8. [ ] Prüfen: alle erwarteten Bereiche vorhanden.
9. [ ] Verantwortliche zuordnen.
10. [ ] Vertretung zuordnen, soweit vorgesehen.
11. [ ] Eine absichtlich fehlerhafte Zeile importieren.
12. [ ] Erwartet: verständlicher Fehler/Prüfhinweis statt stiller falscher Übernahme.
13. [ ] Fehler korrigieren und erneut importieren.
14. [ ] Erwartet: korrigierte Zeile wird sauber übernommen.

## D. Klassen/Kurse und Rollen

1. [ ] 8–12 Klassen/Kurse anlegen/importieren.
2. [ ] Kürzel, Name, Zeitraum kontrollieren.
3. [ ] einen Kurs deaktivieren/reaktivieren, soweit vorgesehen.
4. [ ] zweiten Kundenadmin bzw. weitere organisatorische Rolle anlegen, soweit vorgesehen.
5. [ ] Teilnehmerkonto anlegen/importieren.
6. [ ] denselben Teilnehmer zum Klassenadmin seiner Klasse machen.
7. [ ] als Klassenadmin anmelden.
8. [ ] prüfen: Teilnehmeransicht bleibt erhalten.
9. [ ] prüfen: erlaubte Zusatzfunktionen vorhanden.
10. [ ] prüfen: keine Noten anderer Teilnehmer sichtbar.
11. [ ] prüfen: keine Fehlzeiten anderer Teilnehmer sichtbar.
12. [ ] prüfen: keine Anwesenheit anderer Teilnehmer sichtbar.
13. [ ] Dozent separat anlegen.
14. [ ] Dozent ausdrücklich Kurs A zuordnen.
15. [ ] Dozent nicht Kurs B zuordnen.
16. [ ] als Dozent anmelden.
17. [ ] Kurs A öffnen: muss funktionieren.
18. [ ] Kurs B über normale Navigation versuchen: darf nicht zugänglich sein.
19. [ ] Klassenadmin-Konto auf Dozentenportal prüfen: darf nicht allein wegen Klassenadmin-Recht zugreifen.
20. [ ] Rollenwechsel aus Testdatensatz durchführen.
21. [ ] abmelden/anmelden und prüfen, dass neue Rechte korrekt gelten.
22. [ ] alte, nicht mehr gültige Rechte dürfen nicht weiter funktionieren.

## E. Teilnehmerimport und Teilnehmerverwaltung

1. [ ] Teilnehmerdatei mit 80–140 fiktiven Personen auswählen.
2. [ ] Vorschau öffnen.
3. [ ] Spaltenzuordnung kontrollieren.
4. [ ] Klassen-/Kurszuordnung kontrollieren.
5. [ ] absichtliche Dublette erkennen lassen.
6. [ ] absichtlich fehlerhafte Zeile prüfen.
7. [ ] Import erst nach Vorschau bestätigen.
8. [ ] Teilnehmerzahl nach Import kontrollieren.
9. [ ] zufällig fünf Profile öffnen und Werte vergleichen.
10. [ ] Teilnehmer aus Kurs A darf nicht unzulässig in Kurs B erscheinen.
11. [ ] ersten Kurswechsel durchführen.
12. [ ] zweiten Kurswechsel durchführen.
13. [ ] Historie/Zuordnung kontrollieren, soweit vorgesehen.
14. [ ] Export der Teilnehmerdaten des eigenen Mandanten testen.
15. [ ] prüfen: keine Daten eines anderen Mandanten enthalten.

## F. Räume und Ressourcen

1. [ ] 8–15 Räume/Ressourcen anlegen/importieren.
2. [ ] Kapazität/Bezeichnung/Status prüfen, soweit angeboten.
3. [ ] Raum einer Unterrichtseinheit zuordnen.
4. [ ] denselben Raum absichtlich gleichzeitig doppelt belegen.
5. [ ] erwartetes Ergebnis: Konflikt oder klarer Prüfhinweis.
6. [ ] Raum vorübergehend als nicht verfügbar markieren bzw. Ausfallszenario verwenden.
7. [ ] prüfen: Planung/Autopilot berücksichtigt Ausfall.

## G. Jahresgrundplan

1. [ ] Jahresgrundplan-Datei auswählen.
2. [ ] Vorschau öffnen.
3. [ ] erkannte Spalten Von/Bis/Typ/Klasse kontrollieren.
4. [ ] Ferien/unterrichtsfreie Zeit prüfen.
5. [ ] Feiertag/Schließzeit prüfen.
6. [ ] Praktikum/Betriebsphase prüfen.
7. [ ] Prüfungsphase prüfen.
8. [ ] normalen Unterricht/sonstige Phase prüfen.
9. [ ] globale Phase ohne einzelne Klasse prüfen, wenn im Datensatz vorhanden.
10. [ ] Import im vorgesehenen Synchronisationsmodus bestätigen.
11. [ ] Jahresplan erneut öffnen und Werte kontrollieren.
12. [ ] denselben Import erneut durchführen.
13. [ ] prüfen: keine unkontrollierten Dubletten.
14. [ ] geänderte Phase erneut importieren.
15. [ ] prüfen: nur auto-importierter Bereich wird passend aktualisiert; manuelle Daten dürfen nicht still verschwinden.

## H. Stundenplanimport und Konflikte

1. [ ] Stundenplan-Datei für mindestens vier Wochen auswählen.
2. [ ] Vorschau öffnen.
3. [ ] Klasse, Datum, Beginn, Ende, Fach, Dozent, Raum und Unterrichtsart prüfen.
4. [ ] Import bestätigen.
5. [ ] fünf zufällige Unterrichtseinheiten mit Quelldaten vergleichen.
6. [ ] absichtliche fehlerhafte Zeile testen.
7. [ ] absichtliche Dublette testen.
8. [ ] Jahresplan-/Stundenplankollision testen.
9. [ ] erwartetes Ergebnis: verständlicher Konflikt; niemals stilles Ignorieren.
10. [ ] Raumkonflikt testen.
11. [ ] Dozentenkonflikt testen, soweit Prüfung vorgesehen.
12. [ ] spätere Stundenplanänderung importieren.
13. [ ] prüfen: Änderung wird korrekt erkannt/übernommen.
14. [ ] manuell erzeugte Planung darf durch Reconcile/Sync nicht unkontrolliert gelöscht werden.
15. [ ] Stundenplan als Teilnehmer prüfen.
16. [ ] Stundenplan als Dozent prüfen.
17. [ ] Stundenplan als Kundenadmin prüfen.

## I. Meldungen, Termine, Links und Dateien

1. [ ] neue Meldung erstellen.
2. [ ] Meldung veröffentlichen.
3. [ ] als Teilnehmer lesen.
4. [ ] Meldung ändern.
5. [ ] Änderung als Teilnehmer kontrollieren.
6. [ ] Termin erstellen.
7. [ ] Termin ändern.
8. [ ] Termin absagen/löschen, soweit vorgesehen.
9. [ ] Link hinzufügen und öffnen.
10. [ ] Lernmaterial/Testdatei hochladen.
11. [ ] Datei als berechtigte Rolle öffnen.
12. [ ] nicht berechtigte Rolle darf die Datei nicht unzulässig sehen.
13. [ ] lange Überschrift/langer Text prüfen.
14. [ ] Smartphone prüfen: kein abgeschnittener Dialog.

## J. Aufgaben/Hausaufgaben und Lernmaterial

1. [ ] Aufgabe erstellen.
2. [ ] Fälligkeit setzen.
3. [ ] Material/Link zuordnen, soweit vorgesehen.
4. [ ] als Teilnehmer Aufgabe sehen.
5. [ ] Fälligkeit korrekt anzeigen lassen.
6. [ ] Aufgabe ändern.
7. [ ] Änderung als Teilnehmer kontrollieren.
8. [ ] mehrere Aufgaben gleichzeitig anzeigen/filtern.
9. [ ] erledigt/offen-Status prüfen, soweit vorgesehen.

## K. Prüfungen, Lernfortschritt und Bewertungen

1. [ ] Testprüfung anlegen.
2. [ ] Termin setzen.
3. [ ] Sichtbarkeit zunächst „nicht veröffentlicht“/entsprechend einstellen.
4. [ ] als Teilnehmer prüfen: Ergebnis darf noch nicht sichtbar sein.
5. [ ] Prüfung/Ergebnis im vorgesehenen Rollenprozess bearbeiten.
6. [ ] veröffentlichen/freigeben.
7. [ ] als betroffener Teilnehmer eigenes Ergebnis sehen.
8. [ ] anderer Teilnehmer darf fremdes individuelles Ergebnis nicht sehen.
9. [ ] Klassenadmin darf fremde individuelle Ergebnisse nicht sehen.
10. [ ] Lernfortschritt/Teilnehmer-360° nur mit zulässiger Rolle prüfen.
11. [ ] Copilot darf höchstens Vorschläge/Erklärungen liefern; keine Bewertung unkontrolliert schreiben lassen.
12. [ ] Prüfungstermin-Konflikt aus Testdaten im Scenario Lab prüfen.

## L. Krankmeldungen und sonstige Abwesenheiten

1. [ ] als Teilnehmer Abwesenheitsbereich öffnen.
2. [ ] Krankmeldung für einen Zeitraum einreichen.
3. [ ] **keine Diagnose** eingeben.
4. [ ] prüfen: Diagnose wird nicht verlangt.
5. [ ] zweite sonstige Abwesenheit einreichen.
6. [ ] eigene Übersicht öffnen; beide Meldungen müssen nachvollziehbar sein.
7. [ ] als zuständige Rolle Meldungen prüfen.
8. [ ] eine Meldung anerkennen.
9. [ ] eine andere ablehnen bzw. im vorgesehenen Prüfstatus belassen.
10. [ ] prüfen: Eingang entscheidet nicht automatisch über Anwesenheit/Entschuldigung.
11. [ ] passende Unterrichtseinheit öffnen.
12. [ ] prüfen: anerkannte Meldung kann höchstens einen passenden Hinweis/Vorschlag liefern.
13. [ ] Anwesenheit darf nicht heimlich überschrieben werden.
14. [ ] vorbereiteten Abwesenheits-Mail-Eingang testen, **nur wenn dafür eine Testadresse tatsächlich bereitgestellt wurde**.
15. [ ] dieselbe Testmail doppelt zustellen.
16. [ ] erwartet: keine doppelte Abwesenheit.
17. [ ] mehrdeutige Testmail senden.
18. [ ] erwartet: Prüfhinweis statt geratenem Teilnehmer.
19. [ ] Testmail mit unnötigem Gesundheitsfreitext verwenden.
20. [ ] erwartet: medizinischer Detailtext wird nicht als normaler Abwesenheitsdatensatz unnötig weiterverarbeitet.

## M. Klassenbuch und Anwesenheit

1. [ ] als zugeordneter Dozent Unterrichtseinheit öffnen.
2. [ ] tatsächliche Unterrichts-/Klassenbuchangaben erfassen.
3. [ ] Anwesenheit im vorgesehenen Ablauf erfassen.
4. [ ] speichern.
5. [ ] Seite neu laden.
6. [ ] Daten erneut kontrollieren.
7. [ ] nicht zugeordneter Dozent darf Einheit nicht unzulässig bearbeiten.
8. [ ] Teilnehmer darf fremde Anwesenheit nicht sehen.
9. [ ] Klassenadmin darf fremde Anwesenheit nicht sehen.
10. [ ] Abwesenheitsmeldung als Hinweis gegenprüfen.

## N. Chat und Kommunikation

1. [ ] Klassen-/Kurschat öffnen, wenn freigegeben.
2. [ ] Testnachricht als berechtigte Person senden.
3. [ ] zweite berechtigte Rolle liest Nachricht.
4. [ ] Antwort senden.
5. [ ] weiteren Kurschat öffnen.
6. [ ] Benutzer ohne Kurszuordnung versucht normalen Zugriff.
7. [ ] erwartet: kein unzulässiger Zugriff.
8. [ ] Direktnachricht nur testen, wenn Rolle/Datenschutzregeln dies erlauben.
9. [ ] Moderations-/Lösch-/Meldeablauf prüfen, soweit angeboten.
10. [ ] prüfen: Chat eines anderen Mandanten niemals sichtbar.
11. [ ] Aufbewahrungs-/Auditverhalten im vorgesehenen Adminbereich prüfen, soweit angeboten.

## O. Microsoft Teams

Teams ist ein externer Microsoft-Dienst. Die Funktion kann nur vollständig live getestet werden, wenn ein Microsoft-365-Testmandant, passende Lizenzen und die erforderlichen Graph-/Adminfreigaben vorhanden sind.

1. [ ] als berechtigter Dozent/Kundenadmin Unterrichts-/Kalendertermin öffnen.
2. [ ] Teams-Besprechung erstellen oder verknüpfen, soweit externe Integration freigegeben ist.
3. [ ] Termin als Teilnehmer öffnen.
4. [ ] Teilnehmer sieht klare „Beitreten“-Möglichkeit.
5. [ ] Teilnehmer erhält keine unnötigen Meeting-Adminrechte.
6. [ ] Terminzeit ändern.
7. [ ] prüfen: Änderung wird entsprechend der Microsoft-Integration synchronisiert.
8. [ ] Termin absagen.
9. [ ] prüfen: Absage wird entsprechend synchronisiert.
10. [ ] fremder/nicht berechtigter Benutzer darf Meetingdaten nicht unzulässig verwalten.
11. [ ] Falls echter Microsoft-Testtenant noch fehlt: alle Punkte `[EXTERN OFFEN]` markieren, nicht fälschlich als bestanden.

## P. KI/Copilot – zentraler „Was soll passieren?“-Assistent

1. [ ] Copilot-/Education-OS-Eingabebereich öffnen.
2. [ ] einfache Frage stellen, die nur erklärt/zusammenfasst.
3. [ ] prüfen: Antwort ist verständlich und enthält keine fremden Mandantendaten.
4. [ ] natürliche Absicht eingeben: „Dozent [fiktiver Name] ist morgen krank.“
5. [ ] prüfen: Dozent/Datum werden erkannt oder Unsicherheit wird verständlich angezeigt.
6. [ ] ohne eindeutigen Namen testen.
7. [ ] erwartet: System fragt/markiert Mehrdeutigkeit und rät nicht.
8. [ ] Raumausfall natürlich formulieren.
9. [ ] Prüfungsverschiebung natürlich formulieren.
10. [ ] Curriculum-/Lernstandsproblem natürlich formulieren.
11. [ ] Selbstlernphase natürlich formulieren.
12. [ ] Exkursionsänderung natürlich formulieren.
13. [ ] Stundenplan-Neuplanung natürlich formulieren.
14. [ ] ablaufende Qualifikation natürlich formulieren.
15. [ ] prüfen: natürliche Eingabe erzeugt zunächst Vorschau/Simulation, keine unkontrollierte Produktivänderung.
16. [ ] kritische Ausführung ohne erforderliche Freigabe/MFA versuchen.
17. [ ] erwartet: sicher blockiert.

## Q. KI-Umfragen und Feedbackanalyse

Nur als bestanden markieren, wenn die konkrete Funktion im Testsystem wirklich vorhanden und bedienbar ist.

1. [ ] Umfrage erstellen.
2. [ ] Copilot um verständliche Fragen zu einem fiktiven Thema bitten.
3. [ ] Fragen vor Veröffentlichung bearbeiten können.
4. [ ] Umfrage veröffentlichen.
5. [ ] mit mehreren Testkonten Antworten abgeben.
6. [ ] Ergebnisse öffnen.
7. [ ] KI-Zusammenfassung/Feedbackanalyse auf Plausibilität prüfen.
8. [ ] einzelne Personen dürfen nicht unzulässig aus anonym vorgesehenen Antworten rekonstruiert werden.
9. [ ] KI-Zusammenfassung darf Rohdaten nicht verändern.

## R. Dokument-/Importhilfe und natürliche Suche

1. [ ] Importbereich öffnen.
2. [ ] absichtlich ungewöhnlich benannte, aber verständliche Spalten verwenden.
3. [ ] automatische Zuordnung/Vorschlag prüfen.
4. [ ] falschen Vorschlag manuell korrigieren können.
5. [ ] problematische Datei/Zeile erklären lassen, soweit Copilot-Hilfe angeboten wird.
6. [ ] prüfen: Copilot importiert nicht blind trotz Fehlern.
7. [ ] natürliche Suche mit einem bekannten Kurs/Termin/Dozenten testen.
8. [ ] Suche nach absichtlich nicht vorhandenem Datensatz testen.
9. [ ] erwartet: „nicht gefunden“ statt erfundenem Ergebnis.
10. [ ] Suche nach Daten eines anderen Mandanten darf niemals Ergebnisse liefern.

## S. Kommunikations- und Unterrichtsassistent

1. [ ] Copilot um Entwurf einer neutralen Kursmeldung bitten.
2. [ ] Entwurf vor Versand bearbeiten können.
3. [ ] prüfen: Entwurf wird nicht ohne ausdrücklichen Versand veröffentlicht.
4. [ ] Unterrichtszusammenfassung/Materialvorschlag für fiktiven Unterricht testen, soweit angeboten.
5. [ ] Lern-/Fördervorschlag anhand fiktiver zulässiger Daten testen.
6. [ ] prüfen: Vorschlag ist als Vorschlag erkennbar und schreibt keine Note/Anwesenheit.
7. [ ] Klassenbuch-Formulierungshilfe testen, soweit angeboten.
8. [ ] prüfen: endgültige Klassenbuchdaten werden erst durch berechtigte Rolle übernommen.

## T. Education OS: Live Twin, Scenario Lab und Autopilot

1. [ ] Education OS öffnen.
2. [ ] Live Education Twin laden.
3. [ ] prüfen: Kurs-/Planungszustand plausibel.
4. [ ] Twin-Snapshot erzeugen, soweit UI angeboten.
5. [ ] Dozentenausfall simulieren.
6. [ ] betroffene Unterrichtseinheiten kontrollieren.
7. [ ] Vertretungsvorschlag prüfen.
8. [ ] Selbstlernoption nur dann als ausführbar erwarten, wenn ausdrücklich erlaubt.
9. [ ] Raumausfall simulieren.
10. [ ] Ersatzraum/Alternative oder klar ungelösten Konflikt prüfen.
11. [ ] Prüfungsverschiebung simulieren.
12. [ ] Konfliktprüfung kontrollieren.
13. [ ] Scenario Lab nutzen, ohne auszuführen.
14. [ ] Produktivdaten erneut öffnen: dürfen durch reine Simulation nicht verändert sein.
15. [ ] zulässigen Plan auswählen.
16. [ ] vorgesehene Freigabe/MFA durchführen.
17. [ ] Plan ausführen.
18. [ ] Ausführungshistorie/Auditspur kontrollieren.
19. [ ] neuen Plan simulieren.
20. [ ] danach Systemzustand verändern.
21. [ ] alten Plan ausführen versuchen.
22. [ ] erwartet: veralteter/staler Plan wird abgelehnt und muss neu simuliert werden.
23. [ ] Rollback/Rücknahme einer reversiblen Testausführung prüfen, soweit angeboten.

## U. Future Radar, Datenqualität/Self-Healing und Management-Briefing

1. [ ] Future Radar öffnen.
2. [ ] Scan ausführen, soweit Rolle/MFA erlaubt.
3. [ ] eingebauten Jahresplan-/Planungsrisikofall finden.
4. [ ] Ressourcen-/Raumrisiko finden.
5. [ ] Frist-/Qualifikations-/Curriculumrisiko prüfen, soweit im Datensatz vorhanden.
6. [ ] Risikoerklärung auf Verständlichkeit prüfen.
7. [ ] vorgeschlagene Gegenmaßnahme nur simulieren/vorbereiten.
8. [ ] Datenqualitäts-/Konsistenzscan öffnen.
9. [ ] absichtlich erzeugten Widerspruch erkennen lassen.
10. [ ] Reparaturvorschlag lesen.
11. [ ] prüfen: keine stille unkontrollierte Reparatur.
12. [ ] Management-Briefing/Zusammenfassung öffnen, soweit angeboten.
13. [ ] prüfen: wichtige offene Risiken/Statuspunkte werden verständlich zusammengefasst.
14. [ ] prüfen: Briefing enthält keine Daten, für die aktuelle Rolle nicht berechtigt ist.

## V. Proof Graph, Nachweise, Readiness und Berichte

1. [ ] Proof-Graph/Nachweiskette für einen Kurs öffnen.
2. [ ] Planung → Unterricht → Anwesenheit/Nachweis → Klassenbuch → Curriculum → Aufgabe/Prüfung → Bericht prüfen, soweit Daten vorhanden.
3. [ ] historische/importierte Daten müssen als solche nachvollziehbar bleiben.
4. [ ] Proof-Paket/Export erzeugen, soweit angeboten.
5. [ ] Readiness/Status eines Kurses öffnen.
6. [ ] Werte mit Testdaten plausibilisieren.
7. [ ] Trend/Snapshot prüfen, soweit angeboten.
8. [ ] Berichte/Exporte nur für berechtigten Mandanten/Kurs sichtbar.

## W. Abrechnung und gebuchter Umfang

1. [ ] Bereich Paket/Abrechnung/gebuchter Umfang öffnen.
2. [ ] aktuelle Klassen-/Kursgrenze prüfen.
3. [ ] Erweiterung im **Testmodus** vorbereiten, soweit angeboten.
4. [ ] erfolgreiche Stripe-Testzahlung durchführen.
5. [ ] prüfen: Umfang wird nach erfolgreicher Testzahlung korrekt aktiviert.
6. [ ] separaten fehlgeschlagenen Testzahlungsfall durchführen.
7. [ ] prüfen: fehlgeschlagene Zahlung aktiviert keinen kostenpflichtigen Umfang.
8. [ ] sauberen Wiederholungsversuch durchführen.
9. [ ] prüfen: erst erfolgreicher Retry aktiviert den Umfang.
10. [ ] niemals echte Karten-/Bankdaten verwenden.
11. [ ] Falls Stripe-End-to-End-Test noch nicht real durchgeführt werden kann: `[EXTERN OFFEN]` markieren.

## X. Import, Export, Backup und Restore

1. [ ] verfügbare CSV-Exporte testen.
2. [ ] XLSX-Exporte testen, soweit angeboten.
3. [ ] PDF-Exporte testen, soweit angeboten.
4. [ ] vollständigen Mandantenexport/ZIP erzeugen, soweit angeboten.
5. [ ] stichprobenartig Inhalt prüfen.
6. [ ] keine fremden Mandantendaten enthalten.
7. [ ] manuelles Backup auslösen.
8. [ ] Teständerung durchführen.
9. [ ] Restore im vorgesehenen Testablauf durchführen.
10. [ ] prüfen: Sicherheitsbackup vor Restore vorhanden, soweit vorgesehen.
11. [ ] wiederhergestellten Zustand kontrollieren.
12. [ ] automatischen Backupstatus prüfen, soweit sichtbar.

## Y. Vertragsende/Löschung

Nur mit reinem Testmandanten durchführen.

1. [ ] Vertragsende-/Exportworkflow öffnen.
2. [ ] Abschlussbackup/Export prüfen.
3. [ ] Lösch-/Schonfristablauf starten, soweit Testfunktion vorhanden.
4. [ ] Abbruch innerhalb der vorgesehenen Frist testen.
5. [ ] prüfen: Mandant bleibt bei Abbruch erhalten.
6. [ ] finalen Löschschritt nur in ausdrücklich dafür vorgesehener Testumgebung durchführen.
7. [ ] Audit/Nachweis des Prozesses prüfen, soweit vorgesehen.

## Z. Sicherheit, Datenschutz und Mandantentrennung

1. [ ] als Teilnehmer Admin-URL über normale Navigation/gespeicherten Testlink aufrufen.
2. [ ] erwartet: Zugriff verweigert.
3. [ ] als Klassenadmin sensible Teilnehmerdaten versuchen.
4. [ ] erwartet: Zugriff verweigert.
5. [ ] als Dozent nicht zugeordneten Kurs versuchen.
6. [ ] erwartet: Zugriff verweigert.
7. [ ] als Kundenadmin fremden Testmandanten normal über bekannten Testlink versuchen.
8. [ ] erwartet: Zugriff verweigert/keine Daten.
9. [ ] Gastzugriff auf interne Daten versuchen.
10. [ ] erwartet: Zugriff verweigert.
11. [ ] Abmelden und Browser-Zurück verwenden.
12. [ ] erwartet: geschützte Inhalte dürfen nicht wieder als nutzbare Sitzung erscheinen.
13. [ ] Passwort/MFA-Code darf nirgends im normalen UI oder Export angezeigt werden.
14. [ ] Fehlerseiten dürfen keine Geheimnisse/API-Schlüssel/Stacktraces mit sensiblen Daten zeigen.
15. [ ] KI/Copilot darf keine fremden Mandantendaten liefern.
16. [ ] Chat darf keine fremden Mandanten-/Kursdaten liefern.
17. [ ] Exporte/Backups dürfen keine fremden Mandantendaten enthalten.

---

# TEIL 5 – Oberfläche auf Desktop und Smartphone

Jeder Tester führt mindestens einen vollständigen Alltagsrundgang am Computer und einen kleineren Rundgang am Smartphone/kleinen Browserfenster durch.

- [ ] Navigation vollständig sichtbar/bedienbar.
- [ ] keine überlappenden Menüs.
- [ ] keine abgeschnittenen Dialoge.
- [ ] Schaltflächen anklickbar.
- [ ] lange Namen brechen sinnvoll um.
- [ ] große Tabellen bleiben bedienbar.
- [ ] Browser zurück/vor führt nicht zu kaputtem Zustand.
- [ ] Neuladen behält gespeicherte Daten korrekt.
- [ ] verständliche Lade-/Fehlerzustände.
- [ ] keine dauerhaft sichtbare Einrichtungshilfe nach Abschluss.
- [ ] deutsche Umlaute/Sonderzeichen korrekt.
- [ ] Datums-/Zeitangaben verständlich und plausibel.

---

# TEIL 6 – Fehlerbericht für absolute Anfänger

Wenn etwas nicht funktioniert, schreibe **genau diese acht Punkte** auf:

1. **Bereich:** Wo warst Du? Beispiel „Stundenplan“.
2. **Rolle:** Als wer warst Du angemeldet? Beispiel „Teilnehmer“.
3. **Klickweg:** Was hast Du nacheinander angeklickt?
4. **Eingabe:** Was hast Du eingegeben oder welche Testdatei benutzt?
5. **Erwartung:** Was sollte Deiner Meinung nach passieren?
6. **Tatsächlich:** Was ist stattdessen passiert?
7. **Wiederholbar:** Passiert es nach Neuladen noch einmal?
8. **Gerät:** Computer/Smartphone + Browser.

Zusätzlich Screenshot machen, **aber niemals** Passwort, MFA-Code, API-Schlüssel, echte Zahlungsdaten oder andere Geheimnisse mitfotografieren.

---

# TEIL 7 – Abschlusskontrolle: Nichts unbewertet lassen

Am Schluss durch das gesamte Dokument scrollen und nach `[ ]` suchen. Jedes verbleibende Kästchen muss entweder getestet oder ausdrücklich als `[FEHLER]`, `[NICHT VERFÜGBAR]` oder `[EXTERN OFFEN]` markiert werden.

Danach beantworten:

- [ ] Konntest Du den Bildungsträger ohne fremde Hilfe einrichten?
- [ ] Welche Stelle war trotz dieser Anleitung unverständlich?
- [ ] Welche Funktion hast Du gesucht, aber nicht gefunden?
- [ ] Gab es eine Schaltfläche ohne erkennbare Wirkung?
- [ ] Gab es eine Stelle, an der Du Angst hattest, etwas kaputtzumachen?
- [ ] Waren Fehlermeldungen verständlich genug?
- [ ] Waren Rollen und Rechte nachvollziehbar?
- [ ] Hatte der Copilot/Autopilot klare Grenzen zwischen Vorschlag und echter Änderung?
- [ ] Würdest Du das System nach diesem Test im Alltag bedienen können?
- [ ] Welche drei Punkte müssen vor einem echten Kunden unbedingt noch verbessert werden?

## Externe Live-Abnahmen gesondert kennzeichnen

Folgende Punkte gelten **nicht** allein durch sichtbare UI oder Unit-/CI-Tests als vollständig extern abgenommen:

- echter Microsoft-Graph-/Teams-End-to-End-Test mit autorisiertem Microsoft-365-Testmandanten,
- Stripe-Testfall „Zahlung schlägt fehl → aktiviert nichts → sauberer Retry funktioniert“,
- echte Browser-/Smartphone-Praxistests durch die vorgesehenen Personen,
- Backup/Restore-Praxistest,
- kundenspezifische Datenschutz-/Aufbewahrungseinstellungen,
- QES nur dann, wenn ein realer Anbieter tatsächlich ausgewählt, integriert und End-to-End geprüft wurde.

Diese Punkte dürfen bis zur echten Durchführung nur als `[EXTERN OFFEN]` bezeichnet werden – niemals vorsorglich als bestanden.
