import type { BackupManifest, D1DatabaseLike, PortabilityConfig, R2BucketLike } from './types.js';

interface BackupPreflightEnv { DB:D1DatabaseLike; FILES:R2BucketLike; }
interface BackupRow { id:string; tenant_id:string; object_prefix:string; status:string; }

async function loadManifest(env:BackupPreflightEnv,row:BackupRow):Promise<BackupManifest>{
  if(row.status!=='ready')throw new Error('BACKUP_NOT_READY');
  const obj=await env.FILES.get(`${row.object_prefix}/manifest.json`);if(!obj)throw new Error('BACKUP_MANIFEST_MISSING');
  let manifest:BackupManifest;try{manifest=JSON.parse(await obj.text()) as BackupManifest;}catch{throw new Error('BACKUP_MANIFEST_INVALID');}
  if(manifest.version!==1||manifest.backupId!==row.id||manifest.tenantId!==row.tenant_id||!Array.isArray(manifest.resources)||!Array.isArray(manifest.files)||!Array.isArray(manifest.userIds))throw new Error('BACKUP_MANIFEST_INVALID');
  return manifest;
}
function valueKey(v:unknown):string{return typeof v==='string'||typeof v==='number'?String(v):JSON.stringify(v);}

export async function preflightTenantBackup(env:BackupPreflightEnv,cfg:PortabilityConfig,backupId:string,expectedTenantId?:string):Promise<{manifest:BackupManifest;resourceCount:number;rowCount:number;fileCount:number}>{
  const row=await env.DB.prepare('SELECT id,tenant_id,object_prefix,status FROM portability_backups WHERE id=?').bind(backupId).first<BackupRow>();if(!row)throw new Error('BACKUP_NOT_FOUND');if(expectedTenantId&&row.tenant_id!==expectedTenantId)throw new Error('BACKUP_TENANT_MISMATCH');
  const manifest=await loadManifest(env,row),resourceMap=new Map(cfg.resources.map(x=>[x.key,x])),userIds=new Set(manifest.userIds.map(String));let rowCount=0;
  for(const item of manifest.resources){
    const resource=resourceMap.get(item.resource);if(!resource)throw new Error(`BACKUP_RESOURCE_UNKNOWN:${item.resource}`);const object=await env.FILES.get(item.objectKey);if(!object)throw new Error(`BACKUP_RESOURCE_OBJECT_MISSING:${item.resource}`);
    let payload:any;try{payload=JSON.parse(await object.text());}catch{throw new Error(`BACKUP_RESOURCE_JSON_INVALID:${item.resource}`);}if(payload?.version!==1||payload?.resource!==item.resource||payload?.tenantId!==manifest.tenantId||!Array.isArray(payload?.rows))throw new Error(`BACKUP_RESOURCE_PAYLOAD_INVALID:${item.resource}`);if(Number(item.rowCount)!==payload.rows.length)throw new Error(`BACKUP_RESOURCE_ROWCOUNT_MISMATCH:${item.resource}`);
    const schema=(await env.DB.prepare(`PRAGMA table_info(${resource.table})`).all<{name:string;pk:number}>()).results??[],columns=new Set(schema.map(x=>x.name)),pk=schema.filter(x=>Number(x.pk)>0).sort((a,b)=>Number(a.pk)-Number(b.pk)).map(x=>x.name);if(!schema.length||!pk.length)throw new Error(`BACKUP_RESOURCE_SCHEMA_INVALID:${item.resource}`);
    const seen=new Set<string>();for(const raw of payload.rows){if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error(`BACKUP_RESOURCE_ROW_INVALID:${item.resource}`);const record=raw as Record<string,unknown>;for(const key of Object.keys(record))if(!columns.has(key))throw new Error(`BACKUP_RESOURCE_COLUMN_UNKNOWN:${item.resource}:${key}`);
      if(item.resource==='users'){if(!userIds.has(String(record.id||'')))throw new Error('BACKUP_USER_SCOPE_INVALID');}else if(String(record[resource.tenantColumn]??'')!==manifest.tenantId)throw new Error(`BACKUP_RESOURCE_TENANT_SCOPE_INVALID:${item.resource}`);
      const key=pk.map(k=>valueKey(record[k])).join('\u001f');if(pk.some(k=>record[k]===undefined||record[k]===null)||seen.has(key))throw new Error(`BACKUP_RESOURCE_PRIMARY_KEY_INVALID:${item.resource}`);seen.add(key);rowCount++;}
  }
  for(const file of manifest.files){if(file.tenantId!==manifest.tenantId)throw new Error('BACKUP_FILE_TENANT_SCOPE_INVALID');if(!file.objectKey.startsWith(`tenants/${manifest.tenantId}/`))throw new Error('BACKUP_FILE_OBJECT_SCOPE_INVALID');const obj=await env.FILES.get(file.backupKey);if(!obj)throw new Error(`BACKUP_FILE_OBJECT_MISSING:${file.id}`);if(Number(file.size)!==Number(obj.size))throw new Error(`BACKUP_FILE_SIZE_MISMATCH:${file.id}`);}
  return{manifest,resourceCount:manifest.resources.length,rowCount,fileCount:manifest.files.length};
}
