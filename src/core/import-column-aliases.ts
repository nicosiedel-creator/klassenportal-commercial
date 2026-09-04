// Kopfzeilen echter Kundendateien treffen die Schreibweise des Portals so gut wie nie. Bei einem
// Traegerpaket mit 1537 Teilnehmenden wurde keine einzige Zeile zugeordnet, weil die Datei
// "Kurs-Code" statt "Kurscode" schrieb - ein Bindestrich, und die ganze Lieferung war unbrauchbar.
// Deshalb liegt die Zuordnung hier zentral und breit: eine Kopfzeile darf so heissen, wie der
// Kunde sie nun einmal nennt, in seiner Sprache und in seiner Schreibweise.
//
// Die kanonischen Zielnamen sind NICHT frei gewaehlt: es sind genau die Namen, die
// participant-document-import.ts (fromRow) und organization-import.ts (courseData, subjectData,
// personName, rowValue) ohnehin schon lesen. Wer hier einen neuen Namen erfindet, schreibt Werte
// in ein Feld, das niemand abholt - die Spalte waere weiterhin verloren, nur unsichtbar.

// Identisch zur Normalisierung der beiden Import-Dateien. Bewusst dieselbe Regel und nicht eine
// eigene: eine zweite, leicht abweichende Normalisierung wuerde genau die Faelle wieder
// auseinanderlaufen lassen, die diese Tabelle zusammenfuehren soll.
export function columnKey(v:string):string{return v.trim().toLowerCase().replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/[ß]/g,'ss').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}

