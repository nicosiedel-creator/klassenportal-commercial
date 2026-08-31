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
    // Datei-Import: Organisation, Kurse, Faecher, Rollen
    // Rollen und Zuordnungen
    FORBIDDEN_ROLE_ASSIGNMENT:'Diese Rolle darfst du nicht vergeben. Klassenverantwortliche können Teilnehmende und Gäste ihrer Klasse verwalten; alles Weitere kann die Kundenadministration.',
    CLASS_ADMIN_PARTICIPANT_MANAGED:'Diese Person ist Klassenverantwortliche/r ihrer Klasse. Nimm ihr zuerst dieses Zusatzrecht, danach lässt sich die Zuordnung ändern.',
    CANNOT_REMOVE_OWN_TENANT_ADMIN:'Dein eigenes Kunden-Admin-Recht kannst du dir nicht entziehen – sonst sperrst du dich aus. Lege zuerst eine zweite Person als Kunden-Admin an.',
    // Unterrichtsstunden aus einem Stundenplan
    LESSON_DATE_REQUIRED:'Diese Unterrichtsstunde hat kein lesbares Datum. Ohne Datum lässt sie sich nicht in den Stundenplan einordnen.',
    LESSON_TIME_REQUIRED:'Dieser Unterrichtsstunde fehlt der Beginn oder das Ende. Beides wird für den Stundenplan gebraucht.',
    LESSON_END_BEFORE_START:'Das Ende dieser Unterrichtsstunde liegt vor ihrem Beginn.',
    COURSE_NOT_RESOLVED:'Die Klasse bzw. der Kurs dieser Zeile konnte nicht eindeutig zugeordnet werden.',
    // Portalrollen für Beschäftigte
    STAFF_ORG_UNIT_REQUIRED:'Diese beschäftigte Person nennt keinen Bereich. Eine Freigabe gilt immer für einen Standort oder Bereich – ohne den lässt sie sich nicht erteilen.',
    STAFF_ORG_UNIT_NOT_FOUND:'Der angegebene Bereich wurde im Portal nicht gefunden. Lies zuerst das Organigramm ein oder lege den Bereich an.',
    ACCESS_RESPONSIBLE_CONFIRMATION_REQUIRED:'„Verantwortlich“ schließt das Recht ein, weiteren Personen Rechte zu vergeben. Das wird über den Sammelimport nie automatisch erteilt – vergib es unter „Struktur, Standorte & Zuständigkeiten“.',
    SELF_ELEVATION_FORBIDDEN:'Du kannst dir selbst keine Verantwortlichen-Freigabe erteilen.',
    GRANT_VALIDITY_INVALID:'Das Ende der Gültigkeit muss nach ihrem Beginn liegen.',
    ORG_PROFILE_INVALID:'Dieses Rechteprofil gibt es nicht.',
    // Standorte, Organisationseinheiten und Ressourcen
    ORG_UNIT_NAME_REQUIRED:'Diese Zeile hat keinen Namen für die Einheit. Ohne Namen lässt sich kein Standort und kein Bereich anlegen.',
    ORG_UNIT_PARENT_INVALID:'Eine Einheit kann nicht ihr eigener übergeordneter Knoten sein.',
    ORG_UNIT_PARENT_UNRESOLVED:'Der übergeordnete Knoten dieser Einheit konnte nicht aufgelöst werden. Bitte die Spalte parent_external_id prüfen.',
    ORG_UNIT_TYPE_INACTIVE:'Dieser Einheitentyp ist in eurem Portal abgeschaltet. Bitte ihn unter Organisation & Struktur wieder aktivieren oder in der Datei einen anderen Typ angeben.',
    ORG_UNIT_TYPE_MISSING:'Der Typ dieser Einheit konnte nicht angelegt werden. Bitte unter Organisation & Struktur einen Typ anlegen und den Import wiederholen.',
    ORG_TYPE_NOT_FOUND:'Dieser Einheitentyp ist in eurem Portal nicht vorhanden.',
    ORG_TYPE_INVALID:'Dieser Einheitentyp ist nicht zulässig. Erlaubt sind Kleinbuchstaben, Ziffern, Bindestrich und Unterstrich.',
    ORG_EXTERNAL_ID_EXISTS:'Eine Einheit mit dieser externen Kennung gibt es bereits.',
    ORG_UNIT_FIELDS_REQUIRED:'Für eine Einheit werden Name und Typ benötigt.',
    ORG_UNIT_NOT_FOUND:'Diese Organisationseinheit wurde nicht gefunden.',
    ORG_HIERARCHY_CYCLE:'Diese Zuordnung würde einen Ringschluss in der Organisationsstruktur erzeugen.',
    FORBIDDEN_ORG_SCOPE:'Für diese Organisationseinheit fehlt dir die Berechtigung.',
    RESOURCE_NAME_REQUIRED:'Diese Zeile hat keinen Namen für den Raum bzw. die Ressource.',
    FORBIDDEN_PLANNING_MANAGE:'Räume und Ressourcen darf nur die Kundenadministration oder eine Person mit Kursverwaltungsrecht pflegen.',
    UNSUPPORTED_ORGANIZATION_IMPORT_FILE:'Dieses Dateiformat wird nicht unterstützt. Möglich sind CSV, XLSX, JSON, TXT und textbasierte PDF.',
    IMPORT_JSON_ROWS_REQUIRED:'Diese JSON-Datei enthält keine Datensätze. Erwartet wird eine Liste oder ein Feld "rows".',
    ORGANIZATION_IMPORT_DATA_REQUIRED:'Aus dieser Datei ließ sich keine verwertbare Zeile lesen. Bitte prüfe, ob die erste Zeile die Spaltenüberschriften enthält.',
    ORGANIZATION_IMPORT_TOO_LARGE:'Diese Datei enthält zu viele Zeilen. Bitte in kleineren Teilen einlesen.',
    ORGANIZATION_IMPORT_NOT_FOUND:'Diese Vorschau ist nicht mehr vorhanden. Bitte die Datei erneut einlesen.',
    ORGANIZATION_IMPORT_NOT_PENDING:'Diese Vorschau wurde bereits übernommen.',
    ORGANIZATION_IMPORT_EXPIRED:'Die Vorschau ist abgelaufen. Bitte die Datei erneut einlesen.',
    ORGANIZATION_IMPORT_PREVIEW_CHANGED:'Die Vorschau hat sich zwischenzeitlich geändert. Bitte die Datei erneut einlesen.',
    SUBJECT_NAME_REQUIRED:'Für ein Fach fehlt der Name.',
    TEACHER_NAME_REQUIRED:'Für eine Lehrkraft fehlt der Name.',
    COURSE_NOT_RESOLVED:'Der Kurs ließ sich nicht eindeutig zuordnen. Bitte Kursname oder Kurscode ergänzen.',
    // Excel im Einzelnen: der Grund gehoert benannt, ohne Innereien preiszugeben.
    XLSX_NO_WORKSHEET:'Diese Excel-Datei enthält kein lesbares Tabellenblatt.',
    XLSX_CELL_TOO_LARGE:'Eine Zelle dieser Excel-Datei enthält zu viel Text.',
    XLSX_TOO_MANY_ROWS:'Diese Excel-Datei enthält zu viele Zeilen. Bitte in kleineren Teilen einlesen.',
    XLSX_TOO_MANY_COLUMNS:'Diese Excel-Datei enthält zu viele Spalten.',
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
    ACCESS_CODE_REQUIRED:'Für diese Zugangsart wird ein Zugangscode mit mindestens 10 Zeichen benötigt.',
    ACCESS_MODE_INVALID:'Die gewählte Zugangsart ist ungültig.',
    ROLE_INVALID:'Die gewählte Rolle ist ungültig.',
    EMAIL_INVALID:'Bitte gib eine gültige E-Mail-Adresse ein.',
    CUSTOMER_EMAIL_INVALID:'Bitte gib eine gültige E-Mail-Adresse ein.',
    EMAIL_PASSWORD_REQUIRED:'Bitte E-Mail-Adresse und Passwort eingeben.',
    COURSE_LIMIT_REACHED:'Das gebuchte Paket lässt keine weitere Klasse bzw. keinen weiteren Kurs zu.',

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

    // Angebote in der Plattformverwaltung
    OFFER_NOT_FOUND:'Das Angebot wurde nicht gefunden.',
    OFFER_ALREADY_ACCEPTED:'Das Angebot wurde bereits angenommen.',
    OFFER_NOT_DRAFT:'Das Angebot ist kein Entwurf mehr und lässt sich so nicht mehr ändern.',
    OFFER_NOT_CANCELLABLE:'Nur Entwürfe und versendete Angebote lassen sich stornieren.',
    OFFER_LINK_NOT_AVAILABLE:'Ein Angebotslink lässt sich nur für Entwürfe und versendete Angebote erzeugen.',
    OFFER_EMAIL_NOT_AVAILABLE:'Ein Angebot lässt sich nur als Entwurf oder nach dem Versand per E-Mail schicken.',
    OFFER_ONBOARDING_ALREADY_COMPLETED:'Die Einrichtung zu diesem Angebot ist bereits abgeschlossen.',

    // Einrichtung, die vor einer Aktion vollständig sein muss
    MAIL_PROVIDER_NOT_CONFIGURED:'Der Versanddienst für E-Mails ist noch nicht eingerichtet.',
    STRIPE_NOT_CONFIGURED:'Die Zahlungsabwicklung ist nicht eingerichtet.',
    SELLER_PROFILE_INCOMPLETE:'Die Anbieter- und Rechnungsdaten sind noch unvollständig.',
    LEGAL_CONFIGURATION_INCOMPLETE:'Impressum, Datenschutz, AGB und Auftragsverarbeitung müssen zuerst vollständig freigegeben sein.',
    PRICING_NOT_CONFIGURED:'Für diesen Tarif fehlt eine freigegebene Preisregel oder ein manueller Preis.',

    // Module in der Kundenverwaltung
    MODULE_ALREADY_ACTIVE:'Dieses Modul ist bereits aktiv.',
    MODULE_NOT_ACTIVE:'Dieses Modul ist für diese Organisation nicht aktiv.',
    MODULE_ALREADY_ON_SUBSCRIPTION:'Dieses Modul gehört bereits zum laufenden Abonnement.',
    MODULE_PAYMENT_PENDING:'Für dieses Modul steht noch eine Zahlung aus.',
    MODULE_SELF_SERVICE_DISABLED:'Dieses Modul lässt sich nicht selbst buchen. Bitte wende dich an die Betreuung.',
    MODULE_CANCELLATION_ALREADY_SCHEDULED:'Für dieses Modul ist bereits eine Kündigung vorgemerkt.',
    MODULE_CANCELLATION_ALREADY_DUE:'Die Kündigung für dieses Modul ist bereits fällig.',
    SELF_SERVICE_DOWNGRADE_NOT_ALLOWED:'Ein Wechsel in einen kleineren Tarif ist in der Selbstverwaltung nicht möglich. Bitte wende dich an die Betreuung.',
    ACTIVE_BILLING_MUST_END_FIRST:'Dazu muss die laufende Abrechnung zuerst beendet werden.',

    // Umfragen und Live-Einheiten, die Teilnehmende selbst bedienen
    SURVEY_CLOSED:'Diese Umfrage ist bereits geschlossen.',
    SURVEY_ALREADY_VOTED:'Du hast an dieser Umfrage bereits teilgenommen.',
    LIVE_STUDY_NOT_FOUND:'Diese Live-Einheit wurde nicht gefunden.',
    LIVE_STUDY_CAPACITY_REACHED:'Diese Live-Einheit ist voll besetzt.',
    PARTICIPANT_TOKEN_INVALID:'Dieser Teilnahmelink ist ungültig oder abgelaufen.',
    PRESENTER_TOKEN_INVALID:'Dieser Moderationslink ist ungültig oder abgelaufen.',

    // Stundenplan
    TIMETABLE_FILE_UNSUPPORTED:'Dieses Dateiformat wird für den Stundenplan nicht unterstützt.',
    TIMETABLE_BATCH_CONFIRMATION_REQUIRED:'Die Übernahme für alle Klassen muss ausdrücklich bestätigt werden.',

    // Rechte, die eine Aktion ausschließen
    FORBIDDEN_COURSE_SCOPE:'Für diese Klasse bzw. diesen Kurs fehlt die Berechtigung.',
    SELF_ELEVATION_FORBIDDEN:'Eigene Rechte lassen sich nicht selbst erweitern.',
    PLATFORM_ADMIN_RESET_FORBIDDEN:'Das Passwort einer Plattformverwaltung lässt sich hier nicht zurücksetzen.',
    PRIMARY_RESPONSIBILITY_TENANT_ADMIN_REQUIRED:'Die Hauptverantwortung darf nur die Organisationsverwaltung vergeben.',
    STRONG_AUTH_REQUIRED:'Diese Aktion setzt eine Anmeldung mit Passwort oder Unternehmenszugang voraus.',
    PLATFORM_ORIGIN_MISMATCH:'Die Plattformverwaltung lässt sich nur über die offizielle Adresse des Portals anmelden.',

    // Nicht gefunden - benannt statt allgemein, damit klar ist, wonach gesucht wurde
    TENANT_NOT_FOUND:'Diese Organisation wurde nicht gefunden.',
    USER_NOT_FOUND:'Diese Person wurde nicht gefunden.',
    PARTICIPANT_NOT_FOUND:'Diese teilnehmende Person wurde nicht gefunden.',
    TEACHER_NOT_FOUND:'Diese Lehrkraft wurde nicht gefunden.',
    LESSON_NOT_FOUND:'Diese Unterrichtseinheit wurde nicht gefunden.',
    EXAM_NOT_FOUND:'Diese Prüfung wurde nicht gefunden.',
    ORG_UNIT_NOT_FOUND:'Dieser Organisationsbereich wurde nicht gefunden.',
    PLAN_NOT_FOUND:'Dieser Tarif wurde nicht gefunden.',
    ATTENDANCE_SESSION_NOT_FOUND:'Diese Anwesenheitserfassung wurde nicht gefunden.',
    RESOURCE_NOT_FOUND:'Diese Ressource wurde nicht gefunden.',

    // Eingaben, die der Nutzer selbst korrigieren kann
    DATE_INVALID:'Bitte ein gültiges Datum angeben.',
    ENUM_VALUE_INVALID:'Bitte einen der angebotenen Werte auswählen.',
    USER_FIELDS_REQUIRED:'Bitte alle Pflichtfelder zur Person ausfüllen.',
    PARTICIPANT_REQUIRED:'Bitte mindestens eine teilnehmende Person auswählen.',
    TENANT_REQUIRED:'Bitte zuerst eine Organisation auswählen.',
    DOMAIN_INVALID:'Bitte eine gültige Domain angeben, etwa beispiel.de.',

    // Zu viele Versuche
    LEGAL_REPORT_RATE_LIMITED:'Es wurden zu viele Meldungen in kurzer Zeit abgeschickt. Bitte später erneut versuchen.',
    API_RATE_LIMITED:'Zu viele Anfragen in kurzer Zeit. Bitte einen Moment warten und es dann erneut versuchen.',
  };
  const GENERIC='Die Aktion konnte nicht ausgeführt werden. Bitte die Eingaben prüfen oder es später erneut versuchen.';
  const TECHNICAL=/^[A-Z][A-Z0-9_]{2,}$/;

  // Nimmt einen Fehler, einen Code oder einen Text und liefert immer einen lesbaren Satz.
  window.KP_ERROR_TEXT=function(value){
    // Ein Fehler ohne Meldung ist kein Text: (value&&value.message)||value fiel dann auf das
    // Objekt selbst zurueck, und der Nutzer bekam "Error" zu sehen - bei einem beliebigen
    // Objekt sogar "[object Object]". Nur eine echte Zeichenkette zaehlt als Meldung.
    const raw=value&&typeof value.message==='string'?value.message:(typeof value==='string'?value:'');
    const code=String(raw).trim();
    if(TEXTS[code])return TEXTS[code];
    if(!code)return GENERIC;
    // Suffixe wie FIELD_REQUIRED:name auf den Grundcode zurückführen.
    const base=code.split(':')[0];
    if(TEXTS[base])return TEXTS[base];
    if(base==='FIELD_REQUIRED')return 'Bitte fülle alle Pflichtfelder aus.';
    // Der Leser fuer Excel-Dateien kennt viele einzelne Abbruchgruende. Sie alle sagen dem
    // Kunden dasselbe: diese Datei laesst sich nicht lesen, und so kommt er weiter. Ein
    // technischer Code wie XLSX_ZIP_EOCD_MISSING hilft ihm dabei nicht.
    if(base.startsWith('XLSX_'))return 'Diese Excel-Datei ließ sich nicht lesen. Bitte in Excel erneut als .xlsx speichern oder als CSV exportieren.';
    if(TECHNICAL.test(code))return GENERIC;
    return code;
  };
  window.KP_ERROR_TEXTS=TEXTS;
})();
