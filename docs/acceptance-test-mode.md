# Kontrollierter Abnahmemodus vor Live-Freigabe

Die Basisadresse des Workers (`klassenportal-commercial.<account>.workers.dev`) dient vor Einrichtung einer gültigen Produktionsdomain als kontrollierte Abnahmeumgebung.

## Sicherheitsgrenzen

- Der Modus ist nur aktiv, solange `APP_ORIGIN` noch nicht als gültige Produktionsdomain konfiguriert ist.
- Branch-/Commit-Preview-URLs bleiben gesperrt.
- Kunden- und Klassen-Admin-Oberflächen dürfen geladen werden; Daten-APIs benötigen weiterhin eine gültige Sitzung und die normale Rollen-/Tenant-Prüfung.
- Öffentliche Einrichtungslinks (`/einrichtung/<token>`) und deren Onboarding-API bleiben an den unvorhersehbaren Einladungstoken gebunden.
- Portal-, Intake-, SSO-, SCIM- und API-Endpunkte behalten ihre vorhandenen Login-, Zugriffscode- oder Tokenprüfungen.
- Zahlungsverändernde Routen werden im Abnahmemodus nicht freigegeben, wenn ein Stripe-Live-Schlüssel konfiguriert ist. Testzahlungen sind nur mit Stripe-Testschlüsseln zulässig.
- Sobald eine gültige `APP_ORIGIN` gesetzt ist, endet der workers.dev-Abnahmemodus automatisch. Danach gilt ausschließlich die versionsgebundene Produktionsfreigabe.

Der Abnahmemodus ist kein Ersatz für die Live-Freigabe. Für externe Tests ausschließlich fiktive Personen/Daten und keine echten Zahlungsmittel verwenden.
