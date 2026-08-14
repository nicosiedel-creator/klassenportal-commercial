import type { PortabilityEnv } from './types.js';
import { portabilityConfig } from './config.js';
import { createBackup } from './backup.js';
import { audit } from './db.js';
import { randomId } from './utils.js';
import { listTenantFiles } from './files.js';

export async function requestTenantDeletion(env:PortabilityEnv,tenantId:string,actor:string):Promise<{requestId:string;executeAfter:string;backupId:string}>{
  const backup=await createBackup(env,tenantId,'contract_end',actor);const requestId=randomId('del_');const d=new Date();d.setUTCDate(d.getUTCDate()+portabilityConfig.deleteGraceDays);const executeAfter=d.toISOString();
  await env.DB.prepare('INSERT INTO portability_delete_requests(id,tenant_id,requested_by,execute_after,final_export_backup_id,status) VALUES(?,?,?,?,?,?)').bind(requestId,tenantId,actor,executeAfter,backup.backupId,'pending').run();await audit(env.DB,tenantId,actor,'tenant_delete_requested',{requestId,executeAfter,backupId:backup.backupId});return{requestId,executeAfter,backupId:backup.backupId};
}
export async function confirmTenantDeletion(env:PortabilityEnv,requestId:string,actor:string):Promise<void>{const r=await env.DB.prepare('SELECT tenant_id,status FROM portability_delete_requests WHERE id=?').bind(requestId).first<{tenant_id:string;status:string}>();if(!r||r.status!=='pending')throw new Error('DELETE_REQUEST_INVALID');await env.DB.prepare("UPDATE portability_delete_requests SET status='confirmed',confirmed_by=?,confirmed_at=CURRENT_TIMESTAMP WHERE id=?").bind(actor,requestId).run();await audit(env.DB,r.tenant_id,actor,'tenant_delete_confirmed',{requestId});}
export async function executeDueTenantDeletion(env:PortabilityEnv,requestId:string,actor:string):Promise<void>{
 const r=await env.DB.prepare('SELECT tenant_id,status,execute_after FROM portability_delete_requests WHERE id=?').bind(requestId).first<{tenant_id:string;status:string;execute_after:string}>();if(!r||r.status!=='confirmed')throw new Error('DELETE_REQUEST_NOT_CONFIRMED');if(Date.now()<new Date(r.execute_after).getTime())throw new Error('DELETE_GRACE_PERIOD_ACTIVE');
 const files=await listTenantFiles(env,r.tenant_id);for(const f of files)await env.FILES.delete(f.object_key);
 const resources=[...portabilityConfig.resources].sort((a,b)=>b.restoreOrder-a.restoreOrder);const statements=resources.map(x=>env.DB.prepare(`DELETE FROM ${x.table} WHERE ${x.tenantColumn}=?`).bind(r.tenant_id));statements.push(env.DB.prepare('DELETE FROM portability_files WHERE tenant_id=?').bind(r.tenant_id));await env.DB.batch(statements);
 await audit(env.DB,r.tenant_id,actor,'tenant_delete_executed',{requestId});await env.DB.prepare("UPDATE portability_delete_requests SET status='completed',completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(requestId).run();
 // Deliberately keep backup metadata/audit/delete request according to legal retention policy; physical backup purge can be scheduled separately.
}
