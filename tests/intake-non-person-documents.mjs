import { strict as assert } from 'node:assert';
import { parseCsv } from '../dist/portability/csv.js';
import { mapOrganizationRows } from '../dist/core/organization-import-file.js';
import { importRole } from '../dist/core/organization-import.js';
import { routeRows, routeExtracted, emptyRouted, rowHasPerson } from '../dist/core/intake-classifier.js';

// Gemessen am Abnahmepaket eines echten Kunden (21 Dateien): von 1060 Zeilen, die als Teilnehmer
// zur Pruefung vorgelegt wurden, enthielten 690 keine einzige Person. Abwesenheiten,
// Pruefungstermine, Meldungen, Lernziele, Zertifikate, Umfragen, ein Jahresgrundplan,
// Szenariodaten - jede Zeile wurde als "Teilnehmer" ohne Name und ohne E-Mail vorgelegt.
// Hunderte Zeilen Handpruefung fuer nichts, und der Eindruck, der Import erkenne nichts.
//
// Ursache: importRole gibt am Ende "participant" zurueck, wenn ihm nichts anderes einfaellt. Fuer
// eine einzelne Zeile ist das richtig - fuer eine ganze Unterlage zu wenig.
//
// Zweiter Befund derselben Messung: die Rueckfaelle der Rollenerkennung suchten ihr Wort
// irgendwo in der Angabe. "Exkursion" enthaelt "kurs" - acht Exkursionen wurden zu Kursen.
//
// Genau die Kopfzeilen des Abnahmepakets, eine Zeile je Datei.
const DATEIEN = {
  '05_Teilnehmer.csv': [`participant_id,external_id,course_external_id,first_name,last_name,email,status
PAR-0001,PAR-0001,EXT-ADM-26-01,Alina,Test,alina.test@example.invalid,aktiv`, 'participants'],
  '09_Jahresgrundplan.xlsx': [`plan_id,external_id,parent_external_id,date,title,owner_unit_external_id,description,status
YP-001,PLAN-001,ORG-MBA-TEST,2026-09-01,Semesterstart,ORG-MBA-TEST,Start Regelbetrieb,geplant`, 'none'],
  '10_Meldungen.xlsx': [`message_id,external_id,parent_external_id,course_external_id,publish_at,language,title,body,audience,status
MSG-001,MSG-001,EXT-ADM-26-01,EXT-ADM-26-01,2026-09-02 08:00,de-DE,Willkommen,Startinformationen.,course,veroeffentlicht`, 'none'],
  '11_Pruefungen.xlsx': [`exam_id,external_id,parent_external_id,course_external_id,title,exam_type,original_date,current_date,start_time,end_time,room_external_id,status,version
EX-001,EX-001,EXT-ADM-26-01,EXT-ADM-26-01,Leistungsnachweis,Klausur,2026-11-04,2026-11-04,09:00,10:30,ROOM-BM-B201,geplant,1`, 'none'],
  '12_Abwesenheiten.xlsx': [`attendance_id,external_id,parent_external_id,participant_external_id,course_external_id,date,status,minutes_absent,excused,recorded_by_external_id,private_data
ATT-001-1,ATT-001-1,PAR-0001,PAR-0001,EXT-ADM-26-01,2026-09-07,anwesend,0,nein,EMP-001,ja`, 'none'],
  '13_Umfragen.xlsx': [`survey_id,external_id,parent_external_id,title,audience,start_date,end_date,anonymous,status
SUR-001,SUR-001,ORG-MBA-TEST,Onboarding Woche 2,all_participants,2026-09-14,2026-09-18,ja,geschlossen`, 'none'],
  '15_Curriculum.xlsx': [`module_id,external_id,parent_external_id,course_external_id,module_code,title,sequence,planned_hours,status
MOD-001,MOD-001,EXT-ADM-26-01,EXT-ADM-26-01,ADM-26-01-M1,Modul 1,1,32,aktiv`, 'none'],
  '17_Zertifikate.xlsx': [`certificate_id,external_id,parent_external_id,participant_external_id,course_external_id,certificate_type,issue_date,status,verification_code
CERT-0001,CERT-0001,PAR-0001,PAR-0001,EXT-ADM-26-01,Teilnahmebescheinigung,2026-10-30,vorbereitet,PUBLIC-TEST-000001`, 'none'],
  '20_ScenarioLab.xlsx': [`scenario_id,feature,input,scope,snapshot,requested_action,write_allowed
AI-001,Future Radar,Trend: steigende Nachfrage,ORG-MBA-TEST,2026-10-20,Prioritätenvorschlag,nein`, 'none'],
};
const rowsOf = text => mapOrganizationRows(parseCsv(text).rows);

for (const [name, [csv, erwartet]] of Object.entries(DATEIEN)) {
  const rows = rowsOf(csv);
  assert.equal(rows.length, 1, `${name}: die Zeile muss gelesen werden`);
  const decision = routeRows(rows);
  assert.equal(decision.route, erwartet,
    `${name} gehoert auf das Gleis "${erwartet}", geroutet wurde "${decision.route}" (${decision.reason})`);
}

