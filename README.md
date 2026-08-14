# Klassenportal Commercial

Kommerzielle, mandantenfähige Klassen- und Kursplattform für Bildungsträger, Umschulung, Berufsschule und Weiterbildung.

## Architektur

- Cloudflare Workers + Static Assets
- Cloudflare D1 für strukturierte Daten
- Cloudflare R2 für PDFs, Originaldateien, Backups und Exporte
- serverseitige Sessions und rollenbasierte Autorisierung
- strikte `tenant_id`-/`course_id`-Trennung

## Rollen

- Plattform-Admin
- Kunden-/Mandanten-Admin
- Klassen-/Kurs-Admin
- Teilnehmer
- Gast

## Zugriffsarten pro Klasse

- öffentlich
- Link/Code
- Login
- Hybrid

## Kundenfunktionen

- automatisierte Mandantenanlage
- eigene Admins
- Klassen/Kurse
- Branding: Portalname, Logo, Farben, Willkommenstext, Domain/White Label vorbereitbar
- Feature Flags / Module und Upsells
- Benutzer- und Rollenzuordnung
- Stundenplan, Aufgaben, Termine, Meldungen, Links
- Prüfungen & Lernfortschritt
- Prüfungen einzeln für Teilnehmer sichtbar/versteckt
- private, selbst eingetragene persönliche Noten (keine offiziellen Noten)
- CSV-/Excel-/PDF-Import
- CSV-/Excel-/PDF-Export
- kompletter Mandantenexport inklusive Originaldateien
- automatische/manuelle Backups, Restore, Vertragsende und Löschworkflow

## Bewusste Abgrenzung

Kein eigenes Video-Konferenzsystem, kein eigener Chat und keine Office-Suite. Keine offizielle Schulnoten-, Zeugnis- oder Anwesenheitsverwaltung.

## Initiale Cloudflare-Einrichtung

1. D1-Datenbank `klassenportal-commercial` anlegen.
2. R2-Bucket `klassenportal-commercial-files` anlegen.
3. D1-ID in `wrangler.jsonc` eintragen.
4. Secret `BOOTSTRAP_SECRET` in Cloudflare setzen; niemals committen.
5. Migrationen in Reihenfolge anwenden: `0001_core.sql`, danach `0022_data_portability.sql`.
6. Deploy über GitHub/Cloudflare Workers.
7. Einmalig `/api/bootstrap` mit dem Secret aufrufen und Plattform-Admin erzeugen.

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
- Restore nur mit Bestätigung und Sicherheitsbackup
- endgültige Löschung nur Plattform-Admin nach Karenz
- keine Secrets im Repository

## Projektstand

Siehe `PROJECT_STATE.md`.
