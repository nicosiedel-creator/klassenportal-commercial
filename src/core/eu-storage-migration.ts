import type { R2BucketLike, R2ListedObjectLike } from '../portability/types.js';
import { createTenantBackup } from '../portability/backup.js';
import { portabilityConfig } from '../portability/config.js';
import { audit } from './audit.js';
import { verifyPassword } from './auth.js';
import { backupReadiness, verifyBackup } from './backup-verification.js';
import { requirePlatform } from './permissions.js';
import type { CoreAuthContext, Env } from './types.js';

const COPY_CONFIRMATION='EU SPEICHER MIGRIEREN';
const FINALIZE_CONFIRMATION='EU MIGRATION ABSCHLIESSEN';
const COPY_BATCH_SIZE=40;

function yes(value:unknown):boolean{return ['1','true','yes'].includes(String(value??'').trim().toLowerCase());}
function migrationActive(env:Env):void{
  if(!env.LEGACY_FILES)throw new Error('EU_STORAGE_MIGRATION_NOT_ACTIVE');
}
function normalizedEtag(value:unknown):string{return String(value??'').trim().replace(/^W\//,'').replace(/^"|"$/g,'');}
function sameObject(a:{size:number;etag:string}|undefined,b:{size:number;etag:string}|undefined):boolean{return !!a&&!!b&&Number(a.size)===Number(b.size)&&normalizedEtag(a.etag)===normalizedEtag(b.etag);}
async function cancelBody(object:{body:ReadableStream<Uint8Array>}|null|undefined):Promise<void>{try{await object?.body.cancel();}catch{/* best-effort connection release */}}
async function ownerStepUp(env:Env,auth:CoreAuthContext,password:unknown):Promise<void>{
  requirePlatform(auth);const current=String(password??'');if(!current)throw new Error('CURRENT_PASSWORD_REQUIRED');
  const user=await env.DB.prepare("SELECT password_hash FROM users WHERE id=? AND status='active' AND is_platform_admin=1").bind(auth.userId).first<{password_hash:string}>();
  if(!user||!(await verifyPassword(current,user.password_hash)))throw new Error('CURRENT_PASSWORD_INVALID');
}
async function allObjects(bucket:R2BucketLike):Promise<Map<string,R2ListedObjectLike>>{
  const objects=new Map<string,R2ListedObjectLike>();let cursor:string|undefined;
  do{
    const page=await bucket.list({cursor,limit:1000});
    for(const object of page.objects){if(objects.has(object.key))throw new Error('EU_R2_DUPLICATE_LISTING_KEY');objects.set(object.key,object);}
    if(page.truncated&&!page.cursor)throw new Error('EU_R2_CURSOR_MISSING');cursor=page.truncated?page.cursor:undefined;
  }while(cursor);
  return objects;
}
function bytes(objects:Map<string,R2ListedObjectLike>):number{return [...objects.values()].reduce((sum,object)=>sum+Number(object.size||0),0);}

export async function inspectEuStorageMigration(env:Env){
  const backups=await backupReadiness(env,48);
  if(!env.LEGACY_FILES){
    const required=yes(env.EU_STORAGE_MIGRATION_REQUIRED);
    return{active:false,configuredRequired:required,complete:!required,sourceObjects:0,sourceBytes:0,destinationObjects:0,destinationBytes:0,missingCount:required?1:0,mismatchedCount:0,missing:required?['LEGACY_FILES_BINDING_MISSING']:[],mismatched:[],backups};
  }
  const source=await allObjects(env.LEGACY_FILES),destination=await allObjects(env.FILES),missing:string[]=[],mismatched:string[]=[];
  for(const [key,object] of source){const target=destination.get(key);if(!target)missing.push(key);else if(!sameObject(object,target))mismatched.push(key);}
  return{active:yes(env.EU_STORAGE_MIGRATION_REQUIRED),configuredRequired:yes(env.EU_STORAGE_MIGRATION_REQUIRED),complete:missing.length===0&&mismatched.length===0,sourceObjects:source.size,sourceBytes:bytes(source),destinationObjects:destination.size,destinationBytes:bytes(destination),missingCount:missing.length,mismatchedCount:mismatched.length,missing:missing.slice(0,20),mismatched:mismatched.slice(0,20),backups};
}

export async function euStorageMigrationStatus(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);return inspectEuStorageMigration(env);
}

export async function copyEuStorageBatch(env:Env,auth:CoreAuthContext,input:Record<string,unknown>){
  requirePlatform(auth);migrationActive(env);if(String(input.confirmation||'')!==COPY_CONFIRMATION)throw new Error('EU_STORAGE_COPY_CONFIRMATION_REQUIRED');await ownerStepUp(env,auth,input.current_password);
  const cursor=String(input.cursor||'').trim()||undefined,page=await env.LEGACY_FILES!.list({cursor,limit:COPY_BATCH_SIZE});let copied=0,skipped=0;
  for(const listed of page.objects){
    const source=await env.LEGACY_FILES!.get(listed.key);if(!source)throw new Error('EU_R2_SOURCE_OBJECT_MISSING');
    const existing=await env.FILES.get(listed.key);
    if(existing&&sameObject(source,existing)){await Promise.all([cancelBody(source),cancelBody(existing)]);skipped++;continue;}
    await cancelBody(existing);
    await env.FILES.put(listed.key,source.body,{httpMetadata:source.httpMetadata,customMetadata:source.customMetadata});
    const stored=await env.FILES.get(listed.key);if(!stored)throw new Error('EU_R2_COPY_READBACK_MISSING');const matches=sameObject(source,stored),error=Number(source.size)!==Number(stored.size)?'EU_R2_COPY_SIZE_MISMATCH':'EU_R2_COPY_ETAG_MISMATCH';await cancelBody(stored);if(!matches)throw new Error(error);copied++;
  }
  if(page.truncated&&!page.cursor)throw new Error('EU_R2_CURSOR_MISSING');
  await audit(env.DB,auth.userId,'platform.eu_storage_copy_batch',undefined,undefined,'r2_migration',page.cursor||'complete',{cursor:cursor||null,nextCursor:page.cursor||null,objects:page.objects.length,copied,skipped});
  return{copied,skipped,processed:page.objects.length,done:!page.truncated,nextCursor:page.truncated?page.cursor:null};
}

export async function finalizeEuStorageMigration(env:Env,auth:CoreAuthContext,input:Record<string,unknown>){
  requirePlatform(auth);migrationActive(env);if(String(input.confirmation||'')!==FINALIZE_CONFIRMATION)throw new Error('EU_STORAGE_FINALIZE_CONFIRMATION_REQUIRED');await ownerStepUp(env,auth,input.current_password);
  const status=await inspectEuStorageMigration(env);if(!status.complete)throw new Error('EU_STORAGE_COPY_NOT_COMPLETE');
  const tenants=(await env.DB.prepare("SELECT id FROM tenants WHERE status='active' ORDER BY id").all<{id:string}>()).results??[],verified:string[]=[];
  for(const tenant of tenants){
    const backup=await createTenantBackup(env,portabilityConfig,auth,tenant.id,'automatic'),verification=await verifyBackup(env,backup.backupId);
    if(verification.status!=='verified'||verification.integrityLevel!=='strong')throw new Error('EU_BACKUP_VERIFICATION_FAILED');verified.push(backup.backupId);
  }
  const readiness=await backupReadiness(env,48);if(!readiness.ready)throw new Error('EU_BACKUP_READINESS_FAILED');
  await audit(env.DB,auth.userId,'platform.eu_storage_migration_verified',undefined,undefined,'r2_migration','eu',{sourceObjects:status.sourceObjects,sourceBytes:status.sourceBytes,activeTenants:tenants.length,verifiedBackups:verified});
  return{complete:true,sourceObjects:status.sourceObjects,sourceBytes:status.sourceBytes,verifiedBackups:verified,backups:readiness};
}
