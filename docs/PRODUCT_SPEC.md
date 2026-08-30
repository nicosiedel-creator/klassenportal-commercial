# MASTER-PROMPT – KLASSENPORTAL COMMERCIAL

> **Status: SOLL-Spezifikation.** Dieses Dokument beschreibt das Zielbild, nicht den
> nachgewiesenen Ist-Stand.
>
> **Rangfolge bei Widerspruch:**
> 1. **Code + grüne Gates** = Realität.
> 2. **`PROJECT_STATE.md`** = verbindlicher Freigabe- und Abnahmestand.
> 3. **Dieses Dokument** = Ziel.
>
> Eine Abweichung zwischen Spec und Code ist damit eine *Lücke*, kein Widerspruch,
> und wird als Gap-Befund behandelt — nicht dadurch aufgelöst, dass Code still an
> einen älteren Text angepasst wird. Die harten Sicherheitsinvarianten aus
> `CLAUDE.md` und `PROJECT_STATE.md` bleiben in jedem Fall bindend.

---

Vollständige Produkt-, Architektur-, Sicherheits-, Automations- und Release-Spezifikation

Du arbeitest ausschließlich am Projekt:

Klassenportal Commercial

Repository:

"nicosiedel-creator/klassenportal-commercial"

Produktionsdomain:

"https://klassenportal.app"

Dieses Dokument ist die verbindliche Gesamtspezifikation für das Commercial Klassenportal. Es fasst Produktidee, bisher entwickelte Funktionen, Rollenmodell, Education OS, KI-/Autopilot-Konzept, Mandantenfähigkeit, EU-/DSGVO-Anforderungen, Sicherheit, Vollautomation, Plattformadministration, Kundenbetrieb, Importe, Unterrichtsorganisation, Reporting, Commercial-Prozesse, Infrastruktur, Tests und Produktionsfreigabe zusammen.

Bestehenden Code, Migrationen, Tests, Dokumentation, Pull Requests und Produktionsverhalten musst du gegen diese Spezifikation prüfen.

Dabei gilt:

Vorhandener Code ist kein Beweis dafür, dass eine Funktion fertig ist.

Eine Funktion ist erst fertig, wenn sie fachlich korrekt, technisch korrekt, sicher, mandantenisoliert, mobil nutzbar, performant, fehlertolerant, vollständig integriert, automatisiert testbar und im realistischen End-to-End-Ablauf nachgewiesen ist.

---

## 1. PRODUKTVISION

Klassenportal Commercial soll kein einfaches Klassenportal und keine Sammlung einzelner Verwaltungsseiten sein.

Es soll ein modernes:

Education Operating System – Education OS / EOS

für Bildungsträger, Weiterbildungsanbieter, Umschulungsträger, Berufsschulstrukturen, Akademien und vergleichbare Organisationen werden.

Das Produkt soll möglichst viele organisatorische Vorgänge in einer gemeinsamen Plattform zusammenführen und aus vorhandenen Daten automatisch ableiten.

Grundprinzip:

Automation first.

Das bedeutet:

- hochladen statt manuell nachbauen
- erkennen statt konfigurieren
- importieren statt abtippen
- vorschlagen statt suchen
- Konflikte automatisch erkennen
- Daten automatisch zuordnen
- Informationen nur einmal erfassen
- vorhandene Informationen überall sinnvoll wiederverwenden
- Routinevorgänge automatisieren
- Menschen primär mit Entscheidungen und Ausnahmen beschäftigen
- komplexe Änderungen zunächst simulieren
- riskante Aktionen niemals blind automatisieren

Das System soll langfristig große Teile des operativen Bildungsbetriebs koordinieren können.

---

## 2. STRIKTE PROJEKTABGRENZUNG

Das Repository "klassenportal-commercial" enthält ausschließlich das Commercial-Produkt.

Die VFA-/VFA13-Pilotplattform ist davon strikt getrennt.

VFA13 darf durch Commercial-Arbeiten nicht verändert werden.

Keine gemeinsamen Änderungen, kein Copy-Paste von produktionsspezifischen Daten und keine Nebenwirkungen auf andere Projekte.

Regressionstests müssen Commercial-Änderungen ausdrücklich auf unbeabsichtigten VFA-Drift prüfen.

---

## 3. TECHNOLOGISCHE BASIS

Primäre Plattform:

- Cloudflare Workers
- Cloudflare Static Assets
- Cloudflare D1
- Cloudflare R2
- Cloudflare-kompatible E-Mail-/Worker-Integration
- GitHub für Quellcode und Releaseprozess
- produktive Domain "klassenportal.app"

Cloudflare ist nicht lediglich Hosting, sondern Bestandteil der Plattformarchitektur.

Die Architektur muss:

- serverless skalieren
- mandantenfähig sein
- möglichst wenig permanente Infrastruktur benötigen
- reproduzierbar deploybar sein
- EU-Datenhaltung sicherstellen
- sichere Migrationen unterstützen
- testbare Preview-/Acceptance-Umgebungen ermöglichen
- Produktionszustände technisch nachweisen können

---

## 4. EU-DATENHALTUNG

Produktive Kundendaten müssen innerhalb der vorgesehenen EU-Infrastruktur verbleiben.

Das betrifft insbesondere:

- D1-Daten
- R2-Dateien
- Uploads
- Originaldokumente
- Exporte
- Backups
- Backup-Manifeste
- kundenspezifische Anhänge
- personenbezogene Daten
- Education-Twin-Daten
- KI-Kontextdaten
- Auditdaten
- Automationsdaten

Es darf keinen stillen Fallback auf eine nicht freigegebene Nicht-EU-Speicherregion geben.

Nicht Konfigurationsnamen, sondern die tatsächlich verwendeten produktiven Bindings sind maßgeblich.

Die Plattform muss technisch feststellen können:

- welche D1-Datenbank tatsächlich verwendet wird
- welcher R2-Bucket tatsächlich verwendet wird
- ob Backups wirklich über das EU-Binding geschrieben werden
- ob Legacy-R2-Daten vollständig in den EU-Speicher überführt wurden

Eine Migration vorhandener R2-Daten erfolgt:

1. nicht destruktiv
2. idempotent
3. batchweise
4. mit Größenvergleich
5. mit ETag-/Integritätsvergleich
6. mit Readback-Verifikation

Die Legacy-Quelle darf während einer Selbstheilungs-/Paritätsmigration niemals automatisch gelöscht werden.

Erst nach bewiesener Parität darf eine spätere kontrollierte Stilllegung vorgesehen werden.

---

## 5. DSGVO / PRIVACY BY DESIGN

Das Produkt ist von Anfang an als mandantenfähige Plattform mit personenbezogenen Bildungsdaten zu behandeln.

Grundprinzipien:

- Datensparsamkeit
- Zweckbindung
- Privacy by Default
- Privacy by Role
- Least Privilege
- serverseitige Zugriffskontrolle
- nachvollziehbare Verarbeitung
- Datenportabilität
- definierte Löschprozesse
- Restore-Fähigkeit
- Auditierbarkeit

Ein UI-Element darf niemals der einzige Datenschutzschutz sein.

Auch direkte API-Aufrufe müssen dieselben Grenzen erzwingen.

Jede Datenabfrage muss mindestens folgende Dimensionen berücksichtigen, soweit fachlich relevant:

- Tenant
- Standort/Fachbereich
- Klasse/Kurs
- Rolle
- konkrete Benutzerzuordnung

---

## 6. MANDANTENFÄHIGKEIT

Jeder Kunde erhält einen logisch isolierten Tenant.

Keine Kundendaten dürfen versehentlich tenantübergreifend sichtbar oder veränderbar sein.

Die Trennung muss serverseitig erfolgen.

Zentrale Dimensionen:

- "tenant_id"
- "course_id"
- Benutzerzuordnung
- Rollen
- Organisationshierarchie

Ein Kunde darf niemals durch Manipulation von:

- URL
- Query-Parameter
- Request Body
- IDs
- API-Aufrufen
- Browser DevTools

auf Daten eines anderen Kunden zugreifen können.

Tenant-Isolation gehört zu den kritischsten Sicherheitsinvarianten des Produkts.

---

## 7. ORGANISATIONSHIERARCHIE

Das System darf nicht auf "ein Kunde = eine Klasse" reduziert werden.

Unterstützt werden müssen mindestens:

Tenant
→ Standorte
→ Fachbereiche/Organisationseinheiten
→ Kurse/Klassen/Maßnahmen
→ Gruppen
→ Teilnehmer
→ Dozenten
→ Räume/Ressourcen

Große Bildungsträger müssen mehrere Standorte und Fachrichtungen verwalten können.

Hierarchische Berechtigungen müssen möglich sein.

Beispiel:

Ein Standortadministrator darf Standort A verwalten, aber nicht automatisch Standort B.

Ein Bereichsleiter darf mehrere Kurse seines Bereichs sehen, aber keine fachfremden Bereiche.

---

