# End-to-End-Praxistest Klassenportal

## Ziel

Du testest das Klassenportal wie ein echter neuer Bildungsträger: von der ersten Einrichtung bis zur Nutzung durch einzelne Teilnehmer/Schüler. Dein Test muss unabhängig von anderen Testern sein.

## 1. Eigenen fiktiven Bildungsträger mit deiner eigenen KI erzeugen

Kopiere diesen Auftrag in deine eigene KI. Lass die KI alle Daten selbst erfinden. Übernimm keine Beispieldaten anderer Tester.

> Erzeuge für mich einen vollständig fiktiven deutschen Bildungsträger als realistischen End-to-End-Testdatensatz für ein Klassenportal. Erfinde Namen, Struktur, Angebote und Daten selbstständig. Die Organisation soll plausibel, aber nicht absichtlich simpel sein. Verwende keinerlei echte personenbezogene Daten. Für alle E-Mail-Adressen ausschließlich die Domain `example.invalid` benutzen.
>
> Erzeuge mindestens: Stammdaten und Ansprechpartner; ein eigenes Branding-Konzept; 1–3 Standorte und/oder Fachbereiche mit einem Organigramm; 3–8 Klassen/Kurse mit Kürzeln und Laufzeiten; 4–12 Beschäftigte/Administratoren/Lehrkräfte mit unterschiedlichen Rollen und Zuständigkeiten; 20–60 fiktive Teilnehmer/Schüler über mehrere Klassen verteilt; Räume; einen Stundenplan für mindestens zwei Wochen mit Fächern, Lehrkräften, Räumen und unterschiedlichen Unterrichtsarten; Beispiel-Meldungen, Termine, Lernmaterialien und Aufgaben.
>
> Ergänze realistische Sonderfälle: mindestens eine Abwesenheit, einen Teilnehmer mit Kurswechsel, eine zu korrigierende Importzeile oder Dublette, einen Rollenwechsel bei einem Mitarbeiter, mindestens eine Termin-/Stundenplanänderung und einen Fall, bei dem ein Benutzer etwas wegen fehlender Berechtigung nicht sehen oder ändern darf.
>
> Gib die Daten zusätzlich in CSV-freundlichen Tabellen aus. Organigramm-Spalten: `external_id, parent_external_id, type, name, code, course_code, course_name, responsible_name, responsible_email, profile`. Teilnehmer-Spalten: `Vorname, Nachname, E-Mail, Teilnehmernummer, Klasse, Klassencode, Beginn, Ende`. Stundenplan-Spalten: `Klasse, Datum, Beginn, Ende, Fach, Fachkürzel, Dozent, Raum, Unterricht, Hinweise`.
>
> Entscheide selbst, welche Art von Bildungsträger du erzeugst. Die Daten müssen intern konsistent sein, aber strukturell eigenständig und nicht nach einem vorgegebenen Muster benannt sein.

## 2. Testregeln

- Nur fiktive Daten verwenden. Keine echten Schüler, Beschäftigten, Telefonnummern, Adressen oder Dokumente.
- E-Mail-Adressen ausschließlich unter `example.invalid`.
- Keine echten Kredit-/Debitkarten oder Bankdaten verwenden.
- Zahlungsfunktionen bleiben vollständig deaktiviert; keine Zahlungsdaten eingeben.
- Nicht als Plattform-Admin testen. Du bist ein eigenständiger Kunde/Bildungsträger.
- Nicht versuchen, absichtlich Sicherheitssysteme zu umgehen. Berechtigungsgrenzen dürfen und sollen normal getestet werden.

## 3. Testablauf

### A – Erstkontakt und Einrichtung

- Einrichtungs-/Onboarding-Link öffnen.
- Bildungsträger mit den von deiner KI erzeugten Stammdaten anlegen.
- Paket/Testphase auswählen.
- eigenen Kunden-Admin anlegen und anmelden.
- Passwort- und Bestätigungsabläufe vollständig durchlaufen, sofern angeboten/verlangt.
- prüfen, ob Weiterleitungen, Fehlermeldungen und Bestätigungen verständlich sind.

### B – Branding und Organisation

- Portalname, Logo/Wunschbranding, Farben und Willkommenstext einrichten.
- Organisationsstruktur/Organigramm per CSV oder XLSX importieren, soweit möglich.
- Standorte/Bereiche/Klassen korrekt zuordnen.
- Verantwortliche und Vertretungen anlegen.
- prüfen, ob fehlerhafte oder unvollständige Zeilen vor dem endgültigen Import verständlich gemeldet werden.

