# End-to-End-Praxistest Klassenportal / Education OS

## Ziel

Du testest das Klassenportal wie ein echter neuer Bildungsträger: von der ersten Einrichtung bis zum laufenden Unterrichtsbetrieb, den Rollenportalen, Automationen und dem Education OS. Dein Test muss unabhängig von anderen Testern sein. Nicht nur prüfen, ob Schaltflächen sichtbar sind: wichtige Abläufe müssen bis zum fachlich erwarteten Ergebnis durchgeführt werden.

## 1. Eigenen fiktiven Bildungsträger mit deiner eigenen KI erzeugen

Kopiere diesen Auftrag in deine eigene KI. Lass die KI alle Daten selbst erfinden. Übernimm keine Beispieldaten anderer Tester.

> Erzeuge für mich einen vollständig fiktiven deutschen Bildungsträger als realistischen End-to-End-Testdatensatz für ein Klassenportal. Erfinde Namen, Struktur, Angebote und Daten selbstständig. Die Organisation soll plausibel, aber nicht absichtlich simpel sein. Verwende keinerlei echte personenbezogene Daten. Für alle E-Mail-Adressen ausschließlich die Domain `example.invalid` benutzen.
>
> Erzeuge mindestens: Stammdaten und Ansprechpartner; ein eigenes Branding-Konzept; 1–3 Standorte und/oder Fachbereiche mit einem Organigramm; 3–8 Klassen/Kurse mit Kürzeln und Laufzeiten; 4–12 Beschäftigte/Administratoren/Lehrkräfte mit unterschiedlichen Rollen und Zuständigkeiten; 20–60 fiktive Teilnehmer/Schüler über mehrere Klassen verteilt; Räume; einen Stundenplan für mindestens zwei Wochen mit Fächern, Lehrkräften, Räumen und unterschiedlichen Unterrichtsarten; Beispiel-Meldungen, Termine, Lernmaterialien und Aufgaben.
>
> Erzeuge zusätzlich einen realistischen Jahresgrundplan für mindestens sechs Monate. Er muss mehrere Blockarten enthalten: Ferien/unterrichtsfreie Zeit, Feiertag oder Schließtag, Praktikum/Betriebsphase, Prüfungsphase und normalen Unterricht. Mindestens eine Blockphase soll sich absichtlich mit einer normalen Stundenplanzeile überschneiden, damit die Konflikterkennung getestet werden kann.
>
> Ergänze realistische Sonderfälle: eine Krankmeldung eines Teilnehmers, eine andere Abwesenheit ohne Krankheit, einen Teilnehmer mit Kurswechsel, eine zu korrigierende Importzeile oder Dublette, einen Rollenwechsel bei einem Mitarbeiter, einen Dozentenausfall, einen Raumausfall, mindestens eine Termin-/Stundenplanänderung und einen Fall, bei dem ein Benutzer etwas wegen fehlender Berechtigung nicht sehen oder ändern darf.
>
> Gib die Daten zusätzlich in CSV-freundlichen Tabellen aus. Organigramm-Spalten: `external_id, parent_external_id, type, name, code, course_code, course_name, responsible_name, responsible_email, profile`. Teilnehmer-Spalten: `Vorname, Nachname, E-Mail, Teilnehmernummer, Klasse, Klassencode, Beginn, Ende`. Stundenplan-Spalten: `Klasse, Datum, Beginn, Ende, Fach, Fachkürzel, Dozent, Raum, Unterricht, Hinweise`. Jahresgrundplan-Spalten: `Klasse, Von, Bis, Typ, Titel, Unterricht_sperren, Hinweise`.
>
> Entscheide selbst, welche Art von Bildungsträger du erzeugst. Die Daten müssen intern konsistent sein, aber strukturell eigenständig und nicht nach einem vorgegebenen Muster benannt sein.

## 2. Testregeln