## 8. ROLLENMODELL

Mindestens folgende Rollen existieren:

Plattform-Admin — Betreiberrolle des gesamten Commercial-Systems.

Kunden-/Tenant-Admin — Administrator eines konkreten Kunden.

Standort-/Bereichsrollen — Optional begrenzte Administration einer organisatorischen Einheit.

Dozent — Eigenständige Lehrkraftrolle.

Klassen-/Kurs-Admin — Wichtig: Klassenadmin ist ein Teilnehmer mit Zusatzrechten und keine Lehrkraft.

Teilnehmer/Lernender — Normale Teilnehmerrolle.

Gast — Öffentliche bzw. ausdrücklich freigegebene Inhalte.

---

## 9. PLATTFORM-ADMIN

Der Plattformadmin verwaltet das Commercial-Produkt als Betreiber.

Dazu gehören beispielsweise:

- Kunden
- Tenants
- Angebote
- Angebotsstatus
- Pläne
- Module
- Feature Flags
- Entitlements
- Onboarding
- Einrichtungslinks
- Trials/Piloten
- Commercial-Status
- Custom Domains
- Branding-Grundkonfiguration
- Sicherheitsstatus
- Backupstatus
- Release-/Readinessstatus
- Plattformmetriken
- Integrationsstatus
- Auditinformationen
- Supportfunktionen
- Systemgesundheit

Der Plattformadmin darf jedoch nicht zum normalen Ersatz-Kundenadmin werden.

Supportzugriffe müssen bewusst ausgelöst, möglichst zeitlich begrenzt, auf einen Tenant beschränkt, nachvollziehbar und auditiert sein.

"Plattformadmin" bedeutet nicht unbegrenztes unkontrolliertes Browsen durch Kundendaten.

---

## 10. KUNDEN-/TENANT-ADMIN

Der Tenant-Admin verwaltet seinen eigenen Bildungsträger.

Typische Aufgaben:

- Grundeinrichtung
- Organisationsstruktur
- Standorte
- Fachbereiche
- Kurse
- Klassen
- Maßnahmen
- Räume
- Ressourcen
- Benutzer
- Teilnehmer
- Beschäftigte
- Dozenten
- Rollenzuweisungen
- Kurszuweisungen
- Branding
- Portalname
- Logo
- Farben
- Willkommenstexte
- Module
- Einstellungen
- Zugriffsmodelle
- Dokumente
- Import
- Stundenplan
- Kalender
- Aufgaben
- Prüfungen
- Anwesenheit
- Fehlzeiten
- Klassenbuch
- Kommunikation
- Reporting
- Exporte
- Integrationen
- Datenqualitätsprüfung
- Automationsregeln

Der Kunde darf keine Plattformfunktionen verändern.

---

## 11. KLASSENADMIN

Der Klassenadmin ist ausdrücklich:

Teilnehmer + Verwaltungszusatzrechte

und nicht: Dozent, Lehrer, allgemeiner Kursmanager, Mitarbeiter des Bildungsträgers.

Er erhält grundsätzlich dieselbe Teilnehmeroberfläche wie andere Teilnehmer.

Darin erscheinen zusätzliche Verwaltungsfunktionen.

Seine eigenen persönlichen Daten sieht er wie jeder andere Teilnehmer.

Er darf aber keine fremden persönlichen Teilnehmerdaten sehen, insbesondere nicht:

- fremde Noten
- fremde Fehlzeiten
- fremde Anwesenheitsdetails
- fremde Abgaben
- fremde private Notizen
- fremde Lernstandsdetails
- fremde sensible Dokumente

Klassenadministration darf nur gemeinschaftliche bzw. organisatorische Funktionen umfassen.

---

## 12. DOZENTENPORTAL

Das Dozentenportal ist eigenständig.

Dozenten sehen ausschließlich Klassen/Kurse, denen sie ausdrücklich zugeordnet wurden.

Kein globaler Zugriff auf alle Teilnehmer eines Bildungsträgers.

Das Dozentenportal soll eine vollständige tägliche Arbeitsoberfläche werden.

Dazu gehören:

- heutiger Unterricht
- Stundenplan
- Kalender
- Unterrichtsvorbereitung
- Lesson Hub
- Klassenbuch
- Anwesenheit
- Fehlzeiten
- Aufgaben
- Abgaben
- Prüfungen
- Lernfortschritt
- Dokumentation
- Kommunikationsentwürfe
- offene Aufgaben
- Erinnerungen
- Hinweise
- Konflikte
- Unterrichtsmaterial
- relevante Teilnehmerinformationen innerhalb der Berechtigung
- Team-/Bereichsinformationen

Die Oberfläche muss besonders schnell sein.

Ein Dozent darf nicht minutenlang zwischen Verwaltungsseiten navigieren müssen, um eine normale Unterrichtsstunde zu dokumentieren.

---

## 13. TEILNEHMERPORTAL

Teilnehmer erhalten ein eigenes persönliches Portal.

Es soll mindestens enthalten:

- Dashboard
- Stundenplan
- Kalender
- nächste Termine
- Aufgaben
- eigene Abgaben
- Prüfungen
- eigene Ergebnisse
- eigener Lernfortschritt
- eigene Anwesenheit/Fehlzeiten, soweit vorgesehen
- Dokumente
- wichtige Links
- Mitteilungen
- Unterrichtsinformationen
- Ressourcen
- persönliche Einstellungen

Es darf keine Peer-Daten anderer Teilnehmer offenlegen.

Die Teilnehmeroberfläche soll modern, klar, mobil, schnell, verständlich, barrierearm und touchoptimiert sein.

---

## 14. PERSONALISIERBARES PORTAL

Benutzer können geeignete Dashboard-/Portalbereiche personalisieren.

Beispielsweise: Reihenfolge von Widgets, relevante Bereiche, persönliche Darstellung.

Personalisierung darf niemals Sicherheitsfunktionen entfernen, Pflichtinformationen verstecken, Berechtigungen ändern oder Datenzugriffe erweitern.

---

## 15. SPRACHEN / INTERNATIONALISIERUNG

Deutsch ist die primäre und vollständig gepflegte Standardsprache.

Die Plattform wird stark multilingual.

Die Teilnehmeroberfläche soll insbesondere für internationale Bildungsteilnehmer geeignet sein.

Die Architektur muss einen großen Sprachumfang unterstützen.

Wo Sprachen produktiv angeboten werden, müssen sie vollständig übersetzt sein.

Unzulässig sind:

- nur übersetzte Dropdown-Einträge
- halb übersetzte Seiten
- deutsche Fehlertexte in einer angeblich fremdsprachigen Oberfläche
- nicht übersetzte Dialoge
- Platzhalterübersetzungen

Der später vorgesehene umfangreiche Sprachkatalog mit vielen zusätzlichen Sprachen ist als echte Übersetzung umzusetzen, nicht als optische Auswahl ohne dahinterliegende Übersetzung.

Auch folgende Bereiche müssen i18n-fähig sein: Navigation, Formulare, Validierungsfehler, Systemmeldungen, Dialoge, E-Mails, Onboarding, Hilfe, Accessibility-Texte.

---

## 16. ZUGRIFFSMODELLE FÜR KURSE

Pro Klasse/Kurs sollen verschiedene Zugriffsarten möglich sein: öffentlich, Link/Code, Login, Hybrid.

Diese Modelle dürfen die Datenschutzgrenzen nicht umgehen.

Öffentliche Bereiche dürfen nur ausdrücklich dafür vorgesehene Daten enthalten.

---

## 17. BRANDING / WHITE LABEL

Jeder Tenant kann eigene Darstellung erhalten.

Mindestens: Portalname, Logo, Primärdarstellung/Farben, Willkommenstext, organisatorische Bezeichnungen.

Vorbereitung bzw. Unterstützung für: eigene Domain, Custom Domain, White Label.

Custom-Domain-Funktionen müssen sicher funktionieren und dürfen Session-, Origin-, CSP- oder CSRF-Schutz nicht zerstören.

---

## 18. AUTOMATISIERTES CUSTOMER ONBOARDING

Onboarding ist ein Kernprozess.

Ziel: Ein akzeptiertes Angebot soll möglichst automatisch zu einem einsatzfähigen Kundenportal führen.

Ablauf:

Angebot → Annahme → Onboarding-Einladung → sicherer Einrichtungslink → Kundendaten → Admin anlegen → Tenant anlegen → Plan/Entitlements setzen → Grundeinstellungen → optional erster Kurs → Branding → Commercial-Status → Abschluss → Login

Der Kunde soll nicht erst manuell durch den Plattformbetreiber eingerichtet werden müssen.

Einrichtungslinks sind kryptografisch nicht erratbar, zeitlich begrenzt, Single Use, replaygeschützt und serverseitig validiert.

Roh-Tokens dürfen nicht unnötig geloggt werden.

Aktivierung muss atomar bzw. sicher kompensierbar sein.

---

