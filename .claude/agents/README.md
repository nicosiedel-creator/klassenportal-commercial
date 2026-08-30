# Claude-Code-Subagents (The Agency)

Diese Agents stammen aus [msitarzewski/agency-agents](https://github.com/msitarzewski/agency-agents)
(MIT-Lizenz, "The Agency" – ca. 300 Agent-Personas über alle Divisionen).

Installiert ist hier bewusst **nur eine kuratierte Auswahl** passend zum Stack
dieses Projekts (TypeScript, Cloudflare Workers/D1/R2, mandantenfähig, DSGVO/EU):

| Agent | Zweck |
| --- | --- |
| `engineering-backend-architect` | API-/Worker-Design, Datenflüsse |
| `engineering-software-architect` | Architekturentscheidungen, Trade-offs |
| `engineering-code-reviewer` | Review auf Korrektheit, Security, Wartbarkeit |
| `engineering-minimal-change-engineer` | chirurgische Minimal-Diffs statt Umbau |
| `engineering-database-optimizer` | D1-/SQL-Schema, Indizes, Query-Tuning |
| `engineering-devops-automator` | Deploy, Wrangler, CI-Pipelines |
| `engineering-frontend-developer` | Portal-UI, Static Assets |
| `engineering-identity-access-engineer` | Rollen, Sessions, Tenant-Boundary |
| `engineering-privacy-engineer` | DSGVO, Datenminimierung, Löschkonzepte |
| `engineering-payments-billing-engineer` | Billing-Lifecycle, Offers, Entitlements |
| `engineering-i18n-engineer` | Mehrsprachigkeit, Texte/Labels |
| `engineering-technical-writer` | Doku, Release Notes, Handbücher |
| `testing-test-automation-engineer` | Node-Testsuite ausbauen |
| `testing-api-tester` | API-Contract- und Fehlerpfad-Tests |
| `testing-reality-checker` | "Ist das wirklich produktionsreif?" |
| `testing-accessibility-auditor` | Barrierefreiheit im Portal |
| `testing-performance-benchmarker` | Latenz, Bundle- und Query-Kosten |
| `security-appsec-engineer` | Anwendungssicherheit, Angriffsflächen |
| `security-compliance-auditor` | EU-/DSGVO-Compliance-Nachweise |
| `security-secrets-credential-engineer` | Secrets, Keys, Rotation |

## Verwendung

In einer Claude-Code-Session:

```
Nutze den engineering-code-reviewer für die Änderungen auf diesem Branch.
```

Claude wählt passende Agents auch selbständig anhand der `description`.

## Weitere Agents nachinstallieren

Bewusst nicht alle ~300 Agents installiert: jede Agent-`description` landet im
Kontext jeder Session – die Vollinstallation kostet spürbar Kontext und macht die
Auswahl unschärfer.

Nachinstallieren (Divisionen: `academic`, `design`, `engineering`, `finance`,
`game-development`, `gis`, `healthcare`, `marketing`, `paid-media`, `product`,
`project-management`, `research`, `sales`, `security`, `spatial-computing`,
`specialized`, `strategy`, `support`, `testing`):

```bash
git clone --depth 1 https://github.com/msitarzewski/agency-agents /tmp/agency-agents
cp /tmp/agency-agents/product/*.md .claude/agents/
```

Wichtig: Die Original-Dateien haben im Frontmatter einen `name` mit Leerzeichen
(z. B. `name: Code Reviewer`) sowie die Felder `emoji`/`vibe`. Die Dateien hier
wurden auf ein Claude-Code-taugliches Frontmatter normalisiert
(`name` = Dateiname in kebab-case, `description`, `color`). Beim Nachinstallieren
denselben Schritt machen, sonst kann der Agent nicht sauber geladen werden.

Alternativ global statt projektweit: `~/.claude/agents/` — oder das Upstream-Skript
`./scripts/install.sh --tool claude-code --division engineering`.