// Alle Schluessel stehen bereits in der Form, die columnKey() liefert. Bindestrich, Leerzeichen,
// Punkt und Unterstrich fallen dort auf denselben Unterstrich zusammen - "Kurs-Code", "Kurs Code",
// "Kurs.Code" und "kurs_code" brauchen also nur einen einzigen Eintrag.
//
// columnKey() kennt nur die deutschen Umlaute. Jeder andere diakritische Buchstabe wird zum
// Unterstrich, und genau so kommt die fremdsprachige Kopfzeile hier an: "Prénom" wird zu "pr_nom",
// "établissement" zu "tablissement", "sınıf" zu "s_n_f". Die scheinbar zerhackten Schluessel sind
// deshalb kein Tippfehler, sondern die Form, in der diese Spalten tatsaechlich eintreffen - die
// ASCII-Schreibweise steht jeweils daneben, weil Exportprogramme oft schon selbst entschaerfen.
// Bewusst NICHT zugeordnet: 'art' und 'kategorie' (in einer Meldungs- oder Abwesenheitsliste
// ist das die Meldungsart, keine Entitaetsart - sonst wird jeder Wert daraus zu einer
// Rollenentscheidung) sowie 'taetigkeit' und 'aufgabe' (die Rechtevergabe liest sie ohnehin
// direkt; ueber die Rollenspalte gelesen wuerden sie zusaetzlich die Typerkennung steuern).
// Ebenfalls bewusst NICHT zugeordnet: 'class_id', 'course_external_id' und ihre Geschwister.
// Das sind VERWEISE auf einen Kurs, keine Kursdefinition. Als 'course_code' gelesen hielt die
// Typerkennung jede Meldungs-, Abwesenheits- oder Pruefungszeile, die nur auf ihren Kurs
// zeigt, faelschlich fuer einen Kurs. Teilnehmer- und Organisationsimport lesen diese
// Spalten direkt unter ihrem eigenen Namen - eine Umbenennung ist dafuer nicht noetig.
// Und nicht zugeordnet, weil es im echten Kundenpaket nachweislich Schaden anrichtete:
// 'jahrgang'/'jahrgangsstufe' als Kursname - zwei Klassen desselben Jahrgangs galten damit als
// derselbe Kurs, aus drei Kurszeilen wurden zwei Kurse, und sie hiessen "5" statt "Klasse 5a".
// Ebenso 'fachrichtung' (Eigenschaft, kein Name), 'promotion' (nur franzoesisch ein Jahrgang),
// 'klassenid'/'cohort_id'/'group_id' (Verweise, keine Definition) und 'service' (steht in
// Personallisten als Funktion und wuerde die Rollenerkennung stoeren).
export const COLUMN_ALIASES:Record<string,string>={
  // Wer bereits kanonisch liefert, muss unveraendert durchlaufen - sonst zerlegt die Tabelle die
  // Dateien, die heute schon funktionieren.
  display_name:'display_name',first_name:'first_name',last_name:'last_name',email:'email',e_mail:'email',mail:'email',external_id:'external_id',
  course_id:'course_id',course_code:'course_code',course_name:'course_name',org_path:'org_path',site:'site',area:'area',measure:'measure',
  enrollment_start:'enrollment_start',enrollment_end:'enrollment_end',role:'role',teacher:'teacher',teacher_name:'teacher_name',teacher_email:'teacher_email',teacher_id:'teacher_id',
  subject_name:'subject_name',subject_short_name:'subject_short_name',subject_code:'subject_short_name',parent_external_id:'parent_external_id',node_type:'node_type',type:'type',person_type:'person_type',
  org_unit_id:'org_unit_id',org_unit_external_id:'org_unit_external_id',location_id:'location_id',location_external_id:'location_external_id',room:'room',room_id:'room_id',
  street:'street',postal_code:'postal_code',city:'city',country:'country',phone:'phone',birth_date:'birth_date',portal_role:'portal_role',

  // Deutsch - Person und Name. "Schülername" und "Schüler-Name" sind zwei verschiedene Schluessel,
  // beide kommen in Kundendateien vor.
  name:'display_name',anzeigename:'display_name',vollstaendiger_name:'display_name',voller_name:'display_name',ganzer_name:'display_name',bezeichnung:'display_name',einheit:'display_name',
  person:'display_name',person_name:'display_name',personenname:'display_name',name_der_person:'display_name',
  teilnehmer:'display_name',teilnehmerin:'display_name',teilnehmer_name:'display_name',teilnehmername:'display_name',teilnehmerin_name:'display_name',teilnehmende:'display_name',teilnehmender:'display_name',
  kursteilnehmer:'display_name',kursteilnehmerin:'display_name',name_des_teilnehmers:'display_name',name_teilnehmer:'display_name',
  schueler:'display_name',schuelerin:'display_name',schueler_name:'display_name',schuelername:'display_name',
  azubi:'display_name',auszubildende:'display_name',auszubildender:'display_name',lernende:'display_name',lernender:'display_name',
  vorname:'first_name',vornamen:'first_name',rufname:'first_name',
  nachname:'last_name',familienname:'last_name',nachname_familienname:'last_name',zuname:'last_name',nachnamen:'last_name',
  emailadresse:'email',e_mailadresse:'email',e_mail_adresse:'email',email_adresse:'email',mailadresse:'email',mail_adresse:'email',kontakt_e_mail:'email',dienstliche_e_mail:'email',

  // Deutsch - Teilnehmerkennungen. Alles, was die Person im Fremdsystem eindeutig macht, landet auf
  // external_id: das Portal fuehrt genau ein Feld dafuer.
  teilnehmernummer:'external_id',teilnehmer_nummer:'external_id',teilnehmer_nr:'external_id',teilnehmernr:'external_id',tn_nummer:'external_id',tn_nr:'external_id',tn_id:'external_id',teilnehmerkennung:'external_id',teilnehmer_kennung:'external_id',
  matrikelnummer:'external_id',matrikel_nummer:'external_id',matrikel_nr:'external_id',matrikelnr:'external_id',
  schuelernummer:'external_id',schueler_nummer:'external_id',schueler_nr:'external_id',schuelernr:'external_id',
  kundennummer:'external_id',kunden_nummer:'external_id',kunden_nr:'external_id',kundennr:'external_id',
  vertragsnummer:'external_id',vertrags_nummer:'external_id',vertrags_nr:'external_id',vertragsnr:'external_id',
  mitgliedsnummer:'external_id',personennummer:'external_id',personen_nr:'external_id',personenkennung:'external_id',externe_id:'external_id',externe_kennung:'external_id',

  // Deutsch - Kurs- und Klassenname. "Maßnahme", "Bildungsgang" und "Studiengang" benennen beim
  // Bildungstraeger den Kurs selbst und nicht die Ebene darueber; sie gehen deshalb auf
  // course_name. Nur das ausdrueckliche measure bleibt Hierarchie-Kontext.
  kurs:'course_name',kursname:'course_name',kurs_name:'course_name',kursbezeichnung:'course_name',kurs_bezeichnung:'course_name',kurstitel:'course_name',kurs_titel:'course_name',
  klasse:'course_name',klassenname:'course_name',klassen_name:'course_name',klassenbezeichnung:'course_name',klassen_bezeichnung:'course_name',schulklasse:'course_name',jahrgangsklasse:'course_name',
  lehrgang:'course_name',lehrgangsname:'course_name',lehrgangsbezeichnung:'course_name',
  massnahme:'course_name',massnahmenname:'course_name',massnahmenbezeichnung:'course_name',massnahme_bezeichnung:'course_name',
  bildungsgang:'course_name',studiengang:'course_name',ausbildung:'course_name',ausbildungsgang:'course_name',
  gruppe:'course_name',gruppenname:'course_name',kursgruppe:'course_name',lerngruppe:'course_name',stammgruppe:'course_name',kohorte:'course_name',
  seminar:'course_name',seminargruppe:'course_name',seminarname:'course_name',seminartitel:'course_name',veranstaltung:'course_name',veranstaltungsname:'course_name',veranstaltungstitel:'course_name',projekt:'measure',

  // Deutsch - Kurs- und Klassenkennung.
  kurscode:'course_code',kurs_code:'course_code',kurskennung:'course_code',kurs_kennung:'course_code',kursnummer:'course_code',kurs_nummer:'course_code',kurs_nr:'course_code',kursnr:'course_code',kurskuerzel:'course_code',
  klassencode:'course_code',klassen_code:'course_code',klasse_code:'course_code',klassenkennung:'course_code',klassennummer:'course_code',klassen_nummer:'course_code',klassen_nr:'course_code',klassennr:'course_code',klasse_nr:'course_code',
  massnahmennummer:'course_code',massnahmenummer:'course_code',massnahmen_nr:'course_code',massnahme_nr:'course_code',massnahmencode:'course_code',massnahmenkennung:'course_code',
  lehrgangsnummer:'course_code',lehrgangs_nr:'course_code',lehrgangscode:'course_code',lehrgangskennung:'course_code',
  seminarnummer:'course_code',seminar_nr:'course_code',seminarcode:'course_code',veranstaltungsnummer:'course_code',veranstaltungs_nr:'course_code',gruppennummer:'course_code',gruppen_nr:'course_code',

  // Deutsch - Lehrkraft und Rolle. Die Person selbst geht auf teacher, ein reines Namensfeld auf
  // teacher_name: organization-import unterscheidet beides.
  dozent:'teacher',dozentin:'teacher',dozenten:'teacher',lehrkraft:'teacher',lehrer:'teacher',lehrerin:'teacher',lehrende:'teacher',lehrender:'teacher',
  ausbilder:'teacher',ausbilderin:'teacher',referent:'teacher',referentin:'teacher',kursleiter:'teacher',kursleiterin:'teacher',kursleitung:'teacher',
  seminarleiter:'teacher',seminarleiterin:'teacher',fachlehrer:'teacher',klassenlehrer:'teacher',klassenleitung:'teacher',tutor:'teacher',tutorin:'teacher',
  dozent_name:'teacher_name',dozentin_name:'teacher_name',dozenten_name:'teacher_name',lehrer_name:'teacher_name',lehrername:'teacher_name',lehrkraft_name:'teacher_name',name_der_lehrkraft:'teacher_name',ausbilder_name:'teacher_name',kursleiter_name:'teacher_name',
  dozent_email:'teacher_email',dozenten_email:'teacher_email',lehrer_email:'teacher_email',lehrkraft_email:'teacher_email',
  rolle:'role',funktion:'role',personenart:'person_type',portalrolle:'portal_role',portal_rolle:'portal_role',
  typ:'type',knotentyp:'node_type',ebene:'node_type',hierarchieebene:'node_type',strukturebene:'node_type',

  // Deutsch - Fach und Raum.
  fach:'subject_name',fachname:'subject_name',fach_name:'subject_name',fachbezeichnung:'subject_name',unterrichtsfach:'subject_name',lehrfach:'subject_name',lernfeld:'subject_name',
  fachkuerzel:'subject_short_name',fach_kuerzel:'subject_short_name',kuerzel:'subject_short_name',fachcode:'subject_short_name',fach_code:'subject_short_name',
  raum:'room',raumname:'room',raum_name:'room',raumbezeichnung:'room',unterrichtsraum:'room',seminarraum:'room',klassenraum:'room',klassenzimmer:'room',lehrraum:'room',

  // Deutsch - Struktur und Anschrift.
  organisationspfad:'org_path',strukturpfad:'org_path',hierarchiepfad:'org_path',orgpfad:'org_path',org_pfad:'org_path',pfad:'org_path',
  schulstandort:'site',standortname:'site',standort_name:'site',campus:'site',filiale:'site',niederlassung:'site',betriebsstaette:'site',zweigstelle:'site',
  fachbereich:'area',abteilung:'area',abteilungsname:'area',bereichsname:'area',organisationseinheit:'area',
  uebergeordnet:'parent_external_id',uebergeordnete_einheit:'parent_external_id',elternknoten:'parent_external_id',parent_id:'parent_external_id',uebergeordnete_id:'parent_external_id',
  strasse:'street',strasse_hausnummer:'street',adresse:'street',anschrift:'street',plz:'postal_code',postleitzahl:'postal_code',ort:'city',stadt:'city',wohnort:'city',land:'country',

  // Deutsch - Zeitraum und Kontakt. Die blossen Woerter "Beginn", "Start" und "Ende" bleiben
  // absichtlich unzugeordnet, siehe Anmerkung am Dateiende.
  startdatum:'enrollment_start',start_datum:'enrollment_start',beginndatum:'enrollment_start',beginn_datum:'enrollment_start',kursbeginn:'enrollment_start',kurs_beginn:'enrollment_start',
  massnahmebeginn:'enrollment_start',massnahmenbeginn:'enrollment_start',vertragsbeginn:'enrollment_start',ausbildungsbeginn:'enrollment_start',eintritt:'enrollment_start',eintrittsdatum:'enrollment_start',anmeldedatum:'enrollment_start',datum_von:'enrollment_start',
  enddatum:'enrollment_end',end_datum:'enrollment_end',endedatum:'enrollment_end',ende_datum:'enrollment_end',kursende:'enrollment_end',kurs_ende:'enrollment_end',
  massnahmeende:'enrollment_end',massnahmenende:'enrollment_end',vertragsende:'enrollment_end',ausbildungsende:'enrollment_end',austritt:'enrollment_end',austrittsdatum:'enrollment_end',abmeldedatum:'enrollment_end',datum_bis:'enrollment_end',
  telefon:'phone',telefonnummer:'phone',telefon_nr:'phone',tel:'phone',mobil:'phone',mobiltelefon:'phone',mobilnummer:'phone',handy:'phone',handynummer:'phone',
  geburtsdatum:'birth_date',geburtstag:'birth_date',geboren_am:'birth_date',

  // Fremdsystem-Kennungen. WICHTIG: Kennungen, die auf einen KURS zeigen, gehen auf course_code
  // und nicht auf course_id. course_id ist im Portal die eigene, interne Kennung - eine fremde
  // Nummer dort hineinzuschreiben hiesse, das Portal suchte einen Kurs, den es unter dieser ID nie
  // geben kann, und die Zeile bliebe unzugeordnet. Als course_code laeuft sie dagegen durch den
  // normalen Abgleich gegen die Kurskennungen des Mandanten.
  
  kurs_id:'course_id',kursid:'course_id',
  student_id:'external_id',schueler_id:'external_id',schuelerid:'external_id',teilnehmer_id:'external_id',teilnehmerid:'external_id',person_id:'external_id',person_external_id:'external_id',personen_id:'external_id',learner_id:'external_id',participant_id:'external_id',
  // Personalnummer und Mitarbeiterkennung meinen die Lehrkraft, nie die teilnehmende Person -
  // deshalb teacher_id und nicht external_id.
  employee_id:'teacher_id',mitarbeiter_id:'teacher_id',mitarbeiternummer:'teacher_id',personalnummer:'teacher_id',personal_nr:'teacher_id',dozenten_id:'teacher_id',dozent_id:'teacher_id',dozentin_id:'teacher_id',lehrer_id:'teacher_id',lehrkraft_id:'teacher_id',dozenten_kennung:'teacher_id',teacher_external_id:'teacher_id',staff_id:'teacher_id',instructor_id:'teacher_id',
  site_id:'location_id',standort_id:'location_id',campus_id:'location_id',
  // Eine Abteilungskennung benennt die Einheit selbst; sie ist der Schluessel der Organisationszeile.
  department_id:'org_unit_id',abteilungs_id:'org_unit_id',abteilung_id:'org_unit_id',bereich_id:'org_unit_id',fachbereich_id:'org_unit_id',unit_id:'org_unit_id',
  raum_id:'room_id',raumkennung:'room_id',
  // Das Portal fuehrt fuer Faecher keinen Fremdschluessel. Eine Fachkennung ist dort nur als
  // Kuerzel unterzubringen - besser sichtbar als Kuerzel denn stillschweigend verworfen.
  subject_id:'subject_short_name',fach_id:'subject_short_name',fachkennung:'subject_short_name',

  // Englisch.
  firstname:'first_name',forename:'first_name',given_name:'first_name',givenname:'first_name',
  lastname:'last_name',surname:'last_name',family_name:'last_name',familyname:'last_name',
  full_name:'display_name',fullname:'display_name',student:'display_name',student_name:'display_name',studentname:'display_name',learner:'display_name',participant:'display_name',attendee:'display_name',pupil:'display_name',trainee:'display_name',apprentice:'display_name',staff:'display_name',staff_name:'display_name',employee:'display_name',employee_name:'display_name',
  email_address:'email',emailaddress:'email',mail_address:'email',
  student_number:'external_id',student_no:'external_id',registration_number:'external_id',enrolment_number:'external_id',
  course:'course_name',class:'course_name',class_name:'course_name',classname:'course_name',group:'course_name',cohort:'course_name',section:'course_name',program:'course_name',programme:'course_name',training:'course_name',
  class_code:'course_code',classcode:'course_code',course_no:'course_code',class_no:'course_code',
  instructor:'teacher',trainer:'teacher',lecturer:'teacher',function:'role',
  subject:'subject_name',location:'site',department:'area',address:'street',town:'city',zip:'postal_code',zip_code:'postal_code',postcode:'postal_code',
  start_date:'enrollment_start',startdate:'enrollment_start',enrolment_start:'enrollment_start',end_date:'enrollment_end',enddate:'enrollment_end',enrolment_end:'enrollment_end',
  phone_number:'phone',telephone:'phone',mobile:'phone',birthdate:'birth_date',date_of_birth:'birth_date',birthday:'birth_date',dob:'birth_date',

  // Franzoesisch.
  nom:'last_name',nom_de_famille:'last_name',prenom:'first_name',pr_nom:'first_name',nom_complet:'display_name',
  eleve:'display_name',l_ve:'display_name',etudiant:'display_name',tudiant:'display_name',stagiaire:'display_name',apprenant:'display_name',
  courriel:'email',adresse_courriel:'email',courrier_electronique:'email',
  cours:'course_name',classe:'course_name',groupe:'course_name',formation:'course_name',
  code_cours:'course_code',identifiant:'external_id',numero_etudiant:'external_id',num_ro_tudiant:'external_id',
  enseignant:'teacher',enseignante:'teacher',formateur:'teacher',formatrice:'teacher',professeur:'teacher',
  salle:'room',matiere:'subject_name',mati_re:'subject_name',discipline:'subject_name',
  etablissement:'site',tablissement:'site',lieu:'site',
  debut:'enrollment_start',d_but:'enrollment_start',date_de_debut:'enrollment_start',date_de_d_but:'enrollment_start',date_de_fin:'enrollment_end',
  rue:'street',ville:'city',code_postal:'postal_code',pays:'country',telephone_portable:'phone',t_l_phone:'phone',

  // Spanisch.
  nombre:'first_name',nombre_completo:'display_name',apellido:'last_name',apellidos:'last_name',
  alumno:'display_name',alumna:'display_name',estudiante:'display_name',participante:'display_name',
  correo:'email',correo_electronico:'email',correo_electr_nico:'email',
  curso:'course_name',clase:'course_name',grupo:'course_name',codigo_curso:'course_code',c_digo_curso:'course_code',
  profesor:'teacher',profesora:'teacher',docente:'teacher',formador:'teacher',
  aula:'room',asignatura:'subject_name',materia:'subject_name',
  sede:'site',centro:'site',ubicacion:'site',ubicaci_n:'site',departamento:'area',
  identificador:'external_id',matricula:'external_id',matr_cula:'external_id',
  fecha_de_inicio:'enrollment_start',fecha_inicio:'enrollment_start',inicio:'enrollment_start',fecha_de_fin:'enrollment_end',fecha_fin:'enrollment_end',
  calle:'street',ciudad:'city',codigo_postal:'postal_code',c_digo_postal:'postal_code',pais:'country',pa_s:'country',telefono:'phone',tel_fono:'phone',

  // Italienisch.
  nome:'first_name',cognome:'last_name',nome_completo:'display_name',
  studente:'display_name',allievo:'display_name',partecipante:'display_name',corsista:'display_name',
  posta:'email',posta_elettronica:'email',indirizzo_email:'email',
  corso:'course_name',gruppo:'course_name',codice_corso:'course_code',matricola:'external_id',
  insegnante:'teacher',formatore:'teacher',
  data_di_inizio:'enrollment_start',inizio:'enrollment_start',data_di_fine:'enrollment_end',fine:'enrollment_end',
  via:'street',citta:'city',citt:'city',cap:'postal_code',paese:'country',

  // Niederlaendisch.
  voornaam:'first_name',achternaam:'last_name',naam:'display_name',volledige_naam:'display_name',
  leerling:'display_name',deelnemer:'display_name',cursist:'display_name',
  e_mailadres:'email',emailadres:'email',
  cursus:'course_name',klas:'course_name',groep:'course_name',opleiding:'course_name',cursuscode:'course_code',
  docent:'teacher',leraar:'teacher',begeleider:'teacher',lokaal:'room',vak:'subject_name',
  locatie:'site',afdeling:'area',leerlingnummer:'external_id',
  einddatum:'enrollment_end',straat:'street',woonplaats:'city',telefoon:'phone',

  // Polnisch.
  imie:'first_name',imi:'first_name',nazwisko:'last_name',imie_i_nazwisko:'display_name',nazwa:'display_name',
  uczen:'display_name',ucze:'display_name',uczestnik:'display_name',kursant:'display_name',
  adres_e_mail:'email',poczta:'email',
  klasa:'course_name',grupa:'course_name',szkolenie:'course_name',kod_kursu:'course_code',
  nauczyciel:'teacher',wykladowca:'teacher',wyk_adowca:'teacher',trener:'teacher',
  sala:'room',przedmiot:'subject_name',lokalizacja:'site',dzial:'area',dzia:'area',identyfikator:'external_id',
  data_rozpoczecia:'enrollment_start',data_rozpocz_cia:'enrollment_start',data_zakonczenia:'enrollment_end',data_zako_czenia:'enrollment_end',
  ulica:'street',miasto:'city',kod_pocztowy:'postal_code',kraj:'country',

  // Tuerkisch. "adı" und "ad" fallen nach columnKey() auf denselben Schluessel, ebenso
  // "soyadı"/"soyad" - deshalb steht jede Form nur einmal.
  ad:'first_name',soyad:'last_name',ad_soyad:'display_name',
  ogrenci:'display_name',oe_renci:'display_name',katilimci:'display_name',kat_l_mc:'display_name',
  eposta:'email',e_posta:'email',
  sinif:'course_name',s_n_f:'course_name',grup:'course_name',kurs_kodu:'course_code',
  ogretmen:'teacher',oe_retmen:'teacher',egitmen:'teacher',e_itmen:'teacher',
  derslik:'room',ders:'subject_name',konum:'site',bolum:'area',boeluem:'area',
  kimlik_no:'external_id',ogrenci_no:'external_id',oe_renci_no:'external_id',
  baslangic_tarihi:'enrollment_start',bitis_tarihi:'enrollment_end',sehir:'city',telefon_numarasi:'phone'
};