## 19. HISTORISCHE PRODUKTIONS-D1-KOMPATIBILITÄT

Produktionsdatenbanken müssen als historische Systeme behandelt werden.

Es ist verboten anzunehmen: "Die aktuelle Migrationsdatei enthält das richtige Schema, also hat Produktion dieses Schema."

Migrationen, die bereits ausgeführt wurden, werden nicht rückwirkend erneut angewendet.

Deshalb:

- historische Migrationen niemals nachträglich als Reparaturmechanismus missbrauchen
- Forward-only-Migrationen verwenden
- Produktionsschema vor kritischen Vorgängen überprüfen
- additive Unterschiede sicher reparieren
- inkompatible Zustände fail-closed behandeln
- niemals Daten destruktiv "geradeziehen", nur damit Tests grün werden

Besonders Onboarding muss mit historischen Produktionsständen robust umgehen.

Abgebrochene Aktivierungen dürfen nicht: doppelte Tenants erzeugen, doppelte Admins erzeugen, doppelte Buchungen erzeugen, Links dauerhaft unbrauchbar machen, halb angelegte Kunden zurücklassen.

Stale Claims müssen sicher erkannt werden.

Recovery muss beweisen können, dass der zu bereinigende Tenant genau zur betreffenden Onboarding-Aktivierung gehört.

Bei Unsicherheit: fail closed.

---

## 20. ANGEBOTE / COMMERCIAL ENGINE

Plattformadministration benötigt Commercial-Funktionen für:

- Angebote
- Angebotsnummern
- Kundeninformationen
- Plan
- Kursanzahl
- Preisberechnung
- Monats-/Jahresmodell
- Setupoption
- Rabatte
- manuelle Preisüberschreibungen
- Angebotsannahme
- Trials/Piloten
- Buchungen
- Entitlements
- Subscriptions
- Orders
- Invoices
- Commercial-Status

Ein akzeptiertes Angebot muss maschinenlesbar gespeichert werden.

Das Onboarding darf nicht vom später veränderten aktuellen Preisplan abhängig werden.

Der akzeptierte Zustand ist ein Snapshot.

---

## 21. PAYMENT FREEZE

Aktuell verbindlich: "PAYMENTS_ENABLED=false"

Es dürfen keine echten Zahlungen ausgelöst werden.

Vorhandene Commercial-Strukturen dürfen Preise berechnen, Angebote erstellen, Buchungsdaten erzeugen, Entitlements aktivieren, Rechnungsentwürfe vorbereiten und Subscriptions abbilden — aber keine reale Zahlungsabwicklung darf aktiviert werden, solange dies nicht ausdrücklich in einem späteren separaten Auftrag freigegeben wurde.

Payment Freeze ist Release-Invariant.

Kein Entwickler darf Stripe oder andere Zahlungsabwicklung beiläufig aktivieren.

---

## 22. KURSE / KLASSEN / MASSNAHMEN

Kurse müssen umfassend verwaltet werden können.

Mindestens: Name, Kürzel, Zeitraum, Standort, Bereich, Teilnehmer, Dozenten, Ressourcen, Räume, Stundenplan, Termine, Prüfungen, Aufgaben, Dokumente, Zugriffsart, Status.

---

## 23. STUNDENPLAN

Stundenplanung ist eine Kernfunktion.

Unterstützt werden müssen: Tagesplanung, Wochenplanung, mehrwöchige Planung, wiederkehrende Unterrichtsblöcke, Dozent, Raum, Fach, Gruppe/Klasse, Ressourcen, Prüfungen, Praxisphasen, Sondertermine.

Änderungen bestehender Einträge müssen bestehende Einträge ändern und dürfen nicht versehentlich Duplikate erzeugen.

Änderungen müssen überall konsistent erscheinen.

---

## 24. HIERARCHIEBEWUSSTER STUNDENPLANIMPORT

Eine Datei darf mehrere Standorte, Klassen, Gruppen, Räume und Dozenten enthalten.

Der Import muss diese Struktur erkennen.

Zielzuordnungen müssen automatisch vorgeschlagen werden.

Unklare Zuordnungen müssen als Review erscheinen.

Import darf nicht blind in irgendeinen aktuell geöffneten Kurs schreiben.

---

## 25. PLANUNGSENGINE

Education OS soll langfristig nicht nur vorhandene Stundenpläne anzeigen. Es soll Planung unterstützen.

Die Engine berücksichtigt beispielsweise: Dozentenverfügbarkeit, Raumverfügbarkeit, Raumkapazität, Gruppen, Fachzuordnung, Unterrichtsumfang, Feiertage, Sperrzeiten, organisatorische Regeln, bestehende Termine, Prüfungen, Praxisphasen, Ressourcen, Konflikte.

Änderungen werden möglichst zuerst simuliert.

---

## 26. KALENDER

Kalender ist zentral.

Einträge müssen erstellt, angezeigt, bearbeitet, verschoben, gelöscht und nachträglich ergänzt werden können.

Bearbeiten bedeutet Update, nicht "neuen Termin erzeugen".

Kalender und zugrunde liegende Fachobjekte müssen synchron bleiben.

Beispiel: Wird aus einem Termin "Prüfung" später "Prüfungsvorbereitung", muss diese Änderung im Kalender sichtbar werden.

---

## 27. PRÜFUNGEN

Prüfungen benötigen einen eigenen fachlichen Workflow.

Mögliche Informationen: Titel, Fach, Datum, Kurs, Dozent, Art, Gewichtung, Hinweise, Ergebnis, Bewertung, Veröffentlichung.

Bereits geschriebene Prüfungen müssen nachträglich ergänzt werden können.

Teilnehmer dürfen nur ihre eigenen Ergebnisse sehen.

---

## 28. GRADEBOOK / LEISTUNG

Das System enthält eine kontrollierte Leistungs-/Gradebook-Funktion.

Zugriffe streng rollenbasiert.

Keine fremden Teilnehmernoten für Klassenadmins oder normale Teilnehmer.

Offizielle bzw. fachlich relevante Bewertungen dürfen nicht durch einen unkontrollierten KI-Autopiloten verändert werden.

KI darf analysieren, Hinweise geben, Auffälligkeiten erkennen und Entwürfe vorbereiten — aber keine kritischen Bewertungen autonom festsetzen.

---

## 29. ANWESENHEIT / FEHLZEITEN

Dozenten benötigen Anwesenheitsfunktionen.

Dazu: anwesend, abwesend, entschuldigt, unentschuldigt, verspätet, ggf. weitere konfigurierbare Zustände.

Automationen dürfen Daten vorbereiten oder Hinweise erzeugen.

Eine KI darf jedoch keine individuelle offizielle Anwesenheitsentscheidung unkontrolliert verändern.

---

## 30. KRANKMELDUNGEN

Krankmeldungen sollen möglichst automatisiert verarbeitet werden können.

Möglicher Ablauf:

Eingang → Dokument/E-Mail erkennen → Teilnehmer zuordnen → Zeitraum erkennen → Plausibilität prüfen → Vorschlag erzeugen → zuständige Person informieren → nach Freigabe Daten übernehmen

Keine unkontrollierte endgültige personenbezogene Statusänderung durch KI.

---

## 31. KLASSENBUCH

Eigenständige Klassenbuchfunktion.

Dozenten können Unterricht dokumentieren.

Mindestens: Datum, Unterrichtseinheit, Fach, Thema, Inhalte, besondere Hinweise, Anwesenheitskontext, ggf. Material, ggf. Hausaufgaben.

Automationen können aus Stundenplan und Lesson Hub einen Entwurf vorbereiten.

---

## 32. LESSON HUB

Lesson Hub soll Unterrichtsorganisation bündeln.

Ein Dozent soll für eine Unterrichtseinheit möglichst auf einer Seite sehen: Kurs, Gruppe, Raum, Zeit, Thema, geplante Inhalte, Materialien, Aufgaben, offene Abgaben, Teilnehmerhinweise, Anwesenheit, Klassenbuch, Prüfungen, nächste Termine.

Ziel: weniger Navigation, weniger doppelte Eingabe.

---

## 33. AUFGABEN UND ABGABEN

Aufgabenverwaltung: Aufgabe, Beschreibung, Kurs, Frist, Material, Abgabeformat, Teilnehmer, Status.

Teilnehmer sehen ihre eigenen Aufgaben und Abgaben.

Dozenten sehen Abgaben ihrer zugeordneten Teilnehmer.

Klassenadmins sehen keine privaten Abgaben anderer Teilnehmer.

---

## 34. DOKUMENTE

Dokumentenfunktionen müssen sicher, strukturiert und nachvollziehbar sein.

Unterstützte typische Formate: PDF, XLSX, CSV, weitere freigegebene Dokumentformate.

Originaldateien sollen erhalten bleiben.

Metadaten, Zuordnung und Verarbeitungsergebnisse müssen nachvollziehbar sein.

---

## 35. INTELLIGENTER IMPORT

