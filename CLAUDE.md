# Klassenportal Commercial – Arbeitsanweisung für Claude

Mandantenfähige Klassen-/Kursplattform für Bildungsträger (Umschulung, Berufsschule,
Weiterbildung). Produktiv unter `klassenportal.app`.

Verbindlicher Produktstand: `PROJECT_STATE.md`. Bei Widerspruch gewinnt `PROJECT_STATE.md`
gegenüber dieser Datei.

## Stack & Aufbau

- Cloudflare Workers + Static Assets, D1 (SQL), R2 (Dateien/Backups) – EU-Bindings
- `src/index.ts` – Worker-Entry, verteilt auf die Router
- `src/core/*.ts` – Domänenlogik; `src/core/router.ts` + `src/core/*-router.ts` – API
- `src/portability/*` – CSV/XLSX/PDF/ZIP-Import und -Export
- `public/*` – ausgeliefertes Frontend (plain HTML/CSS/JS, kein Framework, kein Bundler)
- `migrations/NNNN_*.sql` – D1-Migrationen, streng aufsteigend nummeriert
- `tests/*.mjs` – 90+ Node-Tests, `scripts/*.mjs` – Build, Deploy, Gates

## Befehle

```bash
npm run typecheck   # tsc --noEmit
npm run build       # tsc -> dist/ (+ pdfjs-Kopie)
npm test            # baut zuerst, dann die komplette Testkette
```

Tests importieren aus `dist/`, nicht aus `src/`. Ohne `npm run build` laufen sie gegen
einen veralteten Stand. Einzelnen Test fahren: `npm run build && node tests/<datei>.mjs`.

Neue Tests **müssen** in die `test`-Kette in `package.json` eingetragen werden, sonst
laufen sie in CI nie.

## Harte Regeln

Diese Punkte sind Sicherheits- und Produktinvarianten, keine Stilfragen. Nicht ohne
ausdrücklichen Auftrag aufweichen:

- **Mandantentrennung:** jede Query und jede Autorisierung serverseitig über `tenant_id`
  bzw. `course_id`. Keine Filterung im Frontend als Schutz.
- **Rollengrenzen:** Klassenadmin bleibt Teilnehmer mit Zusatzrechten und sieht keine
  fremden Leistungs-, Anwesenheits-, Abgabe- oder Notizdaten. Dozenten sehen nur explizit
  zugeordnete Klassen/Kurse. Plattformadmin ist kein Ersatz-Kundenadmin.
- **Zahlungen:** bleiben deaktiviert (`PAYMENTS_ENABLED=false`) bis zur ausdrücklichen
  Freigabe. Payment-Freeze nicht umgehen.
- **Fail-closed:** im Zweifel verweigern, nicht durchlassen. Kritische Aktionen bleiben
  erklärbar und auditierbar.
- **Kein stiller Datenverlust** bei Migration, Restore oder EU-Storage-Zyklus. Legacy-
  Quellen werden nicht gelöscht.
- **Keine Secrets im Repo**, keine Admin-Zugangsdaten in Workflows.
- **Keine erfundene Provider-, Rechts- oder Compliance-Konfiguration.** Lieber Lücke
  benennen als plausibel klingend erfinden.
- **Release-Gates** (Release Gate, Deep Security, Privacy/Storage, Circuit Breaker,
  Klassenportal CI, Browser-E2E inkl. Mobile) werden nicht durch Abschalten von Schutz
  erfüllt.
- **Migrationen** sind additiv und bekommen die nächste freie Nummer. Bestehende
  Migrationsdateien werden nicht nachträglich geändert.

## Konventionen

- **Oberfläche ist Deutsch.** Englische Fachbegriffe nur, wo technisch sinnvoll.
  Fehlertexte und Labels haben Contract-Tests (`tests/error-text-contract.mjs`,
  `tests/login-error-text.mjs`) – Texte nicht beiläufig ändern.
- **API-Fehler** laufen über stabile Codes (`safeErrorCode`) und das Status-Mapping in
  `err()` in `src/core/router.ts`. Neuer Code = Eintrag im Mapping + Test.
- In Routern niemals `return handler(env, …)` innerhalb eines `try`-Blocks ohne `await` –
  die Rejection umgeht dann das Status-Mapping und wird zu 500
  (bewacht von `tests/api-error-contract.mjs`).
- Codestil im Bestand ist sehr kompakt (wenig Whitespace, kurze Namen). Neuen Code an die
  umgebende Datei angleichen, nicht an einen eigenen Stil.
- Änderungen klein und chirurgisch halten. Kein Umbau im Vorbeigehen.

## Subagents

Unter `.claude/agents/` liegen 20 kuratierte Agents aus
[msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents) (MIT).
Details und Nachinstallation: `.claude/agents/README.md`.

Routing für dieses Projekt:

| Thema | Agent |
| --- | --- |
| Worker-/API-Design, neue Endpunkte | `engineering-backend-architect` |
| größere Architekturentscheidung | `engineering-software-architect` |
| Review vor Merge | `engineering-code-reviewer` |
| kleiner Fix ohne Kollateralschaden | `engineering-minimal-change-engineer` |
| D1-Schema, Migrationen, langsame Queries | `engineering-database-optimizer` |
| Wrangler, Deploy, CI-Gates | `engineering-devops-automator` |
| `public/*`-Oberfläche, Mobile-Viewport | `engineering-frontend-developer` |
| Sessions, Rollen, Mandantengrenze, Step-up | `engineering-identity-access-engineer` |
| DSGVO, Löschworkflow, Datenminimierung | `engineering-privacy-engineer` |
| Angebote, Entitlements, Billing-Lifecycle | `engineering-payments-billing-engineer` |
| Texte, Labels, Mehrsprachigkeit | `engineering-i18n-engineer` |
| Doku, Release Notes | `engineering-technical-writer` |
| neue Tests, Testkette | `testing-test-automation-engineer` |
| API-Contract- und Fehlerpfad-Tests | `testing-api-tester` |
| „ist das wirklich produktionsreif?" | `testing-reality-checker` |
| Barrierefreiheit | `testing-accessibility-auditor` |
| Latenz, Query- und Bundlekosten | `testing-performance-benchmarker` |
| Angriffsflächen, Hardening | `security-appsec-engineer` |
| EU-/DSGVO-Nachweise, Auditierbarkeit | `security-compliance-auditor` |
| Secrets, Keys, Rotation | `security-secrets-credential-engineer` |

Die harten Regeln oben gelten für Subagents genauso. Ein Agent darf sie nicht mit
„Best Practice" überschreiben.
