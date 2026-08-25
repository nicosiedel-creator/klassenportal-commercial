# Commercial Production Acceptance – 2026-08-25

## Scope

Dieser Abschlussblock gilt ausschließlich für das Commercial Klassenportal auf `main`. VFA-13 ist ausdrücklich nicht Bestandteil dieser Freigabe.

## Sicherheitsentscheidung

Produktionsreife wird nicht mehr aus veralteten manuellen Bool-Flags abgeleitet. Kritische Freigaben bleiben fail-closed und versionsgebunden. Die Plattformadmin-Livefreigabe bleibt absichtlich eine menschliche Step-up-Aktion mit aktuellem Passwort und exakter Bestätigungsphrase; CI erhält dafür keine Administrator-Zugangsdaten.

## Evidenzbasierte EU-Speicherfreigabe

- Produktive Backups werden über das produktive `FILES`-Binding geschrieben. Dessen EU-Jurisdiktion ist damit zugleich die relevante Backup-Speichergrenze.
- Der Legacy-R2-Bestand wird gegen den EU-R2-Bestand anhand von Schlüssel, Größe und ETag geprüft.
- Fehlende oder abweichende Objekte werden in begrenzten Batches nicht-destruktiv kopiert und unmittelbar per Readback verifiziert.
- Die Legacy-Quelle wird durch den Selbstheilungszyklus niemals gelöscht.
- Kundenschreib-Automationen bleiben während einer noch unvollständigen Migration pausiert.
- Sobald die reale Objektparität erreicht ist, laufen die normalen Automationen wieder an; starke Kundenbackups und deren Verifikation bleiben zusätzliches Release-Gate.

## Browser-/Geräteabnahme

Der verpflichtende Commercial-Browser-E2E prüft den exakten PR-Kandidaten mit Chromium sowohl als Desktop als auch in einer mobilen Touch-Konfiguration. Geprüft werden Plattformzugang, Produktoberfläche, Kundenadmin und Dozentenportal einschließlich unerwarteter Server-/Browserfehler und dokumentweitem horizontalem Overflow. Zahlungswege bleiben bis zur späteren ausdrücklichen Zahlungsfreigabe fail-closed.

## Education OS

Die bestehenden Education-OS-Pflichtgates bleiben unverändert verpflichtend: Release Gate, Deep Security, Privacy/Storage und Circuit Breaker. Die reale Browser-/Mobile-Abnahme wird zusätzlich durch das Commercial Browser E2E erzwungen. Kritische KI-/Autopilot-Schreibrechte, Rollen-, Zahlungs-, Noten- und individuelle Anwesenheitsaktionen bleiben weiterhin den bestehenden Guardrails und menschlichen Freigaben unterworfen.

## Release-Regel

Merge ausschließlich, wenn auf demselben unveränderten Head alle sechs Pflichtgates grün sind. Danach muss der exakte `main`-Commit erneut den produktiven Cloudflare-Build und den Commercial-Main-Live-Smoke bestehen. Eine technische Freigabe darf niemals durch Abschalten von WAF, Rollen-, Datenschutz-, Backup-, Zahlungs- oder Step-up-Schutz erreicht werden.