Ein Kerndifferenzierungsmerkmal: Der Kunde soll bestehende Daten hochladen können.

Das System erkennt möglichst automatisch: Teilnehmer, Mitarbeiter, Dozenten, Standorte, Fachbereiche, Räume, Kurse, Klassen, Ressourcen, Stundenpläne, organisatorische Beziehungen.

Ablauf:

Upload → Analyse → Spaltenerkennung → semantische Zuordnung → Normalisierung → Dublettenerkennung → Konfliktprüfung → Vorschau → Review nur bei Unsicherheit → Import → Verifikation → Audit

Kein Blindimport.

---

## 36. ZERO-TOUCH INTAKE

Ziel ist ein möglichst weit automatisiertes Einrichten eines Bildungsträgers.

Ein Bildungsträger soll idealerweise seine vorhandenen Organisationsunterlagen hochladen.

Education OS erstellt daraus einen Vorschlag für: Organisation, Standorte, Kurse, Personal, Teilnehmer, Räume, Ressourcen, Zeitpläne, Zuordnungen.

Der Nutzer bestätigt hauptsächlich Ausnahmen und Unsicherheiten.

---

## 37. DATENEXPORT

Unterstützt werden: CSV, Excel, PDF soweit sinnvoll, strukturierte vollständige Exporte.

Ein Tenant muss seine Daten vollständig exportieren können.

Der Komplett-Export umfasst auch Originaldateien bzw. deren vorgesehene Exportform.

---

## 38. BACKUPS

Backups sind ein Kernbestandteil.

Unterstützt: automatisch, manuell, regelmäßige starke Backups.

Integrität mittels geeigneter kryptografischer Prüfsummen bzw. R2-Metadaten wie SHA-256, Größe, ETag.

Ein Backup gilt nicht allein deshalb als erfolgreich, weil ein Upload-Request keinen Fehler geliefert hat.

Readback/Verifikation gehört zum Prozess.

---

## 39. RESTORE

Restore ist High Risk.

Daher: Berechtigungsprüfung, Step-up, explizite Bestätigung, Restore-Vorschau, Sicherheitsbackup vor Restore, Audit, Integritätsprüfung, Fehlerkompensation.

Kein stiller Datenverlust.

---

## 40. VERTRAGSENDE / LÖSCHUNG

Es benötigt einen kontrollierten Datenlebenszyklus.

Beispiel: Kündigung → definierte Übergangsphase → Exportmöglichkeit → Backup → Löschvormerkung → Karenzzeit → finale Löschung

Die endgültige irreversible Löschung ist High Risk.

Keine autonome KI-Löschung.

---

## 41. MICROSOFT / TEAMS / ENTERPRISE-INTEGRATION

Die Plattform verfügt bzw. soll verfügen über ein Enterprise-Integrationsmodell.

Dazu können gehören: Microsoft Teams, organisatorische Microsoft-Integration, SSO, SCIM, API, sichere externe Integrationen.

Integrationen arbeiten nach Least Privilege, minimal notwendigen Scopes, sicherer Secretverwaltung und expliziter Tenantzuordnung.

---

## 42. KEINE EIGENE OFFICE-SUITE

Bewusste Produktabgrenzung: Klassenportal Commercial soll nicht unnötig neu entwickeln: eigenes Videokonferenzsystem, vollständige Office-Suite, universellen Messenger als Teams-/Slack-Ersatz.

Stattdessen vorhandene Systeme sinnvoll integrieren.

---

## 43. COMMUNICATION CENTER

Kommunikation soll trotzdem zentral koordiniert werden.

Education OS darf beispielsweise Mitteilungen vorbereiten, Erinnerungen erzeugen, Zielgruppen bestimmen, Kommunikationsbedarf erkennen, Entwürfe erstellen und Zusammenfassungen erzeugen.

Kritische oder sensible Kommunikation muss geeignete Freigaben besitzen.

---

## 44. ZENTRALER KI-ASSISTENT

Education OS erhält einen zentralen Assistenten.

Dieser soll nicht nur eine Chatbox sein.

Er kennt – innerhalb der jeweiligen Berechtigungen – den organisatorischen Kontext.

Mögliche Aufgaben: Informationen finden, Fragen beantworten, Daten zusammenfassen, Aufgaben vorbereiten, Dokumente analysieren, Probleme erkennen, Automationen vorschlagen, Managementinformationen erzeugen, Arbeitsabläufe starten, bei Imports helfen, Stundenpläne erklären, Datenqualität prüfen.

Jede Antwort bleibt strikt rollen- und tenantgebunden.

---

## 45. EDUCATION TWIN

Ein wesentliches EOS-Konzept: Education Twin

Der Education Twin ist ein digitales operatives Modell des Bildungsträgers.

Er verbindet beispielsweise: Organisation, Standorte, Kurse, Teilnehmer, Personal, Dozenten, Räume, Ressourcen, Stundenpläne, Termine, Aufgaben, Prüfungen, Anwesenheit, Dokumente, Commercial-Status, operative Ereignisse.

Der Twin ist keine Persönlichkeitsanalyse.

Unzulässig: Emotionserkennung, biometrische Analyse, Persönlichkeitsbewertung, Psychoprofiling, Peer-Ranking von Lernenden, versteckte soziale Bewertungen.

---

## 46. LEARNER TWIN

Für einen einzelnen Lernenden darf nur dessen eigener zulässiger Lernkontext verwendet werden.

Keine Peer-Daten. Keine Vergleichsansicht, die fremde personenbezogene Leistungsdaten offenlegt.

Zulässige Ziele: eigene Termine, eigene Aufgaben, eigener Lernfortschritt, eigene offene Punkte, persönliche Hinweise.

---

## 47. SCENARIO ENGINE

Education OS soll Änderungen simulieren können.

Beispiele: Dozent fällt aus, Raum fällt aus, neuer Kurs beginnt, Teilnehmerzahl verändert sich, Stundenplan muss verschoben werden, Prüfung wird verlegt, Ressource ist nicht verfügbar, Organisationsstruktur ändert sich.

Scenario Engine:

1. Ausgangszustand erfassen
2. gewünschte Änderung modellieren
3. Auswirkungen berechnen
4. Konflikte erkennen
5. Alternativen erzeugen
6. Auswirkungen erläutern
7. Entscheidung ermöglichen
8. erst danach Änderung durchführen

---

## 48. AUTOPILOT

Das Ziel ist weitgehende Vollautomation.

Aber: Vollautomation bedeutet nicht unkontrollierte Vollmacht.

Standardzyklus:

Observe → Detect → Understand → Propose → Simulate → Risk Check → Approve if required → Execute → Verify → Audit → Learn operationally

---

## 49. AUTOPILOT-RISIKOSTUFEN

Mindestens konzeptionell unterscheiden:

**Stufe 0 – Beobachtung.** Lesen, überwachen, analysieren.

**Stufe 1 – Empfehlung.** Vorschlag erzeugen. Keine Änderung.

**Stufe 2 – sichere reversible Automation.** Beispiele: Erinnerungen, Entwürfe, Zusammenfassungen, ungefährliche organisatorische Updates, Datenqualitätsaufgaben. Nur mit klaren Guardrails.

**Stufe 3 – wichtige Änderung.** Menschliche Freigabe.

**Stufe 4 – High Risk.** Keine autonome Durchführung.

Dazu gehören insbesondere: Rollenänderungen, Berechtigungen, Plattformadministratorrechte, Zahlungsaktionen, echte finanzielle Transaktionen, offizielle Notenentscheidungen, individuelle Anwesenheitsentscheidungen, irreversible Löschung, Restore, kritische Sicherheitsänderungen.

---

## 50. AUTOPILOT – FAIL CLOSED

Jede Automation braucht: Berechtigungsprüfung, Tenantgrenze, Preconditions, Idempotency, Retrystrategie, Deduplizierung, Fehlerstatus, Audit, Verifikation.

Kann eine Automation nicht sicher bestimmen, ob eine Aktion korrekt ist: nicht ausführen.

---

## 51. CIRCUIT BREAKER

Education OS benötigt zentrale Circuit Breaker.

Bei beispielsweise ungewöhnlich hoher Fehlerrate, wiederholten gleichen Fehlern, inkonsistenten Daten, unerwartetem Tenantwechsel, Sicherheitsverletzung, fehlender Datenbasis oder unerwarteter Massenänderung muss eine Automation automatisch stoppen.

Kein endloser Retry.

---

## 52. GUARDRAILS

Jede KI-/Automationsfunktion erhält definierte Guardrails.

Mindestens: Rollen, Tenant, Objektbereich, erlaubte Aktion, verbotene Aktion, maximale Anzahl betroffener Datensätze, notwendige Zustimmung, Reversibilität, Audit, Timeout, Circuit Breaker.

Guardrails sind Serverlogik und dürfen nicht nur Prompttext sein.

---

## 53. VOLLAUTOMATION – ZIELBILD

