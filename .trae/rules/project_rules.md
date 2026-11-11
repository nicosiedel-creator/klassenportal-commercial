# Klassenportal – Hard Constraints (Education OS)

Geltungsbereich: 60+ verdrahtete Module, ~289 Tabellen (PERSONENDATEN), Fail-Closed-Prinzip.

1. **TOKEN-SPARSAM (No-Read-Blind)**
   Nie ganze Ordner oder Dateien >150 Zeilen blind einlesen. Immer `grep`/Code-Suche nutzen
   und parallel nur exakte Snippets (± 25 Zeilen um die Fundstelle) laden.
   `node_modules`, Build-Ordner und Lock-Dateien sind tabu.

2. **MAXIMALE PARALLELITÄT**
   Alle unabhängigen Such-, Lese-, Analyse- und Edit-Aktionen in EINEM Tool-Aufruf bündeln.
   Arbeit nach Modulen getrennt und parallel.

3. **KEIN GIT / FAIL-CLOSED BACKUP**
   Vor JEDER Änderung an Kern-Dateien, Schemata oder Logik ein Backup `dateiname.bak.ext` anlegen.
   Niemals bestehende Module, Rollen-Rechte, 16-BL-Notenregeln oder DSGVO/BSI-Checks löschen.
   Nur chirurgische Search-and-Replace-Edits (keine Voll-Rewrites, keine Platzhalter).

4. **DATEN-SICHERHEIT**
   Niemals echte API-Keys, Secrets oder PII aus `.env`/Datenbanken im Chat ausgeben.
   Nur Variablen-NAMEN nennen, niemals Werte.

5. **TELEMETRIE-ONLY**
   Kein Smalltalk, keine langen Erklärungen. Antwort strikt im Format:
   `PHASE | STATUS` / `FIXED: [Bereich] Datei:Zeile -> Ursache -> Fix` / `REMAINING_ISSUES` / `NEXT_ACTION`.
