import type { AuthContext, BackupManifest, PortabilityConfig, PortabilityEnv } from './types.js';
import { assertTenantAdmin, randomId, safeFilename } from './utils.js';
import { readTenantRows, systemColumns, tenantExists } from './db.js';
import { listTenantFiles } from './files.js';

async function copyR2(env:PortabilityEnv,sourceKey:string,targetKey:string,tenantId:string):Promise<number>{
  const obj=await env.FILES.get(sourceKey);if(!obj)throw new Error(`R2_SOURCE_MISSING:${sourceKey}`);
  await env.FILES.put(targetKey,obj.body,{httpMetadata:obj.httpMetadata,customMetadata:{...(obj.customMetadata??{}),tenantId,backupCopy:'true',sourceKey}});
  return obj.size;
}

export async function createTenantBackup(env:PortabilityEnv,config:PortabilityConfig,auth:AuthContext,tenantId:string,reason:BackupManifest['reason']='manual'):Promise<BackupManifest>{
  assertTenantAdmin(auth,tenantId);
  if(!await tenantExists(env.DB,config.tenantTable,config.tenantIdColumn,tenantId))throw new Error('TENANT_NOT_FOUND');
  const backupId=randomId('bak_'),createdAt=new Date().toISOString(),prefix=`backups/${reason}/${tenantId}/${backupId}`;
  await env.DB.prepare("INSERT INTO portability_backups (id, tenant_id, reason, status, object_prefix, created_by, created_at) VALUES (?, ?, ?, 'creating', ?, ?, ?)").bind(backupId,tenantId,reason,prefix,auth.userId,createdAt).run();
  try{
    const manifest:BackupManifest={version:1,backupId,tenantId,createdAt,reason,resources:[],files:[]};
    for(const r of [...config.resources].sort((a,b)=>a.restoreOrder-b.restoreOrder)){
      const rows=await readTenantRows(env.DB,r,tenantId),objectKey=`${prefix}/data/${r.key}.json`;
      await env.FILES.put(objectKey,JSON.stringify(rows),{httpMetadata:{contentType:'application/json'},customMetadata:{tenantId,backupId,resource:r.key}});
      manifest.resources.push({key:r.key,objectKey,rowCount:rows.length});
    }
    for(const f of await listTenantFiles(env,tenantId)){
      const originalKey=String(f.object_key),fid=String(f.id),originalName=String(f.original_name??'datei'),backupKey=`${prefix}/files/${safeFilename(fid)}-${safeFilename(originalName)}`,size=await copyR2(env,originalKey,backupKey,tenantId);
      manifest.files.push({
        id:fid,originalKey,backupKey,originalName,size,
        contentType:String(f.content_type??'')||undefined,uploadedBy:String(f.uploaded_by??'')||undefined,createdAt:String(f.created_at??'')||undefined,
        purpose:String(f.purpose??'source')||'source',courseId:String(f.course_id??'')||undefined,title:String(f.title??'')||undefined,
        description:String(f.description??'')||undefined,visible:Number(f.visible??1)===1,updatedAt:String(f.updated_at??'')||undefined,
      });
    }
    await env.FILES.put(`${prefix}/manifest.json`,JSON.stringify(manifest,null,2),{httpMetadata:{contentType:'application/json'},customMetadata:{tenantId,backupId}});
    await env.DB.prepare("UPDATE portability_backups SET status='ready', completed_at=?, size_bytes=? WHERE id=?").bind(new Date().toISOString(),manifest.files.reduce((s,f)=>s+f.size,0),backupId).run();
    return manifest;
  }catch(e){
    await env.DB.prepare("UPDATE portability_backups SET status='failed', error_message=? WHERE id=?").bind(String((e as Error).message),backupId).run();throw e;
  }
}

export async function listTenantBackups(env:PortabilityEnv,auth:AuthContext,tenantId:string):Promise<Record<string,unknown>[]>{
  assertTenantAdmin(auth,tenantId);
  const r=await env.DB.prepare('SELECT id, reason, status, object_prefix, size_bytes, created_by, created_at, completed_at FROM portability_backups WHERE tenant_id=? ORDER BY created_at DESC').bind(tenantId).all<Record<string,unknown>>();return r.results??[];
}