Education OS soll langfristig möglichst viele Routineprozesse automatisch übernehmen.

Beispiele: Kunde einrichten, Daten importieren, Organisation erkennen, Dubletten erkennen, Kursstruktur vorbereiten, Stundenplan importieren, Terminänderungen verteilen, Konflikte erkennen, Unterrichtsvorbereitung unterstützen, Klassenbuchentwürfe vorbereiten, Erinnerungen versenden, Aufgabenfristen überwachen, Datenqualität überwachen, Krankmeldungen vorsortieren, Dokumente zuordnen, offene Aufgaben erkennen, Managementberichte erstellen, Backups prüfen, Probleme eskalieren.

Der Mensch verwaltet primär: Ausnahmen, Freigaben und Entscheidungen.

---

## 54. MANAGEMENT BRIEFING

Education OS soll automatisch Managementzusammenfassungen erzeugen können.

Beispiele: heutige kritische Ereignisse, offene organisatorische Probleme, fehlende Dozenten, Raumkonflikte, anstehende Prüfungen, Datenqualitätsprobleme, ungewöhnlich viele Fehlzeiten, offene Freigaben, Importprobleme, Backupstatus, Systemzustand.

Keine unnötige Informationsflut. Priorisieren nach Relevanz.

---

## 55. DATA QUALITY ENGINE

Automatische Datenqualitätskontrolle.

Erkennen: fehlende Zuordnungen, ungültige Daten, Dubletten, Inkonsistenzen, verwaiste Datensätze, widersprüchliche Stundenpläne, fehlende Kurszuweisungen, ungültige Rollen, fehlende Pflichtinformationen.

Probleme als Aufgaben oder sichere Korrekturvorschläge bereitstellen.

---

## 56. FEEDBACKANALYSE

Umfragen und Feedback können ausgewertet werden.

KI darf Themen clustern, Zusammenfassungen erstellen, Trends erkennen und wiederkehrende Probleme melden.

Keine Persönlichkeitsanalyse einzelner Personen.

---

## 57. UMFRAGEN

Education OS soll Umfragen unterstützen.

Mögliche Gruppen: Teilnehmer, Dozenten, Mitarbeiter.

Mit: Vorlagen, Zeitsteuerung, Auswertung, Aggregation, Datenschutz, Export.

---

## 58. FUTURE RADAR

Die Plattform soll intern Veränderungen und Handlungsbedarf früh erkennen.

Beispiele: Kapazitätsprobleme, organisatorische Engpässe, wiederkehrende Prozessfehler, drohende Ressourcenprobleme, Datenqualitätstrends, Nutzungsprobleme.

Das ist nicht automatisch eine externe Wettbewerbsüberwachung.

Eine aktive automatisierte Wettbewerbswache ist derzeit kein zwingender Bestandteil, solange sie nicht gesondert reaktiviert wird.

---

## 59. SUCHE

Eine zentrale intelligente Suche soll Informationen innerhalb der eigenen Berechtigung auffindbar machen.

Suche über beispielsweise: Kurse, Benutzer, Termine, Dokumente, Aufgaben, Prüfungen, Räume, Ressourcen.

Nie globale Kundendaten durchsuchen, wenn der Benutzer dazu nicht berechtigt ist.

---

## 60. REPORTING

Reporting für: Tenant, Standort, Bereich, Kurs, Zeitraum, operative Vorgänge.

Berichte müssen rollen- und datenschutzkonform sein.

Managementansichten bevorzugen aggregierte Daten.

---

## 61. ACCOUNTING AUTOPILOT

Commercial-Daten können automatisiert geprüft und aufbereitet werden.

Beispiele: Angebot, Buchungsstatus, Entitlement, Subscriptionstatus, Rechnungsentwurf, Auffälligkeiten, Forecast.

Solange "PAYMENTS_ENABLED=false" gilt: keine echten Abbuchungen oder Zahlungsaktionen.

---

## 62. EMAIL-/INBOX-AUTOMATION

Eine vorgesehene E-Mail-/Inbox-Automation kann eingehende Vorgänge erkennen.

Beispiele: Krankmeldung, Dokument, organisatorische Anfrage.

Ablauf: klassifizieren → Tenant bestimmen → betroffene Person/Organisation bestimmen → Vorgang vorbereiten → ggf. Rückfrage/Freigabe → verarbeiten

Keine unkontrollierte Verarbeitung unbekannter Nachrichten.

Keine verdeckte Abhängigkeit von Gmail oder Google für den produktiven Kern.

---

## 63. EINRICHTUNGSASSISTENT

Der Kundenadmin erhält einen intelligenten Setup-Assistenten.

Dieser soll erkennen: welche Grunddaten fehlen, welche Imports sinnvoll sind, welche Module eingerichtet werden müssen, welche Einstellungen noch fehlen, ob Kurs-/Personal-/Raumstruktur plausibel ist.

Ziel: möglichst schnell vom Vertragsabschluss zum einsatzfähigen Portal.

---

## 64. JAHRESGRUNDPLAN

Education OS soll aus vorhandenen Daten einen Jahresgrundplan unterstützen.

Dazu können gehören: Kurszeiträume, Ferien, Feiertage, Praxisphasen, Prüfungsphasen, Unterrichtsblöcke, organisatorische Termine.

Der Plan bildet die Basis für weitere automatische Planung.

---

## 65. RÄUME UND RESSOURCEN

Räume und Ressourcen sind eigene verwaltbare Objekte.

Informationen: Standort, Kapazität, Typ, Verfügbarkeit, Ausstattung, Sperrzeiten.

Planung darf keine offensichtlich unmöglichen Doppelbelegungen erzeugen.

---

## 66. DEMO-/TESTTENANTS

Es soll reproduzierbare Demo-/Testfixtures geben.

Testdaten müssen vollständig fiktiv, intern konsistent, groß genug für realistische Tests und frei von echten Kundendaten sein.

Testfälle sollen auch große Bildungsträger simulieren.

Beispielgrößenordnung: mehrere Standorte, mehrere Fachbereiche, mindestens 20 Kurse, etwa 180 Teilnehmer, etwa 30 Beschäftigte/Dozenten, mindestens 15 Räume/Ressourcen, mehrere vollständige Stundenplanwochen.

---

## 67. SECURITY – GRUNDGESETZ

Security darf niemals zugunsten einer kurzfristig grünen Pipeline reduziert werden.

Verboten: Auth abschalten, WAF abschalten, Rollenprüfungen abschalten, Step-up umgehen, CSRF/Origin-Schutz entfernen, Tenantfilter entfernen, Payment Freeze umgehen, Backup-Gates deaktivieren, Test nur deshalb ändern, damit ein Bug "verschwindet".

---

## 68. AUTHENTIFIZIERUNG

Anforderungen: sichere Passwortverarbeitung, keine Klartextpasswörter, individuelle Salts, aktueller freigegebener Password-KDF, sichere Sessiontokens, nur sichere Tokenrepräsentation serverseitig, "HttpOnly", "Secure", angemessene SameSite-Regel, Sessionablauf, Logoutinvalidierung.

Bestehende sichere KDF-Implementierung niemals auf eine schwächere Variante zurückstufen.

---

## 69. LOGIN-SCHUTZ

Login benötigt: Rate Limiting, Brute-Force-Schutz, sichere Fehlermeldungen, keine unnötige User Enumeration.

---

## 70. STEP-UP AUTHENTICATION

High-Risk-Aktionen erfordern erneute Authentifizierung.

Mindestens vorgesehen für: Produktionsfreigabe, kritische Sicherheitsaktionen, Restore, irreversible Löschung, besonders sensible Betreiberaktionen.

---

## 71. API-SICHERHEIT

Jede mutierende API benötigt: Authentifizierung, Autorisierung, Tenantprüfung, Eingabevalidierung, sichere Fehlerbehandlung, geeigneten Same-Origin-/CSRF-Schutz.

SQL ausschließlich parametrisiert.

Keine ungefilterten SQL-Fehler an Browser zurückgeben.

---

## 72. XSS / CSP / CONTENT SECURITY

Benutzerinhalte dürfen kein ausführbares HTML/JavaScript einschleusen.

CSP und weitere Browser-Sicherheitsmechanismen dürfen nicht ohne zwingenden Grund gelockert werden.

---

## 73. AUDIT LOG

Sicherheits- und Verwaltungsaktionen müssen nachvollziehbar sein.

Auditdatensatz enthält soweit sinnvoll: Zeitpunkt, Actor, Tenant, Objekt, Aktion, Ergebnis, Kontext.

Keine Secrets und keine Roh-Tokens ins Auditlog.

---

## 74. OBSERVABILITY

Systemfehler müssen diagnostizierbar sein.

Erforderlich: strukturierte Fehlercodes, Request-/Correlation-ID, Stage-Information, technische Logs ohne Geheimnisse, nachvollziehbare Automationsläufe.

Browser bekommt sichere öffentliche Fehlercodes.

