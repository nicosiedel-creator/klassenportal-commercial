import type { BackupManifest } from '../portability/types.js';
import { etagMatches, sha256Text } from '../portability/backup-integrity.js';
import type { Env } from './types.js';
import { nowIso } from './utils.js';

type IntegrityLevel='structural'|'strong';

export async function ensureBackupVerificationSchema(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS backup_verifications (
    backup_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('verified','failed')),checked_at TEXT NOT NULL,
    resource_count INTEGER NOT NULL DEFAULT 0,file_count INTEGER NOT NULL DEFAULT 0,missing_objects_json TEXT,error_message TEXT,integrity_level TEXT NOT NULL DEFAULT 'structural',
    FOREIGN KEY(backup_id) REFERENCES portability_backups(id) ON DELETE CASCADE,FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE)`).run();
  const cols=(await env.DB.prepare('PRAGMA table_info(backup_verifications)').all<{name:string}>()).results??[];if(!cols.some(x=>x.name==='integrity_level'))await env.DB.prepare("ALTER TABLE backup_verifications ADD COLUMN integrity_level TEXT NOT NULL DEFAULT 'structural'").run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_backup_verification_time ON backup_verifications(status,checked_at DESC)').run();
}
async function save(env:Env,backupId:string,tenantId:string,status:'verified'|'failed',resources:number,files:number,issues:string[],integrityLevel:IntegrityLevel,error?:string){await ensureBackupVerificationSchema(env);await env.DB.prepare(`INSERT INTO backup_verifications(backup_id,tenant_id,status,checked_at,resource_count,file_count,missing_objects_json,error_message,integrity_level)
  VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(backup_id) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at,resource_count=excluded.resource_count,file_count=excluded.file_count,missing_objects_json=excluded.missing_objects_json,error_message=excluded.error_message,integrity_level=excluded.integrity_level`).bind(backupId,tenantId,status,nowIso(),resources,files,JSON.stringify(issues),error||null,integrityLevel).run();}
function strongManifest(manifest:BackupManifest):boolean{return manifest.integrity?.version===1&&manifest.integrity.json==='sha256'&&manifest.integrity.files==='r2-etag-size';}

export async function verifyBackup(env:Env,backupId:string):Promise<{status:'verified'|'failed';tenantId:string;resourceCount:number;fileCount:number;missing:string[];integrityLevel:IntegrityLevel;error?:string}>{
  await ensureBackupVerificationSchema(env);const row=await env.DB.prepare("SELECT id,tenant_id,object_prefix,status FROM portability_backups WHERE id=?").bind(backupId).first<{id:string;tenant_id:string;object_prefix:string;status:string}>();if(!row||row.status!=='ready')throw new Error('BACKUP_NOT_READY');const manifestKey=`${row.object_prefix}/manifest.json`,issues:string[]=[];let manifest:BackupManifest;
  try{const obj=await env.FILES.get(manifestKey);if(!obj)throw new Error('BACKUP_MANIFEST_MISSING');manifest=JSON.parse(await obj.text()) as BackupManifest;if(manifest.version!==1||manifest.backupId!==row.id||manifest.tenantId!==row.tenant_id||!Array.isArray(manifest.resources)||!Array.isArray(manifest.files))throw new Error('BACKUP_MANIFEST_INVALID');if(manifest.integrity&&!strongManifest(manifest))throw new Error('BACKUP_INTEGRITY_METADATA_INVALID');}
  catch(e){const error=String((e as Error)?.message||'BACKUP_MANIFEST_INVALID').slice(0,500);await save(env,row.id,row.tenant_id,'failed',0,0,[manifestKey],'structural',error);return{status:'failed',tenantId:row.tenant_id,resourceCount:0,fileCount:0,missing:[manifestKey],integrityLevel:'structural',error};}
  const strong=strongManifest(manifest),integrityLevel:IntegrityLevel=strong?'strong':'structural',prefix=row.object_prefix;
  if(strong&&!manifest.users)issues.push('BACKUP_USERS_METADATA_MISSING');
  if(manifest.users){
    if(!manifest.users.objectKey.startsWith(`${prefix}/data/`))issues.push('BACKUP_USERS_OBJECT_SCOPE_INVALID');if(strong&&!manifest.users.sha256)issues.push('BACKUP_USERS_HASH_MISSING');
    const obj=await env.FILES.get(manifest.users.objectKey);if(!obj)issues.push(manifest.users.objectKey);else try{const text=await obj.text();if(manifest.users.sha256&&await sha256Text(text)!==manifest.users.sha256)issues.push('BACKUP_USERS_HASH_MISMATCH');const rows=JSON.parse(text);if(!Array.isArray(rows)||rows.length!==Number(manifest.users.rowCount))issues.push('BACKUP_USERS_ROWCOUNT_MISMATCH');}catch{issues.push('BACKUP_USERS_JSON_INVALID');}
  }
  const resourceKeys=new Set<string>(),resourceObjects=new Set<string>();for(const item of manifest.resources){
    if(!item.key||resourceKeys.has(item.key))issues.push(`BACKUP_RESOURCE_DUPLICATE:${item.key}`);resourceKeys.add(item.key);if(!item.objectKey.startsWith(`${prefix}/data/`))issues.push(`BACKUP_RESOURCE_OBJECT_SCOPE_INVALID:${item.key}`);if(resourceObjects.has(item.objectKey))issues.push(`BACKUP_RESOURCE_OBJECT_DUPLICATE:${item.key}`);resourceObjects.add(item.objectKey);if(strong&&!item.sha256)issues.push(`BACKUP_RESOURCE_HASH_MISSING:${item.key}`);
    const obj=await env.FILES.get(item.objectKey);if(!obj){issues.push(item.objectKey);continue;}try{const text=await obj.text();if(item.sha256&&await sha256Text(text)!==item.sha256)issues.push(`BACKUP_RESOURCE_HASH_MISMATCH:${item.key}`);const rows=JSON.parse(text);if(!Array.isArray(rows)||rows.length!==Number(item.rowCount))issues.push(`BACKUP_RESOURCE_ROWCOUNT_MISMATCH:${item.key}`);}catch{issues.push(`BACKUP_RESOURCE_JSON_INVALID:${item.key}`);}
  }
  const fileIds=new Set<string>(),fileObjects=new Set<string>();for(const file of manifest.files){
    if(!file.id||fileIds.has(file.id)||fileObjects.has(file.backupKey))issues.push(`BACKUP_FILE_DUPLICATE:${file.id}`);fileIds.add(file.id);fileObjects.add(file.backupKey);if(!file.backupKey.startsWith(`${prefix}/files/`))issues.push(`BACKUP_FILE_BACKUP_SCOPE_INVALID:${file.id}`);if(!file.originalKey.startsWith(`tenants/${manifest.tenantId}/`))issues.push(`BACKUP_FILE_OBJECT_SCOPE_INVALID:${file.id}`);if(!Number.isFinite(Number(file.size))||Number(file.size)<0)issues.push(`BACKUP_FILE_SIZE_INVALID:${file.id}`);if(strong&&!file.etag)issues.push(`BACKUP_FILE_ETAG_MISSING:${file.id}`);
    const obj=await env.FILES.get(file.backupKey);if(!obj){issues.push(file.backupKey);continue;}if(Number(file.size)!==Number(obj.size))issues.push(`BACKUP_FILE_SIZE_MISMATCH:${file.id}`);if(file.etag&&!etagMatches(file.etag,obj.etag))issues.push(`BACKUP_FILE_ETAG_MISMATCH:${file.id}`);
  }
  const uniqueIssues=[...new Set(issues)],status=uniqueIssues.length?'failed':'verified',error=uniqueIssues.length?`BACKUP_INTEGRITY_FAILED:${uniqueIssues.length}`:undefined;await save(env,row.id,row.tenant_id,status,manifest.resources.length,manifest.files.length,uniqueIssues,integrityLevel,error);return{status,tenantId:row.tenant_id,resourceCount:manifest.resources.length,fileCount:manifest.files.length,missing:uniqueIssues,integrityLevel,error};
}

export async function verifyPendingBackups(env:Env,limit=2):Promise<{verified:number;failed:number}>{
  await ensureBackupVerificationSchema(env);const rows=(await env.DB.prepare(`SELECT b.id FROM portability_backups b LEFT JOIN backup_verifications v ON v.backup_id=b.id
    WHERE b.status='ready' AND (v.backup_id IS NULL OR v.checked_at<b.completed_at) ORDER BY b.completed_at DESC LIMIT ?`).bind(Math.max(1,Math.min(10,limit))).all<{id:string}>()).results??[];let verified=0,failed=0;for(const row of rows){try{const r=await verifyBackup(env,row.id);r.status==='verified'?verified++:failed++;}catch(e){console.error('Backup verification failed',{backupId:row.id,error:String((e as Error)?.message||e)});failed++;}}return{verified,failed};
}

export async function backupReadiness(env:Env,maxAgeHours=48){
  await ensureBackupVerificationSchema(env);const cutoff=new Date(Date.now()-maxAgeHours*3600_000).toISOString(),tenants=(await env.DB.prepare("SELECT id,name FROM tenants WHERE status='active' ORDER BY name").all<{id:string;name:string}>()).results??[],issues:Array<Record<string,string>>=[];
  for(const t of tenants){const row=await env.DB.prepare(`SELECT b.id,b.completed_at,v.status,v.checked_at,v.integrity_level FROM portability_backups b LEFT JOIN backup_verifications v ON v.backup_id=b.id
    WHERE b.tenant_id=? AND b.status='ready' ORDER BY b.completed_at DESC LIMIT 1`).bind(t.id).first<{id:string;completed_at:string;status:string|null;checked_at:string|null;integrity_level:string|null}>();if(!row)issues.push({tenantId:t.id,tenantName:t.name,reason:'Kein bereites Backup vorhanden'});else if(row.completed_at<cutoff)issues.push({tenantId:t.id,tenantName:t.name,reason:'Letztes Backup älter als 48 Stunden'});else if(row.status!=='verified'||!row.checked_at||row.checked_at<row.completed_at)issues.push({tenantId:t.id,tenantName:t.name,reason:'Letztes Backup ist nicht vollständig verifiziert'});else if(row.integrity_level!=='strong')issues.push({tenantId:t.id,tenantName:t.name,reason:'Letztes Backup nutzt nur die ältere strukturelle Prüfung; neues Integritäts-Backup erforderlich'});}
  return{ready:issues.length===0,issues,activeTenants:tenants.length,maxAgeHours};
}
