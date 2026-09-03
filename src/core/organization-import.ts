import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireRole } from './permissions.js';
import { createCourse } from './data.js';
import { enforceCourseEntitlement } from './commerce.js';
import { createTenantUser } from './users.js';
import { createTeacherPortalTeacher, saveTeacherPortalAssignment } from './teacher-portal.js';
import { createOrgUnit, resolveTenantUser } from './enterprise-organization.js';
import { profilePermissions, type OrgPermission, type OrgProfile } from './enterprise-access.js';
import { savePlanningResource } from './planning-constraints.js';
import { id, normalizeEmail, nowIso, safeString, sha256Text, slugify } from './utils.js';
import { parseDate, parseTime } from './timetable.js';

export type OrganizationCandidateType='org_unit'|'resource'|'course'|'subject'|'lesson'|'exam'|'participant'|'class_admin'|'guest'|'teacher'|'staff'|'tenant_admin_review';
export type OrganizationCandidate={type:OrganizationCandidateType;display_name:string|null;email:string|null;course_id:string|null;course_name:string|null;course_code:string|null;course_ref:string|null;subject_name:string|null;subject_short_name:string|null;confidence:number;warnings:string[];source_row:number|null;synthesized?:boolean;external_id?:string|null;parent_external_id?:string|null;org_unit_type_key?:string|null;org_unit_type_label?:string|null;org_unit_ref?:string|null;address?:Record<string,string>|null;resource_kind?:string|null;resource_status?:string|null;capacity?:number|null;features?:string[]|null;lesson_date?:string|null;lesson_start?:string|null;lesson_end?:string|null;room?:string|null;notes?:string|null;access_profile?:OrgProfile|null;access_permissions?:OrgPermission[]|null;access_label?:string|null;teacher_ref?:string|null;exam_title?:string|null;allowed_aids?:string|null;};
type ExistingCourse={id:string;name:string;code:string};
const norm=(v:unknown,max=300)=>safeString(v,max).replace(/\s+/g,' ').trim();
const key=(v:unknown)=>norm(v).toLocaleLowerCase('de-DE').replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/[ß]/g,'ss').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const validEmail=(v:unknown)=>{const e=normalizeEmail(v);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:'';};
export const rowValue=(row:Record<string,unknown>,...names:string[])=>{for(const n of names){const wanted=key(n);for(const [k,v] of Object.entries(row))if(key(k)===wanted&&String(v??'').trim())return v;}return'';};
const ORG_UNIT_TYPE_KEY=/^[a-z][a-z0-9_-]{1,48}$/;
const ORG_UNIT_NODE_WORDS=/^(location|standort|org_unit|orgunit|organisationseinheit|abteilung|bereich|einheit|unit|knoten)$/;
// Eindeutige Einheitenwoerter: so heisst nie die Funktion einer Person.
const ORG_UNIT_WORDS_STRONG=/^(standort|location|campus|niederlassung|filiale|fachbereich|abteilung|department|organisationseinheit|org_unit|orgunit|verwaltungseinheit|stabsstelle|referat|sachgebiet)$/;
// Mehrdeutige Woerter: "Leitung" oder "Service" steht in einer Personalliste genauso in der
// Rollenspalte. Sie zaehlen nur zusammen mit einem Strukturmerkmal der Zeile.
const ORG_UNIT_WORDS_WEAK=/^(leitung|geschaeftsfuehrung|geschaeftsleitung|service|servicebereich|bereich|einheit|unit)$/;
const ORG_UNIT_TYPES:[RegExp,string,string][]=[
  [/^(standort|location|campus|niederlassung|filiale)$/,'location','Standort'],
  [/^(abteilung|bereich|fachbereich|department|organisationseinheit|org_unit|orgunit|einheit|unit|verwaltungseinheit|referat|sachgebiet)$/,'department','Bereich / Fachbereich'],
  [/^(bildungsgang|programm|program|studiengang)$/,'program','Bildungsgang / Programm'],
  [/^(massnahme|projekt|measure|project)$/,'measure','Maßnahme / Projekt'],
  [/^(gruppe|group|team)$/,'group','Gruppe'],
];
// Ein Organigramm nennt seine Ebenen selten so, wie das Portal sie intern fuehrt. "Fachbereich",
// "Leitung", "Service" sind Beschriftungen des Kunden. Bekannte Beschriftungen werden auf die
// mitgelieferten Typen abgebildet, alles andere wird als eigener Typ mit genau der Beschriftung
// des Kunden angelegt - erfunden wird nichts.
function orgUnitType(label:string,hasAddress:boolean){const k=key(label);for(const [re,typeKey,typeLabel] of ORG_UNIT_TYPES)if(re.test(k))return{key:typeKey,label:typeLabel};if(k&&ORG_UNIT_TYPE_KEY.test(k))return{key:k,label:norm(label,120)};return hasAddress?{key:'location',label:'Standort'}:{key:'department',label:'Bereich / Fachbereich'};}
const orgUnitAddress=(row:Record<string,unknown>)=>({street:norm(rowValue(row,'street','strasse','straße','adresse'),160),postal_code:norm(rowValue(row,'postal_code','plz','zip'),20),city:norm(rowValue(row,'city','ort','stadt'),120),country:norm(rowValue(row,'country','land'),80)});
function orgUnitData(row:Record<string,unknown>){
  const address=orgUnitAddress(row),hasAddress=Object.values(address).some(Boolean);
  const declared=norm(rowValue(row,'type','typ','art','kategorie'),120)||norm(rowValue(row,'node_type','knotentyp','ebene'),120);
  const filled:Record<string,string>={};for(const [k,v] of Object.entries(address))if(v)filled[k]=v;
  return{external_id:norm(rowValue(row,'external_id','externe_id','unit_id','location_id','org_unit_id','standort_id'),160)||null,
    parent_external_id:norm(rowValue(row,'parent_external_id','parent_id','uebergeordnet','uebergeordnete_einheit','elternknoten'),160)||null,
    name:norm(rowValue(row,'display_name','name','bezeichnung','einheit','standort'),200)||null,
    type:orgUnitType(declared,hasAddress),address:Object.keys(filled).length?filled:null};
}
// Eine Zeile ist genau dann ein Standort oder eine Organisationseinheit, wenn der Kunde das
// entweder ausdruecklich sagt (node_type/Typ) oder wenn die Zeile eine Einheit beschreibt und
// keine Person, keinen Kurs und kein Fach: kein Vor-/Nachname, keine E-Mail, dafuer eine
// Standort-/Einheitenkennung oder eine Anschrift. Vorher fiel jede solche Zeile in den
// Auffangfall "Teilnehmer" - ein Campus wurde als Person zum Import vorgeschlagen.
export function orgUnitSignal(row:Record<string,unknown>,raw:string):boolean{
  if(ORG_UNIT_NODE_WORDS.test(key(rowValue(row,'node_type','knotentyp','ebene'))))return true;
  if(rowValue(row,'email','e_mail','mail','emailadresse','teacher_email')||rowValue(row,'first_name','vorname','last_name','nachname'))return false;
  if(rowValue(row,'course_name','course_code','kurs','klasse','kurscode','subject_name','fach','fachname'))return false;
  if(ORG_UNIT_WORDS_STRONG.test(raw))return true;
  if(!rowValue(row,'display_name','name','bezeichnung','einheit'))return false;
  const structural=!!(rowValue(row,'location_id','unit_id','org_unit_id','standort_id')||Object.values(orgUnitAddress(row)).some(Boolean));
  return structural&&(!raw||ORG_UNIT_WORDS_WEAK.test(raw)||ORG_UNIT_WORDS_STRONG.test(raw));
}
const RESOURCE_WORDS=/^(raum|room|seminarraum|klassenraum|unterrichtsraum|hoersaal|labor|werkstatt|ressource|resource|equipment|ausstattung|geraet|technik|material|fahrzeug|vehicle|online_raum|onlineraum|online_room|virtueller_raum)$/;
const RESOURCE_KINDS:[RegExp,string][]=[
  [/^(online_raum|onlineraum|online_room|virtueller_raum|virtual|webinar)$/,'online_room'],
  [/^(raum|room|seminarraum|klassenraum|unterrichtsraum|hoersaal|labor|werkstatt)$/,'room'],
  [/^(fahrzeug|vehicle|bus|transporter)$/,'vehicle'],
  [/^(equipment|ausstattung|geraet|technik|material|werkzeug)$/,'equipment'],
];
const RESOURCE_STATUS:[RegExp,string][]=[
  [/^(wartung|maintenance|reparatur|gesperrt|belegt)$/,'maintenance'],
  [/^(inaktiv|inactive|stillgelegt|ausser_betrieb|ausgemustert)$/,'inactive'],
];
const resourceTypeWord=(row:Record<string,unknown>)=>key(rowValue(row,'resource_type','ressourcentyp','ressourcenart','raumtyp','raumart','art_der_ressource'));
// Ein Raum ist keine Person. Ohne diese Unterscheidung landete jede Raumliste im Auffangfall
// "Teilnehmer" und wurde dem Kunden als Personenimport ohne E-Mail vorgelegt.
export function resourceSignal(row:Record<string,unknown>,raw:string):boolean{
  if(RESOURCE_WORDS.test(resourceTypeWord(row)))return true;
  if(rowValue(row,'email','e_mail','mail','emailadresse','teacher_email')||rowValue(row,'first_name','vorname','last_name','nachname'))return false;
  if(rowValue(row,'course_name','course_code','kurs','klasse','kurscode','subject_name','fach','fachname'))return false;
  if(RESOURCE_WORDS.test(raw))return true;
  return!!(rowValue(row,'resource_id','raum_id','room_id','raumnummer')&&rowValue(row,'display_name','name','bezeichnung'));
}
function resourceData(row:Record<string,unknown>){
  const word=resourceTypeWord(row)||key(rowValue(row,'role','rolle','typ','type'));let kind='other';for(const [re,k] of RESOURCE_KINDS)if(re.test(word)){kind=k;break;}
  const statusWord=key(rowValue(row,'status','zustand','verfuegbarkeit'));let status='active';for(const [re,v] of RESOURCE_STATUS)if(re.test(statusWord)){status=v;break;}
  const rawCapacity=norm(rowValue(row,'capacity','kapazitaet','plaetze','sitzplaetze'),20).replace(/[^0-9]/g,''),capacity=rawCapacity?Math.min(100000,Number(rawCapacity)):null;
  const features=norm(rowValue(row,'features','ausstattung','merkmale','austattung'),500).split(/[;,|\/]/).map(x=>x.trim()).filter(Boolean).slice(0,100);
  return{name:norm(rowValue(row,'display_name','name','bezeichnung','raum'),200)||null,kind,status,capacity:Number.isFinite(capacity as number)?capacity:null,features:features.length?features:null,
    external_id:norm(rowValue(row,'external_id','externe_id','resource_id','raum_id','room_id','raumnummer'),160)||null};
}
// Nennt die Zeile ihre Art ausdruecklich und genau, gilt das - vor jeder Struktur- und
// Wortmustererkennung. Genau diese Werte stellt auch die Typkorrektur in der Vorschau ein: eine
// Richtigstellung des Pruefenden muss sich gegen jedes Erkennungsmerkmal der Zeile durchsetzen.
const EXPLICIT_ROLE:[RegExp,OrganizationCandidateType][]=[
  [/^(tenant_admin|kunden_?admin|bildungstraeger_admin|gesamtadmin|organisationsadmin)$/,'tenant_admin_review'],
  [/^(class_admin|klassen_?admin)$/,'class_admin'],
  [/^(teacher|dozent|dozentin|lehrkraft|lehrer|lehrerin|trainer|trainerin|ausbilder|ausbilderin|referent|referentin|kursleiter|kursleiterin)$/,'teacher'],
  [/^(guest|gast)$/,'guest'],
  [/^(course|kurs|klasse)$/,'course'],
  [/^(subject|fach)$/,'subject'],
  [/^(participant|teilnehmer|teilnehmerin|schueler|schuelerin|student|studentin)$/,'participant'],
  [/^(org_unit|orgunit|organisationseinheit|standort|location)$/,'org_unit'],
  [/^(resource|ressource|raum|room)$/,'resource'],
  [/^(lesson|unterricht|unterrichtsstunde|stunde|stundenplan|schulstunde|timetable)$/,'lesson'],
  [/^(exam|pruefung|pruefungen|klausur|leistungskontrolle|examen)$/,'exam'],
  [/^(staff|beschaeftigt|beschaeftigte|beschaeftigter|mitarbeiter|mitarbeiterin)$/,'staff'],
];
// Ein ganzer Ordner enthaelt in aller Regel auch den Stundenplan. Bisher hatte diese Weiche
// dafuer kein Gleis: eine Stundenplanzeile nennt einen Kurscode, also erkannte importRole sie
// als "course" - und aus achtzehn Unterrichtsstunden wurde achtzehnmal derselbe Kurs. Der
// Stundenplan verschwand stillschweigend, genau wie gemeldet ("Stundenplaene hochgeladen und
// diese wurden nicht erkannt").
//
// Was eine Zeile zur Unterrichtsstunde macht, ist ihr Zeitfenster: ein Datum und dazu Beginn und
// Ende. Keine Kurs-, Fach-, Raum- oder Personenliste fuehrt das je Zeile. Deshalb genuegt genau
// dieses Merkmal - und es schlaegt die uebrigen Erkennungen, aber niemals die ausdrueckliche
// Angabe des Pruefenden.
export function lessonSignal(row:Record<string,unknown>):boolean{
  const d=lessonData(row);
  return Boolean(d.date&&d.start&&d.end);
}
// Eine Pruefung sieht aus wie eine Unterrichtsstunde: Datum, Beginn, Ende, Kurs, Raum. Sie ist
// aber ein eigener Vorgang - und sie traegt eine Kennung, ueber die derselbe Termin aus zwei
// Dateien (Pruefungsliste und Pruefungskalender) zu EINER Pruefung zusammenfaellt statt zu zweien.
const EXAM_WORDS=/(klausur|pruefung|prufung|leistungskontrolle|examen|abschlusstest|zwischentest)/;
export function examSignal(row:Record<string,unknown>):boolean{
  const kennung=norm(rowValue(row,'pruefung_id','pruefungs_id','pruefungsid','exam_id','klausur_id'),160);
  if(kennung)return true;
  // Ein Kalendereintrag traegt nur eine allgemeine Terminkennung. Er gilt nur dann als Pruefung,
  // wenn sein eigener Titel es sagt - geraten wird nicht.
  const terminId=norm(rowValue(row,'termin_id','event_id','uid'),160);
  if(!terminId)return false;
  const d=lessonData(row);
  if(!d.date||!d.start)return false;
  return EXAM_WORDS.test(key(rowValue(row,'titel','title','bezeichnung','summary','display_name')));
}
export function examRef(row:Record<string,unknown>):string|null{
  return norm(rowValue(row,'pruefung_id','pruefungs_id','pruefungsid','exam_id','klausur_id','termin_id','event_id','uid'),160)||null;
}
function lessonData(row:Record<string,unknown>){
  const date=parseDate(rowValue(row,'date','datum','tag','unterrichtstag','schultag'));
  const start=parseTime(rowValue(row,'start_time','beginn','start','von','startzeit','uhrzeit_von','beginn_uhrzeit'));
  const end=parseTime(rowValue(row,'end_time','ende','end','bis','endzeit','uhrzeit_bis','ende_uhrzeit','schluss'));
  const room=norm(rowValue(row,'room','raum','unterrichtsraum','room_external_id','raum_nr','raumnummer'),200)||null;
  // In den Hinweis gehoert nur ein Name: "Dozent/in: EMP-001" waere eine Auskunft, die keine ist.
  // Die Kennung wird davon getrennt mitgefuehrt, weil erst sie die Zeile dem Dozentenstamm
  // zuordnet - ohne sie entstuende die Unterrichtsstunde wie bisher ohne Dozent/in.
  const teacher=norm(rowValue(row,'teacher','dozent','dozentin','lehrkraft','lehrer','lehrerin','trainer','ausbilder','referent','kursleiter','dozent_name','teacher_name','lehrer_name'),200)||null;
  const teacherRef=norm(rowValue(row,'dozenten_id','dozent_id','dozentin_id','lehrkraft_id','lehrer_id','teacher_id','teacher_external_id','dozenten_kennung','personalnummer'),160)||null;
  const mode=norm(rowValue(row,'session_type','unterrichtsart','unterricht','format','modus'),120);
  const topic=norm(rowValue(row,'topic','thema','thema_der_stunde','hinweis','bemerkung','notiz','notes'),1500);
  const notes=[mode?`Unterrichtsart: ${mode}`:'',teacher?`Dozent/in: ${teacher}`:'',topic].filter(Boolean).join('\n')||null;
  return{date,start,end,room,notes,teacher_ref:teacherRef||teacher};
}
// --- Portalrollen fuer Beschaeftigte -----------------------------------------------------------
// Eine Beschaeftigtenliste fuehrt Menschen, die keiner Klasse angehoeren: Standortleitung,
// Pruefungskoordination, Teilnehmendenservice, Qualitaetsmanagement, IT-Support. Bis hierher
// fielen sie in den Auffangfall "Teilnehmer" und blieben dort mit COURSE_REQUIRED liegen - fuer
// eine Verwaltungskraft ohne Kurs gab es schlicht keine Rolle.
//
// Das Portal hat dafuer laengst das richtige Werkzeug: eine Freigabe auf einer
// Organisationseinheit, mit Profil, Gueltigkeit und Vererbung auf Unterbereiche
// (org_permission_grants). Genau die wird hier vergeben - dieselbe, die ein Kunden-Admin unter
// "Struktur, Standorte & Zustaendigkeiten" von Hand erteilt.
//
// Die Staffelung folgt der Funktion, nicht dem Wunsch: wer koordiniert, darf bearbeiten; wer
// auswertet, darf lesen und auswerten; die Technik bekommt keine Teilnehmendendaten. Und
// "Verantwortlich" schliesst das Recht ein, weitere Rechte zu vergeben - das entsteht in diesem
// Sammelimport niemals von selbst, sondern wird ausdruecklich zur Bestaetigung vorgelegt, genau
// wie ein gefundenes Kunden-Admin-Recht.
const STAFF_READ_ONLY:OrgPermission[]=['org.view','courses.view'];
const STAFF_FUNCTIONS:[RegExp,OrgProfile,OrgPermission[]|null,string][]=[
  [/leitung|geschaeftsfuehrung|geschaeftsleitung|direktion|vorstand/,'responsible',null,'Verantwortlich'],
  [/qualitaet|qualitaetsmanagement|revision|audit|controlling/,'reporting',null,'Auswertung'],
  [/it_?support|it_?betrieb|edv|systemadministration|technik|helpdesk/,'custom',STAFF_READ_ONLY,'Nur lesen (ohne Teilnehmendendaten)'],
  [/koordination|koordinator|management|managerin|service|sekretariat|sachbearbeitung|verwaltung|betreuung|beratung|pruefung|praxis|curriculum|lehrplan/,'editor',null,'Bearbeiten'],
];
export type StaffAccess={profile:OrgProfile;permissions:OrgPermission[];label:string;confirm:boolean};
// Ohne erkennbare Funktion bleibt es beim sparsamsten Zuschnitt: sehen, was es gibt, und sonst
// nichts. Fail closed - eine unbekannte Funktion ist kein Grund, mehr zu geben.
export function staffAccess(row:Record<string,unknown>):StaffAccess{
  const fn=key(rowValue(row,'role','rolle','funktion','function','position','taetigkeit','aufgabe','bereichsrolle'));
  for(const [pattern,profile,permissions,label] of STAFF_FUNCTIONS){
    if(!pattern.test(fn))continue;
    return{profile,permissions:permissions??profilePermissions(profile),label,confirm:profile==='responsible'};
  }
  return{profile:'custom',permissions:STAFF_READ_ONLY,label:'Nur lesen (ohne Teilnehmendendaten)',confirm:false};
}
// Eine Zeile beschreibt eine beschaeftigte Person, wenn sie einen Menschen nennt und ihre
// Funktion eine Verwaltungsfunktion ist. Ohne Menschen ist es eine Organisationseinheit, keine
// Person - deshalb diese Bedingung und nicht nur das Wort.
function namesAPerson(row:Record<string,unknown>):boolean{
  return Boolean(rowValue(row,'display_name','name','person','person_name','first_name','vorname','last_name','nachname','email','e_mail','mail','emailadresse'));
}
export function staffSignal(row:Record<string,unknown>):boolean{
  if(!namesAPerson(row))return false;
  const fn=key(rowValue(row,'role','rolle','funktion','function','position','taetigkeit','aufgabe','bereichsrolle'));
  return STAFF_FUNCTIONS.some(([pattern])=>pattern.test(fn));
}
// Nennt die Datei die Portalrolle beim Namen, gilt sie. Das Abnahmepaket eines Kunden fuehrt
// dafuer eine eigene Spalte portal_role mit genau diesen Werten - sie zu ignorieren und stattdessen
// aus der Funktionsbezeichnung zu raten, waere absichtlich schlechter.
const PORTAL_ROLE:[RegExp,OrganizationCandidateType][]=[
  [/^(customer_admin|tenant_admin|kunden_?admin|bildungstraeger_admin)$/,'tenant_admin_review'],
  [/^(instructor|teacher|dozent|dozentin|lehrkraft|trainer)$/,'teacher'],
  [/^(staff|mitarbeiter|mitarbeiterin|beschaeftigt|beschaeftigte|beschaeftigter)$/,'staff'],
  [/^(class_admin|klassen_?admin)$/,'class_admin'],
  [/^(participant|student|studentin|teilnehmer|teilnehmerin|schueler|schuelerin)$/,'participant'],
  [/^(guest|gast)$/,'guest'],
];
export function portalRole(row:Record<string,unknown>):OrganizationCandidateType|null{
  const raw=key(rowValue(row,'portal_role','portalrolle','portal_rolle'));
  if(!raw)return null;
  for(const [pattern,role] of PORTAL_ROLE)if(pattern.test(raw))return role;
  return null;
}

