// Gemeinsame deutsche Fehlertexte für alle Kundenoberflächen.
//
// Die Oberflächen laden einander bewusst nicht als Module, jede bringt ihr eigenes api() mit.
// Deshalb liegt das Wörterbuch auf window: jede Oberfläche kann es benutzen, ohne eine
// Abhängigkeit einzuführen. Eigene, speziellere Übersetzungen einer Oberfläche haben Vorrang;
// dieses Wörterbuch ist der gemeinsame Rückfall.
//
// Regel: Ein technischer Code darf nie in der Oberfläche erscheinen. Ist ein Code hier nicht
// aufgeführt, wird ein allgemein verständlicher Satz gezeigt, kein SCREAMING_SNAKE.
(function(){
  const TEXTS={
    // Anmeldung und Sitzung
    UNAUTHENTICATED:'Die Sitzung ist abgelaufen. Bitte melde dich erneut an.',
    LOGIN_REQUIRED:'Bitte melde dich an, um fortzufahren.',
    LOGIN_FAILED:'E-Mail-Adresse oder Passwort ist falsch.',
    LOGIN_RATE_LIMITED:'Zu viele Fehlversuche. Bitte warte einige Minuten und versuche es dann erneut.',
    PASSWORD_CHANGE_REQUIRED:'Bitte vergib zuerst ein neues Passwort.',
    CURRENT_PASSWORD_INVALID:'Das aktuelle Passwort ist nicht korrekt.',
    PASSWORD_LENGTH:'Das Passwort muss mindestens 10 Zeichen lang sein.',
    PASSWORD_LENGTH_INVALID:'Das Passwort muss zwischen 10 und 256 Zeichen lang sein.',
    PASSWORD_CONFIRMATION_MISMATCH:'Die beiden Passwörter stimmen nicht überein.',
    PASSWORD_MUST_CHANGE:'Das neue Passwort muss sich vom bisherigen unterscheiden.',
    SSO_REQUIRED:'Für diese Organisation ist die Anmeldung über den Unternehmenszugang erforderlich.',

    // Berechtigungen und Mandant
    FORBIDDEN:'Für diese Aktion fehlt die Berechtigung.',
    FORBIDDEN_ROLE:'Für diese Aktion fehlt die Berechtigung.',
    FORBIDDEN_COURSE:'Für diese Klasse bzw. diesen Kurs fehlt die Berechtigung.',
    FORBIDDEN_PERMISSION:'Für diese Aktion fehlt die Berechtigung.',
    FORBIDDEN_ORG_SCOPE:'Für diesen Bereich fehlt die Berechtigung.',
    FORBIDDEN_TENANT:'Für diese Organisation fehlt die Berechtigung.',
    TENANT_ADMIN_REQUIRED:'Diese Aktion ist der Administration der Organisation vorbehalten.',
    PLATFORM_ADMIN_REQUIRED:'Diese Aktion ist dem Plattformkonto vorbehalten.',
    TENANT_ACCESS_SUSPENDED:'Der Zugang zu dieser Organisation ist derzeit ausgesetzt. Bitte wende dich an die Administration.',
    SUPPORT_READ_ONLY:'Im Support-Zugriff sind nur lesende Aktionen möglich.',
    TENANT_ID_REQUIRED:'Bitte zuerst eine Organisation auswählen.',
    COURSE_ID_REQUIRED:'Bitte zuerst eine Klasse bzw. einen Kurs auswählen.',

    // Häufige Validierung
    COURSE_NAME_REQUIRED:'Bitte gib einen Namen für die Klasse bzw. den Kurs an.',
    COURSE_CODE_REQUIRED:'Bitte gib ein Kürzel für die Klasse bzw. den Kurs an.',
    COURSE_CODE_EXISTS:'Dieses Kürzel ist in dieser Organisation bereits vergeben.',
    COURSE_NOT_FOUND:'Die gewählte Klasse bzw. der Kurs existiert nicht mehr.',
    ACCESS_CODE_REQUIRED:'Für diese Zugangsart wird ein Zugangscode mit mindestens 6 Zeichen benötigt.',
    ACCESS_MODE_INVALID:'Die gewählte Zugangsart ist ungültig.',
    ROLE_INVALID:'Die gewählte Rolle ist ungültig.',
    EMAIL_INVALID:'Bitte gib eine gültige E-Mail-Adresse ein.',
    CUSTOMER_EMAIL_INVALID:'Bitte gib eine gültige E-Mail-Adresse ein.',
    EMAIL_PASSWORD_REQUIRED:'Bitte E-Mail-Adresse und Passwort eingeben.',
    COURSE_LIMIT_REACHED:'Das gebuchte Paket lässt keine weitere Klasse bzw. keinen weiteren Kurs zu.',
    CANNOT_REMOVE_OWN_TENANT_ADMIN:'Die eigene Administrationsrolle kann nicht entfernt werden.',

    // Einrichtung und Angebot
    ONBOARDING_NOT_FOUND:'Dieser Einrichtungslink ist ungültig.',
    ONBOARDING_EXPIRED:'Dieser Einrichtungslink ist abgelaufen. Bitte fordere einen neuen Link an.',
    ONBOARDING_UNAVAILABLE:'Dieser Einrichtungslink kann nicht mehr verwendet werden.',
    ONBOARDING_ALREADY_IN_PROGRESS:'Die Einrichtung wird bereits verarbeitet. Bitte einen Moment warten.',
    ONBOARDING_ALREADY_COMPLETED:'Diese Einrichtung ist bereits abgeschlossen.',
    ONBOARDING_NOT_OPEN:'Der Einrichtungslink ist nicht mehr offen. Die Ansicht wurde aktualisiert.',
    ONBOARDING_REQUIRED_FIELDS:'Bitte fülle alle mit * gekennzeichneten Felder aus.',
    ONBOARDING_RECOVERY_REQUIRED:'Die Einrichtung wird gerade bereinigt. Bitte in wenigen Minuten erneut versuchen.',
    ONBOARDING_SCHEMA_INCOMPATIBLE:'Die Einrichtung ist vorübergehend nicht verfügbar. Bitte später erneut versuchen.',
    DOUBLE_COST_CONFIRMATION_REQUIRED:'Bitte bestätige Buchung und Kosten jeweils separat.',
    OFFER_EXPIRED:'Dieses Angebot ist abgelaufen.',
    OFFER_NOT_ACCEPTED:'Das zugehörige Angebot ist nicht mehr gültig.',

    // Zahlungen bleiben im Portal bewusst deaktiviert
    PAYMENT_DISABLED:'Die Zahlungsabwicklung im Portal ist derzeit deaktiviert. Die Abrechnung erfolgt außerhalb des Portals.',
    PAYMENT_REQUIRED:'Für diese Aktion ist eine aktive Buchung erforderlich.',
    TRIAL_EXPIRED:'Die Testphase ist beendet.',
    TRIAL_READ_ONLY:'Die Testphase erlaubt derzeit nur lesenden Zugriff.',

    // Dateien
    MATERIAL_FILE_REQUIRED:'Bitte wähle eine Datei aus.',
    MATERIAL_FILE_EMPTY:'Die gewählte Datei ist leer.',
    MATERIAL_FILE_TOO_LARGE:'Die Datei ist zu groß. Erlaubt sind bis zu 25 MB.',
    MATERIAL_FILE_TYPE_INVALID:'Dieser Dateityp ist nicht zugelassen.',MICROSOFT_CLIENT_ID_REQUIRED:'Die Microsoft-365-Anbindung ist für diesen Bildungsträger noch nicht eingerichtet.',MICROSOFT_CLIENT_SECRET_REQUIRED:'Die Microsoft-365-Anbindung ist noch nicht vollständig eingerichtet.',MICROSOFT_AUTHORIZATION_URL_MISSING:'Die Anmeldung bei Microsoft konnte nicht vorbereitet werden.',MICROSOFT_ACCOUNT_NOT_CONNECTED:'Dein Konto ist noch nicht mit Microsoft 365 verbunden.',MICROSOFT_REAUTH_REQUIRED:'Die Verbindung zu Microsoft 365 muss erneuert werden.',MICROSOFT_GRAPH_PERMISSION_REQUIRED:'Microsoft hat die benötigten Kalenderrechte nicht freigegeben.',MICROSOFT_GRAPH_RATE_LIMITED:'Microsoft begrenzt die Anfragen gerade. Bitte kurz warten und erneut versuchen.',
    MATERIAL_NOT_FOUND:'Die Datei ist nicht mehr vorhanden.',

    // Importe: Der Nutzer muss erfahren, was er an seiner Datei ändern soll.
    IMPORT_FILE_REQUIRED:'Bitte wähle eine Datei aus.',
    IMPORT_FILE_TOO_LARGE:'Die Datei ist zu groß. Erlaubt sind bis zu 15 MB.',
    IMPORT_JSON_INVALID:'Die JSON-Datei ist nicht lesbar. Bitte das Format prüfen.',
    UNSUPPORTED_PARTICIPANT_IMPORT_FILE:'Dieses Dateiformat wird nicht unterstützt. Möglich sind CSV, XLSX, JSON und Text.',
    PDF_CLIENT_EXTRACTION_REQUIRED:'PDF-Dateien werden direkt im Browser ausgelesen. Bitte die Datei über die PDF-Auswahl hochladen.',
    PARTICIPANT_IMPORT_DATA_REQUIRED:'Die Datei enthält keine auswertbaren Zeilen. Bitte prüfen, ob Kopfzeile und mindestens ein Datensatz vorhanden sind.',
    PARTICIPANT_IMPORT_TOO_LARGE:'Die Datei enthält zu viele Zeilen für einen Durchgang. Bitte in kleineren Teilen importieren.',
    PARTICIPANT_IMPORT_NOT_FOUND:'Diese Importvorschau ist nicht mehr vorhanden. Bitte die Datei erneut hochladen.',
    PARTICIPANT_IMPORT_EXPIRED:'Die Importvorschau ist abgelaufen. Bitte die Datei erneut hochladen.',
    PARTICIPANT_IMPORT_NOT_PENDING:'Dieser Import wurde bereits abgeschlossen oder verworfen.',
    PARTICIPANT_IMPORT_PREVIEW_CHANGED:'Die Daten haben sich seit der Vorschau geändert. Bitte die Vorschau neu erzeugen und erneut prüfen.',
    ORG_IMPORT_DATA_REQUIRED:'Die Datei enthält keine auswertbaren Zeilen.',
    REVIEW_REQUIRED:'Einige Zeilen müssen vor dem Übernehmen geprüft und bestätigt werden.',
    VALUE_TOO_LONG:'Ein Feld ist zu lang. Bitte die Eingabe kürzen.',

    // Technisch
    INTERNAL_ERROR:'Die Aktion konnte gerade nicht ausgeführt werden. Bitte später erneut versuchen.',
    METHOD_NOT_ALLOWED:'Diese Aktion ist hier nicht möglich.',
    NOT_FOUND:'Der gewünschte Eintrag wurde nicht gefunden.',
    CSRF_ORIGIN_MISMATCH:'Die Anfrage kam nicht von dieser Seite. Bitte die Seite neu laden.',
    ORIGIN_MISMATCH:'Die Anfrage kam nicht von dieser Seite. Bitte die Seite neu laden.',
  };
  const GENERIC='Die Aktion konnte nicht ausgeführt werden. Bitte die Eingaben prüfen oder es später erneut versuchen.';
  const TECHNICAL=/^[A-Z][A-Z0-9_]{2,}$/;

  // Nimmt einen Fehler, einen Code oder einen Text und liefert immer einen lesbaren Satz.
  window.KP_ERROR_TEXT=function(value){
    const code=String((value&&value.message)||value||'').trim();
    if(TEXTS[code])return TEXTS[code];
    if(!code)return GENERIC;
    // Suffixe wie FIELD_REQUIRED:name auf den Grundcode zurückführen.
    const base=code.split(':')[0];
    if(TEXTS[base])return TEXTS[base];
    if(base==='FIELD_REQUIRED')return 'Bitte fülle alle Pflichtfelder aus.';
    if(TECHNICAL.test(code))return GENERIC;
    return code;
  };
  window.KP_ERROR_TEXTS=TEXTS;
})();
