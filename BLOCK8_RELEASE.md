# Block 8 – Produktions- und Release-Härtung

Block 8 ist der letzte Entwicklungsblock der kommerziellen v1. Er verändert das separate produktive VFA13-Portal nicht.

## Technische Release-Gates

Vor einem Merge nach `main` müssen alle Punkte erfüllt sein:

- GitHub Actions vollständig grün: TypeScript, Browser-JavaScript, automatisierte Tests, Release-Readiness und sämtliche D1-Migrationen lokal.
- `/portal/*` läuft Worker-first, damit dynamische Teilnehmer-Routen nicht vom SPA-Fallback verschluckt werden.
- HTML-Antworten werden nicht zwischengespeichert (`Cache-Control: no-store`).
- Sicherheitsheader sind aktiv: MIME-Sniffing-Schutz, Frame-Schutz, Referrer-/Permissions-Policy, HSTS und CSP.
- Unbehandelte Worker-Fehler werden nach außen nur als `INTERNAL_ERROR` ausgegeben; interne Details bleiben in den Worker-Logs.
- Abgelaufene Sessions, Einrichtungslinks und alte Login-Rate-Limit-Datensätze werden regelmäßig bereinigt.
- Öffentlicher Bootstrap bleibt entfernt; `BOOTSTRAP_SECRET` wird vom Runtime-Code nicht verwendet.
- Zugangscode-Hashes dürfen nie Teil der Teilnehmer-API-Antwort sein.

## Deployment-Voraussetzungen

Cloudflare muss für den kommerziellen Worker bereitstellen:

- D1-Binding `DB` → `klassenportal-commercial`
- R2-Binding `FILES` → `klassenportal-commercial-files`
- Static-Assets-Binding `ASSETS`
- `APP_ORIGIN` auf die tatsächlich verwendete HTTPS-Origin setzen
- Stripe Test/Live Secrets nur als Cloudflare-Secrets, niemals im Repository
- Stripe Webhook auf `/api/payments/stripe/webhook`

Alle noch nicht produktiv angewendeten D1-Migrationen werden vor bzw. zusammen mit dem neuen Workerstand in numerischer Reihenfolge angewendet. Migrationen dieses Kandidaten sind additiv; keine bestehende Kundentabelle wird destruktiv neu aufgebaut.

## Abnahme nach Deployment

### Plattform/Kunde
- Plattform-Admin anmelden
- Kunden-Admin öffnen
- bestehenden Testkunden auswählen
- Kunden-Einrichtung / Self-Service-Checkliste prüfen
- Managed-Setup-Arbeitsvorrat prüfen
- Paket & Abrechnung sowie Stripe Customer Portal öffnen

### Teilnehmerportal – Desktop und Smartphone
Je mindestens einmal prüfen:
- öffentlicher Kurs
- Login-Kurs
- Link-/Code-Kurs
- Hybrid-Kurs
- Branding / Logo / Farben
- Meldungen, Stundenplan, Aufgaben, Termine, Prüfungen, Links
- Wochenübersicht, Erinnerungen und Kalender
- Lernmaterial herunterladen
- Benachrichtigung als gelesen markieren / alle gelesen
- Teilnehmerkonto mit einer sowie mit mehreren Klassenzuordnungen

### Daten/Betrieb
- neue Klasse anlegen, bearbeiten und deaktivieren/reaktivieren
- Benutzer/Rolle ändern und Test-Teilnehmerpasswort zurücksetzen
- PDF/XLSX/CSV-Stundenplan importieren
- Lernmaterial hochladen
- manuellen Backup-/Export-Smoke-Test durchführen

### Zahlung
Bereits im Sandbox-E2E bestätigt:
- Kreditkarte erfolgreich → Zahlung bestätigt → Freischaltung → Rechnung → Customer Portal
- SEPA verzögert → zunächst ausstehend / keine Freischaltung → später bestätigt und freigeschaltet

Bewusst noch offen und vor echter Live-Zahlungsfreigabe nachzuholen:
- absichtlich fehlgeschlagene Zahlung: keine Freischaltung und sauberer erneuter Zahlungsversuch

## Rollback

Falls die Abnahme nach Deployment scheitert:

1. keinen weiteren Kunden auf den neuen Stand onboarden;
2. auf die vorherige Cloudflare-Worker-Version zurückrollen;
3. die additiven neuen Tabellen/Spalten nicht vorschnell löschen – ein Worker-Rollback kann sie ignorieren;
4. Ursache im separaten Fix-Branch beheben und die komplette CI erneut durchlaufen lassen;
5. erst nach bestandenem Smoke-Test erneut veröffentlichen.

## Definition „v1 fertig“

Entwicklungsseitig ist die v1 nach bestandenem Block-8-CI feature-complete. Als **produktiv abgenommen** gilt sie erst nach dem realen Browser-/Smartphone-Smoke-Test und dem noch vorgemerkten negativen Stripe-Test vor Live-Zahlungsfreigabe.