// Gibt null zurueck, wenn die Kopfzeile unbekannt ist. Bewusst null und nicht der Schluessel
// selbst: nur so kann die Oberflaeche "nicht erkannt" von "erkannt" unterscheiden und den Kunden
// gezielt nach genau dieser einen Spalte fragen.
export function canonicalColumn(header:string):string|null{const k=columnKey(header);return COLUMN_ALIASES[k]??null;}

// Beschriftungen fuer die Zuordnungsmaske. Nur Felder, die ein Kunde dort sinnvoll auswaehlt -
// Geburtsdatum und Telefon fehlen absichtlich: sie werden erkannt, aber nicht importiert, und
// duerfen in einer Auswahlliste nicht so aussehen, als kaemen sie ins Portal.
export const CANONICAL_FIELD_LABELS:Record<string,string>={
  display_name:'Name',first_name:'Vorname',last_name:'Nachname',email:'E-Mail',external_id:'Teilnehmerkennung',
  course_id:'Kurs-ID (portalintern)',course_code:'Kurs-/Klassenkennung',course_name:'Kurs-/Klassenname',
  org_path:'Organisationspfad',site:'Standort',area:'Bereich / Fachbereich',measure:'Maßnahme / Programm',
  enrollment_start:'Beginn',enrollment_end:'Ende',role:'Rolle',
  teacher:'Lehrkraft',teacher_name:'Name der Lehrkraft',teacher_email:'E-Mail der Lehrkraft',teacher_id:'Personalkennung',
  subject_name:'Fach',subject_short_name:'Fachkürzel',room:'Raum',room_id:'Raumkennung',
  node_type:'Art der Einheit',parent_external_id:'Übergeordnete Einheit',org_unit_id:'Kennung der Einheit',location_id:'Standortkennung',
  street:'Straße',postal_code:'PLZ',city:'Ort',country:'Land'
};

