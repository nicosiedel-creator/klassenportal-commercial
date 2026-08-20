# Teams & Chat – Release-Gates

## Produktentscheidung

Microsoft Teams/Microsoft 365 und der kursbezogene Chat gehören zum vollständigen Klassenportal Education OS und werden nicht als künstlicher Funktions-Upsell verkauft.

## Microsoft Teams / Microsoft Graph

- Keine eigene Videokonferenz-Engine: Microsoft Teams bleibt der Meeting-Provider.
- Berechtigte Kundenadmins und explizit einer Klasse zugeordnete Dozenten dürfen Meetings für Unterrichtseinheiten anlegen bzw. synchronisieren.
- Teilnehmende sehen ausschließlich den kursbezogenen Beitreten-Link und erhalten keine Meeting-Verwaltungsrechte.
- Graph-Meetings werden ohne Teilnehmer-E-Mail-Liste angelegt. Teilnehmeridentitäten werden dadurch nicht unnötig an Microsoft übergeben.
- OAuth nutzt State + PKCE; Refresh-/Access-Tokens werden tenant-/nutzergebunden verschlüsselt gespeichert.
- Plattformadmins sind kein Ersatz-Kundenadmin für die Microsoft-Integration.
- Ein Graph-Meeting darf nur vom ursprünglichen Organizer geändert oder abgesagt werden.
- Als manueller Fallback dürfen ausschließlich HTTPS-Links vertrauenswürdiger Microsoft-Teams-Hosts gespeichert werden.

### Externes Gate

Die Implementierung darf erst nach realem End-to-End-Test in einer verbundenen Microsoft-365-Umgebung als vollständig abgenommen bezeichnet werden:

1. Konto autorisieren.
2. Unterricht → Teams-Besprechung erstellen.
3. Beitreten-Link als Teilnehmer im richtigen Kurs sehen und öffnen.
4. Unterrichtszeit ändern → Besprechung synchronisieren.
5. Besprechung absagen → Link verschwindet und Microsoft-Termin wird entfernt.
6. Fremdkurs-/Fremdtenant-Zugriff muss scheitern.

## Chat

- Standard ist ein mandanten- und kursbezogenes Forum/Chat-Modell.
- Klassenadmins bleiben Teilnehmer und erhalten keine Moderationsrechte über Mitschüler.
- Explizit zugeordnete Dozenten dürfen ihren Kurs moderieren.
- Kundenadmins dürfen innerhalb ihres Mandanten moderieren.
- Direktnachrichten bleiben standardmäßig deaktiviert, bis eine gesonderte Shared-Course-/Datenschutzfreigabe vorliegt.
- Nachrichten werden nicht als HTML gerendert; Frontends müssen Textausgabe sicher behandeln.
- Aufbewahrung, Ausblenden und Moderation bleiben nachvollziehbar/auditierbar.

## Nicht behaupten

- Keine Aussage "Teams vollständig live getestet", solange das externe Microsoft-E2E-Gate nicht tatsächlich durchgeführt wurde.
- Keine Aussage "qualifizierte elektronische Signatur" ohne externen QES-Provider und reale Abnahme.
- Keine Aussage über erfolgreiche Live-Zahlungen ohne tatsächlichen Zahlungs-Smoke.