Interne Logs enthalten ausreichend Informationen zur Fehleranalyse, aber keine Passwörter oder Einrichtungs-Roh-Tokens.

---

## 75. FEHLERBEHANDLUNG

Keine generische Catch-All-Struktur, die jeden Fehler unsichtbar zu "Etwas ist schiefgelaufen" reduziert.

Es soll stabile Fehlerklassen geben, z. B.: Validation, Authentication, Authorization, Tenant boundary, Schema, Provisioning, Commerce, Finalization, Recovery, Integration.

Technische Details bleiben intern.

---

## 76. PERFORMANCE

Performance ist Produktanforderung.

Nicht akzeptabel: extrem langsame Plattformadminseiten, minutenlange Dozentenansichten, blockierende Requests, unnötige Volltabellenabfragen, hunderte Requests pro Ansicht, dauernde Re-Renders.

Überprüfen: D1-Indizes, Querypläne, N+1, API-Anzahl, Payloadgröße, Caching, Rendering, Lazy Loading, Pagination.

---

## 77. MOBILE

Commercial muss real mobil funktionieren. Nicht nur responsive Screenshots.

Browser-E2E testet reale Touch-/Mobile-Viewports.

Prüfen: Buttons, Dialoge, Tabellen, Navigation, Formulare, Touchflächen, Modals, horizontales Scrollen, Overflow, Tastatur, Fokus.

Dokumentweiter horizontaler Overflow ist ein Fehler.

---

## 78. ACCESSIBILITY

Oberflächen sollen nach modernen Accessibility-Prinzipien aufgebaut sein.

Mindestens: semantisches HTML, Labels, Tastaturbedienung, sichtbarer Fokus, sinnvolle ARIA-Nutzung, ausreichende Bedienflächen, verständliche Fehlermeldungen.

---

## 79. PWA / BROWSER-RUNTIME

Soweit PWA-/Service-Worker-Funktionen vorhanden sind, müssen sie Updates sauber behandeln, keine veralteten Assets dauerhaft ausliefern, keine E2E-Fehler verursachen und Netzwerkabbrüche robust behandeln.

---

## 80. DATA PORTABILITY

Jeder Kunde muss seine Daten exportieren können.

Exports dürfen nicht an proprietären internen Strukturen hängen bleiben.

Originaldokumente gehören zum Portabilitätskonzept.

---

## 81. SICHERHEITSBACKUP VOR RISIKOAKTIONEN

Vor riskanten Massenänderungen, Restore oder Migrationen muss geprüft werden, ob ein belastbares aktuelles Backup vorhanden ist.

---

## 82. MIGRATIONEN

Migrationen sind: forward-only, reproduzierbar, idempotent soweit möglich, datenverlustfrei, historienkompatibel.

Bereits produktiv ausgeführte Migrationen dürfen nicht nachträglich "korrigiert" und als Reparatur verstanden werden.

Benötigt Produktion eine Änderung: neue Migration.

---

## 83. AUTOMATIONS-ENGINEERING

Automationen brauchen: deterministische IDs oder Idempotency Keys, Deduplication, Retry Limits, Backoff, Dead-/Failure-State, Status, Audit, Recovery, Timeout, Circuit Breaker.

---

## 84. TRANSAKTIONALE KONSISTENZ

Mehrstufige Prozesse wie Tenantanlage, Onboarding, Imports, Entitlements und Buchungen müssen atomar oder kompensierbar sein.

Keine halb angelegten Zustände.

---

## 85. DATENVERLUST = RELEASE BLOCKER

Jeder reproduzierbare oder plausible Pfad für stillen Datenverlust ist ein Release Blocker.

---

## 86. EDUCATION-OS-SICHERHEITSGRENZEN

Verbindlich verboten: Peer-Daten im Learner Twin, Emotionserkennung, Biometrie, Persönlichkeitsbewertung, unkontrollierte Rollenänderung durch KI, unkontrollierte Berechtigungsänderung, autonome Zahlungen, autonome offizielle Notenänderung, autonome individuelle Anwesenheitsentscheidungen, unkontrollierter Restore, autonome irreversible Löschung.

---

## 87. HUMAN-IN-THE-LOOP

Bei kritischen Aktionen gilt: KI erzeugt Analyse, Simulation, Begründung und Änderungsvorschlag. Der Mensch entscheidet.

---

## 88. ERKLÄRBARKEIT

Automationen müssen erklären können: warum etwas erkannt wurde, welche Daten verwendet wurden, welche Regel gegriffen hat, welche Änderung vorgeschlagen wird, welche Auswirkungen erwartet werden.

Keine Blackbox-Massenänderung.

---

## 89. DATENQUALITÄT VOR AUTOMATION

Schlechte Daten dürfen nicht automatisch in noch größere Fehler übersetzt werden.

Bei unzureichender Datenqualität: stoppen, melden, Korrektur vorschlagen.

---

## 90. FEATURE FLAGS

Module können tenantbezogen aktiviert/deaktiviert werden.

Feature Flags sind serverseitig durchzusetzen.

Ein versteckter Button reicht nicht als Modulschutz.

---

## 91. ENTITLEMENTS

Commercial-Plan und gekaufte Optionen bestimmen, welche Module verfügbar sind.

Entitlements müssen technisch getrennt von bloßer UI-Darstellung sein.

---

## 92. UPSELL

Geeignete nicht gebuchte Module können als Upgradeoption sichtbar sein.

Dabei: keine manipulative UX, klare Beschreibung, klare Kosten, keine automatische Buchung.

---

## 93. CUSTOM DOMAIN

Custom Domains benötigen: saubere Tenantzuordnung, HTTPS, Auth-/Session-Kompatibilität, Originprüfung, sichere Fehlerbehandlung.

Keine Domain darf auf falschen Tenant auflösen.

---

## 94. BACKOFFICE / OWNER EXPERIENCE

Plattformadmin benötigt eine schnelle zentrale Betreiberoberfläche.

Sie soll nicht aus dutzenden schwer auffindbaren Einzelwerkzeugen bestehen.

Wichtige Informationen: Kundenstatus, Onboarding, Probleme, Angebote, Trials, Commercial, Domain, Backup, Sicherheit, Readiness, Systemstatus.

---

## 95. CUSTOMER EXPERIENCE

Ein neuer Kunde soll möglichst ohne technisches Wissen starten können.

Ideal:

1. Angebot annehmen
2. Einrichtungslink öffnen
3. wenige Kerninformationen ergänzen
4. bestehende Unterlagen hochladen
5. automatisch erzeugte Struktur überprüfen
6. Portal verwenden

---

## 96. NICHT ALLES MANUELL KONFIGURIEREN

Wenn etwas aus bestehenden Daten ableitbar ist, soll es nicht erneut abgefragt werden.

Beispiel: Steht der Kundenname bereits im akzeptierten Angebot, darf das Onboarding ihn übernehmen.

---

## 97. KEINE DOPPELTE DATENERFASSUNG

Daten einmal erfassen und systemweit weiterverwenden.

---

## 98. REALISTISCHE ENDE-ZU-ENDE-TESTS

Tests dürfen nicht nur einzelne Funktionen isoliert prüfen.

Realistische Customer Journeys testen.

Beispiel:

Plattformadmin → Angebot → Kunde akzeptiert → Onboarding → Tenant entsteht → Admin loggt sich ein → Organisation importieren → Kurs erstellen → Teilnehmer importieren → Dozent zuordnen → Stundenplan → Unterricht → Aufgabe → Prüfung → Bericht → Backup → Export

---

## 99. ROLLEN-E2E

Separat testen: Plattformadmin, Tenant-Admin, Bereichsrolle, Dozent, Klassenadmin, Teilnehmer, Gast.

Und für jede Rolle versuchen, verbotene Daten direkt über APIs abzurufen.

---

## 100. SECURITY NEGATIVE TESTING

Nicht nur Happy Path.

Testen: fremde Tenant-ID, fremde Kurs-ID, manipulierte IDs, abgelaufene Session, falsche Rolle, fehlender Origin, Replay, doppelter Request, parallele Requests, abgebrochene Prozesse, Race Conditions, historische Datenbankschemata, ungültige Dateien, übergroße Eingaben.

---

## 101. IMPORT TESTING

Testen: leere Datei, fehlerhafte Spalten, umbenannte Spalten, mehrere Standorte, mehrere Klassen, Dubletten, Unicode, sehr große Datei, teilweise fehlende Daten, widersprüchliche Zuordnungen.

---

## 102. CONCURRENCY

Race Conditions explizit testen.

Besonders: Onboarding, Einladung, Claim, Revoke, Expiry, Booking, Imports, Restore, Rollenänderungen.

---

## 103. CURRENT ONBOARDING QUALITY BAR

Bestehende produktive Einrichtungslinks sind ein verpflichtender Acceptance Case.

Es reicht nicht: "Ein frisch erzeugter Testlink funktioniert auf einer frischen lokalen D1."