### C – Klassen, Benutzer und Rollen

- alle vorgesehenen Klassen/Kurse anlegen bzw. importieren.
- Kunden-Admin, Klassen-Admin/Lehrkraft und weitere Rollen einrichten.
- Rollenwechsel aus dem KI-Szenario durchführen.
- mit mindestens zwei unterschiedlichen Rollen anmelden und prüfen, ob jede Rolle nur ihre vorgesehenen Bereiche sieht.

### D – Teilnehmer / Schüler

- Teilnehmerliste als CSV/XLSX importieren.
- Vorschau und Zuordnung kontrollieren.
- absichtlich die von der KI vorgesehene Dublette/fehlerhafte Zeile testen und danach korrigieren.
- einzelne Teilnehmerprofile öffnen.
- Kurswechsel eines Teilnehmers durchführen bzw. abbilden.
- prüfen, ob Teilnehmer anderer Klassen nicht unzulässig sichtbar/bearbeitbar sind.

### E – Stundenplan

- Stundenplan als CSV/XLSX importieren.
- automatische Spaltenerkennung kontrollieren.
- Fächer, Dozenten, Räume, Zeiten und Klassen kontrollieren.
- eine spätere Stundenplanänderung importieren und prüfen, ob Änderungen sauber erkannt werden.
- mindestens einen Konflikt oder eine bewusst ungültige Zeile testen.

### F – Laufender Unterrichtsbetrieb

- Meldungen/Informationen veröffentlichen.
- Termine anlegen und ändern.
- Lernmaterial hochladen.
- Aufgabe/Hausaufgabe anlegen und Fälligkeit setzen.
- Anwesenheit/Abwesenheit erfassen.
- Klassenbuch, Teilnehmer-360° und Berichte ansehen, soweit im Paket verfügbar.
- Prüfung/Bewertung anlegen und Rechte/Sichtbarkeit kontrollieren.
- Bescheinigung/Zertifikat bzw. Workflow testen, soweit verfügbar.

### G – Module und Abrechnung

- Paket-/Modulübersicht öffnen.
- mindestens ein Modul aktivieren/deaktivieren oder einen Tarifwechsel simulieren, soweit im Testmodus verfügbar.
- prüfen, dass Zahlungsrouten mit PAYMENT_DISABLED antworten.
- prüfen, dass kein Checkout geöffnet und kein Zahlungsprovider aufgerufen wird.
- prüfen, ob der gebuchte Umfang anschließend genau dem angezeigten Paket entspricht.
- niemals echte Zahlungsdaten verwenden.

### H – Mandanten- und Berechtigungsgrenzen

- URLs/Links aus einer anderen Rolle erneut aufrufen.
- mit Teilnehmerzugang versuchen, Adminbereiche normal aufzurufen; erwartetes Ergebnis: Zugriff verweigert.
- mit Klassen-Admin prüfen, dass andere Klassen nicht bearbeitet werden können, sofern keine Berechtigung besteht.
- keine Daten des anderen Test-Bildungsträgers verwenden oder austauschen. Die beiden Tests müssen vollständig getrennt bleiben.

### I – Alltag und Oberfläche

- einmal Desktop und einmal Smartphone/kleines Browserfenster testen.
- Seite neu laden, zurück/vor verwenden und neu anmelden.
- mehrere Dialoge öffnen/schließen.
- lange Namen, viele Navigationseinträge und größere Tabellen kontrollieren.
- auf überlappende Navigation, abgeschnittene Dialoge, unverständliche Bezeichnungen und nicht klickbare Elemente achten.

### J – Export / Backup / Abschluss

- verfügbare Import-/Export-/Backup-Funktionen öffnen und sinnvoll testen.
- kontrollieren, ob Exportdaten zum eigenen Bildungsträger gehören.
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

Keine Passwörter, Zugangscodes, Test-API-Schlüssel oder andere Zugangsdaten in Screenshots/Fehlerberichten mitsenden.

## 5. Abschlussbewertung

Am Ende bitte kurz beantworten:

- Konntest du den Bildungsträger ohne fremde Hilfe vollständig einrichten?
- Welche Daten/Unterlagen haben dir für die automatische Einrichtung gefehlt?
- Welche Schritte waren unklar oder unnötig kompliziert?
- Wo hättest du eine Importvorlage oder bessere Erklärung gebraucht?
- Welche Funktion würdest du als echter Bildungsträger als Erstes vermissen?
- Würdest du das Portal nach diesem Test produktiv einsetzen? Warum/warum nicht?

