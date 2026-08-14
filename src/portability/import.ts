import type { ImportIssue, ImportPreview, PortabilityEnv, ResourceDefinition } from './types.js';
import { portabilityConfig, resourceByKey } from './config.js';
import { parseCsv } from './csv.js';
import { parseXlsx } from './xlsx.js';
import { asIso, normalizeHeader, parseBoolean, randomId } from './utils.js';
import { audit, insertRows } from './db.js';

function mapColumns(resource: ResourceDefinition, headers: string[]): Map<string,string> {
  const map=new Map<string,string>(); const normalized=headers.map(h=>normalizeHeader(h));
  for(const [target,def] of Object.entries(resource.columns)) {
    const aliases=[target,...(def.sourceAliases??[])].map(normalizeHeader);
    const idx=normalized.findIndex(h=>aliases.includes(h)); if(idx>=0) map.set(target,headers[idx]);
  }
  return map;
}
function coerce(value:unknown, type:string|undefined):unknown {
  if(value===null||value===undefined||value==='') return null;
  if(type==='number'){const n=Number(value);return Number.isFinite(n)?n:null;}
  if(type==='boolean') return parseBoolean(value);
  if(type==='date') return asIso(value);
  return String(value).trim();
}
function validate(resource:ResourceDefinition, source:Record<string,unknown>, mapping:Map<string,string>, rowNo:number):{data:Record<string,unknown>;issues:ImportIssue[]} {
  const data:Record<string,unknown>={}; const issues:ImportIssue[]=[];
  for(const [target,def] of Object.entries(resource.columns)) {
    const src=mapping.get(target); const raw=src?source[src]:undefined; const val=coerce(raw,def.type);
    if(def.required&&(val===null||val===undefined||val==='')) issues.push({row:rowNo,field:target,message:'Pflichtfeld fehlt',value:raw});
    if(def.maxLength&&typeof val==='string'&&val.length>def.maxLength) issues.push({row:rowNo,field:target,message:`Maximal ${def.maxLength} Zeichen`,value:raw});
    if(raw!==undefined&&raw!==''&&def.type==='date'&&val===null) issues.push({row:rowNo,field:target,message:'Ungültiges Datum',value:raw});
    if(raw!==undefined&&raw!==''&&def.type==='number'&&val===null) issues.push({row:rowNo,field:target,message:'Ungültige Zahl',value:raw});
    if(raw!==undefined&&raw!==''&&def.type==='boolean'&&val===null) issues.push({row:rowNo,field:target,message:'Ungültiger Wahrheitswert',value:raw});
    if(val!==null&&val!==undefined) data[target]=val;
  }
  return {data,issues};
}

export async function previewImport(env:PortabilityEnv,tenantId:string,resourceKey:string,sourceType:'csv'|'xlsx',sourceName:string,buffer:ArrayBuffer,actor:string):Promise<ImportPreview&{jobId:string}> {
  const resource=resourceByKey(resourceKey); const parsed=sourceType==='csv'?parseCsv(new TextDecoder().decode(buffer)):await parseXlsx(buffer);
  if(parsed.rows.length>portabilityConfig.maxImportRows) throw new Error('IMPORT_TOO_MANY_ROWS');
  const mapping=mapColumns(resource,parsed.headers); const issues:ImportIssue[]=[]; const staged:Array<{row:number;data:Record<string,unknown>}>=[];
  parsed.rows.forEach((row,i)=>{const x=validate(resource,row,mapping,i+2);issues.push(...x.issues);if(!x.issues.length)staged.push({row:i+2,data:x.data});});
  const jobId=randomId('imp_');
  await env.DB.prepare('INSERT INTO portability_import_jobs(id,tenant_id,resource_key,source_type,source_name,status,rows_seen,rows_valid,rows_invalid,issues_json,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(jobId,tenantId,resourceKey,sourceType,sourceName,'previewed',parsed.rows.length,staged.length,parsed.rows.length-staged.length,JSON.stringify(issues.slice(0,1000)),actor).run();
  if(staged.length){const stmts=staged.map(x=>env.DB.prepare('INSERT INTO portability_import_stage(job_id,row_no,payload_json) VALUES(?,?,?)').bind(jobId,x.row,JSON.stringify(x.data)));await env.DB.batch(stmts);}
  await audit(env.DB,tenantId,actor,'import_previewed',{jobId,resourceKey,sourceType,rowsSeen:parsed.rows.length,rowsValid:staged.length,rowsInvalid:parsed.rows.length-staged.length});
  return {jobId,resource:resourceKey,rowsSeen:parsed.rows.length,rowsValid:staged.length,rowsInvalid:parsed.rows.length-staged.length,headers:parsed.headers,sample:staged.slice(0,10).map(x=>x.data),issues};
}

export async function commitImport(env:PortabilityEnv,tenantId:string,jobId:string,actor:string):Promise<void> {
  const job=await env.DB.prepare('SELECT tenant_id,resource_key,status,rows_invalid FROM portability_import_jobs WHERE id=?').bind(jobId).first<{tenant_id:string;resource_key:string;status:string;rows_invalid:number}>();
  if(!job||job.tenant_id!==tenantId) throw new Error('IMPORT_JOB_NOT_FOUND'); if(job.status!=='previewed') throw new Error('IMPORT_JOB_NOT_PREVIEWED'); if(job.rows_invalid>0) throw new Error('IMPORT_HAS_INVALID_ROWS');
  const staged=await env.DB.prepare('SELECT payload_json FROM portability_import_stage WHERE job_id=? ORDER BY row_no').bind(jobId).all<{payload_json:string}>(); const rows=(staged.results??[]).map(x=>JSON.parse(x.payload_json)); const resource=resourceByKey(job.resource_key);
  if(rows.length) await insertRows(env.DB,resource,tenantId,rows,false);
  await env.DB.batch([
    env.DB.prepare("UPDATE portability_import_jobs SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=? AND status='previewed'").bind(jobId),
    env.DB.prepare('DELETE FROM portability_import_stage WHERE job_id=?').bind(jobId),
  ]);
  await audit(env.DB,tenantId,actor,'import_committed',{jobId,resourceKey:job.resource_key,rows:rows.length});
}
