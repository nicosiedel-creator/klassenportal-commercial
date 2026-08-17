# Klassenportal Commercial – Release-/Vermarktungsstand 17.08.2026

## Schutzregel
Das produktive VFA13-Portal liegt außerhalb dieses Repositories und wird nicht verändert.

## Release Candidate
- Release-Branch: `block3-onboarding-managed-setup`
- PR #16 gegen `main`
- Plattform-Admin hat einen eigenen direkten Login unter `/plattform-admin`.
- Kunden-, Klassen- und Plattformrollen bleiben serverseitig getrennt.
- Aktueller Branch muss vor Merge/Produktion vollständig grün sein; jede neue Produktions-Worker-Version wird bis zur ausdrücklichen Eigentümerfreigabe wieder gesperrt.

## Angebots- und Verkaufsprozess – umgesetzt
- eigener Plattformbereich `Angebote`
- fortlaufende Angebotsnummern
- Entwurf, Freigabe/Versand, Annahme, Ablauf und Stornierung
- Kundendaten und vollständige Anschrift im Angebot
- Tarif und Klassen-/Kursanzahl
- monatliche oder jährliche Abrechnung
- Managed-Setup-Auswahl
- freier individueller Monatspreis
- freier individueller Einrichtungspreis
- Rabatt auf laufenden Preis: Prozent oder fester EUR-Betrag
- Rabatt auf Einrichtung: Prozent oder fester EUR-Betrag
- Live-Preisvorschau
- öffentlicher, nicht erratbarer Angebotslink; serverseitig wird nur der SHA-256-Hash des Tokens gespeichert
- Linkrotation macht den vorherigen Angebotslink ungültig
- Druckansicht / Speichern als PDF über den Browser
- direkte Angebotsannahme mit ausdrücklicher Einbeziehung von AGB und AVV
- Annahme speichert die genaue Version von AGB, AVV und Datenschutz
- aus einem angenommenen Angebot wird ein Einrichtungslink erzeugt; der Plattform-Admin kann ihn sicher neu ausstellen
- Angebot kann über die konfigurierte Transaktions-E-Mail direkt versendet werden; bei Mailfehler bleibt ein gültiger kopierbarer Link erhalten

### Preisbindung
Ein angenommener Sonderpreis/Rabatt wird als Snapshot eingefroren. Das Onboarding berechnet ihn nicht neu. Beim späteren Stripe-Checkout wird bei individuellen Konditionen exakt dieser Preis über eine isolierte Stripe-Price-Data-Position verwendet; der gemeinsame Tarifkatalog wird dadurch nicht verändert.

## Pilotbetrieb – umgesetzt
- Angebotstyp `Kostenloser Pilot / Testbetrieb`
- Standardvorschlag: 90 Tage
- frei wählbare Pilotdauer 1–365 Tage
- frei wählbares Klassen-/Kurskontingent
- Standardvorschlag für anschließenden Lese-/Exportzeitraum: 14 Tage
- Preis wird technisch auf 0 EUR gezwungen
- keine Zahlungsart erforderlich
- keine automatische Umwandlung in ein kostenpflichtiges Abonnement
- Datenbank-Sicherheitsregeln verhindern eine automatische kostenpflichtige Pilotkonvertierung
- eine spätere kostenpflichtige Nutzung benötigt eine neue ausdrückliche Buchungsentscheidung

Damit kann insbesondere ein dreimonatiger Pilot bei einem Bildungsträger angeboten werden, ohne dass nach drei Monaten automatisch Kosten entstehen.

## Recht & Datenschutz – integriert
Die Plattform erzeugt die Rechtsseiten selbst; es werden keine externen Platzhalter-URLs mehr benötigt.

Verfügbare Seiten:
- `/impressum`
- `/datenschutz`
- `/agb`
- `/avv`
- `/unterauftragsverarbeiter`
- `/datenportabilitaet`
- `/rechtsverstoss-melden`

Der Plattformbereich `Recht & Datenschutz` verwaltet Anbieteridentität und rechtliche Angaben an einer Stelle. Solange Pflichtangaben fehlen oder die Veröffentlichung nicht ausdrücklich aktiviert ist, bleiben Rechtsdokumente und Angebotsfreigabe gesperrt.

Erforderliche echte Anbieterangaben dürfen nicht erfunden werden: tatsächlicher Anbieter/Firma, Rechtsform, Inhaber/Vertretung, ladungsfähige Anschrift und Anbieter-/Support-E-Mail. Register-, USt-/Wirtschafts-ID-, DPO- und weitere Angaben werden nur eingetragen, soweit sie tatsächlich zutreffen.

### AGB
B2B-only; individuelle Angebote haben Vorrang. Regeln u. a. zu Vertragsschluss, Sonderpreisen/Rabatten, Pilot ohne Auto-Abo, Leistungsumfang, Kundenpflichten, Minderjährigen-/Teilnehmerdaten, Abrechnung, Laufzeit/Kündigung, Data-Act-Wechsel/Export, Datenschutz/AVV, IP, Gewährleistung, Haftung, Unterauftragnehmern und Änderungen.

