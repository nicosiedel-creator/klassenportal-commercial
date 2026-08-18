import type { BackupManifest } from '../portability/types.js';
import type { Env } from './types.js';
import { nowIso } from './utils.js';

export async function ensureBackupVerificationSchema(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS backup_verifications (
    backup_id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,status TEXT NOT NULL CHECK(status IN ('verified','failed')),checked_at TEXT NOT NULL,
    resource_count INTEGER NOT NULL DEFAULT 0,file_count INTEGER NOT NULL DEFAULT 0,missing_objects_json TEXT,error_message TEXT,
    FOREIGN KEY(backup_id) REFERENCES portability_backups(id) ON DELETE CASCADE,FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_backup_verification_time ON backup_verifications(status,checked_at DESC)').run();
}
async function save(env:Env,backupId:string,tenantId:string,status:'verified'|'failed',resources:number,files:number,missing:string[],error?:string){await ensureBackupVerificationSchema(env);await env.DB.prepare(`INSERT INTO backup_verifications(backup_id,tenant_id,status,checked_at,resource_count,file_count,missing_objects_json,error_message)
  VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(backup_id) DO UPDATE SET status=excluded.status,checked_at=excluded.checked_at,resource_count=excluded.resource_count,file_count=excluded.file_count,missing_objects_json=excluded.missing_objects_json,error_message=excluded.error_message`).bind(backupId,tenantId,status,nowIso(),resources,files,JSON.stringify(missing),error||null).run();}

export async function verifyBackup(env:Env,backupId:string):Promise<{status:'verified'|'failed';tenantId:string;resourceCount:number;fileCount:number;missing:string[];error?:string}>{
  await ensureBackupVerificationSchema(env);const row=await env.DB.prepare("SELECT id,tenant_id,object_prefix,status FROM portability_backups WHERE id=?").bind(backupId).first<{id:string;tenant_id:string;object_prefix:string;status:string}>();if(!row||row.status!=='ready')throw new Error('BACKUP_NOT_READY');const manifestKey=`${row.object_prefix}/manifest.json`,missing:string[]=[];let manifest:BackupManifest;
  try{const obj=await env.FILES.get(manifestKey);if(!obj)throw new Error('BACKUP_MANIFEST_MISSING');manifest=JSON.parse(await obj.text()) as BackupManifest;if(manifest.version!==1||manifest.backupId!==row.id||manifest.tenantId!==row.tenant_id||!Array.isArray(manifest.resources)||!Array.isArray(manifest.files))throw new Error('BACKUP_MANIFEST_INVALID');}
  catch(e){const error=String((e as Error)?.message||'BACKUP_MANIFEST_INVALID').slice(0,500);await save(env,row.id,row.tenant_id,'failed',0,0,[manifestKey],error);return{status:'failed',tenantId:row.tenant_id,resourceCount:0,fileCount:0,missing:[manifestKey],error};}
  const keys=[...manifest.resources.map(x=>x.objectKey),...manifest.files.map(x=>x.backupKey)];for(let i=0;i<keys.length;i+=12){const slice=keys.slice(i,i+12),found=await Promise.all(slice.map(async key=>({key,obj:await env.FILES.get(key)})));for(const x of found)if(!x.obj)missing.push(x.key);}
  const status=missing.length?'failed':'verified',error=missing.length?`BACKUP_OBJECTS_MISSING:${missing.length}`:undefined;await save(env,row.id,row.tenant_id,status,manifest.resources.length,manifest.files.length,missing,error);return{status,tenantId:row.tenant_id,resourceCount:manifest.resources.length,fileCount:manifest.files.length,missing,error};
}

export async function verifyPendingBackups(env:Env,limit=2):Promise<{verified:number;failed:number}>{
  await ensureBackupVerificationSchema(env);const rows=(await env.DB.prepare(`SELECT b.id FROM portability_backups b LEFT JOIN backup_verifications v ON v.backup_id=b.id
    WHERE b.status='ready' AND (v.backup_id IS NULL OR v.checked_at<b.completed_at) ORDER BY b.completed_at DESC LIMIT ?`).bind(Math.max(1,Math.min(10,limit))).all<{id:string}>()).results??[];let verified=0,failed=0;for(const row of rows){try{const r=await verifyBackup(env,row.id);r.status==='verified'?verified++:failed++;}catch(e){console.error('Backup verification failed',{backupId:row.id,error:String((e as Error)?.message||e)});failed++;}}return{verified,failed};
}

export async function backupReadiness(env:Env,maxAgeHours=48){
  await ensureBackupVerificationSchema(env);const cutoff=new Date(Date.now()-maxAgeHours*3600_000).toISOString(),tenants=(await env.DB.prepare("SELECT id,name FROM tenants WHERE status='active' ORDER BY name").all<{id:string;name:string}>()).results??[],issues:Array<Record<string,string>>=[];
  for(const t of tenants){const row=await env.DB.prepare(`SELECT b.id,b.completed_at,v.status,v.checked_at FROM portability_backups b LEFT JOIN backup_verifications v ON v.backup_id=b.id
    WHERE b.tenant_id=? AND b.status='ready' ORDER BY b.completed_at DESC LIMIT 1`).bind(t.id).first<{id:string;completed_at:string;status:string|null;checked_at:string|null}>();if(!row)issues.push({tenantId:t.id,tenantName:t.name,reason:'Kein bereites Backup vorhanden'});else if(row.completed_at<cutoff)issues.push({tenantId:t.id,tenantName:t.name,reason:'Letztes Backup älter als 48 Stunden'});else if(row.status!=='verified'||!row.checked_at)issues.push({tenantId:t.id,tenantName:t.name,reason:'Letztes Backup ist nicht vollständig verifiziert'});}
  return{ready:issues.length===0,issues,activeTenants:tenants.length,maxAgeHours};
}
