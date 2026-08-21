# Kundenadmin / Education OS – Abnahmeszenarien

## Pflichtfall Raum-Sperre
Eingabe im Kundenadmin: `Raum M 102 bis 01.10.2026 gesperrt`

Erwartung:
- Ein eindeutig vorhandener Raum `M 102` wird gegen die echten Mandantendaten aufgelöst, ohne dass `resource_id` angezeigt oder eingegeben werden muss.
- `bis 01.10.2026` wird als Zeitraum bis zum Ende dieses lokalen Tages interpretiert; ohne expliziten Beginn beginnt die Simulation am aktuellen lokalen Tag.
- Bei mehreren passenden Räumen bleibt die Simulation gesperrt und die vorhandene Kandidatenauswahl wird genutzt.
- Fehlende Angaben werden mit fachlichen deutschen Bezeichnungen erklärt, nicht mit internen Feldnamen.
- Erst nach vollständiger Auflösung wird die Simulation ermöglicht. MFA, Vier-Augen-Prinzip, stale-snapshot-Gate und Autopilot-Guardrails bleiben unverändert.

## Kundenadmin UX
- Ruhige professionelle Enterprise-Informationshierarchie.
- Feste fachliche Navigation, kompakte Verwaltungskarten und Tabellen statt übergroßer spielerischer Kacheln.
- Education OS priorisiert Auftrag und Ergebnis; Sicherheitsinformation bleibt sichtbar, belegt aber nicht den Hauptarbeitsbereich.
- Räume/Ressourcen verwenden für `Typ` kontrollierte Auswahlwerte statt freien inkonsistenten Freitexts.