### Datenschutz
Trennt eigene Verantwortlichkeit für Interessenten-/Vertrags-/Abrechnungs-/Sicherheits-/Supportdaten von Auftragsverarbeitung für fachliche Kunden-/Klassen-/Teilnehmerdaten. Cloudflare, Resend und Stripe werden entsprechend ihrer tatsächlichen Rolle beschrieben; Microsoft-Integrationen sind optional.

### AVV
Enthält Gegenstand/Dauer, Art/Zweck, Datenarten, Betroffenengruppen, Weisungen, Vertraulichkeit, TOM, Unterauftragsverarbeiter, Drittlandtransfer, Unterstützung, Datenschutzverletzungen, Audits und Rückgabe/Löschung. Art.-9-Daten sind ausdrücklich nicht Standardzweck und benötigen bei tatsächlicher Nutzung eine geeignete Rechtsgrundlage/zusätzliche Schutzmaßnahmen.

### Rechtswidrige Inhalte
Es existiert ein vorsorglicher Meldeweg mit validiertem Formular, Rate-Limit, Speicherung des Vorgangs und – bei konfigurierter Transaktions-E-Mail – Benachrichtigung des Rechts-/Supportkontakts plus Eingangsbestätigung.

## Öffentliche Produktseite – umgesetzt
- Route `/produkt`
- Funktionen und Automationsprinzip erklärt
- Pilot-/Angebots-CTA
- zeigt nur Tarife, deren `pricing_enabled=1` vom Plattform-Admin ausdrücklich freigegeben wurde
- keine hart codierten veraltbaren Listenpreise in der Marketingseite
- Sonderpreise/Rabatte bleiben über individuelle Angebote möglich
- Produktseite und Preis-API bleiben in Produktion hinter dem versionsgebundenen Release-Gate, bis die jeweilige Worker-Version freigegeben wurde

## Technische Sicherheit / Betrieb
Bereits vorhanden:
- Mandanten-/Klassentrennung
- serverseitige Rollen-/Berechtigungsprüfung
- sichere Passwort-Hashes und transparenter Upgradepfad
- kurze Eigentümersitzungen, MFA/Recovery
- CSRF-/Origin-Schutz
- Auditprotokoll
- automatisierte Backups, Verifikation und Restore-Sicherheitsablauf
- Voll-Export, Vertragsende-/Löschworkflow
- Stripe fail-closed Payment Lifecycle
- Custom-Domain-Verifikation
- Runtime-Schema-Guards für migrationskritische Angebots-/Rechtsfunktionen
- versionsgebundene Produktionsfreigabe

## Automatisierte Abnahme
Der aktuelle Abschlusslauf muss grün umfassen:
- TypeScript Build
- Browser-JavaScript-Syntax
- komplette automatisierte Test-Suite
- Rollen-/Security-Tests
- Billing Lifecycle
- Angebots-/Pilotregressionen
- Owner Security
- Custom Domains
- Launch Readiness / Rechtsunterlagen
- Production Release Gate
- Portal UX / Privacy
- Forced Password Flow
- Restore Safety
- lokale Ausführung aller D1-Migrationen

## Was technisch nicht erfunden oder aus GitHub heraus gesetzt werden darf
Diese Punkte sind externe Produktionskonfiguration und bleiben bis zur Eingabe der realen Werte fail-closed:
1. endgültige Produktionsdomain und `APP_ORIGIN`
2. echte Anbieter-/Impressumsdaten und ausdrückliche Rechtsdokument-Freigabe
3. Stripe Live Secret Key + Webhook Secret und Live-Konfiguration
4. `OWNER_MFA_ENCRYPTION_KEY` und aktivierte Eigentümer-MFA
5. Resend-Konfiguration (`RESEND_API_KEY`, `MAIL_FROM`, verifizierte Absenderdomain)
6. aktuelle verifizierte Kundenbackups vor Produktionsfreigabe
7. Cloudflare-for-SaaS-Zugangsdaten nur dann, wenn eigene Kundendomains tatsächlich verkauft/aktiviert werden

Die Live-Freigabe muss gesperrt bleiben, solange ein erforderlicher Punkt fehlt.

## Empfohlener erster echter Pilot
Sicherer Standard:
- 90 Tage
- 0 EUR
- keine Zahlungsart
- keine automatische Verlängerung/Umwandlung
- nur vereinbarte Klassen-/Kursanzahl
- danach 14 Tage Lese-/Exportzugriff
- anschließend entweder Ende/Lösch-/Exportworkflow oder neues ausdrücklich angenommenes kostenpflichtiges Angebot

Vor dem Versand an einen echten Bildungsträger: reale Anbieterangaben veröffentlichen, AVV/Datenschutz bereitstellen, Transaktions-E-Mail konfigurieren und den konkreten Pilotumfang im Angebot prüfen.