export async function restoreTenantBackup(env:PortabilityEnv,config:PortabilityConfig,auth:AuthContext,tenantId:string,backupId:string,confirmation:string):Promise<{restored:true;safetyBackupId:string}>{
  assertTenantAdmin(auth,tenantId);if(confirmation!=='RESTORE')throw new Error('RESTORE_CONFIRMATION_REQUIRED');
  const row=await env.DB.prepare('SELECT object_prefix,status FROM portability_backups WHERE id=? AND tenant_id=?').bind(backupId,tenantId).first<Record<string,unknown>>();if(!row||row.status!=='ready')throw new Error('BACKUP_NOT_READY');
  const safety=await createTenantBackup(env,config,auth,tenantId,'pre_restore'),manifestObj=await env.FILES.get(`${String(row.object_prefix)}/manifest.json`);if(!manifestObj)throw new Error('BACKUP_MANIFEST_MISSING');
  const manifest=JSON.parse(await manifestObj.text()) as BackupManifest;if(manifest.tenantId!==tenantId||manifest.backupId!==backupId)throw new Error('BACKUP_SCOPE_MISMATCH');
  const restoreId=randomId('rst_');
  for(const item of manifest.resources){
    const obj=await env.FILES.get(item.objectKey);if(!obj)throw new Error(`BACKUP_RESOURCE_MISSING:${item.key}`);
    const rows=JSON.parse(await obj.text()) as Record<string,unknown>[];
    for(let i=0;i<rows.length;i+=70){const stmts=rows.slice(i,i+70).map((r,j)=>env.DB.prepare('INSERT INTO portability_restore_rows (restore_id, resource_key, row_no, row_json) VALUES (?, ?, ?, ?)').bind(restoreId,item.key,i+j+1,JSON.stringify(r)));if(stmts.length)await env.DB.batch(stmts);}
  }
  for(const file of manifest.files){
    const obj=await env.FILES.get(file.backupKey);if(!obj)throw new Error(`BACKUP_FILE_MISSING:${file.backupKey}`);
    await env.FILES.put(file.originalKey,obj.body,{httpMetadata:obj.httpMetadata,customMetadata:{...(obj.customMetadata??{}),tenantId,restoredFrom:backupId}});
  }
  const ordered=[...config.resources].sort((a,b)=>a.restoreOrder-b.restoreOrder),tx=[];
  for(const r of [...ordered].reverse())tx.push(env.DB.prepare(`DELETE FROM ${r.table} WHERE ${r.tenantColumn}=?`).bind(tenantId));
  for(const r of ordered){
    const cols=Object.keys(r.columns),sys=systemColumns(r),targets=[r.idColumn,r.tenantColumn,...cols,...sys],selects=[`COALESCE(json_extract(row_json, '$.${r.idColumn}'), lower(hex(randomblob(16))))`,'?',...cols.map(c=>`json_extract(row_json, '$.${c}')`),...sys.map(c=>`COALESCE(json_extract(row_json, '$.${c}'), CURRENT_TIMESTAMP)`)] ;
    tx.push(env.DB.prepare(`INSERT INTO ${r.table} (${targets.join(',')}) SELECT ${selects.join(',')} FROM portability_restore_rows WHERE restore_id=? AND resource_key=? ORDER BY row_no`).bind(tenantId,restoreId,r.key));
  }
  tx.push(env.DB.prepare('DELETE FROM portability_files WHERE tenant_id=?').bind(tenantId));
  for(const f of manifest.files)tx.push(env.DB.prepare(`INSERT INTO portability_files
    (id,tenant_id,object_key,original_name,content_type,size_bytes,uploaded_by,created_at,purpose,course_id,title,description,visible,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      f.id,tenantId,f.originalKey,f.originalName,f.contentType??'application/octet-stream',f.size,f.uploadedBy??null,f.createdAt??manifest.createdAt,
      f.purpose??'source',f.courseId??null,f.title??null,f.description??null,f.visible===false?0:1,f.updatedAt??f.createdAt??manifest.createdAt,
    ));
  tx.push(env.DB.prepare('DELETE FROM portability_restore_rows WHERE restore_id=?').bind(restoreId));
  tx.push(env.DB.prepare("INSERT INTO portability_audit_events (id,tenant_id,actor_id,action,object_type,object_id,details_json,created_at) VALUES(?,?,?,'backup.restore','backup',?,?,?)").bind(randomId('audit_'),tenantId,auth.userId,backupId,JSON.stringify({safetyBackupId:safety.backupId}),new Date().toISOString()));
  await env.DB.batch(tx);
  const wanted=new Set(manifest.files.map(f=>f.originalKey));let cursor:string|undefined;
  do{const page=await env.FILES.list({prefix:`tenants/${tenantId}/`,cursor,limit:1000}),extras=page.objects.map(o=>o.key).filter(k=>!wanted.has(k));if(extras.length)await env.FILES.delete(extras);cursor=page.truncated?page.cursor:undefined;}while(cursor);
  return{restored:true,safetyBackupId:safety.backupId};
}