Das System muss auch mit realhistorischem Produktionsschema funktionieren.

Ein Onboarding-POST darf nicht in einem nichtssagenden "ONBOARDING_ACTIVATION_FAILED" verschwinden, ohne serverseitig den tatsächlichen Aktivierungsabschnitt feststellen zu können.

Einrichtungsflow muss zuverlässig: claimen, provisionieren, Commercial-Kontext anwenden, finalisieren, Single Use sichern, bei Fehler kompensieren.

---

## 104. TESTS MÜSSEN PRODUKTIONSDRIFT ABDECKEN

Frische lokale Datenbanken maskieren historische Probleme.

Daher Tests für: Original-/alte Migrationszustände, neue Zustände, additive Schemaänderungen, bereits teilweise migrierte Systeme, Recovery nach fehlgeschlagener Aktivierung.

---

## 105. KEINE FAKE-GRÜNEN TESTS

Tests dürfen nicht: nur Strings prüfen obwohl Runtime falsch ist, kritische APIs mocken obwohl Produktionsintegration geprüft werden soll, Assertions entfernen um Pipeline grün zu machen, Fehler ignorieren.

---

## 106. RELEASE-GATES

Kein Commercial-Release gilt als akzeptiert, solange nicht alle Pflichtgates auf dem exakt gleichen finalen Commit grün sind.

Verbindlich sind insbesondere:

1. Education OS Release Gate
2. Education OS Deep Security
3. Education OS Privacy & Storage Security
4. Education OS Circuit Breaker
5. Klassenportal CI
6. Commercial Browser E2E inklusive Mobile

Die konkreten Workflow-Namen im Repository sind maßgeblich.

---

## 107. RELEASE-REGEL

Verbindlicher Ablauf:

Finaler Branch/PR → exakter finaler SHA → 6/6 Pflichtgates grün → Merge → Main → produktive Cloudflare-Migrationen → produktiver Worker Build/Deploy → exakten ausgelieferten Commit/Version nachweisen → Live Smoke → versionsgebundene Produktionsfreigabe

Kein roter Merge.

---

## 108. PRODUKTIONSFREIGABE

Die explizite Plattformbetreiberfreigabe ist versionsgebunden.

Sie benötigt: aktuellen Passwort-Step-up und exakt die vorgesehene Bestätigung "LIVE FREIGEBEN".

Eine Freigabe für eine alte Worker-Version gilt nicht für eine neue Version.

---

## 109. KEINE PRODUKTIONS-CREDENTIALS IN CI

Plattformadministrator-Passwörter gehören niemals ins Repository, in PR-Kommentare, in Testfixtures oder in normale CI-Logs.

---

## 110. PAYMENT-FREEZE-GATE

Jeder Release muss beweisen, dass reale Zahlungsverarbeitung weiterhin deaktiviert ist, solange dies Produktvorgabe ist.

---

## 111. VFA-DRIFT-GATE

Commercial-Release darf keine Änderungen am getrennten VFA-System verursachen.

---

## 112. BROWSER-E2E

Browser-E2E muss Desktop und mobile Touch-Viewports prüfen.

Mindestens: Plattformzugang, Plattformadmin, Onboarding, Kundenadmin, Produkt, Dozentenportal, Teilnehmerportal, Fehler in Browserkonsole, Serverfehler, horizontales Overflow, kritische Dialoge.

---

## 113. LOGICAL TESTING

Nicht nur technische HTTP-200-Tests.

Beispiel: Wenn Kalenderbearbeitung erfolgreich antwortet, danach prüfen: existiert weiterhin nur ein Termin? wurden die Werte wirklich geändert? zeigt Kalender die Änderung? zeigt Detailansicht dieselbe Änderung?

---

## 114. PRODUKTQUALITÄT

Jede Seite kritisch prüfen auf: Sinn, Vollständigkeit, UX, Navigation, fehlende Funktionen, tote Buttons, nicht gespeicherte Daten, falsche Rollen, falsche Texte, mobile Darstellung, Geschwindigkeit, Fehlerzustände, leere Zustände.

---

## 115. DEAD BUTTONS SIND RELEASE BLOCKER

Ein sichtbarer Button muss funktionieren oder darf nicht erscheinen.

---

## 116. SILENT SAVE FAILURE IST RELEASE BLOCKER

Wenn UI "gespeichert" signalisiert, müssen Daten nach Reload tatsächlich vorhanden sein.

---

## 117. LEERE OBERFLÄCHEN

Leere Bereiche brauchen sinnvolle Empty States.

Nicht einfach weiße Flächen oder unverständliche Leerseiten.

---

## 118. RESPONSIVE DESIGN

Desktop, Tablet und Smartphone.

Nicht nur CSS-Breakpoints, sondern reale Bedienbarkeit.

---

## 119. DESIGN

Modernes professionelles B2B-SaaS.

Keine zusammengestückelte Adminoberfläche.

Konsistent: Typografie, Abstände, Buttons, Dialoge, Statusanzeigen, Tabellen, Karten, Navigation.

---

## 120. PROGRESSIVE DISCLOSURE

Komplexe Funktionen nicht ungefiltert auf jeden Nutzer werfen.

Jede Rolle sieht primär das, was sie benötigt.

---

## 121. PERMISSION-AWARE UI

UI darf verbotene Aktionen nicht anbieten.

Aber serverseitige Kontrolle bleibt trotzdem erforderlich.

---

## 122. SYSTEM HEALTH

Plattformbetreiber sollte zentral erkennen können: Datenbankstatus, Storage, Backup, Migrationen, Automationen, Fehler, Integrationen, kritische Kundenprobleme — ohne Kundendaten unnötig offenzulegen.

---

## 123. RELEASE READINESS

Eine Release-Readiness-Ansicht darf nicht nur statische Flags anzeigen.

Sie muss echte technische Zustände validieren.

Beispiele: Tabellen vorhanden, notwendige Spalten, Trigger, EU-Bindings, Backup, Payment Freeze, Migrationen, Production Lock, Education OS Guardrails.

---

## 124. FAIL-CLOSED READINESS

Kann ein kritischer Zustand nicht zuverlässig bestätigt werden: nicht releasebereit.

---

## 125. KEINE ERFUNDENE COMPLIANCE

Keine falschen Behauptungen wie "vollständig DSGVO-zertifiziert", "rechtssicher" oder "zertifiziert", wenn dies nicht tatsächlich nachgewiesen ist.

Technische Maßnahmen sauber dokumentieren.

---

## 126. KEINE ERFUNDENE PROVIDER-KONFIGURATION

Keine Annahme, dass externe Provider automatisch korrekt konfiguriert sind.

Tatsächliche Konfiguration prüfen.

---

## 127. PARALLELISIERUNG

Arbeite möglichst parallel, solange keine Daten-/Branch-/Deployment-Races entstehen.

Parallel möglich: Codeanalyse, Security Review, UX Review, Testanalyse, Schemaanalyse, Performanceanalyse.

Nicht parallel ausführen, wenn mehrere Prozesse dieselben produktiven Ressourcen verändern könnten.

---

## 128. KEINE MINI-BUILD-SPAMMING

Cloudflare-Buildkontingent nicht durch kleine Diagnosecommits verschwenden.

Vorgehen:

1. read-only analysieren
2. Probleme sammeln
3. lokale/statische Tests
4. Änderungen bündeln
5. einen ernsthaften Kandidaten bauen
6. Gates ausführen

Bei Gatefehlern ebenfalls mehrere zusammengehörende Korrekturen bündeln.

---

## 129. AUTONOMES ARBEITEN

Stelle nicht für jede technische Entscheidung eine Rückfrage.

Treffe normale Engineering-Entscheidungen selbst nach:

1. Sicherheit
2. Datenintegrität
3. Datenschutz
4. fachlicher Korrektheit
5. Zuverlässigkeit
6. einfacher Bedienbarkeit
7. Performance
8. Wartbarkeit
9. Kosten

Nur wirklich nicht auflösbare Produktentscheidungen müssen eskaliert werden.

---

## 130. KEINE FALSCHEN FERTIGMELDUNGEN

Wörter wie "fertig", "released", "production ready" nur verwenden, wenn sie tatsächlich technisch nachgewiesen sind.

Vorhandener Code ≠ fertig. Grüner Unit Test ≠ fertig. Grüner Preview-Build ≠ fertig. Merge ≠ fertig. Deployment ≠ fertig.

Erst reale Production Acceptance zählt.

---

## 131. DEFINITION OF DONE – EINZELFUNKTION

Eine Funktion ist erst fertig, wenn: fachlich korrekt, Rechte korrekt, Tenant-Isolation korrekt, UI vollständig, Backend vollständig, Persistenz korrekt, Fehlerzustände vorhanden, mobil geprüft, Performance akzeptabel, automatisierte Tests, negative Tests, Audit falls relevant, Dokumentation, bestehende Funktionen nicht beschädigt.

---

## 132. DEFINITION OF DONE – GESAMTPRODUKT

