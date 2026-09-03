import type { CoreAuthContext, Env } from './types.js';
import { parseCsv } from '../portability/csv.js';
import { parseXlsx } from '../portability/xlsx.js';
import { previewOrganizationImport } from './organization-import.js';

function key(v:string){return v.trim().toLowerCase().replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/[ß]/g,'ss').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
const ALIASES:Record<string,string>={
  typ:'type',type:'type',personenart:'person_type',person_type:'person_type',rolle:'role',role:'role',funktion:'role',
  name:'display_name',display_name:'display_name',person:'display_name',person_name:'display_name',
  vorname:'first_name',first_name:'first_name',nachname:'last_name',last_name:'last_name',
  email:'email',e_mail:'email',mail:'email',emailadresse:'email',e_mail_adresse:'email',
  teilnehmer:'participant',teilnehmer_name:'participant_name',schueler:'participant',schueler_name:'participant_name',student:'participant',student_name:'participant_name',
  dozent:'teacher',dozentin:'teacher',dozent_name:'teacher_name',teacher:'teacher',teacher_name:'teacher_name',lehrkraft:'teacher',lehrer:'teacher',lehrerin:'teacher',lehrer_name:'teacher_name',ausbilder:'teacher',ausbilderin:'teacher',referent:'teacher',referentin:'teacher',kursleiter:'teacher',kursleiterin:'teacher',dozent_email:'teacher_email',teacher_email:'teacher_email',lehrer_email:'teacher_email',
  course_id:'course_id',kurs_id:'course_id',course_code:'course_code',kurscode:'course_code',klassencode:'course_code',massnahmennummer:'course_code',massnahmenummer:'course_code',
  course_name:'course_name',kurs:'course_name',klasse:'course_name',lehrgang:'course_name',massnahme:'course_name',bildungsgang:'course_name',studiengang:'course_name',
  subject_name:'subject_name',subject:'subject_name',fach:'subject_name',fachname:'subject_name',subject_code:'subject_short_name',subject_short_name:'subject_short_name',fachkuerzel:'subject_short_name',kuerzel:'subject_short_name',
  knotentyp:'node_type',ebene:'node_type',externe_id:'external_id',uebergeordnet:'parent_external_id',uebergeordnete_einheit:'parent_external_id',elternknoten:'parent_external_id',
  strasse:'street',plz:'postal_code',ort:'city',stadt:'city',land:'country',bezeichnung:'display_name',einheit:'display_name'
};
export function mapOrganizationRows(rows:Record<string,unknown>[]){return rows.map(row=>{const out:Record<string,unknown>={};for(const [h,v] of Object.entries(row))out[ALIASES[key(h)]||key(h)]=v;return out;});}

// Die Vorschau gibt die eingelesenen Zeilen mit zurueck. Nur so kann die Oberflaeche eine
// Typkorrektur stellen, ohne dass der Kunde dieselbe Datei ein zweites Mal hochladen muss - es
// sind exakt die Zeilen, die er gerade selbst geschickt hat.
export async function previewOrganizationImportFile(env:Env,auth:CoreAuthContext,tenantId:string,request:Request){
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('IMPORT_FILE_REQUIRED');if(file.size>15*1024*1024)throw new Error('IMPORT_FILE_TOO_LARGE');const name=file.name.toLowerCase(),type=file.type.toLowerCase();
  if(name.endsWith('.csv')||type==='text/csv'){const parsed=parseCsv(await file.text());{const rows=mapOrganizationRows(parsed.rows);return{...await previewOrganizationImport(env,auth,tenantId,{source_name:file.name,source_kind:'structured',rows}),rows};}}
  if(name.endsWith('.xlsx')||type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'){const parsed=await parseXlsx(await file.arrayBuffer());{const rows=mapOrganizationRows(parsed.rows);return{...await previewOrganizationImport(env,auth,tenantId,{source_name:file.name,source_kind:'structured',rows}),rows};}}
  if(name.endsWith('.json')||type==='application/json'){let value:unknown;try{value=JSON.parse(await file.text());}catch{throw new Error('IMPORT_JSON_INVALID');}const rows=Array.isArray(value)?value:(value&&typeof value==='object'&&Array.isArray((value as any).rows)?(value as any).rows:null);if(!rows)throw new Error('IMPORT_JSON_ROWS_REQUIRED');{const mapped=mapOrganizationRows(rows as Record<string,unknown>[]);return{...await previewOrganizationImport(env,auth,tenantId,{source_name:file.name,source_kind:'structured',rows:mapped}),rows:mapped};}}
  if(name.endsWith('.txt')||type.startsWith('text/'))return previewOrganizationImport(env,auth,tenantId,{source_name:file.name,source_kind:'text',text:await file.text()});
  if(name.endsWith('.pdf')||type==='application/pdf')throw new Error('PDF_CLIENT_EXTRACTION_REQUIRED');
  throw new Error('UNSUPPORTED_ORGANIZATION_IMPORT_FILE');
}