- Nur fiktive Daten verwenden. Keine echten Schüler, Beschäftigten, Telefonnummern, Adressen oder Dokumente.
- E-Mail-Adressen ausschließlich unter `example.invalid`.
- Keine echten Kredit-/Debitkarten oder Bankdaten verwenden.
- Zahlungen ausschließlich im Stripe-Testmodus durchführen.
- Nicht als Plattform-Admin testen. Du bist ein eigenständiger Kunde/Bildungsträger.
- Berechtigungsgrenzen normal testen, aber Sicherheitssysteme nicht absichtlich umgehen.
- Eine Krankmeldung darf niemals eine Diagnose oder einen medizinischen Freitext erfordern. Prüfe ausdrücklich, dass das System solche Angaben nicht für die normale Abwesenheitsverarbeitung speichert oder an unnötige Rollen weitergibt.
- Klassen-Admin und Lehrkraft sind verschiedene Rollen: Ein Klassen-Admin ist weiterhin Teilnehmer/Schüler mit zusätzlichen Verwaltungsrechten. Lehrkräfte arbeiten über das separate Dozentenportal mit expliziter Dozenten-Kurs-Zuordnung.

## 3. Testablauf

### A – Erstkontakt und Einrichtung

- Einrichtungs-/Onboarding-Link öffnen.
- Bildungsträger mit den von deiner KI erzeugten Stammdaten anlegen.
- vorgesehenen Test-/Buchungsablauf durchführen.
- eigenen Kunden-Admin anlegen und anmelden.
- Passwort-/MFA-Abläufe vollständig durchlaufen, sofern angeboten/verlangt.
- prüfen, ob Weiterleitungen, Fehlermeldungen und Bestätigungen verständlich sind.
- die Einrichtungsführung vollständig abarbeiten und danach prüfen, dass „Einrichtung vorbereiten“ und die Einrichtungs-Fortschrittskarte nicht dauerhaft weiter angezeigt werden.

### B – Branding und Organisation

- Portalname, Logo/Wunschbranding, Farben und Willkommenstext einrichten.
- Organisationsstruktur/Organigramm per CSV oder XLSX importieren.
- Standorte/Bereiche/Klassen korrekt zuordnen.
- Verantwortliche und Vertretungen anlegen.
- prüfen, ob fehlerhafte oder unvollständige Zeilen vor dem endgültigen Import verständlich gemeldet werden.

### C – Klassen, Benutzer, Klassen-Admin und Dozentenportal

- alle vorgesehenen Klassen/Kurse anlegen bzw. importieren.
- Kunden-Admin und weitere organisatorische Rollen einrichten.
- einen Teilnehmer zusätzlich zum Klassen-Admin machen und prüfen, dass seine normale Teilnehmeransicht erhalten bleibt und nur zulässige Verwaltungsfunktionen hinzukommen.
- ausdrücklich prüfen, dass der Klassen-Admin keine individuellen Noten, Fehlzeiten oder Anwesenheitsdaten anderer Teilnehmer lesen kann.
- mindestens eine Lehrkraft separat im Dozentenportal einer konkreten Klasse/einem konkreten Kurs zuordnen.
- prüfen, dass ein Teilnehmer-/Klassen-Admin-Konto nicht gleichzeitig als Lehrkraft desselben Kurses missbraucht werden kann.
- Rollenwechsel aus dem KI-Szenario durchführen.
- mit mindestens drei unterschiedlichen Rollen anmelden und prüfen, ob jede Rolle nur ihre vorgesehenen Bereiche sieht.

### D – Teilnehmer / Schüler

- Teilnehmerliste als CSV/XLSX importieren.
- Vorschau und Zuordnung kontrollieren.
- absichtlich die von der KI vorgesehene Dublette/fehlerhafte Zeile testen und danach korrigieren.
- einzelne Teilnehmerprofile öffnen.
- Kurswechsel eines Teilnehmers durchführen bzw. abbilden.
- prüfen, ob Teilnehmer anderer Klassen nicht unzulässig sichtbar/bearbeitbar sind.

### E – Jahresgrundplan und Stundenplan

- Jahresgrundplan importieren und die automatische Erkennung von Klasse/Kurs, Von/Bis und Blocktyp kontrollieren.
- mindestens Ferien/unterrichtsfreie Zeit, Feiertag/Schließtag, Praktikum/Betriebsphase und Prüfungsphase prüfen.
- kontrollieren, dass blockierende Jahresplanzeiten bei Stundenplanung und Autopilot als Planungsgrundlage berücksichtigt werden und nicht still mit normalem Unterricht überschrieben werden.
- den absichtlich eingebauten Jahresplan-/Stundenplankonflikt prüfen; erwartetes Ergebnis: verständlicher Konflikt oder bewusster Override, niemals stilles Ignorieren.
- normalen Stundenplan als CSV/XLSX importieren.
- automatische Spaltenerkennung kontrollieren.
- Fächer, Dozenten, Räume, Zeiten und Klassen kontrollieren.
- eine spätere Stundenplanänderung importieren und prüfen, ob Änderungen sauber erkannt werden.
- mindestens einen weiteren Konflikt oder eine bewusst ungültige Zeile testen.

