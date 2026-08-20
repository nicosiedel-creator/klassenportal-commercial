# Klassenportal Commercial – Education OS

Kommerzielle, mandantenfähige Bildungsbetriebsplattform für Bildungsträger, Umschulung, Berufsschule und Weiterbildung. Das Produkt wird als **ein zusammenhängendes Education OS** entwickelt; Kernfunktionen werden nicht künstlich in Basic/Pro/Premium-Pakete zerlegt. Der gebuchte Umfang skaliert vor allem mit der Anzahl der Klassen/Kurse und realen Zusatzleistungen.

## Architektur

- Cloudflare Workers + Static Assets
- Cloudflare D1 für strukturierte Daten
- Cloudflare R2 für PDFs, Originaldateien, Backups und Exporte
- serverseitige Sessions und rollenbasierte Autorisierung
- strikte `tenant_id`-/`course_id`-Trennung
- Education Twin + Scenario Lab + kontrollierter Autopilot + Future Radar + Proof Graph

## Rollen

- Plattform-Admin – getrennte Plattform-/Betriebsrolle
- Kunden-/Mandanten-Admin – verwaltet ausschließlich den eigenen Bildungsträger
- Dozent/Lehrkraft – separates Dozentenportal mit expliziter Kurszuordnung
- Klassen-/Kurs-Admin – Teilnehmer mit begrenzten zusätzlichen Klassenrechten, **keine Lehrkraft**
- Teilnehmer
- Gast

Ein Klassenadmin darf aufgrund dieser Zusatzrolle niemals individuelle Noten/Bewertungen, Fehlzeiten oder Anwesenheitsdaten anderer Teilnehmer sehen.

## Zugriffsarten pro Klasse

- öffentlich
- Link/Code
- Login
- Hybrid

## Kernfunktionen

- automatisierte Mandantenanlage und Self-Service-Einrichtung
- eigene Kundenadmins, Klassen/Kurse und Delegation zulässiger Klassenaufgaben
- Branding: Portalname, Logo, Farben, Willkommenstext, Domain/White-Label-Vorbereitung
- mandantenbezogene Funktions-/Modulkonfiguration ohne künstliche Produktpaket-Grenzen
- Benutzer-, Rollen- und Dozenten-Kurs-Zuordnung
- Stundenplan, Jahresgrundplan, Aufgaben, Termine, Meldungen, Links und Lernmaterialien
- Klassenbuch-/Anwesenheitsprozesse im vorgesehenen Rollen- und Freigabemodell
- Prüfungen, Lernfortschritt und kontrollierte Sichtbarkeit
- Teilnehmer-Abwesenheitsmeldungen ohne notwendige Diagnose-/Gesundheitsfreitexte
- Klassen-/Kurschat und rollen-/datenschutzabhängige Kommunikation
- Microsoft-Teams-Integration für Unterrichts-/Kalenderbesprechungen, sofern der Kundenmandant die nötigen Microsoft-365-Lizenzen, Richtlinien und Graph-/Adminfreigaben bereitstellt
- CSV-/Excel-/PDF-Importe mit Vorschau/Validierung und konfliktbewusster Übernahme
- CSV-/Excel-/PDF-Export
- kompletter Mandantenexport inklusive Originaldateien
- automatische/manuelle Backups, Restore, Vertragsende und Löschworkflow
- Education OS mit Live Education Twin, Scenario Lab, Autopilot, Future Radar, Self-Healing/Konsistenzprüfung, Proof Graph und Readiness
- natürlicher Szenario-/Intent-Eingang: Freitext wird in prüfbare Vorschläge/Simulationen übersetzt, nicht direkt unkontrolliert in Produktivänderungen

## KI-/Automationsgrundsatz

KI/Copilot darf erklären, suchen, zusammenfassen, analysieren, Datenqualität prüfen und Vorschläge bzw. Simulationen vorbereiten. Kritische fachliche oder administrative Änderungen werden nicht allein durch Freitext unkontrolliert geschrieben. Noten/Bewertungen, Anwesenheit, Zahlungen, Berechtigungen und produktive Planänderungen bleiben an die vorgesehenen Rollen-, Vorschau-, MFA-, Freigabe- und Auditregeln gebunden.

## Bewusste Abgrenzung

- **Kein eigenes Videokonferenzsystem:** Live-Besprechungen werden über Microsoft Teams als externen Dienst integriert.
- **Keine Office-Suite:** Das Education OS ersetzt Word/Excel/PowerPoint nicht, sondern importiert bzw. verarbeitet geeignete Daten/Dokumente.
- Microsoft-365-/Teams-Lizenzen sind nicht Bestandteil des Klassenportal-Produkts und müssen beim jeweiligen Kunden vorhanden sein.
- Externe Integrationen gelten erst nach echtem End-to-End-Test mit den benötigten Kundendiensten als produktiv abgenommen.

## Initiale Cloudflare-Einrichtung

1. D1-Datenbank `klassenportal-commercial` anlegen.
2. R2-Bucket `klassenportal-commercial-files` anlegen.
3. D1-ID in `wrangler.jsonc` eintragen.
4. Secret `BOOTSTRAP_SECRET` in Cloudflare setzen; niemals committen.
5. Alle Migrationen in numerischer Reihenfolge anwenden.
6. Deploy über GitHub/Cloudflare Workers.
7. Einmalig `/api/bootstrap` mit dem Secret aufrufen und Plattform-Admin erzeugen.
8. Danach den Bootstrap-Zugang wieder entfernen/deaktivieren und das Bootstrap-Secret löschen.

## Lokale Prüfung

```bash
npm install
npm run typecheck
npm test
```

## Sicherheit

- Passwörter: PBKDF2-HMAC-SHA256 mit individuellem Salt
- Sessions: zufällige Tokens, nur Hash in D1, `HttpOnly; Secure; SameSite=Strict`
- Login-Limitierung in D1
- Origin-Prüfung für Browser-Schreibzugriffe
- serverseitige Rollen-/Mandantenprüfung
- rollen- und kursbezogene Datenschutzgrenzen
- kritische Autopilot-Aktionen mit Guardrails/MFA/Freigaben/Audit
- Restore nur mit Bestätigung und Sicherheitsbackup
- endgültige Löschung nur im vorgesehenen kontrollierten Ablauf
- keine Secrets im Repository

## Dokumentation und Tests

- Rollenhandbücher: `docs/BENUTZERHANDBUCH_ROLLEN.md`
- große fiktive Testdatensätze: `docs/TESTDATEN_GROSS.md`
- vollständige Anfänger-End-to-End-Checkliste: `TESTER_END_TO_END.md`
- Release-/Abnahmegrenzen: `EDUCATION_OS_RELEASE.md`
- Sicherheit: `EDUCATION_OS_SECURITY.md`

## Projektstand

Siehe `PROJECT_STATE.md`. Ein Build darf erst dann als vollständig produktiv abgenommen bezeichnet werden, wenn neben den Code-/CI-Gates auch die dort bzw. in `EDUCATION_OS_RELEASE.md` beschriebenen realen externen End-to-End-Prüfungen bestanden sind.