// Diese Rueckfaelle suchten das Wort irgendwo in der Angabe. "Exkursion" enthaelt "kurs", also
// wurden im Abnahmepaket eines Kunden acht Exkursionen zu Kursen; "Gastronomie" enthielte "gast",
// "Fachbereich" enthaelt "fach". Gesucht wird deshalb das ganze Wort: key() macht aus jeder
// Angabe eine Folge von Woertern mit Unterstrich dazwischen, und genau darauf wird geprueft.
// "teilnehmer_aktiv" oder "dozent_extern" treffen weiterhin, "exkursion" nicht mehr.
function word(pattern:string,raw:string):boolean{return new RegExp(`(^|_)(${pattern})(_|$)`).test(raw);}
export function importRole(row:Record<string,unknown>):OrganizationCandidateType{
  const raw=key(rowValue(row,'role','rolle','funktion','person_type','personenart','typ','type'));
  for(const [pattern,role] of EXPLICIT_ROLE)if(pattern.test(raw))return role;
  const stated=portalRole(row);if(stated)return stated;
  if(examSignal(row))return'exam';
  if(lessonSignal(row))return'lesson';
  if(word('tenant_admin|kunden_?admin|bildungstraeger_admin|gesamtadmin|organisationsadmin',raw))return'tenant_admin_review';
  if(resourceSignal(row,raw))return'resource';
  if(orgUnitSignal(row,raw))return'org_unit';
  if(word('class_admin|klassen_?admin',raw))return'class_admin';
  if(word('teacher|dozent|dozentin|lehrkraft|lehrer|lehrerin|trainer|trainerin|ausbilder|ausbilderin|referent|referentin|kursleiter|kursleiterin',raw))return'teacher';
  if(staffSignal(row))return'staff';
  if(word('guest|gast',raw))return'guest';
  if(word('course|kurs|klasse',raw))return'course';
  if(word('subject|fach',raw))return'subject';
  if(word('participant|teilnehmer|teilnehmerin|schueler|schuelerin|student|studentin',raw))return'participant';
  // Eine Dozentenliste des Kunden nennt die Person oft nur ueber ihre Kennung ("Dozenten_ID:
  // D001") und traegt sonst nur Name und E-Mail. Ohne dieses Merkmal fiel die ganze Datei in den
  // Auffangfall "Teilnehmer": der Dozentenstamm blieb leer, und der Stundenplan fand spaeter
  // niemanden zum Zuordnen. Eine Stundenplanzeile fuehrt dieselbe Spalte, ist aber oben schon
  // als 'lesson' erkannt - sie kommt hier nicht an.
  const teacherSignal=rowValue(row,'teacher','teacher_name','dozent','dozent_name','lehrkraft','lehrer','lehrer_name','ausbilder','referent','kursleiter')
    ||rowValue(row,'dozenten_id','dozent_id','dozentin_id','lehrkraft_id','lehrer_id','dozenten_kennung');
  if(teacherSignal)return'teacher';
  const personSignal=rowValue(row,'display_name','name','person','person_name','participant','participant_name','teilnehmer','schueler','student'),emailSignal=rowValue(row,'email','e_mail','mail','emailadresse');
  if(!personSignal&&!emailSignal){if(rowValue(row,'course_name','kurs','klasse','lehrgang','massnahme','course_code','kurscode','klassencode'))return'course';if(rowValue(row,'subject_name','subject','fach','fachname'))return'subject';}
  return'participant';
}
function personName(row:Record<string,unknown>,type:OrganizationCandidateType){const specific=type==='teacher'?rowValue(row,'teacher','teacher_name','dozent','dozent_name','lehrkraft','lehrer','lehrer_name','ausbilder','referent','kursleiter'):rowValue(row,'participant','participant_name','teilnehmer','teilnehmer_name','schueler','student');const direct=norm(specific||rowValue(row,'display_name','name','person','person_name'));if(direct)return direct;const first=norm(rowValue(row,'first_name','vorname')),last=norm(rowValue(row,'last_name','nachname'));return[first,last].filter(Boolean).join(' ');}
function courseData(row:Record<string,unknown>){return{id:norm(rowValue(row,'course_id','kurs_id'),120)||null,name:norm(rowValue(row,'course_name','kurs','klasse','lehrgang','massnahme','maßnahme'),200)||null,code:norm(rowValue(row,'course_code','kurscode','klassencode','massnahmennummer','maßnahmennummer'),80)||null};}
function subjectData(row:Record<string,unknown>){return{name:norm(rowValue(row,'subject_name','subject','fach','fachname'),200)||null,short:norm(rowValue(row,'subject_short_name','subject_code','fachkuerzel','fachkürzel','kuerzel','kürzel'),50)||null};}
// Der Kurscode zuerst, die eigene Kennung des Kunden zuletzt: "CRS-001" sagt dem Portal nichts,
// "ADM-26-01" steht an der Klasse, die aus derselben Kursliste entstanden ist. Stand die eigene
// Kennung vorn, suchte der Import beim Anlegen nach "crs_001" und fand nichts - gemessen am
// Abnahmepaket eines Kunden blieben so alle 509 Unterrichtsstunden mit COURSE_NOT_RESOLVED
// liegen, obwohl ihre Klasse im selben Lauf angelegt worden war.
function courseRef(c:{id:string|null;name:string|null;code:string|null}){return key(c.code||c.name||c.id||'')||null;}
function label(text:string,names:string[],max=220){for(const n of names){const m=text.match(new RegExp(`(?:^|\\n)\\s*${n}\\s*[:\\-]\\s*([^\\n]{1,${max}})`,'im'));if(m?.[1])return norm(m[1],max);}return'';}
export function textRows(text:string){const blocks=text.replace(/\r/g,'\n').replace(/---+\s*Seite[^\n]*---+/gi,'\n').split(/\n\s*\n|---+\s*(?:Datensatz|Person)[^\n]*---+/i).map(x=>x.trim()).filter(Boolean).slice(0,1000);return blocks.map(block=>({rolle:label(block,['Rolle','Funktion','Typ','Personenart'],100),name:label(block,['Name','Person','Teilnehmer(?:in)?','Dozent(?:in)?','Lehrkraft'],200),email:(block.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||'',kurs:label(block,['Kurs','Klasse','Lehrgang','Maßnahme','Massnahme'],200),kurscode:label(block,['Kurscode','Klassencode','Maßnahmennummer','Massnahmennummer'],100),fach:label(block,['Fach','Subject'],200),fachkuerzel:label(block,['Fachkürzel','Fachkuerzel','Subject code'],50)}));}
// Eine Kurskennung aus der Datei des Kunden ist seine eigene, nicht die des Portals. Sie hier zu
// finden ist ein Glueck, sie nicht zu finden ist der Normalfall - eine Kursliste wird ja gerade
// eingelesen, um die Kurse erst anzulegen.
//
// Vorher brach die Aufloesung bei einer unbekannten Kennung sofort mit COURSE_NOT_FOUND ab und
// sah den Kursnamen, der direkt daneben stand, nie an. Ergebnis in einer echten Kundendatei:
// 24 Funde, jede einzelne Kurszeile mit "Angegebener Kurs existiert nicht" abgewaehlt - obwohl
// genau diese Kurse angelegt werden sollten.
//
// Jetzt ist eine unbekannte Kennung nur dann ein Hindernis, wenn daneben weder Kursname noch
// Kurscode steht. Nur dann ist wirklich nicht zu erkennen, welcher Kurs gemeint ist.
function resolveCourse(c:{id:string|null;name:string|null;code:string|null},courses:ExistingCourse[]){if(c.id){const x=courses.find(v=>v.id===c.id);if(x)return{course:x,warning:null};if(!c.code&&!c.name)return{course:null,warning:'COURSE_NOT_FOUND'};}const code=c.code?.toLowerCase(),name=c.name?.toLocaleLowerCase('de-DE');if(code){const found=courses.filter(v=>v.code.toLowerCase()===code);if(found.length===1)return{course:found[0],warning:null};if(found.length>1)return{course:null,warning:'COURSE_AMBIGUOUS'};}if(name){const found=courses.filter(v=>v.name.toLocaleLowerCase('de-DE')===name);if(found.length===1)return{course:found[0],warning:null};if(found.length>1)return{course:null,warning:'COURSE_AMBIGUOUS'};}return{course:null,warning:null};}
// Eine Zeile kann mehrere Kurse gleichzeitig nennen - Semikolon, Komma, senkrechter Strich oder
// Zeilenumbruch getrennt, dieselben Trennzeichen wie bei jeder anderen Mehrfachangabe in diesem
// Import (siehe "features" bei Ressourcen). Eine Zelle ohne Trennzeichen bleibt unveraendert.
function splitList(v:string|null):string[]{if(!v)return[];const parts=v.split(/[;,|\n]+/).map(x=>norm(x)).filter(Boolean);return parts.length?[...new Set(parts)]:[];}
// Vorher war eine Zelle wie "VFA-26-A, VFA-26-B" EIN Kursname, den kein Kurs so trug: die ganze
// Teilnehmerzeile blieb mit "Angegebener Kurs existiert nicht" liegen, obwohl beide Kurse laengst
// bestanden - und wer wirklich in zwei Klassen sitzt, kam ueberhaupt nicht durch den Import.
// Jetzt entsteht aus einer solchen Zeile fuer jeden genannten Kurs eine eigene Kursangabe; ohne
// Trennzeichen bleibt es bei der einen, die schon vorher galt.
function courseVariants(c:{id:string|null;name:string|null;code:string|null}){
  const codes=splitList(c.code),names=splitList(c.name),n=Math.max(codes.length,names.length);
  if(n<=1)return[c];
  return Array.from({length:n},(_,i)=>({id:null,name:names[i]??null,code:codes[i]??null}));
}
function baseCandidate(row:Record<string,unknown>,i:number,courses:ExistingCourse[]):OrganizationCandidate[]{
  const type=importRole(row),c=courseData(row),s=subjectData(row),resolved=resolveCourse(c,courses),warnings:string[]=[];let name:string|null=null,email:string|null=null;
  if(type==='resource'){const x=resourceData(row);if(!x.name)warnings.push('RESOURCE_NAME_REQUIRED');
    return[{type,display_name:x.name,email:null,course_id:null,course_name:null,course_code:null,course_ref:null,subject_name:null,subject_short_name:null,confidence:Math.max(0,100-warnings.length*25),warnings,source_row:i,external_id:x.external_id,parent_external_id:null,org_unit_ref:norm(rowValue(row,'location_external_id','org_unit_external_id','standort','location'),160)||null,resource_kind:x.kind,resource_status:x.status,capacity:x.capacity,features:x.features}];}
  if(type==='org_unit'){const u=orgUnitData(row);if(!u.name)warnings.push('ORG_UNIT_NAME_REQUIRED');if(u.external_id&&u.parent_external_id&&key(u.external_id)===key(u.parent_external_id))warnings.push('ORG_UNIT_PARENT_INVALID');
    return[{type,display_name:u.name,email:null,course_id:null,course_name:null,course_code:null,course_ref:null,subject_name:null,subject_short_name:null,confidence:Math.max(0,100-warnings.length*25),warnings,source_row:i,external_id:u.external_id,parent_external_id:u.parent_external_id,org_unit_type_key:u.type.key,org_unit_type_label:u.type.label,address:u.address}];}
  if(type==='staff'){const access=staffAccess(row),unitRef=norm(rowValue(row,'org_unit_external_id','org_unit','organisationseinheit_id','location_external_id','bereich','standort'),160)||null;
    name=personName(row,'participant')||null;email=validEmail(rowValue(row,'email','e_mail','mail','emailadresse'))||null;
    if(!name)warnings.push('NAME_REQUIRED');if(!email)warnings.push('EMAIL_REQUIRED');
    if(!unitRef)warnings.push('STAFF_ORG_UNIT_REQUIRED');
    if(access.confirm)warnings.push('ACCESS_RESPONSIBLE_CONFIRMATION_REQUIRED');
    return[{type,display_name:name,email,course_id:null,course_name:null,course_code:null,course_ref:null,subject_name:null,subject_short_name:null,confidence:Math.max(0,100-warnings.filter(w=>w!=='ACCESS_RESPONSIBLE_CONFIRMATION_REQUIRED').length*25),warnings,source_row:i,org_unit_ref:unitRef,access_profile:access.profile,access_permissions:access.permissions,access_label:access.label}];}
  if(type==='exam'){const l=lessonData(row);
    if(!l.date)l.date=parseDate(rowValue(row,'current_date','exam_date','pruefungsdatum','pruefungstermin','termin','termindatum','geplant_am'));const titel=norm(rowValue(row,'titel','title','bezeichnung','summary','display_name'),300)||null;
    if(!titel)warnings.push('EXAM_TITLE_REQUIRED');if(!l.date||!l.start)warnings.push('EXAM_TIME_REQUIRED');
    if(resolved.warning)warnings.push(resolved.warning);
    if(!resolved.course&&(c.name||c.code)&&!resolved.warning)warnings.push('COURSE_WILL_BE_CREATED');
    return[{type,display_name:titel,email:null,course_id:resolved.course?.id||null,course_name:resolved.course?.name||c.name,
      course_code:resolved.course?.code||c.code,course_ref:courseRef(c),subject_name:s.name,subject_short_name:s.short,
      confidence:Math.max(0,100-warnings.filter(w=>w!=='COURSE_WILL_BE_CREATED').length*25),warnings,source_row:i,
      lesson_date:l.date,lesson_start:l.start,lesson_end:l.end,room:l.room,exam_title:titel,
      allowed_aids:norm(rowValue(row,'hilfsmittel','allowed_aids','beschreibung','description','hinweis'),1000)||null,
      external_id:examRef(row),org_unit_ref:null}];}
  if(type==='lesson'){const l=lessonData(row);
    if(!l.date)warnings.push('LESSON_DATE_REQUIRED');if(!l.start||!l.end)warnings.push('LESSON_TIME_REQUIRED');
    if(l.start&&l.end&&l.end<=l.start)warnings.push('LESSON_END_BEFORE_START');
    if(!resolved.course&&!c.name&&!c.code&&!c.id)warnings.push('COURSE_REQUIRED');
    if(resolved.warning)warnings.push(resolved.warning);if(!resolved.course&&(c.name||c.code)&&!resolved.warning)warnings.push('COURSE_WILL_BE_CREATED');
    return[{type,display_name:[l.date,l.start&&l.end?`${l.start}–${l.end}`:''].filter(Boolean).join(' ')||null,email:null,course_id:resolved.course?.id||null,course_name:resolved.course?.name||c.name,course_code:resolved.course?.code||c.code,course_ref:courseRef(c),subject_name:s.name,subject_short_name:s.short,confidence:Math.max(0,100-warnings.filter(w=>w!=='COURSE_WILL_BE_CREATED').length*25),warnings,source_row:i,lesson_date:l.date,lesson_start:l.start,lesson_end:l.end,room:l.room,notes:l.notes,teacher_ref:l.teacher_ref,org_unit_ref:norm(rowValue(row,'org_unit_external_id','location_external_id','org_unit','organisationseinheit_id'),160)||null}];}
  let personRef:string|null=null;
  if(type==='course'){name=c.name||norm(rowValue(row,'name','display_name'),200)||null;if(!name&&!c.code)warnings.push('COURSE_NAME_REQUIRED');}
  else if(type==='subject'){name=s.name||norm(rowValue(row,'name','display_name'),200)||null;if(!name)warnings.push('SUBJECT_NAME_REQUIRED');}
  else{name=personName(row,type)||null;email=validEmail(rowValue(row,'email','e_mail','mail','emailadresse','teacher_email','dozent_email','lehrer_email'))||null;personRef=norm(rowValue(row,'dozenten_id','dozent_id','dozentin_id','lehrkraft_id','lehrer_id','teacher_id','teacher_external_id','dozenten_kennung','personalnummer'),160)||null;if(!name)warnings.push('NAME_REQUIRED');if(!email&&type!=='teacher')warnings.push('EMAIL_REQUIRED');if(type==='teacher'&&!email)warnings.push('TEACHER_PORTAL_EMAIL_MISSING');}
  const orgUnitRef=norm(rowValue(row,'org_unit_external_id','location_external_id','org_unit','organisationseinheit_id'),160)||null;
  const isPersonInCourse=['participant','class_admin','guest'].includes(type);
  const varianten=isPersonInCourse?courseVariants(c):[c];
  return varianten.map(v=>{
    const r=v===c?resolved:resolveCourse(v,courses),w=[...warnings];
    if(isPersonInCourse&&!r.course&&!v.name&&!v.code&&!v.id)w.push('COURSE_REQUIRED');
    if(r.warning)w.push(r.warning);
    if(!r.course&&(v.name||v.code)&&!r.warning)w.push('COURSE_WILL_BE_CREATED');
    if(type==='tenant_admin_review')w.push('TENANT_ADMIN_CONFIRMATION_REQUIRED');
    const confidence=Math.max(0,100-w.filter(x=>!['COURSE_WILL_BE_CREATED','TEACHER_PORTAL_EMAIL_MISSING'].includes(x)).length*25-(w.includes('TEACHER_PORTAL_EMAIL_MISSING')?10:0));
    return{type,display_name:name,email,course_id:r.course?.id||null,course_name:r.course?.name||v.name,course_code:r.course?.code||v.code,course_ref:courseRef(v),subject_name:s.name,subject_short_name:s.short,confidence,warnings:w,source_row:i,teacher_ref:personRef,org_unit_ref:orgUnitRef};
  });
}
async function existingCourses(env:Env,tenantId:string){const r=await env.DB.prepare('SELECT id,name,code FROM courses WHERE tenant_id=? AND is_active=1 ORDER BY name').bind(tenantId).all<ExistingCourse>();return(r.results??[]) as ExistingCourse[];}
// Zwei Einheiten koennen gleich heissen ("IT" an zwei Standorten). Unterschieden werden sie an
// ihrer externen Kennung; nur ohne Kennung bleibt der Name das einzige Merkmal.
// Eine Klasse wird an ihrem Code erkannt, nicht an ihrer Beschriftung. Sonst stehen dieselbe
// Klasse zweimal im Entwurf, sobald eine zweite Datei desselben Ordners sie nur ueber den Code
// nennt: die Kursliste bringt "Pflege A" mit Code PFL-A, der Stundenplan nur PFL-A - und der
// aus dem Stundenplan ergaenzte Platzhalter wurde vor der echten Zeile angelegt. Die Klasse hiess
// danach "PFL-A". Mit dem Code als Merkmal fallen beide zusammen, und mergeDuplicates behaelt die
// echte Zeile.
function candidateSignature(c:OrganizationCandidate){if(c.type==='staff')return`${c.type}|${key(c.email||c.display_name)}|${key(c.org_unit_ref||'')}`;if(c.type==='course')return`${c.type}|${key(c.course_code||c.course_name||c.display_name||'')}`;if(c.type==='lesson')return`${c.type}|${c.course_id||c.course_ref||''}|${c.lesson_date||''}|${c.lesson_start||''}|${c.lesson_end||''}|${key(c.room||'')}`;if(c.type==='resource')return`${c.type}|${key(c.resource_kind||'')}|${key(c.display_name)}`;if(c.type==='subject')return`${c.type}|${key(c.subject_name||c.display_name)}`;if(c.type==='org_unit')return`${c.type}|${key(c.external_id||c.display_name)}`;return`${c.type}|${key(c.email||c.display_name)}|${c.course_id||c.course_ref||''}`;}
function synthesize(candidates:OrganizationCandidate[],courses:ExistingCourse[]){const out:OrganizationCandidate[]=[],courseSeen=new Set<string>(),subjectSeen=new Set<string>();for(const c of candidates){if(c.type!=='course'&&!c.course_id&&(c.course_name||c.course_code)&&!c.warnings.includes('COURSE_AMBIGUOUS')&&!c.warnings.includes('COURSE_NOT_FOUND')){const k=key(c.course_code||c.course_name);if(k&&!courseSeen.has(k)){courseSeen.add(k);out.push({synthesized:true,type:'course',display_name:c.course_name||c.course_code,email:null,course_id:null,course_name:c.course_name||c.course_code,course_code:c.course_code||null,course_ref:k,subject_name:null,subject_short_name:null,confidence:100,warnings:[],source_row:c.source_row});}}}for(const c of candidates){if(c.type!=='subject'&&c.subject_name){const k=key(c.subject_name);if(k&&!subjectSeen.has(k)){subjectSeen.add(k);out.push({synthesized:true,type:'subject',display_name:c.subject_name,email:null,course_id:null,course_name:null,course_code:null,course_ref:null,subject_name:c.subject_name,subject_short_name:c.subject_short_name,confidence:100,warnings:[],source_row:c.source_row});}}}const existingCourseKeys=new Set(courses.flatMap(c=>[key(c.id),key(c.code),key(c.name)]));const combined=[...out.filter(c=>c.type!=='course'||!existingCourseKeys.has(key(c.course_code||c.course_name))),...candidates];return mergeDuplicates(combined);}
// Zwei Zeilen koennen denselben Fund beschreiben: die Kursliste nennt den Kurs mitsamt seinem
// Bereich, und die Teilnehmerliste nennt denselben Kurs noch einmal - woraus zusaetzlich ein
// Platzhalter entsteht, damit der Kurs auf jeden Fall angelegt wird.
//
// Vorher gewann davon schlicht der erste Treffer, und das war der Platzhalter. Der wusste vom
// Bereich nichts. Ergebnis in einem echten Kundenpaket: die Spalte org_unit_external_id der
// Kursliste war wirkungslos, sobald irgendein Teilnehmer denselben Kurs nannte - der Kurs
// entstand ohne seinen Bereich.
//
// Jetzt tritt der Platzhalter hinter die echte Zeile zurueck, und was nur eine der beiden weiss,
// geht nicht verloren.
function mergeDuplicates(candidates:OrganizationCandidate[]){
  const bySignature=new Map<string,OrganizationCandidate>();
  for(const candidate of candidates){
    const signature=candidateSignature(candidate),existing=bySignature.get(signature);
    if(!existing){bySignature.set(signature,candidate);continue;}
    const keep=existing.synthesized&&!candidate.synthesized?candidate:existing,other=keep===existing?candidate:existing;
    for(const field of ['org_unit_ref','external_id','parent_external_id','course_code','course_name','course_id','subject_short_name','email'] as const)
      if(!keep[field]&&other[field])(keep as Record<string,unknown>)[field]=other[field];
    bySignature.set(signature,keep);
  }
  return[...bySignature.values()];
}
function summary(candidates:OrganizationCandidate[]){const counts:Record<string,number>={};for(const c of candidates)counts[c.type]=(counts[c.type]||0)+1;const needs_review=candidates.filter(c=>c.warnings.some(w=>!['COURSE_WILL_BE_CREATED','ORG_UNIT_PARENT_NOT_FOUND'].includes(w))).length;return{counts,needs_review,total:candidates.length};}
function canonical(candidates:OrganizationCandidate[]){return candidates.map(c=>({...c,warnings:[...new Set(c.warnings)].sort()}));}
// Ein Organigramm beginnt fast immer beim Bildungstraeger selbst - und genau diese Zeile liegt
// nicht in der Datei. Eine unbekannte uebergeordnete Kennung ist deshalb kein Fehler: die Einheit
// wird als oberste Ebene angelegt, und die Vorschau sagt das auch. Blockiert wird nur, was
// wirklich unaufloesbar ist.
async function markOrgUnitParents(env:Env,tenantId:string,candidates:OrganizationCandidate[]){
  const units=candidates.filter(c=>c.type==='org_unit');if(!units.length)return;
  const rows=await env.DB.prepare('SELECT external_id FROM org_units WHERE tenant_id=? AND external_id IS NOT NULL').bind(tenantId).all<{external_id:string}>().catch(()=>({results:[] as {external_id:string}[]}));
  const known=new Set<string>();for(const x of rows.results??[])known.add(key(x.external_id));
  for(const u of units)if(u.external_id)known.add(key(u.external_id));
  for(const u of units){const parent=key(u.parent_external_id||'');if(parent&&!known.has(parent))u.warnings.push('ORG_UNIT_PARENT_NOT_FOUND');}
}
export async function previewOrganizationImport(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireRole(auth,'tenant_admin');let rows:Record<string,unknown>[]=[];if(Array.isArray(input.rows))rows=(input.rows as Record<string,unknown>[]).slice(0,5000);if(typeof input.text==='string'&&input.text.trim())rows.push(...textRows(input.text));if(Array.isArray(input.documents))for(const d of(input.documents as unknown[]).slice(0,500))rows.push(...textRows(String(d||'')));if(!rows.length)throw new Error('ORGANIZATION_IMPORT_DATA_REQUIRED');if(rows.length>5000)throw new Error('ORGANIZATION_IMPORT_TOO_LARGE');const courses=await existingCourses(env,tenantId);
  // Eine Rueckfrage, die keine Antwort zulaesst, ist keine Rueckfrage. Erkennt die Automatik eine
  // Zeile falsch - ein Standort als Teilnehmer etwa -, kann der Pruefende ihren Typ hier
  // richtigstellen oder sie ganz weglassen. Die Korrektur wird als Rollenspalte in die Zeile
  // geschrieben und laeuft danach durch genau dieselbe Erkennung wie alles andere: es gibt
  // keinen zweiten, nur fuer Korrekturen gebauten Weg, der abweichen koennte.
  const overrides=input.role_overrides&&typeof input.role_overrides==='object'?input.role_overrides as Record<string,unknown>:{};
  const kept:{row:Record<string,unknown>;index:number}[]=[];
  rows.forEach((row,index)=>{const choice=norm(overrides[String(index)],40).toLowerCase();if(choice==='ignore')return;kept.push({row:choice?{...row,role:choice}:row,index});});
  if(!kept.length)throw new Error('ORGANIZATION_IMPORT_DATA_REQUIRED');
  const raw=kept.flatMap(r=>baseCandidate(r.row,r.index,courses)),merged=synthesize(raw,courses);await markOrgUnitParents(env,tenantId,merged);const candidates=canonical(merged),digest=await sha256Text(JSON.stringify(candidates)),batchId=id('oib_'),ts=nowIso(),expires=new Date(Date.now()+2*3600_000).toISOString(),sourceName=norm(input.source_name,250)||'Organisationsimport',sourceKind=norm(input.source_kind,50)||'structured';await env.DB.prepare("INSERT INTO organization_import_batches(id,tenant_id,source_name,source_kind,preview_digest,preview_json,status,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,'preview',?,?,?)").bind(batchId,tenantId,sourceName,sourceKind,digest,JSON.stringify(candidates),auth.userId,ts,expires).run();await audit(env.DB,auth.userId,'organization.import.previewed',tenantId,undefined,'organization_import_batch',batchId,{sourceName,total:candidates.length,summary:summary(candidates)});return{batch_id:batchId,digest,expires_at:expires,candidates,summary:summary(candidates)};}
async function findCourse(env:Env,tenantId:string,c:OrganizationCandidate){if(c.course_id)return c.course_id;const ref=key(c.course_ref||c.course_code||c.course_name);if(!ref)return null;const r=await env.DB.prepare('SELECT id,name,code FROM courses WHERE tenant_id=? AND is_active=1').bind(tenantId).all<ExistingCourse>();const found=(r.results??[]).filter(x=>[key(x.id),key(x.code),key(x.name)].includes(ref));return found.length===1?String(found[0].id):null;}
async function ensureSubject(env:Env,tenantId:string,name:string,shortName:string|null){const existing=await env.DB.prepare('SELECT id FROM subjects WHERE tenant_id=? AND name=? COLLATE NOCASE').bind(tenantId,name).first<{id:string}>();if(existing)return{...existing,created:false};const sid=id('sub_');await env.DB.prepare('INSERT INTO subjects(id,tenant_id,name,short_name,created_at) VALUES(?,?,?,?,?)').bind(sid,tenantId,name,shortName,nowIso()).run();return{id:sid,created:true};}
// Dieselbe Pruefung kommt aus der Pruefungsliste UND aus dem Pruefungskalender - beide nennen
// dieselbe Kennung. Sie darf daraus genau einmal entstehen. Und wird sie spaeter verschoben,
// aendert sich die bestehende Pruefung, statt dass eine zweite danebensteht.
async function ensureExam(env:Env,tenantId:string,exam:{courseId:string;subjectId:string|null;title:string;startsAt:string;endsAt:string|null;room:string|null;aids:string|null;externalId:string|null}){
  const ts=nowIso();
  const found=exam.externalId
    ?await env.DB.prepare('SELECT id FROM exams WHERE tenant_id=? AND external_id=?').bind(tenantId,exam.externalId).first<{id:string}>()
    :await env.DB.prepare('SELECT id FROM exams WHERE tenant_id=? AND course_id=? AND title=? COLLATE NOCASE AND starts_at=?').bind(tenantId,exam.courseId,exam.title,exam.startsAt).first<{id:string}>();
  if(found){
    // Angaben werden ergaenzt und berichtigt, aber nie durch Leerstellen ersetzt: was schon
    // dasteht, geht durch eine Datei ohne diese Spalte nicht verloren.
    await env.DB.prepare(`UPDATE exams SET course_id=?,subject_id=COALESCE(?,subject_id),title=?,starts_at=?,
      ends_at=COALESCE(?,ends_at),room=COALESCE(?,room),allowed_aids=COALESCE(?,allowed_aids),updated_at=? WHERE tenant_id=? AND id=?`)
      .bind(exam.courseId,exam.subjectId,exam.title,exam.startsAt,exam.endsAt,exam.room,exam.aids,ts,tenantId,String(found.id)).run();
    return{id:String(found.id),created:false};
  }
  const eid=id('exm_');
  await env.DB.prepare('INSERT INTO exams(id,tenant_id,course_id,subject_id,title,starts_at,ends_at,room,allowed_aids,external_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(eid,tenantId,exam.courseId,exam.subjectId,exam.title,exam.startsAt,exam.endsAt,exam.room,exam.aids,exam.externalId,ts,ts).run();
  return{id:eid,created:true};
}
// Eine Stundenplanzeile nennt die Dozentin als Kennung, als E-Mail oder als Namen. Zugeordnet
// wird nur, was eindeutig ist: genau ein Treffer im Dozentenstamm. Bleibt es mehrdeutig oder
// unbekannt, bleibt die Stunde ohne Dozent/in - geraten wird nichts.
async function findTeacher(env:Env,tenantId:string,ref:string|null|undefined){
  const wanted=norm(ref,200);if(!wanted)return null;
  const rows=(await env.DB.prepare('SELECT id,name,email,external_id FROM teachers WHERE tenant_id=?').bind(tenantId).all<{id:string;name:string;email:string|null;external_id:string|null}>()).results??[];
  const k=key(wanted);
  for(const feld of ['external_id','email','name'] as const){
    const treffer=rows.filter(x=>key(x[feld]||'')===k);
    if(treffer.length===1)return String(treffer[0].id);
    if(treffer.length>1)return null;
  }
  return null;
}
// Dieselbe Doppelpruefung wie im Stundenplanimport: gleiche Klasse, gleiche Zeit, gleicher Raum
// ist dieselbe Stunde. Ein zweiter Ordnerwurf legt sie deshalb nicht noch einmal an.
async function ensureLesson(env:Env,tenantId:string,lesson:{courseId:string;subjectId:string|null;teacherId:string|null;startsAt:string;endsAt:string;room:string|null;notes:string|null}){
  const existing=await env.DB.prepare("SELECT id,teacher_id FROM lessons WHERE tenant_id=? AND course_id=? AND starts_at=? AND ends_at=? AND COALESCE(room,'')=COALESCE(?,'')").bind(tenantId,lesson.courseId,lesson.startsAt,lesson.endsAt,lesson.room).first<{id:string;teacher_id:string|null}>();
  // Eine von Hand gesetzte Dozentin wird nie ueberschrieben; eine noch leere wird nachgetragen.
  if(existing){
    if(lesson.teacherId&&!existing.teacher_id)await env.DB.prepare('UPDATE lessons SET teacher_id=? WHERE tenant_id=? AND id=? AND teacher_id IS NULL').bind(lesson.teacherId,tenantId,String(existing.id)).run();
    return{id:existing.id,created:false};
  }
  const lid=id('les_');
  await env.DB.prepare('INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(lid,tenantId,lesson.courseId,lesson.subjectId,lesson.teacherId,lesson.startsAt,lesson.endsAt,lesson.room,lesson.notes,nowIso()).run();
  return{id:lid,created:true};
}
// Eine Freigabe je Person und Bereich. Wird derselbe Ordner ein zweites Mal geworfen, entsteht
// keine zweite - und eine von Hand veraenderte Freigabe wird nicht ueberschrieben: was der
// Kunden-Admin selbst eingestellt hat, gilt.
async function ensureStaffGrant(env:Env,auth:CoreAuthContext,tenantId:string,grant:{userId:string;unitId:string;profile:OrgProfile;permissions:OrgPermission[]}){
  const existing=await env.DB.prepare("SELECT id FROM org_permission_grants WHERE tenant_id=? AND user_id=? AND org_unit_id=? AND status='active'").bind(tenantId,grant.userId,grant.unitId).first<{id:string}>();
  if(existing)return{id:existing.id,created:false};
  const grantId=id('grt_'),ts=nowIso();
  await env.DB.prepare("INSERT INTO org_permission_grants(id,tenant_id,user_id,org_unit_id,profile,permissions_json,inherit_descendants,valid_from,valid_until,status,source,source_ref,granted_by,created_at,updated_at) VALUES(?,?,?,?,?,?,1,NULL,NULL,'active','import',?,?,?,?)")
    .bind(grantId,tenantId,grant.userId,grant.unitId,grant.profile,JSON.stringify(grant.permissions),`organization-import:${grant.unitId}:${grant.userId}`,auth.userId,ts,ts).run();
  return{id:grantId,created:true};
}
export const ORGANIZATION_BLOCKING_WARNINGS=new Set(['RESOURCE_NAME_REQUIRED','ORG_UNIT_NAME_REQUIRED','ORG_UNIT_PARENT_INVALID','COURSE_NAME_REQUIRED','SUBJECT_NAME_REQUIRED','LESSON_DATE_REQUIRED','LESSON_TIME_REQUIRED','LESSON_END_BEFORE_START','EXAM_TITLE_REQUIRED','EXAM_TIME_REQUIRED','STAFF_ORG_UNIT_REQUIRED','STAFF_ORG_UNIT_NOT_FOUND','ACCESS_RESPONSIBLE_CONFIRMATION_REQUIRED','NAME_REQUIRED','EMAIL_REQUIRED','COURSE_REQUIRED','COURSE_AMBIGUOUS','COURSE_NOT_FOUND','TENANT_ADMIN_CONFIRMATION_REQUIRED']);
async function recordResult(env:Env,batchId:string,tenantId:string,index:number,type:string,action:string,entityId:string|null,detail:unknown){await env.DB.prepare('INSERT INTO organization_import_results(id,batch_id,tenant_id,candidate_index,entity_type,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id('oir_'),batchId,tenantId,index,type,action,entityId,JSON.stringify(detail??{}),nowIso()).run();}
// Der Typ einer Einheit muss im Mandanten bekannt sein, bevor eine Einheit ihn tragen darf.
// Angelegt wird er nur, wenn er fehlt: hat der Kunde einen Typ bewusst abgeschaltet oder
// umbenannt, bleibt seine Entscheidung stehen und der Import meldet das offen.
async function ensureOrgUnitType(env:Env,tenantId:string,typeKey:string,label:string){
  const ts=nowIso();
  await env.DB.prepare("INSERT INTO org_unit_types(tenant_id,type_key,label,sort_order,is_active,created_at,updated_at) VALUES(?,?,?,100,1,?,?) ON CONFLICT(tenant_id,type_key) DO NOTHING").bind(tenantId,typeKey,label,ts,ts).run();
  const row=await env.DB.prepare('SELECT is_active FROM org_unit_types WHERE tenant_id=? AND type_key=?').bind(tenantId,typeKey).first<{is_active:number}>();
  if(!row)throw new Error('ORG_UNIT_TYPE_MISSING');
  if(Number(row.is_active)!==1)throw new Error('ORG_UNIT_TYPE_INACTIVE');
}
// Ein Kurs gehoert zu einem Standort oder Bereich - diese Spalte liegt in jeder ordentlichen
// Kursliste daneben und wurde bisher weggeworfen. Die erste Zuordnung eines Kurses ist seine
// fuehrende; weitere kommen additiv dazu.
async function linkCourseOrgUnit(env:Env,tenantId:string,courseId:string,unitId:string|null){
  if(!courseId||!unitId)return null;
  const link=await env.DB.prepare('SELECT org_unit_id FROM course_org_units WHERE tenant_id=? AND course_id=? AND org_unit_id=?').bind(tenantId,courseId,unitId).first().catch(()=>null);
  if(link)return unitId;
  const primary=await env.DB.prepare('SELECT org_unit_id FROM course_org_units WHERE tenant_id=? AND course_id=? AND is_primary=1 LIMIT 1').bind(tenantId,courseId).first<{org_unit_id:string}>().catch(()=>null);
  return env.DB.prepare('INSERT INTO course_org_units(tenant_id,course_id,org_unit_id,is_primary,created_at) VALUES(?,?,?,?,?)').bind(tenantId,courseId,unitId,primary?0:1,nowIso()).run().then(()=>unitId).catch(()=>null);
}
// Einheiten werden von oben nach unten angelegt: eine Zeile wartet, solange ihr Elternknoten in
// derselben Datei noch nicht existiert. Die Reihenfolge in der Datei ist damit egal. Zeilen,
// deren Elternknoten nie entsteht - Ringschluss oder uebersprungener Elternknoten -, werden
// offen gemeldet und nicht heimlich an die Wurzel gehaengt.
async function applyOrgUnits(env:Env,auth:CoreAuthContext,tenantId:string,batchId:string,rows:OrganizationCandidate[],selected:Set<number>,results:any[]){
  const byExternal=new Map<string,{id:string;name:string}>(),byName=new Map<string,string>();
  const existing=await env.DB.prepare('SELECT id,name,type_key,external_id FROM org_units WHERE tenant_id=?').bind(tenantId).all<{id:string;name:string;type_key:string;external_id:string|null}>().catch(()=>({results:[] as {id:string;name:string;type_key:string;external_id:string|null}[]}));
  for(const x of existing.results??[]){if(x.external_id)byExternal.set(key(x.external_id),{id:String(x.id),name:String(x.name)});byName.set(`${key(x.type_key)}|${key(x.name)}`,String(x.id));}
  let pending=rows.map((_,i)=>i).filter(i=>rows[i].type==='org_unit'&&selected.has(i));
  const inBatch=new Set(pending.map(i=>key(rows[i].external_id||'')).filter(Boolean));
  while(pending.length){
    const deferred:number[]=[];let progressed=false;
    for(const i of pending){
      const r=rows[i],parentKey=key(r.parent_external_id||'');
      if(parentKey&&!byExternal.has(parentKey)&&inBatch.has(parentKey)){deferred.push(i);continue;}
      progressed=true;
      if(r.warnings.some(w=>ORGANIZATION_BLOCKING_WARNINGS.has(w))){const x={index:i,type:'org_unit',action:'skipped',reason:'REVIEW_REQUIRED'};results.push(x);await recordResult(env,batchId,tenantId,i,'org_unit',x.action,null,x);continue;}
      try{
        const external=norm(r.external_id,160)||null,typeKey=norm(r.org_unit_type_key,50)||'department',nameKey=`${key(typeKey)}|${key(r.display_name)}`;
        const known=external?byExternal.get(key(external))?.id:byName.get(nameKey);
        if(known){if(external)byExternal.set(key(external),{id:known,name:String(r.display_name||'')});results.push({index:i,type:'org_unit',action:'existing',entity_id:known});await recordResult(env,batchId,tenantId,i,'org_unit','existing',known,{});continue;}
        await ensureOrgUnitType(env,tenantId,typeKey,norm(r.org_unit_type_label,120)||typeKey);
        const unit=await createOrgUnit(env,auth,tenantId,{name:r.display_name,type_key:typeKey,parent_id:parentKey?byExternal.get(parentKey)?.id||null:null,external_id:external,metadata:r.address||undefined}) as {id:string}|null;
        const unitId=String(unit?.id||'');
        if(external&&unitId)byExternal.set(key(external),{id:unitId,name:String(r.display_name||'')});
        if(unitId)byName.set(nameKey,unitId);
        results.push({index:i,type:'org_unit',action:'created',entity_id:unitId});
        await recordResult(env,batchId,tenantId,i,'org_unit','created',unitId||null,{parent:r.parent_external_id||null,type_key:typeKey});
      }catch(e){const reason=String((e as Error).message||e),x={index:i,type:'org_unit',action:'skipped',reason};results.push(x);await recordResult(env,batchId,tenantId,i,'org_unit','skipped',null,x);}
    }
    if(!progressed){for(const i of deferred){const x={index:i,type:'org_unit',action:'skipped',reason:'ORG_UNIT_PARENT_UNRESOLVED'};results.push(x);await recordResult(env,batchId,tenantId,i,'org_unit',x.action,null,x);}break;}
    pending=deferred;
  }
  return byExternal;
}
export async function applyOrganizationImport(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireRole(auth,'tenant_admin');const batchId=norm(input.batch_id,100),digest=norm(input.digest,128),batch=await env.DB.prepare('SELECT preview_digest,preview_json,status,expires_at FROM organization_import_batches WHERE id=? AND tenant_id=?').bind(batchId,tenantId).first<{preview_digest:string;preview_json:string;status:string;expires_at:string}>();if(!batch)throw new Error('ORGANIZATION_IMPORT_NOT_FOUND');if(batch.status!=='preview')throw new Error('ORGANIZATION_IMPORT_NOT_PENDING');if(batch.expires_at<=nowIso())throw new Error('ORGANIZATION_IMPORT_EXPIRED');if(batch.preview_digest!==digest)throw new Error('ORGANIZATION_IMPORT_PREVIEW_CHANGED');const rows=JSON.parse(batch.preview_json) as OrganizationCandidate[],selected=new Set((Array.isArray(input.selected_indexes)?input.selected_indexes:rows.map((_,i)=>i)).map(Number)),results:any[]=[];const orgUnits=await applyOrgUnits(env,auth,tenantId,batchId,rows,selected,results);// Reihenfolge nach Abhaengigkeit, nicht nach Gewohnheit: eine Unterrichtsstunde braucht ihren
// Kurs, ihr Fach UND ihre Dozentin. Solange 'lesson' vor 'teacher' lief, war der Dozentenstamm
// beim Anlegen der Stunde noch leer - ein ganzer eingeworfener Ordner ergab 29 Stunden ohne eine
// einzige Dozentin, obwohl beide Listen im selben Stapel lagen. Dozierende haengen von nichts ab
// und koennen deshalb gefahrlos vorher laufen.
  const order:OrganizationCandidateType[]=['resource','course','subject','teacher','staff','lesson','exam','participant','class_admin','guest','tenant_admin_review'];for(const type of order)for(let i=0;i<rows.length;i++){const r=rows[i];if(r.type!==type||!selected.has(i))continue;if(r.warnings.some(w=>ORGANIZATION_BLOCKING_WARNINGS.has(w))){const x={index:i,type,action:'skipped',reason:'REVIEW_REQUIRED'};results.push(x);await recordResult(env,batchId,tenantId,i,type,x.action,null,x);continue;}try{
    if(type==='resource'){const name=r.display_name;if(!name)throw new Error('RESOURCE_NAME_REQUIRED');const kind=norm(r.resource_kind,30)||'room',found=await env.DB.prepare('SELECT id FROM planning_resources WHERE tenant_id=? AND resource_type=? AND name=?').bind(tenantId,kind,name).first<{id:string}>();if(found){results.push({index:i,type,action:'existing',entity_id:found.id});await recordResult(env,batchId,tenantId,i,type,'existing',found.id,{});continue;}const unit=orgUnits.get(key(r.org_unit_ref||'')),saved=await savePlanningResource(env,auth,tenantId,{name,resource_type:kind,code:r.external_id||null,location:unit?.name||norm(r.org_unit_ref,160)||null,capacity:r.capacity??null,features:r.features??null,status:r.resource_status||'active'}) as {resource_id:string};results.push({index:i,type,action:'created',entity_id:saved.resource_id});await recordResult(env,batchId,tenantId,i,type,'created',saved.resource_id,{kind});continue;}
    if(type==='course'){const name=r.course_name||r.display_name||r.course_code;if(!name)throw new Error('COURSE_NAME_REQUIRED');const unitId=orgUnits.get(key(r.org_unit_ref||''))?.id||null,found=await findCourse(env,tenantId,r);if(found){const linked=await linkCourseOrgUnit(env,tenantId,found,unitId);results.push({index:i,type,action:'existing',entity_id:found,org_unit_id:linked});await recordResult(env,batchId,tenantId,i,type,'existing',found,{org_unit_id:linked});continue;}await enforceCourseEntitlement(env,tenantId);const c=await createCourse(env,auth,tenantId,{name,code:r.course_code||slugify(name),access_mode:'login'}) as any;const linked=await linkCourseOrgUnit(env,tenantId,String(c?.id||''),unitId);results.push({index:i,type,action:'created',entity_id:c?.id,org_unit_id:linked});await recordResult(env,batchId,tenantId,i,type,'created',c?.id||null,{org_unit_id:linked});continue;}
    if(type==='subject'){const name=r.subject_name||r.display_name;if(!name)throw new Error('SUBJECT_NAME_REQUIRED');const s=await ensureSubject(env,tenantId,name,r.subject_short_name);results.push({index:i,type,action:s.created?'created':'existing',entity_id:s.id});await recordResult(env,batchId,tenantId,i,type,s.created?'created':'existing',s.id,{});continue;}
    if(type==='exam'){const courseId=await findCourse(env,tenantId,r);if(!courseId)throw new Error('COURSE_NOT_RESOLVED');
      const titel=norm(r.exam_title||r.display_name,300);if(!titel)throw new Error('EXAM_TITLE_REQUIRED');
      if(!r.lesson_date||!r.lesson_start)throw new Error('EXAM_TIME_REQUIRED');
      const fach=r.subject_name?await ensureSubject(env,tenantId,r.subject_name,r.subject_short_name??null):null;
      const gespeichert=await ensureExam(env,tenantId,{courseId,subjectId:fach?.id??null,title:titel,
        startsAt:`${r.lesson_date}T${r.lesson_start}:00`,endsAt:r.lesson_end?`${r.lesson_date}T${r.lesson_end}:00`:null,
        room:r.room??null,aids:r.allowed_aids??null,externalId:norm(r.external_id,160)||null});
      const aktion=gespeichert.created?'created':'updated';
      results.push({index:i,type,action:aktion,entity_id:gespeichert.id,course_id:courseId});
      await recordResult(env,batchId,tenantId,i,type,aktion,gespeichert.id,{title:titel});continue;}
    if(type==='lesson'){const courseId=await findCourse(env,tenantId,r);if(!courseId)throw new Error('COURSE_NOT_RESOLVED');if(!r.lesson_date||!r.lesson_start||!r.lesson_end)throw new Error('LESSON_TIME_REQUIRED');const subject=r.subject_name?await ensureSubject(env,tenantId,r.subject_name,r.subject_short_name??null):null;const teacherId=await findTeacher(env,tenantId,r.teacher_ref);const saved=await ensureLesson(env,tenantId,{courseId,subjectId:subject?.id??null,teacherId,startsAt:`${r.lesson_date}T${r.lesson_start}:00`,endsAt:`${r.lesson_date}T${r.lesson_end}:00`,room:r.room??null,notes:r.notes??null});const action=saved.created?'created':'existing';results.push({index:i,type,action,entity_id:saved.id,course_id:courseId});await recordResult(env,batchId,tenantId,i,type,action,saved.id,{courseId,startsAt:`${r.lesson_date}T${r.lesson_start}:00`});continue;}
    if(type==='staff'){
      const unit=orgUnits.get(key(r.org_unit_ref||''));
      if(!unit)throw new Error('STAFF_ORG_UNIT_NOT_FOUND');
      if(!r.display_name||!r.email)throw new Error('USER_FIELDS_REQUIRED');
      const profile=(r.access_profile??'custom') as OrgProfile,permissions=r.access_permissions??profilePermissions(profile);
      const target=await resolveTenantUser(env,auth,tenantId,{email:r.email,display_name:r.display_name});
      const saved=await ensureStaffGrant(env,auth,tenantId,{userId:target.id,unitId:unit.id,profile,permissions});
      const action=saved.created?(target.created?'created_invited':'access_granted'):'existing';
      results.push({index:i,type,action,user_id:target.id,org_unit_id:unit.id,grant_id:saved.id,profile});
      await recordResult(env,batchId,tenantId,i,type,action,target.id,{unitId:unit.id,grantId:saved.id,profile,permissions});
      continue;
    }
    if(type==='tenant_admin_review'){const x={index:i,type,action:'skipped',reason:'TENANT_ADMIN_CONFIRMATION_REQUIRED'};results.push(x);await recordResult(env,batchId,tenantId,i,type,x.action,null,x);continue;}
    const courseId=await findCourse(env,tenantId,r);
    if(type==='participant'||type==='class_admin'||type==='guest'){if(!courseId)throw new Error('COURSE_NOT_RESOLVED');if(!r.display_name||!r.email)throw new Error('USER_FIELDS_REQUIRED');const baseRole=type==='guest'?'guest':'participant',user=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:baseRole,course_id:courseId});let capability=null;if(type==='class_admin')capability=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:'class_admin',course_id:courseId});const action=user.invitation_sent?'created_invited':'existing_added';results.push({index:i,type,action,user_id:user.user_id,course_id:courseId,class_admin_membership_id:capability?.membership_id||null});await recordResult(env,batchId,tenantId,i,type,action,user.user_id,{courseId,classAdmin:type==='class_admin'});continue;}
    if(type==='teacher'){if(!r.display_name)throw new Error('TEACHER_NAME_REQUIRED');const teacher=await createTeacherPortalTeacher(env,auth,tenantId,{name:r.display_name,email:r.email||'',external_id:r.teacher_ref||''}) as any;if(!courseId||!r.email){const action=courseId?'teacher_master_created_portal_email_missing':'teacher_master_created_unassigned';results.push({index:i,type,action,teacher_id:teacher?.id});await recordResult(env,batchId,tenantId,i,type,action,teacher?.id||null,{courseId});continue;}const existingUser=await env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').bind(r.email).first<{id:string}>(),preGuest=existingUser?await env.DB.prepare("SELECT id FROM memberships WHERE tenant_id=? AND course_id=? AND user_id=? AND role='guest'").bind(tenantId,courseId,existingUser.id).first<{id:string}>():null;const user=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:'guest',course_id:courseId});const assignment=await saveTeacherPortalAssignment(env,auth,tenantId,{teacher_id:teacher.id,user_id:user.user_id,course_id:courseId}) as any;if(!preGuest&&user.membership_id&&assignment?.id)await env.DB.prepare('UPDATE teacher_portal_assignments SET auth_membership_id=? WHERE id=? AND tenant_id=?').bind(user.membership_id,assignment.id,tenantId).run();const action=user.invitation_sent?'teacher_invited_assigned':'teacher_assigned';results.push({index:i,type,action,teacher_id:teacher.id,user_id:user.user_id,course_id:courseId,assignment_id:assignment?.id});await recordResult(env,batchId,tenantId,i,type,action,teacher.id,{userId:user.user_id,courseId,assignmentId:assignment?.id});continue;}
  }catch(e){const reason=String((e as Error).message||e),x={index:i,type,action:'skipped',reason};results.push(x);await recordResult(env,batchId,tenantId,i,type,'skipped',null,x);}}await env.DB.prepare("UPDATE organization_import_batches SET status='applied',applied_at=? WHERE id=? AND tenant_id=? AND status='preview'").bind(nowIso(),batchId,tenantId).run();await audit(env.DB,auth.userId,'organization.import.applied',tenantId,undefined,'organization_import_batch',batchId,{selected:selected.size,created:results.filter(x=>String(x.action).includes('created')||String(x.action).includes('invited')).length,skipped:results.filter(x=>x.action==='skipped').length});return{batch_id:batchId,results};}