// Der Grund muss benannt sein - sonst steht der Kunde vor einer Datei, die einfach fehlt.
assert.equal(routeRows(rowsOf(DATEIEN['12_Abwesenheiten.xlsx'][0])).reason, 'NO_PERSON_IN_DOCUMENT');
assert.equal(routeRows(rowsOf(DATEIEN['05_Teilnehmer.csv'][0])).reason, 'PERSON_ROWS');

// Und die Zeile selbst: eine Person erkennt man an Name oder E-Mail, nicht an einer Kennung.
assert.equal(rowHasPerson({ participant_external_id: 'PAR-0001', course_external_id: 'EXT-1' }), false,
  'eine Teilnehmerkennung ist keine Person');
for (const person of [{ name: 'Anna Beispiel' }, { email: 'anna@example.invalid' }, { vorname: 'Anna', nachname: 'Beispiel' }, { display_name: 'Anna' }, { dozent: 'Herr Test' }])
  assert.equal(rowHasPerson(person), true, `${JSON.stringify(person)} ist eine Person`);

// Eine Unterlage, in der auch nur eine Zeile eine Person nennt, bleibt ein Teilnehmerimport.
assert.equal(routeRows([{ attendance_id: 'A1', date: '2026-09-07' }, { name: 'Anna Beispiel', email: 'anna@example.invalid' }]).route, 'participants',
  'eine einzige Person in der Unterlage genuegt - lieber pruefen als verwerfen');

// Die Weiche legt so eine Unterlage benannt zur Seite, statt sie als kaputte Teilnehmerliste
// vorzulegen. Verschwiegen wird sie nicht.
{
  const routed = emptyRouted();
  routeExtracted(routed, '12_Abwesenheiten.xlsx', { kind: 'rows', rows: rowsOf(DATEIEN['12_Abwesenheiten.xlsx'][0]) });
  routeExtracted(routed, '05_Teilnehmer.csv', { kind: 'rows', rows: rowsOf(DATEIEN['05_Teilnehmer.csv'][0]) });
  assert.deepEqual(routed.unsupported, ['12_Abwesenheiten.xlsx'],
    'die Unterlage ohne Person muss benannt bei den nicht zuzuordnenden stehen');
  assert.equal(routed.participantRows.length, 1, 'und die echte Teilnehmerliste unangetastet durchgehen');
  assert.equal(routed.organizationRows.length, 0, 'sie darf auch nicht auf das Organisationsgleis rutschen');
  assert.ok(routed.decisions.some(d => d.source === '12_Abwesenheiten.xlsx' && d.reason === 'NO_PERSON_IN_DOCUMENT'),
    'der Grund muss in der Rueckverfolgung stehen');
}

// ---------------------------------------------------------------------------------------------
// Der zweite Befund: das ganze Wort, nicht irgendein Stueck davon.
// ---------------------------------------------------------------------------------------------
const rolleVon = (typ, rest = {}) => importRole({ typ, title: 'Praxisblock 1', ...rest });
for (const [typ, erwartet] of [
  ['Exkursion', 'participant'],
  ['Praxisphase', 'participant'],
  ['Projekt', 'participant'],
  ['Gastronomie', 'participant'],
  ['Kurs', 'course'],
  ['Klasse', 'course'],
  ['Gast', 'guest'],
  ['Dozent', 'teacher'],
  ['Teilnehmer', 'participant'],
])
  assert.equal(rolleVon(typ), erwartet,
    `"${typ}" muss als "${erwartet}" gelesen werden, gelesen wurde "${rolleVon(typ)}"`);

// Zusammengesetzte Angaben mit Trennzeichen treffen weiterhin - genau dafuer gibt es den
// Rueckfall. Nur das Wort mitten im Wort nicht mehr.
for (const [typ, erwartet] of [['teilnehmer aktiv', 'participant'], ['Dozent (extern)', 'teacher'], ['Kurs / Lehrgang', 'course'], ['klassen-admin', 'class_admin']])
  assert.equal(rolleVon(typ), erwartet,
    `"${typ}" muss als "${erwartet}" gelesen werden, gelesen wurde "${rolleVon(typ)}"`);

// Die echte Zeile aus 16_Praxis_Exkursion_Projekte.xlsx des Kunden: acht davon wurden zu Kursen.
const PRAXIS = `practice_id,external_id,parent_external_id,course_external_id,type,title,start_date,end_date,partner_name,partner_email,status
PRX-1-1,PRX-1-1,EXT-PRA-ADM-26-01,EXT-PRA-ADM-26-01,Exkursion,Exkursion 1,2026-11-02,2026-11-13,Praxispartner Test GmbH,partner@example.invalid,geplant`;
assert.equal(importRole(rowsOf(PRAXIS)[0]), 'participant',
  'eine Exkursion ist kein Kurs - "Exkursion" enthaelt nur zufaellig "kurs"');
assert.equal(routeRows(rowsOf(PRAXIS)).route, 'none',
  'und ohne Person in der Unterlage gehoert sie nicht in die Teilnehmerpruefung');

console.log(`Eingang: ${Object.values(DATEIEN).filter(([, r]) => r === 'none').length} Unterlagen ohne Person werden benannt zur Seite gelegt statt als Teilnehmer vorgelegt; "Exkursion" ist kein Kurs mehr: OK`);
