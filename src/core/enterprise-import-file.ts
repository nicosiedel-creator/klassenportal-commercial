import type { CoreAuthContext, Env } from './types.js';
import { parseCsv } from '../portability/csv.js';
import { parseXlsx } from '../portability/xlsx.js';
import { previewOrgImport } from './enterprise-organization.js';

function key(v:string){return v.trim().toLowerCase().replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/[ß]/g,'ss').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');}
const ALIASES:Record<string,string>={
  external_id:'external_id',externe_id:'external_id',id:'external_id',
  parent_external_id:'parent_external_id',eltern_id:'parent_external_id',parent_id:'parent_external_id',
  type:'type',typ:'type',ebene:'type',
  name:'name',bezeichnung:'name',
  code:'code',kuerzel:'code',
  course_code:'course_code',kurscode:'course_code',klassencode:'course_code',kurs_code:'course_code',
  course_name:'course_name',kursname:'course_name',klassenname:'course_name',kurs_name:'course_name',
  responsible_email:'responsible_email',verantwortlich_email:'responsible_email',verantwortlicher_email:'responsible_email',email_verantwortlich:'responsible_email',
  responsible_name:'responsible_name',verantwortlich_name:'responsible_name',verantwortlicher_name:'responsible_name',
  profile:'profile',profil:'profile',rolle:'profile',
};
function mapRows(rows:Record<string,unknown>[]){return rows.map(row=>{const out:Record<string,unknown>={};for(const [h,v] of Object.entries(row)){const target=ALIASES[key(h)];if(target)out[target]=v;}return out;});}
export async function previewOrgImportFile(env:Env,auth:CoreAuthContext,tenantId:string,request:Request){
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('IMPORT_FILE_REQUIRED');if(file.size>10*1024*1024)throw new Error('IMPORT_FILE_TOO_LARGE');const name=file.name.toLowerCase();let parsed:{headers:string[];rows:Record<string,unknown>[]};if(name.endsWith('.csv')||file.type==='text/csv')parsed=parseCsv(await file.text());else if(name.endsWith('.xlsx')||file.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')parsed=await parseXlsx(await file.arrayBuffer());else throw new Error('UNSUPPORTED_IMPORT_FILE');return previewOrgImport(env,auth,tenantId,{source_name:file.name,rows:mapRows(parsed.rows)});
}
