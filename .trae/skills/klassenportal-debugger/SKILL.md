---
name: klassenportal-debugger
description: Modulare, tokensparende Reparatur des Klassenportal (Education OS) ohne Seiteneffekte auf benachbarte Module. Immer aktivieren bei Build-, Typ-, API- oder Laufzeitfehlern im Klassenportal.
---

# Klassenportal Debugger – chirurgischer Workflow

## Grundsätze
- **Snippet-Only:** `grep`en statt Voll-Reads; nur ± 25 Zeilen um den Fehler laden.
- **Modul-Isolation:** Fehler nach Modul/Bereich gruppieren und getrennt beheben
  (core / portability / public-UI / migrations / tests). Keine Sammel-Rewrites.
- **Fail-Closed:** Vor jedem Edit `.bak` anlegen. Nur Search-and-Replace, keine Platzhalter.
- **Personendaten & Sicherheit:** DSGVO/BSI-Checks, Rollen-Rechte, 16-BL-Notenregeln nie entfernen.

## Reihenfolge der Prüfungen
1. `npm run typecheck` (tsc --noEmit) → 0 Fehler anstreben.
2. `npm run build` (tsconfig.build.json + pdfjs-Assets).
3. `npx wrangler d1 migrations apply DB --local` (Schema 289 Tabellen).
4. `npm test` (Fail-Closed-Suite) → bis Exit-Code 0.

## Verifikation
- Jeder Fix muss durch Terminal-Check (typecheck/build/test) UND – wo relevant –
  Browser-Konsole/Netzwerk (4xx/5xx) bestätigt werden.
- Kein Fix gilt als fertig ohne grünen Check.

## Ausgabe
Strikt Telemetrie: `Datei:Zeile -> Ursache -> Fix`.