// Bewusst NICHT zugeordnet, damit diese Tabelle nichts kaputtmacht:
// - "id", "nr", "nummer", "code", "datum", "titel": zu unspezifisch. In einer Teilnehmerliste ist
//   "Nr" die laufende Zeilennummer, in einer Kursliste der Kurscode. Wer solche Spalten raet,
//   schreibt in der Haelfte der Dateien den falschen Wert in ein Pflichtfeld - lieber unerkannt
//   lassen und den Kunden in der Zuordnungsmaske fragen.
// - "status", "version", "tenant_id", "notiz", "sprache": gehoeren zu keinem Kurs- oder Namensfeld.
//   Sie bleiben unveraendert stehen, wo die Importe sie ohnehin schon selbst auswerten.
// - "beginn", "start", "ende", "von", "bis", "datum": der Stundenplan-Import liest genau diese
//   Woerter als Uhrzeit bzw. Tag der Unterrichtsstunde. Eine Umlenkung auf enrollment_start haette
//   jeder importierten Stunde ihre Uhrzeit genommen. Die eindeutigen Formen ("Kursbeginn",
//   "Startdatum", "Vertragsende") sind dagegen zugeordnet.
// - "standort", "bereich", "raumnummer", "raum_nr", "organisationseinheit_id": der
//   Organisations-Import liest diese Kopfzeilen woertlich als Name der Einheit bzw. als Verweis
//   auf sie. Eine Umlenkung wuerde einer Standortzeile ihren Namen wegnehmen.
// - "position": in einer Personalliste die Funktion, in einer Raumliste der Ort - nicht entscheidbar.