### F – Krankmeldungen, sonstige Abwesenheiten und Klassenbuch

- als Teilnehmer eine Krankmeldung für einen Zeitraum einreichen; keine Diagnose und keinen medizinischen Freitext angeben.
- als Teilnehmer eine andere Abwesenheit, z. B. Arzttermin oder genehmigte Abwesenheit, einreichen.
- im Dozentenportal bzw. bei der zuständigen Rolle prüfen, dass beide Meldungen sichtbar und als administrative Abwesenheitsmeldungen prüfbar sind.
- eine Meldung anerkennen und eine andere ablehnen; prüfen, dass dies nicht bereits beim Eingang automatisch entschieden wurde.
- prüfen, dass eine anerkannte Meldung bei einer passenden Unterrichtseinheit höchstens „entschuldigt abwesend“ vorschlägt und die Anwesenheit nicht unkontrolliert überschreibt.
- sofern für den Test eine gesonderte Abwesenheits-E-Mail-Adresse bereitgestellt wird: eine fiktive Krankmeldung von einem eindeutig zuordenbaren Teilnehmer an diese Adresse senden und prüfen, dass Zeitraum/Teilnehmer korrekt erkannt werden.
- denselben E-Mail-Vorgang erneut zustellen und prüfen, dass keine doppelte Abwesenheit entsteht.
- eine absichtlich mehrdeutige oder nicht eindeutig zuordenbare Abwesenheitsmail testen; erwartetes Ergebnis: Prüfhinweis statt geratenem Datensatz.
- prüfen, dass Diagnose-/Gesundheitsfreitext aus einer E-Mail nicht als normaler Abwesenheitsdatensatz übernommen wird.
- Anwesenheit einer Unterrichtseinheit erfassen und das digitale Klassenbuch vervollständigen.

### G – Education OS, Autopilot, Future Radar und Self-Healing

- Education OS öffnen und prüfen, dass Live Twin, Autopilot, Future Radar, Scenario Lab, Self-Healing, Proof Graph und Ausführungshistorie tatsächlich Daten laden und bedienbar sind; reine Platzhalter/Schaltflächen ohne Wirkung als Fehler melden.
- Dozentenausfall aus dem KI-Szenario über den Autopilot analysieren und eine Simulation erzeugen. Prüfen, ob betroffene Unterrichtseinheiten erkannt und sinnvolle Optionen vorgeschlagen werden.
- Raumausfall simulieren und prüfen, ob Ersatzraum/Alternative bzw. ein klarer ungelöster Konflikt entsteht.
- die Teilnehmer-Krankmeldung/Abwesenheit als Betriebssignal prüfen: Sie soll im zuständigen Aufmerksamkeits-/Automationsprozess erscheinen, aber niemals automatisch eine Diagnose ableiten, Anwesenheit schreiben oder die Entschuldigungsentscheidung vorwegnehmen.
- Future Radar nach den eingebauten Jahresplan-, Ressourcen-, Frist- oder Planungsrisiken prüfen.
- Self-Healing mit mindestens einem absichtlich erzeugten Widerspruch prüfen. Erwartet wird ein nachvollziehbarer Reparaturvorschlag, kein stilles unkontrolliertes Umschreiben.
- im Scenario Lab mindestens eine Änderung nur simulieren und bestätigen, dass Produktivdaten unverändert bleiben.
- anschließend einen zulässigen Plan über den vorgesehenen Freigabe-/MFA-Ablauf ausführen und die Ausführungshistorie/Auditspur kontrollieren.
- den realen Systemzustand nach einer Simulation ändern und danach versuchen, den alten Plan auszuführen; erwartetes Ergebnis: alter Plan wird als veraltet abgelehnt und muss neu simuliert werden.

### H – Laufender Unterrichtsbetrieb