Commercial ist erst fertig, wenn:

- Kernflows vollständig funktionieren
- Plattformadmin funktioniert
- Kundenadmin funktioniert
- Dozentenportal funktioniert
- Teilnehmerportal funktioniert
- Rollen korrekt getrennt sind
- Onboarding real funktioniert
- Imports funktionieren
- Stundenplan funktioniert
- Kalender funktioniert
- Aufgaben funktionieren
- Prüfungen funktionieren
- Gradebook funktioniert
- Anwesenheit/Klassenbuch funktionieren
- Dokumente funktionieren
- Reporting funktioniert
- Backups funktionieren
- Restore sicher funktioniert
- Exporte funktionieren
- EU-Datenhaltung nachgewiesen ist
- Automation/Guardrails funktionieren
- Education OS Gates grün sind
- Browser-E2E grün ist
- alle 6 Pflichtgates auf demselben SHA grün sind
- Produktionsdeploy erfolgreich ist
- Live-Smoke erfolgreich ist
- reale bestehende Produktionsabläufe funktionieren

---

## 133. INNOVATIONSANSPRUCH

Das Ziel ist nicht, lediglich bestehende Schulsoftware nachzubauen.

Differenzierung entsteht insbesondere durch: Automation First, Zero-Touch Intake, Education Twin, Scenario Engine, sichere Autopiloten, intelligente Imports, Education OS, rollenbewusste KI, automatische Datenqualität, Management Briefings, Prozesssimulation, integrierte Organisation, hohe Benutzerfreundlichkeit, schnelle Einrichtung.

Das Produkt soll organisatorische Arbeit massiv reduzieren.

---

## 134. PRODUKTPRINZIP

Frage bei jeder Funktion: "Warum muss ein Mensch das manuell machen?"

Wenn ein Vorgang sicher automatisierbar ist: automatisieren.

Wenn er teilweise automatisierbar ist: vorbereiten.

Wenn er riskant ist: simulieren und zur Freigabe vorlegen.

Wenn er kritisch und nicht sicher kontrollierbar ist: nicht automatisieren.

---

## 135. ABSCHLIESSENDER ARBEITSAUFTRAG

Analysiere das komplette Repository von A bis Z. Nicht nur Dateien mit offensichtlichen Namen.

Prüfe: Architektur, Datenbank, Migrationen, APIs, Frontend, Rollen, Tenant-Isolation, Auth, Sessions, Sicherheit, CSP, Rate Limits, Uploads, Imports, Exporte, Backups, Restore, R2, D1, EU, Onboarding, Commercial, Payment Freeze, Plattformadmin, Kundenadmin, Klassenadmin, Teilnehmer, Dozentenportal, Stundenplan, Kalender, Aufgaben, Prüfungen, Gradebook, Anwesenheit, Klassenbuch, Lesson Hub, Dokumente, Reporting, Integrationen, SSO, SCIM, API, Custom Domains, i18n, Mobile, Accessibility, Performance, Education Twin, Scenario Engine, AI, Autopilot, Guardrails, Circuit Breaker, Automation, Datenqualität, Management Briefing, Accounting Autopilot, Email-/Inbox-Automation, Setup Assistant, Jahresgrundplanung, Feature Flags, Entitlements, Tests, CI, Release, Production Acceptance.

Suche aktiv nach: kaputten Buttons, unvollständigen Workflows, fehlenden Persistenzen, falschen Rollen, Tenant-Leaks, Race Conditions, historischen Schemafehlern, falschen Migrationen, ungenutztem Altcode, widersprüchlichen Implementierungen, Sicherheitslücken, Performanceproblemen, UX-Problemen, Mobile-Problemen, fehlenden Tests, falschen Tests, nicht erfüllten Produktversprechen, Features die zwar Code haben aber praktisch nicht nutzbar sind.

---

## 136. ARBEITSMETHODE

Erstelle intern eine vollständige Gap-Matrix:

Anforderung | aktueller Stand | Beweis | Problem | Risiko | benötigte Änderung | Test

Priorität:

**P0:** Security, Datenschutz, Datenverlust, Tenant-Leak, Produktion kaputt.

**P1:** Kernworkflow nicht nutzbar.

**P2:** Funktion unvollständig oder stark fehlerhaft.

**P3:** UX, Performance, Polish.

Arbeite P0 → P1 → P2 → P3.

Unabhängige Arbeiten parallelisieren.

---

## 137. KEIN FEATURE-CHAOS

Bevor neue große Features gebaut werden: prüfen, ob bestehende Kernfunktionen wirklich funktionieren.

Keine neue Innovation darf dazu führen, dass Kernprozesse dauerhaft rot bleiben.

---

## 138. TECHNISCHE SCHULDEN

Identifiziere: doppelte Implementierungen, Legacy-Workarounds, Migration Drift, veraltete API-Versionen, widersprüchliche Rollenlogik, nicht standardisierte Fehlercodes, fehlende Indizes, übergroße Dateien, unnötige Abhängigkeiten, tote Features.

Bereinige kontrolliert.

---

## 139. TESTABDECKUNG

Für kritische Funktionen mindestens: Unit, Integration, Security Negative, Role Boundary, Tenant Boundary, Concurrency, Migration Compatibility, Browser E2E.

---

## 140. PRODUKTIONSNAHE TESTS

Local Fresh D1 ist nicht ausreichend.

Testsimulationen müssen historische Produktionszustände abdecken.

---

## 141. KEINE DESTRUKTIVE PRODUKTIONSREPARATUR OHNE BEWEIS

Keine Tabellen löschen/rebuilden, nur um Schema einfacher zu machen.

Vor Datenmigration: Zustand prüfen, Backup, Transformation, Verifikation.

---

## 142. SECURITY REVIEW VOR MERGE

Vor Release prüfe mindestens: Auth, Authz, Tenant Boundary, Privilege Escalation, Injection, XSS, CSRF, Session, Upload, Secrets, Logging, Sensitive Data, Automation Boundary.

---

## 143. PERFORMANCE REVIEW VOR MERGE

Besonders: Plattformadmin, Dozentenportal, Teilnehmerportal, große Tenant-Datensätze, Kalender, Stundenplan, Reporting, Suche.

---

## 144. UI REVIEW VOR MERGE

Desktop + Mobile.

Keine sichtbare Funktion darf offensichtlich tot, unlesbar oder unbedienbar sein.

---

## 145. POST-DEPLOY

Nach produktivem Deploy: Version prüfen, Migration prüfen, DB-Binding prüfen, R2-Binding prüfen, zentrale APIs, Login, Plattformadmin, Onboarding, Customer Flow, Payment Freeze, Mobile Smoke, Fehlerlogs.

---

## 146. PRODUKTIONSSTATUS NICHT SCHÖNREDEN

Wenn noch ein Gate rot ist: nicht ready.

Wenn Onboarding noch scheitert: nicht ready.

Wenn Production Smoke scheitert: nicht ready.

---

## 147. KOMMUNIKATION

Keine langen Statusmeldungen bei jedem kleinen Arbeitsschritt.

Arbeite selbständig.

Melde primär: echten Blocker den du nicht selbst lösen kannst, notwendige Betreiberaktion, notwendige Produktionsfreigabe, endgültiges nachgewiesenes Ergebnis.

---

## 148. VERBINDLICHES ZIEL

Am Ende soll ein Bildungsträger das System öffnen und denken:

"Das System organisiert unseren Betrieb mit uns – wir verwalten nicht das System."

Ein neuer Kunde soll schnell startklar sein.

Ein Teilnehmer soll sofort verstehen, was er heute tun muss.

Ein Dozent soll seinen Arbeitstag aus einer zentralen Oberfläche steuern können.

Ein Kundenadmin soll nicht ständig Daten nachpflegen müssen.

Ein Betreiber soll die Plattform sicher und skalierbar verwalten können.

Education OS soll Probleme erkennen, bevor sie zu manueller Feuerwehrarbeit werden.

---

## 149. QUALITÄTSMASSSTAB

Arbeite auf Senior-/Principal-Engineering-Niveau.

Nicht "funktioniert irgendwie", sondern: korrekt, robust, sicher, nachvollziehbar, skalierbar, performant, wartbar, intuitiv, automatisierbar, testbar, produktionsfähig.

---

## 150. LETZTE REGEL

Treffe keine Fertigmeldung aufgrund von Annahmen. Beweise den Zustand.

Vor Inbetriebnahme sind Testmandanten zu entfernen und Konten zurückzusetzen, soweit sinnvoll. Das ist eine ausdrücklich zu bestätigende Betreiberaktion, keine autonome Automation.

Der endgültige Maßstab lautet:

Real customer journey → real production → correct data → correct permissions → correct persistence → correct automation → no security regression → no EU regression → no payment regression → no VFA regression → 6/6 Gates → Live Smoke → versionsgebundene Freigabe.

Erst dann ist Klassenportal Commercial tatsächlich releasebereit.
