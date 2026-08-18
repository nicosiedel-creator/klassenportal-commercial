# Block 4 – Klassenportal für Teilnehmer

Dieser Block setzt auf PR #16 / Branch `block3-onboarding-managed-setup` auf.

## Enthalten
- eigene Route `/portal/<mandant>/<klasse>`
- responsive, gebrandete Teilnehmeransicht
- Meldungen, Stundenplan, Aufgaben, Termine, Prüfungen und Links
- Modul-Feature-Flags werden in der Portalansicht respektiert
- Anmeldung, Link-/Code-Zugang und Hybrid-Zugang
- Zugangscodes werden im neuen Frontend über einen Request-Header statt in der URL übertragen
- sicherer Public-Overview-Datensatz: insbesondere kein `access_code_hash` im Client
- Fächer und Dozenten werden lesbar statt nur als IDs ausgegeben
- Kunden-/Klassenadmins erhalten direkte Portal- und Kopierlinks
- reine Teilnehmer-/Gastkonten landen automatisch im Klassenportal bzw. in einer Auswahl ihrer Klassen
- erzwungener Passwortwechsel bleibt vorgeschaltet

## Noch praktisch zu testen
- öffentlicher Kurs
- Login-Kurs
- Link/Code-Kurs
- Hybrid-Kurs
- Teilnehmerkonto mit genau einer Klasse
- Teilnehmerkonto mit mehreren Klassen
- Kunden-Admin → Klassen/Kurse → Portal öffnen / Link kopieren
- Branding und mobile Darstellung