- Meldungen/Informationen veröffentlichen.
- Termine anlegen und ändern.
- Lernmaterial hochladen.
- Aufgabe/Hausaufgabe anlegen und Fälligkeit setzen.
- Klassenbuch, Teilnehmer-360°, Berichte und Lernfortschritt ansehen.
- Prüfung/Bewertung anlegen und Rechte/Sichtbarkeit kontrollieren.
- Bescheinigung/Zertifikat bzw. Workflow testen, soweit die konkrete Funktion im Testsystem bereitsteht.

### I – Abrechnung und gebuchter Umfang

- Bereich „Paket & Abrechnung“ bzw. gebuchten Umfang öffnen.
- Erweiterung des Klassen-/Kursumfangs im Testmodus prüfen, sofern angeboten.
- Stripe-Testzahlung durchführen.
- erfolgreiche Testzahlung sowie einen vorgesehenen Fehl-/Abbruchfall testen.
- prüfen, dass eine fehlgeschlagene Zahlung keinen kostenpflichtigen Umfang aktiviert und ein sauberer Wiederholungsversuch korrekt funktioniert.
- niemals echte Zahlungsdaten verwenden.

### J – Mandanten- und Berechtigungsgrenzen

- URLs/Links aus einer anderen Rolle erneut aufrufen.
- mit Teilnehmerzugang versuchen, Adminbereiche normal aufzurufen; erwartetes Ergebnis: Zugriff verweigert.
- mit Klassen-Admin prüfen, dass fremde Teilnehmerdaten und andere Klassen nicht bearbeitet werden können, sofern keine Berechtigung besteht.
- mit einer Lehrkraft prüfen, dass das Dozentenportal nur ausdrücklich zugeordnete Kurse öffnet.
- keine Daten des anderen Test-Bildungsträgers verwenden oder austauschen. Die beiden Tests müssen vollständig getrennt bleiben.

### K – Alltag und Oberfläche

- einmal Desktop und einmal Smartphone/kleines Browserfenster testen.
- Seite neu laden, zurück/vor verwenden und neu anmelden.
- mehrere Dialoge öffnen/schließen.
- lange Namen, viele Navigationseinträge und größere Tabellen kontrollieren.
- auf überlappende Navigation, abgeschnittene Dialoge, unverständliche Bezeichnungen, tote Schaltflächen, dauerhaft sichtbare Einrichtungshelfer und nicht klickbare Elemente achten.

### L – Export / Backup / Abschluss

- verfügbare Import-/Export-/Backup-Funktionen öffnen und sinnvoll testen.
- kontrollieren, ob Exportdaten ausschließlich zum eigenen Bildungsträger gehören.
- Backup/Restore im vorgesehenen Testablauf prüfen, wenn dafür eine Testfunktion bereitsteht.
- am Ende prüfen, ob der Bildungsträger aus Sicht eines echten Kunden arbeitsfähig wäre.

## 4. Fehler dokumentieren

Für jeden Fehler bitte genau festhalten:

1. Bereich/Funktion
2. verwendete Rolle
3. was du gemacht hast
4. was du erwartet hast
5. was stattdessen passiert ist
6. Screenshot
7. ob der Fehler nach Neuladen erneut auftritt
8. Browser/Gerät

Keine Passwörter, MFA-Codes, Test-API-Schlüssel oder andere Zugangsdaten in Screenshots/Fehlerberichten mitsenden.

## 5. Abschlussbewertung

Am Ende bitte kurz beantworten:

- Konntest du den Bildungsträger ohne fremde Hilfe vollständig einrichten?
- Welche Daten/Unterlagen haben dir für die automatische Einrichtung gefehlt?
- Welche Schritte waren unklar oder unnötig kompliziert?
- Wo hättest du eine Importvorlage oder bessere Erklärung gebraucht?
- Haben Autopilot, Future Radar und Self-Healing im Alltag einen erkennbaren Nutzen geliefert oder nur Oberfläche gezeigt? Nenne konkrete Beispiele.
- Wurden Krankmeldungen/Abwesenheiten über Portal und gegebenenfalls E-Mail zuverlässig, datensparsam und ohne automatische Entschuldigungsentscheidung verarbeitet?
- Wurde der Jahresgrundplan zuverlässig als Planungsgrundlage berücksichtigt?
- Welche Funktion würdest du als echter Bildungsträger als Erstes vermissen?
- Würdest du das Portal nach diesem Test produktiv einsetzen? Warum/warum nicht?
