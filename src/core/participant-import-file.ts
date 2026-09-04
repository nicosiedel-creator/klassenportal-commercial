import type { CoreAuthContext, Env } from './types.js';
import { parseCsv } from '../portability/csv.js';
import { parseXlsx } from '../portability/xlsx.js';
import { previewParticipantImport } from './participant-document-import.js';
import { canonicalColumn } from './import-column-aliases.js';

function key(v:string){return v.trim().toLowerCase().replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/[ß]/g,'ss').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
const ALIASES:Record<string,string>={
  name:'display_name',display_name:'display_name',teilnehmer:'display_name',teilnehmer_name:'display_name',schueler:'display_name',schueler_name:'display_name',student:'display_name',student_name:'display_name',
  vorname:'first_name',first_name:'first_name',nachname:'last_name',last_name:'last_name',
  email:'email',e_mail:'email',mail:'email',emailadresse:'email',e_mail_adresse:'email',
  external_id:'external_id',teilnehmernummer:'teilnehmernummer',teilnehmer_id:'teilnehmer_id',matrikelnummer:'matrikelnummer',schuelernummer:'schuelernummer',vertragsnummer:'vertragsnummer',
  course_id:'course_id',kurs_id:'course_id',
  course_code:'course_code',kurscode:'kurscode',klassencode:'klassencode',massnahmennummer:'massnahmennummer',
  course_name:'course_name',kurs:'kurs',klasse:'klasse',massnahme:'massnahme',bildungsgang:'bildungsgang',studiengang:'studiengang',
  beginn:'beginn',start:'start',enrollment_start:'enrollment_start',ende:'ende',enrollment_end:'enrollment_end'
};
// Die Liste oben deckt nur die Schreibweisen ab, die dieses Portal von Anfang an kannte. Eine
// Datei aus einem Fremdsystem heisst ihre Spalten anders - 'Kurs-Code' statt 'Kurscode',
// 'class_id' statt 'course_code', 'first_name' statt 'Vorname'. Fuer alles, was die eigene
// Liste nicht kennt, greift die gemeinsame, mehrsprachige Tabelle. Sie kommt bewusst danach:
// eine hier ausdruecklich getroffene Entscheidung bleibt die staerkere.
//
// Und eine bereits gefuellte Zielspalte wird nicht ueberschrieben: fuehrt eine Datei 'Name'
// UND 'Teilnehmername', gewinnt der zuerst gelesene Wert, statt dass der zweite ihn loescht.
export function mapParticipantRows(rows:Record<string,unknown>[]){return rows.map(row=>{const out:Record<string,unknown>={};for(const [h,v] of Object.entries(row)){const target=ALIASES[key(h)]||canonicalColumn(h)||key(h);if(out[target]!==undefined&&String(out[target]??'').trim())continue;out[target]=v;}return out;});}

export async function previewParticipantImportFile(env:Env,auth:CoreAuthContext,tenantId:string,request:Request){
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('IMPORT_FILE_REQUIRED');if(file.size>15*1024*1024)throw new Error('IMPORT_FILE_TOO_LARGE');const name=file.name.toLowerCase(),type=file.type.toLowerCase();
  if(name.endsWith('.csv')||type==='text/csv'){const parsed=parseCsv(await file.text());return previewParticipantImport(env,auth,tenantId,{source_name:file.name,source_kind:'structured',rows:mapParticipantRows(parsed.rows)});}
  if(name.endsWith('.xlsx')||type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){const parsed=await parseXlsx(await file.arrayBuffer());return previewParticipantImport(env,auth,tenantId,{source_name:file.name,source_kind:'structured',rows:mapParticipantRows(parsed.rows)});}
  if(name.endsWith('.json')||type==='application/json'){let value:unknown;try{value=JSON.parse(await file.text());}catch{throw new Error('IMPORT_JSON_INVALID');}const rows=Array.isArray(value)?value:(value&&typeof value==='object'&&Array.isArray((value as any).rows)?(value as any).rows:null);if(!rows)throw new Error('IMPORT_JSON_ROWS_REQUIRED');return previewParticipantImport(env,auth,tenantId,{source_name:file.name,source_kind:'structured',rows:mapParticipantRows(rows as Record<string,unknown>[])});}
  if(name.endsWith('.txt')||type.startsWith('text/'))return previewParticipantImport(env,auth,tenantId,{source_name:file.name,source_kind:'pasted_text',text:await file.text()});
  if(name.endsWith('.pdf')||type==='application/pdf')throw new Error('PDF_CLIENT_EXTRACTION_REQUIRED');
  throw new Error('UNSUPPORTED_PARTICIPANT_IMPORT_FILE');
}
