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
    // Prüfungen aus einer Prüfungsliste oder einem Prüfungskalender
    EXAM_TITLE_REQUIRED:'Dieser Prüfung fehlt die Bezeichnung. Ohne sie lässt sich nicht erkennen, worum es in der Prüfung geht.',
    EXAM_TIME_REQUIRED:'Dieser Prüfung fehlt das Datum oder der Beginn. Beides wird für den Prüfungstermin gebraucht.',
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
    TENANT_SUSPENDED:'Dieser Zugang ist derzeit gesperrt. Änderungen sind nicht möglich; die vorhandenen Daten bleiben sichtbar. Bitte wende Dich an Deine Ansprechperson.',
    TENANT_INACTIVE:'Dieser Zugang ist beendet.',
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

    // Aufgaben und Abgaben
    ASSIGNMENT_NOT_FOUND:'Diese Aufgabe wurde nicht gefunden.',
    ASSIGNMENT_MODE_INVALID:'Bitte eine der angebotenen Abgabearten auswählen.',
    ASSIGNMENT_MAX_POINTS_INVALID:'Bitte eine gültige Höchstpunktzahl angeben.',
    ASSIGNMENT_MAX_FILES_INVALID:'Bitte eine gültige Höchstzahl an Dateien angeben.',
    ASSIGNMENT_DEADLINE_PASSED:'Die Abgabefrist ist abgelaufen.',
    ASSIGNMENT_FILES_REQUIRED:'Für diese Aufgabe ist mindestens eine Datei abzugeben.',
    ASSIGNMENT_FILE_NOT_ALLOWED:'Für diese Aufgabe sind keine Dateien vorgesehen.',
    ASSIGNMENT_TEXT_NOT_ALLOWED:'Für diese Aufgabe ist keine Texteingabe vorgesehen.',
    ASSIGNMENT_NO_SUBMISSION:'Zu dieser Aufgabe liegt noch keine Abgabe vor.',
    SUBMISSION_NOT_FOUND:'Diese Abgabe wurde nicht gefunden.',
    SUBMISSION_ALREADY_SUBMITTED:'Diese Abgabe wurde bereits eingereicht.',
    SUBMISSION_NOT_SUBMITTED:'Diese Abgabe wurde noch nicht eingereicht.',
    SUBMISSION_CONTENT_REQUIRED:'Bitte einen Text schreiben oder eine Datei anhängen.',
    SUBMISSION_TEXT_REQUIRED:'Bitte einen Text eingeben.',
    SUBMISSION_FILE_REQUIRED:'Bitte mindestens eine Datei anhängen.',
    SUBMISSION_FILE_NOT_FOUND:'Diese Datei wurde nicht gefunden.',
    SUBMISSION_FILE_EMPTY:'Diese Datei ist leer.',
    SUBMISSION_FILE_LIMIT:'Es sind zu viele Dateien angehängt.',
    SUBMISSION_FILE_TOO_LARGE:'Diese Datei ist zu groß.',
    SUBMISSION_FILE_TYPE_INVALID:'Dieser Dateityp ist für diese Aufgabe nicht zugelassen.',
    SUBMISSION_FILE_SIGNATURE_INVALID:'Der Inhalt dieser Datei passt nicht zu ihrer Endung. Bitte die Datei prüfen.',
    SUBMISSION_DUPLICATE_FILE:'Diese Datei ist bereits angehängt.',
    SUBMISSION_GRADED_LOCKED:'Diese Abgabe ist bereits bewertet und kann nicht mehr geändert werden.',
    SUBMISSION_NOT_GRADABLE:'Diese Abgabe kann in ihrem aktuellen Stand nicht bewertet werden.',
    SUBMISSION_NOT_RETURNABLE:'Diese Abgabe kann in ihrem aktuellen Stand nicht zurückgegeben werden.',
    SUBMISSION_WITHDRAWAL_NOT_ALLOWED:'Diese Abgabe kann nicht mehr zurückgezogen werden.',
    SUBMISSION_CREATE_FAILED:'Die Abgabe konnte nicht angelegt werden. Bitte erneut versuchen.',
    RETURN_NOTE_REQUIRED:'Bitte eine Rückmeldung für die zurückgegebene Abgabe schreiben.',
    FORBIDDEN_SUBMISSION:'Für diese Abgabe fehlt die erforderliche Berechtigung.',
    MATERIAL_UPLOAD_FAILED:'Die Datei konnte nicht abgelegt werden. Bitte erneut versuchen.',

    // Notenbuch und Notenskala
    GRADE_POINTS_INVALID:'Bitte eine gültige Punktzahl innerhalb der Höchstpunktzahl angeben.',
    BULK_GRADE_INVALID:'Mindestens eine Bewertung der Sammeleingabe ist ungültig.',
    BULK_GRADE_PARTICIPANT_INVALID:'Eine Person der Sammeleingabe gehört nicht zu dieser Klasse.',
    GRADEBOOK_ITEM_FAILED:'Diese Bewertung konnte nicht gespeichert werden. Bitte erneut versuchen.',
    CATEGORY_NOT_FOUND:'Diese Notenkategorie wurde nicht gefunden.',
    CATEGORY_NAME_REQUIRED:'Bitte eine Bezeichnung für die Kategorie angeben.',
    CATEGORY_NAME_DUPLICATE:'Eine Kategorie mit dieser Bezeichnung ist bereits vorhanden.',
    CATEGORY_RENAME_NOT_ALLOWED:'Diese Kategorie kann nicht umbenannt werden.',
    CATEGORY_POLICY_INVALID:'Bitte eine der angebotenen Gewichtungsarten auswählen.',
    CATEGORY_WEIGHT_TOTAL_INVALID:'Die Gewichte der Kategorien ergeben keine gültige Summe.',
    CATEGORY_WEIGHT_TOTAL_EXCEEDED:'Die Gewichte der Kategorien überschreiten zusammen 100 Prozent.',
    GRADING_SCALE_INVALID:'Diese Notenskala ist nicht gültig.',
    GRADING_SCALE_GAP:'In der Notenskala fehlt ein Bereich. Die Stufen müssen lückenlos aneinander anschließen.',
    GRADING_SCALE_OVERLAP:'Zwei Stufen der Notenskala überschneiden sich.',
    GRADING_SCALE_LABEL_DUPLICATE:'Zwei Stufen der Notenskala tragen dieselbe Bezeichnung.',
    GRADING_SCALE_COVERAGE_REQUIRED:'Die Notenskala muss den gesamten Bereich von 0 bis 100 Prozent abdecken.',
    GRADING_SCALE_STORED_INVALID:'Die hinterlegte Notenskala ist nicht mehr gültig. Bitte sie neu festlegen.',

    // Tests und Fragenkataloge
    QUIZ_NOT_FOUND:'Dieser Test wurde nicht gefunden.',
    QUIZ_INVALID:'Dieser Test ist nicht gültig.',
    QUIZ_EMPTY:'Dieser Test enthält noch keine Fragen.',
    QUIZ_NOT_AVAILABLE:'Dieser Test steht derzeit nicht zur Verfügung.',
    QUIZ_WINDOW_CLOSED:'Das Zeitfenster für diesen Test ist geschlossen.',
    QUIZ_TIME_EXPIRED:'Die Bearbeitungszeit ist abgelaufen.',
    QUIZ_ATTEMPTS_EXHAUSTED:'Die zulässige Zahl an Versuchen ist aufgebraucht.',
    QUIZ_ATTEMPT_NOT_FOUND:'Dieser Versuch wurde nicht gefunden.',
    QUIZ_ATTEMPT_LOCKED:'Dieser Versuch ist abgeschlossen und kann nicht mehr geändert werden.',
    QUIZ_ATTEMPT_NOT_GRADABLE:'Dieser Versuch kann in seinem aktuellen Stand nicht bewertet werden.',
    QUIZ_MANUAL_GRADE_INVALID:'Bitte eine gültige Punktzahl für die Bewertung von Hand angeben.',
    QUIZ_ANSWER_TOO_LARGE:'Diese Antwort ist zu lang.',
    QUIZ_POLICY_INVALID:'Bitte gültige Regeln für den Test angeben.',
    QUIZ_QUESTION_NOT_FOUND:'Diese Frage wurde nicht gefunden.',
    QUIZ_QUESTION_SCOPE_INVALID:'Diese Frage gehört nicht zu diesem Test.',
    QUESTION_INVALID:'Diese Frage ist nicht vollständig.',
    QUESTION_OPTIONS_INVALID:'Bitte gültige Antwortmöglichkeiten angeben.',
    QUESTION_ANSWER_KEY_INVALID:'Die hinterlegte Musterlösung passt nicht zu den Antwortmöglichkeiten.',
    QUESTION_BANK_NOT_FOUND:'Dieser Fragenkatalog wurde nicht gefunden.',
    QUESTION_BANK_TITLE_REQUIRED:'Bitte eine Bezeichnung für den Fragenkatalog angeben.',

    // Unterrichtsdrehscheibe und Kursvorlagen
    LESSON_HUB_DATE_INVALID:'Bitte ein gültiges Datum angeben.',
    LESSON_HUB_MODE_INVALID:'Bitte eine der angebotenen Unterrichtsformen auswählen.',
    LESSON_HUB_MATERIAL_INVALID:'Dieses Material ist nicht gültig.',
    LESSON_HUB_LINK_URL_REQUIRED:'Bitte eine Adresse für den Link angeben.',
    LESSON_HUB_LINK_URL_INVALID:'Bitte eine gültige Adresse angeben, beginnend mit https://.',
    LESSON_HUB_TOO_MANY_LINKS:'Es sind zu viele Links angehängt.',
    LESSON_HUB_TOO_MANY_MATERIALS:'Es sind zu viele Materialien angehängt.',
    ACTIVITY_TYPE_INVALID:'Bitte eine der angebotenen Aktivitätsarten auswählen.',
    COURSE_TEMPLATE_NOT_FOUND:'Diese Kursvorlage wurde nicht gefunden.',
    COURSE_CLONE_TARGET_REQUIRED:'Bitte angeben, in welche Klasse übernommen werden soll.',
    COURSE_CLONE_FAILED:'Die Übernahme ist nicht vollständig gelungen. Bitte das Ergebnis prüfen.',
    PARTICIPANT_NOT_IN_COURSE:'Diese Person gehört nicht zu dieser Klasse.',

    // Selbstlernphasen im laufenden Unterricht
    LIVE_STUDY_NOT_FOUND:'Diese Selbstlernphase wurde nicht gefunden.',
    LIVE_STUDY_NOT_STARTED:'Diese Selbstlernphase hat noch nicht begonnen.',
    LIVE_STUDY_NOT_OPEN:'Diese Selbstlernphase ist derzeit nicht geöffnet.',
    LIVE_STUDY_CLOSED:'Diese Selbstlernphase ist geschlossen.',
    LIVE_STUDY_ENDED:'Diese Selbstlernphase ist beendet.',
    LIVE_STUDY_EXPIRED:'Der Zugang zu dieser Selbstlernphase ist abgelaufen.',
    LIVE_STUDY_ALREADY_SUBMITTED:'Für diese Selbstlernphase wurde bereits eine Rückmeldung abgegeben.',

    // Meldungen an Klassen und Bereiche
    COMMUNICATION_NOT_FOUND:'Diese Meldung wurde nicht gefunden.',
    COMMUNICATION_FIELDS_REQUIRED:'Bitte alle Pflichtfelder der Meldung ausfüllen.',
    COMMUNICATION_DATE_INVALID:'Bitte ein gültiges Datum angeben.',
    COMMUNICATION_WINDOW_INVALID:'Bitte einen gültigen Anzeigezeitraum angeben; das Ende darf nicht vor dem Beginn liegen.',
    COMMUNICATION_PRIORITY_INVALID:'Bitte eine der angebotenen Dringlichkeiten auswählen.',
    COMMUNICATION_TARGET_REQUIRED:'Bitte angeben, wer die Meldung erhalten soll.',
    COMMUNICATION_TARGET_INVALID:'Diese Empfängergruppe ist nicht gültig.',
    COMMUNICATION_TOO_MANY_TARGETS:'Es wurden zu viele Empfängergruppen ausgewählt.',
    COMMUNICATION_NO_RECIPIENTS:'Zu dieser Auswahl gibt es derzeit niemanden, der die Meldung erhalten würde.',
    COMMUNICATION_NOT_PUBLISHABLE:'Diese Meldung kann in ihrem aktuellen Stand nicht veröffentlicht werden.',
    COMMUNICATION_ACK_DUE_INVALID:'Bitte eine gültige Frist für die Lesebestätigung angeben.',
    COMMUNICATION_ACK_NOT_AVAILABLE:'Für diese Meldung ist keine Lesebestätigung vorgesehen.',
    COMMUNICATION_MAIL_NOT_CONFIGURED:'Der Mailversand ist für dieses Portal nicht eingerichtet. Die Meldung erscheint weiterhin im Portal.',
    FORBIDDEN_COMMUNICATION_SCOPE:'Für diesen Empfängerkreis fehlt die erforderliche Berechtigung.',

    // Verantwortlichkeiten
    RESPONSIBILITY_NOT_FOUND:'Diese Verantwortlichkeit wurde nicht gefunden.',
    RESPONSIBILITY_ALREADY_EXISTS:'Diese Verantwortlichkeit ist bereits vergeben.',
    RESPONSIBILITY_KIND_INVALID:'Bitte eine der angebotenen Arten von Verantwortlichkeit auswählen.',
    RESPONSIBILITY_TARGET_REQUIRED:'Bitte angeben, wofür die Verantwortlichkeit gelten soll.',
    RESPONSIBILITY_DATE_INVALID:'Bitte ein gültiges Datum angeben.',
    RESPONSIBILITY_VALIDITY_INVALID:'Bitte einen gültigen Gültigkeitszeitraum angeben; das Ende darf nicht vor dem Beginn liegen.',
    PRIMARY_RESPONSIBILITY_MUST_START_NOW:'Eine Hauptverantwortung kann nicht mit Wirkung in der Zukunft beginnen - sie gilt ab sofort.',
    CANNOT_REVOKE_OWN_RESPONSIBILITY:'Die eigene Verantwortlichkeit kann nicht selbst entzogen werden. Bitte eine andere verantwortliche Person darum bitten.',
    FORBIDDEN_RESPONSIBILITY_SCOPE:'Für diesen Bereich fehlt die erforderliche Berechtigung.',
    PLATFORM_ADMIN_RESPONSIBILITY_FORBIDDEN:'Ein Plattformkonto kann keine Verantwortlichkeit in einem Kundenmandanten übernehmen.',
    APPROVAL_DECISION_INVALID:'Bitte eine der angebotenen Entscheidungen auswählen.',

    // Autopilot: Vorschlag, Freigabe, Ausführung
    AUTOPILOT_ACTION_UNSUPPORTED:'Diese Maßnahme kann der Autopilot nicht ausführen.',
    AUTOPILOT_ACTION_FORBIDDEN:'Für diese Maßnahme fehlt die erforderliche Berechtigung.',
    AUTOPILOT_ACTION_LIMIT:'Es wurden zu viele Maßnahmen auf einmal angefordert.',
    AUTOPILOT_APPROVAL_REQUIRED:'Diese Maßnahme wird erst nach ausdrücklicher Freigabe ausgeführt.',
    AUTOPILOT_SECOND_ADMIN_REQUIRED:'Diese Maßnahme verlangt die Freigabe einer zweiten verantwortlichen Person.',
    AUTOPILOT_CRITICAL_MANUAL_ONLY:'Diese Maßnahme ist zu weitreichend für eine automatische Ausführung und bleibt der Bearbeitung von Hand vorbehalten.',
    AUTOPILOT_POLICY_MODE_INVALID:'Bitte eine der angebotenen Betriebsarten für den Autopiloten auswählen.',
    AUTOPILOT_POLICY_RISK_INVALID:'Bitte eine gültige Risikogrenze angeben.',
    AUTOPILOT_POLICY_DUAL_INVALID:'Die Einstellung zur Freigabe durch zwei Personen ist nicht gültig.',
    AUTOPILOT_POLICY_RECOMMEND_ONLY:'Der Autopilot ist auf "nur vorschlagen" eingestellt und führt nichts aus.',
    AUTOPILOT_TENANT_LOCKED:'Der Autopilot ist für diesen Kunden gesperrt.',
    AUTOPILOT_COURSE_LIMIT:'Es sind zu viele Klassen für einen Lauf ausgewählt.',
    AUTOPILOT_COURSE_SCOPE_INVALID:'Diese Klasse gehört nicht zum gewählten Bereich.',
    AUTOPILOT_TIME_INVALID:'Bitte einen gültigen Zeitraum angeben.',
    AUTOPILOT_TWIN_CHANGED_RESIMULATE:'Die Betriebsdaten haben sich seit der Simulation geändert. Bitte erneut durchspielen, bevor etwas ausgeführt wird.',
    AUTOPILOT_ROLLBACK_WINDOW_EXPIRED:'Die Frist für die Rücknahme dieser Ausführung ist abgelaufen.',
    AUTOPILOT_EXECUTION_NOT_ROLLBACKABLE:'Diese Ausführung lässt sich nicht zurücknehmen.',
    SCENARIO_NOT_FOUND:'Dieser Vorgang wurde nicht gefunden.',
    SCENARIO_EXPIRED:'Dieser Vorgang ist abgelaufen. Bitte ihn erneut durchspielen.',
    SCENARIO_NOT_APPROVABLE:'Dieser Vorgang kann in seinem aktuellen Stand nicht freigegeben werden.',
    SCENARIO_NOT_EXECUTABLE:'Dieser Vorgang kann in seinem aktuellen Stand nicht ausgeführt werden.',
    SCENARIO_OPTION_NOT_FOUND:'Diese Handlungsmöglichkeit wurde nicht gefunden.',
    SCENARIO_OPTION_NOT_EXECUTABLE:'Diese Handlungsmöglichkeit kann nicht ausgeführt werden.',
    SCENARIO_PLAN_DIGEST_MISMATCH:'Der Plan hat sich seit der Freigabe geändert. Aus Sicherheitsgründen wird nichts ausgeführt; bitte erneut prüfen.',
    SCENARIO_SNAPSHOT_DIGEST_MISMATCH:'Die zugrunde liegenden Daten haben sich seit der Freigabe geändert. Aus Sicherheitsgründen wird nichts ausgeführt; bitte erneut prüfen.',
    TWIN_SNAPSHOT_NOT_FOUND:'Zu diesem Zeitpunkt liegt kein Abbild der Betriebsdaten vor.',

    // Eigene Domain
    CUSTOM_DOMAIN_NOT_FOUND:'Diese Domain wurde nicht gefunden.',
    CUSTOM_DOMAIN_REQUIRED:'Bitte eine Domain angeben.',
    CUSTOM_DOMAIN_INVALID:'Bitte eine gültige Domain angeben, etwa portal.beispiel.de.',
    CUSTOM_DOMAIN_RESERVED:'Diese Domain ist reserviert und kann nicht verwendet werden.',
    CUSTOM_DOMAIN_ALREADY_IN_USE:'Diese Domain wird bereits verwendet.',
    CUSTOM_DOMAIN_MODULE_NOT_ACTIVE:'Das Modul für eigene Domains ist nicht freigeschaltet.',
    CUSTOM_DOMAIN_REPLACEMENT_REQUIRES_REMOVAL:'Bitte zuerst die bestehende Domain entfernen, bevor eine neue eingerichtet wird.',
    CUSTOM_DOMAIN_PROVIDER_NOT_CONFIGURED:'Die Anbindung für eigene Domains ist noch nicht eingerichtet. Bitte an den Support wenden.',
    CUSTOM_DOMAIN_PROVIDER_ID_MISSING:'Zu dieser Domain fehlt die Kennung beim Anbieter. Bitte an den Support wenden.',
    TENANT_SECRETS_ENCRYPTION_KEY_REQUIRED:'Die sichere Ablage von Zugangsdaten ist für dieses Portal noch nicht eingerichtet. Bitte an den Support wenden.',
    FORBIDDEN_PLATFORM_ADMIN_TENANT_INTEGRATION:'Diese Anbindung richtet der Kunde selbst ein; ein Plattformkonto kann das nicht übernehmen.',

    // Microsoft-Anbindung
    MICROSOFT_ACCOUNT_NOT_CONNECTED:'Es ist noch kein Microsoft-Konto verbunden.',
    MICROSOFT_CLIENT_ID_REQUIRED:'Bitte die Anwendungskennung der Microsoft-Anbindung angeben.',
    MICROSOFT_CLIENT_SECRET_REQUIRED:'Bitte den Schlüssel der Microsoft-Anbindung angeben.',
    MICROSOFT_GRAPH_MEETING_REQUIRED:'Zu diesem Termin gibt es keine Microsoft-Besprechung.',
    MICROSOFT_MEETING_ORGANIZER_MISMATCH:'Diese Besprechung wurde von einem anderen Konto angelegt und kann hier nicht geändert werden.',
    MICROSOFT_EVENT_ATTENDEE_LIMIT:'Dieser Termin hat zu viele Teilnehmende für die Microsoft-Anbindung.',

    // Anwesenheit und Klassenbuch - der meistbenutzte Teil des Tagesbetriebs
    ATTENDANCE_DATE_INVALID:'Bitte ein gültiges Datum für die Anwesenheit angeben.',
    ATTENDANCE_DAY_INVALID:'Für diesen Tag kann keine Anwesenheit erfasst werden.',
    ATTENDANCE_MODE_INVALID:'Bitte eine der angebotenen Unterrichtsformen auswählen.',
    ATTENDANCE_RECORDS_REQUIRED:'Bitte mindestens einen Anwesenheitseintrag erfassen.',
    ATTENDANCE_RECORD_INVALID:'Ein Anwesenheitseintrag ist unvollständig. Bitte Status und Person prüfen.',
    ATTENDANCE_DUPLICATE_USER:'Eine Person wurde doppelt erfasst. Bitte die Liste prüfen.',
    ATTENDANCE_SESSION_CANCELLED:'Dieser Termin ist abgesagt. Für abgesagte Termine wird keine Anwesenheit erfasst.',
    ATTENDANCE_SESSION_DATE_MISMATCH:'Das Datum passt nicht zu diesem Termin. Bitte den richtigen Termin wählen.',
    ATTENDANCE_SOURCE_INVALID:'Bitte eine gültige Herkunft für den Termin angeben.',
    ATTENDANCE_SOURCE_REF_REQUIRED:'Zu dieser Herkunft fehlt der Bezug auf den Termin.',
    ATTENDANCE_WINDOW_INVALID:'Die Anwesenheit kann für diesen Zeitraum nicht mehr geändert werden.',
    ABSENCE_RANGE_INVALID:'Bitte einen gültigen Abwesenheitszeitraum angeben; das Ende darf nicht vor dem Beginn liegen.',
    ABSENCE_RANGE_TOO_LONG:'Dieser Abwesenheitszeitraum ist zu lang. Bitte in kürzere Abschnitte aufteilen.',
    ABSENCE_DECISION_INVALID:'Bitte eine der angebotenen Entscheidungen auswählen.',
    ABSENCE_NOTICE_NOT_PENDING:'Diese Abwesenheitsmeldung wurde bereits entschieden.',

    // Noten
    GRADE_INVALID:'Bitte eine gültige Note nach der hinterlegten Notenskala eingeben.',
    GRADE_TITLE_REQUIRED:'Bitte eine Bezeichnung für diese Bewertung angeben.',

    // Diskussionen und Nachrichten
    DISCUSSION_THREAD_NOT_FOUND:'Dieser Beitrag wurde nicht gefunden.',
    DISCUSSION_THREAD_INVALID:'Bitte einen gültigen Beitrag auswählen.',
    DISCUSSION_THREAD_LOCKED:'Dieser Beitrag ist geschlossen. Es können keine Antworten mehr geschrieben werden.',
    DISCUSSION_MESSAGE_REQUIRED:'Bitte einen Text eingeben.',
    DISCUSSION_RATE_LIMIT:'Es wurden zu viele Beiträge in kurzer Zeit geschrieben. Bitte einen Moment warten.',
    DISCUSSION_RETENTION_INVALID:'Bitte eine gültige Aufbewahrungsdauer angeben.',
    FORBIDDEN_DISCUSSION_THREAD:'Für diesen Beitrag fehlt die erforderliche Berechtigung.',
    COURSE_FORUM_DISABLED:'Das Forum ist für diese Klasse nicht freigeschaltet.',
    PARTICIPANT_THREAD_CREATION_DISABLED:'Teilnehmende dürfen in dieser Klasse keine eigenen Beiträge eröffnen.',
    DIRECT_MESSAGES_DISABLED:'Direktnachrichten sind für diese Klasse nicht freigeschaltet.',
    DIRECT_MESSAGE_RECIPIENTS_INVALID:'Bitte gültige Empfängerinnen und Empfänger auswählen.',
    DIRECT_MESSAGE_RECIPIENT_INVALID:'Diese Person kann hier nicht als Empfänger ausgewählt werden.',
    TENANT_ADMIN_REQUIRED_FOR_DIRECT_MODERATION:'Direktnachrichten darf nur die Kundenverwaltung moderieren.',

    // Umfragen
    SURVEY_NOT_FOUND:'Diese Umfrage wurde nicht gefunden.',
    SURVEY_FIELDS_REQUIRED:'Bitte alle Pflichtfelder der Umfrage ausfüllen.',
    SURVEY_OPTIONS_INVALID:'Bitte gültige Antwortmöglichkeiten angeben.',
    SURVEY_OPTION_NOT_FOUND:'Diese Antwortmöglichkeit wurde nicht gefunden.',
    SURVEY_STATUS_INVALID:'Bitte einen gültigen Status für die Umfrage auswählen.',

    // Auswertungen
    REPORT_DATASET_INVALID:'Bitte eine der angebotenen Datenquellen auswählen.',
    REPORT_COLUMNS_INVALID:'Bitte gültige Spalten für die Auswertung auswählen.',
    REPORT_DEFINITION_INVALID:'Diese gespeicherte Auswertung ist nicht mehr gültig. Bitte neu zusammenstellen.',

    // Dozentenzuordnung und Vertretung
    TEACHER_ASSIGNMENT_NOT_FOUND:'Diese Zuordnung zum Dozentenportal wurde nicht gefunden.',
    TEACHER_ASSIGNMENT_FIELDS_REQUIRED:'Bitte alle Pflichtfelder der Zuordnung ausfüllen.',
    TEACHER_EMAIL_INVALID:'Bitte eine gültige E-Mail-Adresse für die Dozentin oder den Dozenten angeben.',
    TEACHER_USER_NOT_FOUND:'Zu dieser Dozentin oder diesem Dozenten gibt es noch kein Benutzerkonto.',
    TEACHER_STUDENT_ROLE_CONFLICT:'Dieselbe Person kann in derselben Klasse nicht gleichzeitig unterrichten und teilnehmen.',
    FORBIDDEN_TEACHER_COURSE:'Für diese Klasse fehlt die Freigabe im Dozentenportal.',
    SUBSTITUTION_NOT_FOUND:'Dieser Vertretungsfall wurde nicht gefunden.',
    SUBSTITUTION_FIELDS_REQUIRED:'Bitte alle Pflichtfelder der Vertretung ausfüllen.',

    // Erscheinungsbild
    LOGO_REQUIRED:'Bitte eine Logodatei auswählen.',
    LOGO_FORMAT_INVALID:'Dieses Bildformat wird nicht unterstützt. Bitte PNG, JPG oder SVG verwenden.',
    LOGO_TOO_LARGE:'Diese Logodatei ist zu groß. Bitte kleiner speichern.',
    COLOR_INVALID:'Bitte eine gültige Farbe angeben, etwa #2563eb.',
    BRANDING_CONTRAST_TOO_LOW:'Der Kontrast dieser Farben ist zu gering und wäre für manche Menschen nicht lesbar. Bitte kräftigere Farben wählen.',
    WHITE_BACKGROUND_NOT_ALLOWED:'Ein rein weißer Hintergrund ist hier nicht zulässig. Bitte einen leicht abgesetzten Ton wählen.',
    CUSTOM_DOMAIN_MANAGED_SEPARATELY:'Die eigene Domain wird in einem eigenen Bereich verwaltet und kann hier nicht geändert werden.',

    // Tarif, Module und Grenzen
    PLAN_COURSE_LIMIT_EXCEEDED:'Die im Tarif enthaltene Zahl an Klassen ist erreicht. Bitte eine Klasse archivieren oder den Tarif erweitern.',
    PLAN_LIMIT_INVALID:'Diese Tarifgrenze ist nicht gültig.',
    ENTITLEMENT_NOT_FOUND:'Für diesen Kunden ist kein Leistungsumfang hinterlegt.',
    FEATURE_KEY_INVALID:'Diese Funktion ist nicht bekannt.',
    FEATURE_NOT_AVAILABLE:'Diese Funktion ist im aktuellen Tarif nicht enthalten.',
    MODULE_MANAGED_BY_BILLING:'Dieses Modul wird über die Abrechnung verwaltet und kann hier nicht umgeschaltet werden.',
    MODULE_MANAGED_BY_PACKAGE:'Dieses Modul gehört zum gebuchten Paket und kann nicht einzeln abgeschaltet werden.',
    SELF_SERVICE_EXPANSION_DISABLED:'Die Erweiterung durch den Kunden selbst ist derzeit nicht freigeschaltet.',
    SETTINGS_NOT_FOUND:'Für diesen Kunden sind noch keine Einstellungen hinterlegt.',
    NO_CHANGE:'Es gab nichts zu ändern - die Angaben entsprechen bereits dem gespeicherten Stand.',
    NUMBER_INVALID:'Bitte eine gültige Zahl eingeben.',
    CURRENCY_INVALID:'Bitte eine gültige Währung angeben.',
    CONTENT_TYPE_INVALID:'Dieser Dateityp wird hier nicht unterstützt.',

    // Benachrichtigungen und Teams
    PUSH_NOT_CONFIGURED:'Push-Benachrichtigungen sind für dieses Portal nicht eingerichtet.',
    PUSH_ENDPOINT_INVALID:'Diese Push-Anmeldung ist ungültig. Bitte die Benachrichtigungen im Browser neu erlauben.',
    PUSH_ENDPOINT_ALREADY_OWNED:'Diese Push-Anmeldung gehört bereits zu einem anderen Konto.',
    PUSH_VAPID_KEY_INVALID:'Die Einrichtung der Push-Benachrichtigungen ist unvollständig. Bitte an den Support wenden.',
    TEAMS_WEBHOOK_REQUIRED:'Bitte die Teams-Webhook-Adresse angeben.',
    TEAMS_WEBHOOK_INVALID:'Diese Teams-Webhook-Adresse ist nicht gültig.',
    TEAMS_TEST_FAILED:'Die Testnachricht an Teams konnte nicht zugestellt werden. Bitte die Webhook-Adresse prüfen.',

    // Anmeldung: technische Reste, die niemand als Code lesen sollte
    PASSWORD_DERIVATION_PARAMS_INVALID:'Dieses Kennwort kann nicht geprüft werden. Bitte das Kennwort zurücksetzen lassen.',
    LEGACY_PASSWORD_PARAMS_INVALID:'Dieses Kennwort stammt aus einem alten Verfahren und muss zurückgesetzt werden.',

    // Einwurf: Dateien, Pakete, Verlinkung
    INTAKE_FILES_REQUIRED:'Bitte mindestens eine Datei auswählen.',
    INTAKE_TOO_MANY_FILES:'Es wurden zu viele Dateien auf einmal ausgewählt. Bitte in kleineren Paketen einwerfen.',
    INTAKE_UPLOAD_TOO_LARGE:'Diese Datei ist zu groß für den Einwurf. Bitte kleiner speichern oder aufteilen.',
    INTAKE_UPLOAD_LINK_INVALID:'Dieser Einwurf-Link ist nicht mehr gültig. Bitte einen neuen Link anfordern.',
    INTAKE_RATE_LIMITED:'Es wurden zu viele Dateien in kurzer Zeit eingeworfen. Bitte einen Moment warten.',
    INTAKE_SUBMITTER_REQUIRED:'Bitte angeben, wer die Dateien einwirft.',
    INTAKE_BATCH_NOT_FOUND:'Dieses Einwurf-Paket wurde nicht gefunden.',
    INTAKE_DOCUMENT_NOT_FOUND:'Dieses eingeworfene Dokument wurde nicht gefunden. Möglicherweise wurde es bereits verarbeitet oder entfernt.',
    INTAKE_NO_EXTRACTABLE_DATA:'Aus dieser Datei ließen sich keine Daten lesen. Bitte als CSV oder Excel-Datei einwerfen.',
    INTAKE_PREVIEW_REQUIRED:'Bitte zuerst die Vorschau ansehen und prüfen.',
    INTAKE_CHANNEL_SCOPE_INVALID:'Dieser Einwurf-Weg passt nicht zur gewählten Klasse oder Organisationseinheit.',
    INTAKE_LINK_SCOPE_INVALID:'Dieser Einwurf-Link passt nicht zur gewählten Klasse oder Organisationseinheit.',
    DOCUMENT_ZIP_INVALID:'Dieses ZIP-Archiv ließ sich nicht öffnen. Bitte erneut packen und noch einmal versuchen.',
    DOCUMENT_ZIP_COMPRESSION_UNSUPPORTED:'Dieses ZIP-Archiv verwendet ein nicht unterstütztes Packverfahren. Bitte ohne Verschlüsselung als normales ZIP speichern.',
    DOCUMENT_ARCHIVE_PATH_INVALID:'Im Archiv steckt ein unzulässiger Dateipfad. Bitte den Ordner erneut packen.',
    DOCUMENT_ARCHIVE_TOO_MANY_ENTRIES:'Dieses Archiv enthält zu viele Dateien. Bitte in kleineren Teilen einwerfen.',
    DOCUMENT_ARCHIVE_ENTRY_TOO_LARGE:'Eine Datei im Archiv ist zu groß. Bitte sie einzeln und kleiner einwerfen.',
    DOCUMENT_ARCHIVE_EXPANSION_LIMIT:'Dieses Archiv wird beim Entpacken unverhältnismäßig groß und wird deshalb nicht verarbeitet.',

    // Datenübernahme aus Altsystemen
    LEGACY_FILE_REQUIRED:'Bitte eine Datei für die Datenübernahme auswählen.',
    LEGACY_FILE_TOO_LARGE:'Diese Datei ist zu groß für die Datenübernahme. Bitte aufteilen.',
    LEGACY_IMPORT_ARCHIVE_ONLY:'Für diesen Schritt wird ein Archiv (ZIP) erwartet.',
    LEGACY_IMPORT_HAS_ERRORS:'Die Datenübernahme enthält noch Fehler. Bitte die gemeldeten Zeilen prüfen und erneut hochladen.',
    LEGACY_IMPORT_NOT_FOUND:'Diese Datenübernahme wurde nicht gefunden.',
    LEGACY_STRUCTURED_FILE_UNSUPPORTED:'Dieses Dateiformat kann für die Datenübernahme nicht gelesen werden. Bitte als CSV oder Excel-Datei bereitstellen.',
    IMPORT_BATCH_NOT_FOUND:'Dieser Import wurde nicht gefunden. Bitte die Datei erneut hochladen.',
    IMPORT_BATCH_EXPIRED:'Dieser Import ist abgelaufen. Bitte die Datei erneut hochladen.',
    IMPORT_BATCH_OWNER_MISMATCH:'Dieser Import gehört zu einer anderen Person und kann hier nicht fortgesetzt werden.',
    IMPORT_CONFIRMATION_REQUIRED:'Bitte die Vorschau ausdrücklich bestätigen, bevor übernommen wird.',
    IMPORT_ROW_COUNT_INVALID:'Die Zeilenzahl der Vorschau passt nicht mehr zur Datei. Bitte die Vorschau neu erzeugen.',
    IMPORT_PARENT_RESOLUTION_FAILED:'Eine übergeordnete Einheit aus der Datei konnte nicht zugeordnet werden. Bitte die Spalte mit der übergeordneten Einheit prüfen.',

    // Planung: Ressourcen, Sperrzeiten, Stundenplanentwürfe
    RESOURCE_NAME_EXISTS:'Eine Ressource mit diesem Namen ist bereits vorhanden.',
    RESOURCE_CAPACITY_INVALID:'Bitte eine gültige Kapazität angeben.',
    RESOURCE_FEATURES_INVALID:'Die Ausstattung konnte nicht verarbeitet werden. Bitte durch Kommas trennen.',
    RESOURCE_SUBTYPE_INVALID:'Bitte einen der angebotenen Ressourcentypen auswählen.',
    RESOURCE_STATUS_INVALID:'Bitte einen gültigen Status für die Ressource auswählen.',
    RESOURCE_NOT_AVAILABLE:'Diese Ressource ist nicht verfügbar oder nicht aktiv.',
    RESOURCE_BLOCK_TIME_INVALID:'Das Ende der Sperrzeit muss nach dem Beginn liegen.',
    TEACHER_BLOCK_TIME_INVALID:'Das Ende der Abwesenheit muss nach dem Beginn liegen.',
    BLACKOUT_TIME_INVALID:'Das Ende der Sperrzeit muss nach dem Beginn liegen.',
    SCHEDULING_TIME_INVALID:'Bitte gültige Zeiten angeben; das Ende muss nach dem Beginn liegen.',
    SUGGESTION_TIME_INVALID:'Bitte einen gültigen Zeitraum für die Vorschläge angeben.',
    EXCURSION_TIME_INVALID:'Das Ende der Exkursion muss nach dem Beginn liegen.',
    PRACTICE_PERIOD_INVALID:'Bitte einen gültigen Praxiszeitraum angeben.',
    TIMETABLE_PLAN_NOT_FOUND:'Dieser Stundenplanentwurf wurde nicht gefunden.',
    TIMETABLE_PLAN_LOCKED:'Dieser Stundenplan ist bereits veröffentlicht oder abgelegt und kann nicht mehr geändert werden.',
    TIMETABLE_PLAN_HAS_CONFLICTS:'Der Entwurf enthält noch Konflikte. Bitte zuerst die gemeldeten Konflikte klären.',
    PLAN_ENTRY_NOT_FOUND:'Dieser Termin im Entwurf wurde nicht gefunden.',
    PLAN_ENTRY_TIME_INVALID:'Bitte gültige Zeiten für den Termin angeben; das Ende muss nach dem Beginn liegen.',
    PLAN_TIME_INVALID:'Bitte gültige Uhrzeiten angeben; das Ende muss nach dem Beginn liegen.',
    PLAN_PERIOD_INVALID:'Bitte einen gültigen Zeitraum angeben.',
    PLAN_RANGE_INVALID:'Der Zeitraum des Plans ist ungültig. Bitte Beginn und Ende prüfen.',
    PLAN_RANGE_TOO_LONG:'Dieser Zeitraum ist für einen Lauf zu lang. Bitte in kürzeren Abschnitten planen.',
    PLAN_GENERATION_TOO_MANY:'Es würden zu viele Termine auf einmal entstehen. Bitte den Zeitraum verkleinern.',
    PLAN_AUTOFILL_NO_RULES:'Für die gewählten Klassen sind keine Kursregeln hinterlegt. Ohne Kursregeln entsteht kein Termin.',

    // Arbeitszeiten von Dozentinnen und Dozenten
    AVAILABILITY_WEEKDAY_INVALID:'Bitte einen Wochentag von Montag bis Sonntag auswählen.',
    AVAILABILITY_TIME_INVALID:'Bitte gültige Uhrzeiten angeben; das Ende muss nach dem Beginn liegen.',
    AVAILABILITY_PERIOD_INVALID:'Bitte einen gültigen Gültigkeitszeitraum angeben; das Ende darf nicht vor dem Beginn liegen.',
    AVAILABILITY_PREFERENCE_INVALID:'Bitte angeben, ob dieses Zeitfenster möglich oder bevorzugt ist.',
    AVAILABILITY_TOO_MANY:'Für diese Person sind bereits sehr viele Zeitfenster hinterlegt. Bitte nicht mehr benötigte entfernen.',
    AVAILABILITY_NOT_FOUND:'Dieses Zeitfenster wurde nicht gefunden. Möglicherweise wurde es bereits entfernt.',
    WORKLOAD_PERIOD_INVALID:'Bitte einen gültigen Zeitraum angeben; das Ende darf nicht vor dem Beginn liegen.',
    FORBIDDEN_TEACHER_WORKLOAD:'Die Stundenübersicht aller Dozentinnen und Dozenten sieht nur die Planungsverwaltung. Die eigenen Stunden sind davon nicht betroffen.',
    FORBIDDEN_TEACHER_AVAILABILITY:'Arbeitszeiten darf nur die betreffende Person selbst oder die Planungsverwaltung eintragen.',
    TEACHER_NOT_FOUND:'Diese Dozentin oder dieser Dozent wurde nicht gefunden.',

    // Bescheinigungen und Zeugnisse
    CERTIFICATE_TEMPLATE_NOT_FOUND:'Diese Bescheinigungsvorlage wurde nicht gefunden.',
    CERTIFICATE_TEMPLATE_FIELDS_REQUIRED:'Bitte alle Pflichtfelder der Vorlage ausfüllen.',
    CERTIFICATE_TEMPLATE_TYPE_INVALID:'Bitte einen der angebotenen Dokumenttypen auswählen.',
    CERTIFICATE_APPROVAL_MODE_INVALID:'Bitte eine der angebotenen Freigabearten auswählen.',
    CERTIFICATE_ATTENDANCE_CRITERION_INVALID:'Bitte einen Anwesenheitswert zwischen 0 und 100 Prozent angeben.',
    CERTIFICATE_AUTO_CRITERIA_REQUIRED:'Für eine automatische Freigabe muss mindestens ein objektives Kriterium hinterlegt sein.',
    CERTIFICATE_NOT_FOUND:'Diese Bescheinigung wurde nicht gefunden.',
    CERTIFICATE_CRITERIA_NOT_MET:'Die in der Vorlage festgelegten Kriterien sind noch nicht erfüllt.',
    CERTIFICATE_NOT_APPROVABLE:'Diese Bescheinigung kann in ihrem aktuellen Stand nicht freigegeben werden.',
    CERTIFICATE_NOT_ISSUABLE:'Diese Bescheinigung muss zuerst freigegeben werden, bevor sie ausgestellt werden kann.',
    CERTIFICATE_NOT_REVOCABLE:'Diese Bescheinigung kann in ihrem aktuellen Stand nicht widerrufen werden.',
    CERTIFICATE_REVOCATION_REASON_REQUIRED:'Bitte einen Widerrufsgrund angeben; er wird bei der öffentlichen Prüfung angezeigt.',
    CERTIFICATE_BATCH_TOO_LARGE:'Diese Klasse hat zu viele Teilnehmende für einen Sammellauf. Bitte in kleineren Gruppen vorbereiten.',
    FORBIDDEN_CERTIFICATE:'Für Bescheinigungen fehlt die erforderliche Berechtigung.',

    // Berichtsheft / Tätigkeitsnachweis
    REPORT_BOOK_PERIOD_NOT_FOUND:'Dieser Berichtsheft-Zeitraum wurde nicht gefunden.',
    REPORT_BOOK_PERIOD_INVALID:'Bitte einen gültigen Zeitraum angeben; das Ende darf nicht vor dem Beginn liegen.',
    REPORT_BOOK_DATE_REQUIRED:'Bitte ein Datum für den Eintrag angeben.',
    REPORT_BOOK_EMPTY:'Dieser Zeitraum enthält noch keine Einträge und kann deshalb nicht eingereicht werden.',
    REPORT_BOOK_LOCKED:'Dieser Zeitraum ist bereits eingereicht und kann nicht mehr geändert werden.',
    REPORT_BOOK_BATCH_TOO_LARGE:'Diese Klasse hat zu viele Teilnehmende für einen Sammellauf. Bitte in kleineren Gruppen eröffnen.',
    FORBIDDEN_REPORT_BOOK:'Für dieses Berichtsheft fehlt die erforderliche Berechtigung.',

    // Unterschriften
    SIGNATURE_DOCUMENT_NOT_FOUND:'Dieses Dokument zur Unterschrift wurde nicht gefunden.',
    SIGNATURE_DOCUMENT_TYPE_INVALID:'Bitte einen der angebotenen Dokumenttypen auswählen.',
    SIGNATURE_REQUEST_NOT_FOUND:'Diese Unterschriftsanfrage wurde nicht gefunden.',
    SIGNATURE_REQUEST_CLOSED:'Diese Unterschriftsanfrage ist bereits abgeschlossen.',
    SIGNATURE_LEVEL_INVALID:'Bitte eine der angebotenen Unterschriftsstufen auswählen.',
    SIGNATURE_NAME_MISMATCH:'Der eingegebene Name stimmt nicht mit dem hinterlegten Namen überein.',
    SIGNATURE_CONFIRMATION_REQUIRED:'Bitte die Unterschrift ausdrücklich bestätigen.',
    SIGNATURE_SCOPE_REQUIRED:'Bitte angeben, wofür unterschrieben werden soll.',
    SIGNATURE_COURSE_REQUIRED:'Bitte eine Klasse oder einen Kurs auswählen.',
    EXTERNAL_SIGNATURE_PROVIDER_REQUIRED:'Bitte den externen Unterschriftsdienst angeben.',
    EXTERNAL_SIGNATURE_REFERENCE_REQUIRED:'Bitte die Referenz des externen Unterschriftsdienstes angeben.',
    NO_PARTICIPANTS_FOR_SIGNATURE:'In dieser Klasse gibt es derzeit niemanden, der unterschreiben könnte.',
    FORBIDDEN_SIGNATURE_CREATE:'Für das Anlegen von Unterschriftsdokumenten fehlt die erforderliche Berechtigung.',
    FORBIDDEN_SIGNATURE_REQUEST:'Für Unterschriftsanfragen fehlt die erforderliche Berechtigung.',

    // Klassenbuch, Lehrplan, Prüfungsdokumentation
    CLASSBOOK_EXPORT_DATE_INVALID:'Bitte ein gültiges Datum für den Export angeben.',
    CLASSBOOK_EXPORT_RANGE_INVALID:'Bitte einen gültigen Zeitraum für den Export angeben.',
    CLASSBOOK_REVIEW_STATUS_INVALID:'Bitte einen der angebotenen Prüfstände auswählen.',
    CURRICULUM_NOT_FOUND:'Dieser Lehrplan wurde nicht gefunden.',
    CURRICULUM_ITEMS_REQUIRED:'Bitte mindestens einen Lehrplanpunkt angeben.',
    CURRICULUM_TOO_MANY_ITEMS:'Dieser Lehrplan enthält zu viele Punkte auf einmal. Bitte aufteilen.',
    CURRICULUM_ITEM_NOT_BOUND:'Dieser Lehrplanpunkt ist der Klasse nicht zugeordnet.',
    COURSE_OR_CURRICULUM_NOT_FOUND:'Klasse oder Lehrplan wurden nicht gefunden.',
    EXAM_PROFILE_NOT_FOUND:'Dieses Prüfungsprofil wurde nicht gefunden.',
    EXAM_PROFILE_INVALID:'Bitte ein gültiges Prüfungsprofil auswählen.',
    DEADLINE_DUE_REQUIRED:'Bitte eine Frist angeben.',
    LIFECYCLE_ITEM_NOT_FOUND:'Dieser Eintrag wurde nicht gefunden.',
    ACTIVITY_SOURCE_REQUIRED:'Bitte angeben, worauf sich die Tätigkeit bezieht.',
    FORBIDDEN_ACTIVITY_MANAGE:'Für die Verwaltung von Tätigkeiten fehlt die erforderliche Berechtigung.',
    FORBIDDEN_CLASSBOOK_EXPORT:'Für den Klassenbuch-Export fehlt die erforderliche Berechtigung.',
    FORBIDDEN_CLASSBOOK_REVIEW:'Für die Klassenbuchprüfung fehlt die erforderliche Berechtigung.',
    FORBIDDEN_CURRICULUM_LINK:'Für die Zuordnung von Lehrplänen fehlt die erforderliche Berechtigung.',
    FORBIDDEN_CURRICULUM_VIEW:'Für die Ansicht dieses Lehrplans fehlt die erforderliche Berechtigung.',
    FORBIDDEN_EDUCATION_MANAGE:'Für die Verwaltung des Unterrichtsbetriebs fehlt die erforderliche Berechtigung.',
    FORBIDDEN_EDUCATION_CONTENT:'Für die Verwaltung der Inhalte fehlt die erforderliche Berechtigung.',
    FORBIDDEN_EDUCATION_OPERATIONS:'Für diesen Bereich des Unterrichtsbetriebs fehlt die erforderliche Berechtigung.',

    // Organisation und Berechtigungen
    ORG_UNIT_REQUIRED:'Bitte eine Organisationseinheit auswählen.',
    ORG_GRANT_NOT_FOUND:'Diese Freigabe wurde nicht gefunden.',
    PRIMARY_ORG_UNIT_INVALID:'Bitte eine gültige übergeordnete Organisationseinheit auswählen.',
    CANNOT_REVOKE_OWN_RESPONSIBLE_GRANT:'Die eigene Verantwortlichkeit kann nicht selbst entzogen werden. Bitte eine andere verantwortliche Person darum bitten.',
    USER_EMAIL_REQUIRED:'Bitte eine E-Mail-Adresse angeben.',
    USER_NAME_REQUIRED:'Bitte einen Namen angeben.',

    // Absichtserkennung im Autopiloten
    INTENT_REQUIRED:'Bitte beschreiben, was geschehen soll.',
    INTENT_NOT_SAFE_TO_SIMULATE:'Dieser Vorgang lässt sich nicht sicher durchspielen. Bitte die Angaben vervollständigen.',
    INTENT_LOCAL_TIME_INVALID_DST:'Diese Uhrzeit gibt es an diesem Tag wegen der Zeitumstellung nicht. Bitte eine andere Uhrzeit wählen.',
    INTENT_LOCAL_TIME_AMBIGUOUS_DST:'Diese Uhrzeit gibt es an diesem Tag wegen der Zeitumstellung zweimal. Bitte eindeutig angeben.',

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
