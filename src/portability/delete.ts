import type { AuthContext, D1PreparedStatementLike, PortabilityConfig, PortabilityEnv } from './types.js';
import { assertTenantAdmin, randomId } from './utils.js';
import { createTenantBackup } from './backup.js';
import { deleteTenantObjects } from './files.js';
import { storeFullTenantExport } from './export.js';

export async function requestTenantDeletion(env:PortabilityEnv,config:PortabilityConfig,auth:AuthContext,tenantId:string,reason:'contract_end'|'manual'):Promise<{requestId:string;scheduledFor:string;finalBackupId:string;finalExportKey:string}>{
  assertTenantAdmin(auth,tenantId);
  const existing=await env.DB.prepare("SELECT id FROM portability_deletion_requests WHERE tenant_id=? AND status='pending' LIMIT 1").bind(tenantId).first();if(existing)throw new Error('DELETION_ALREADY_PENDING');
  const finalBackup=await createTenantBackup(env,config,auth,tenantId,'contract_end'),finalExport=await storeFullTenantExport(env,config,auth,tenantId,'contract_end'),requestId=randomId('del_'),scheduled=new Date(Date.now()+config.deleteGraceDays*86400000).toISOString();
  await env.DB.prepare("INSERT INTO portability_deletion_requests (id,tenant_id,reason,status,final_backup_id,final_export_key,scheduled_for,requested_by,created_at) VALUES (?,?,?,'pending',?,?,?,?,?)").bind(requestId,tenantId,reason,finalBackup.backupId,finalExport.key,scheduled,auth.userId,new Date().toISOString()).run();
  return{requestId,scheduledFor:scheduled,finalBackupId:finalBackup.backupId,finalExportKey:finalExport.key};
}

export async function cancelTenantDeletion(env:PortabilityEnv,auth:AuthContext,tenantId:string,requestId:string):Promise<void>{
  assertTenantAdmin(auth,tenantId);await env.DB.prepare("UPDATE portability_deletion_requests SET status='cancelled',cancelled_at=?,cancelled_by=? WHERE id=? AND tenant_id=? AND status='pending'").bind(new Date().toISOString(),auth.userId,requestId,tenantId).run();
}

export async function finalizeTenantDeletion(env:PortabilityEnv,config:PortabilityConfig,auth:AuthContext,tenantId:string,requestId:string,confirmation:string):Promise<{deleted:true;filesDeleted:number}>{
  if(!auth.isPlatformAdmin)throw new Error('PLATFORM_ADMIN_REQUIRED');assertTenantAdmin(auth,tenantId);if(confirmation!==`DELETE:${tenantId}`)throw new Error('DELETE_CONFIRMATION_REQUIRED');
  const req=await env.DB.prepare('SELECT scheduled_for,status FROM portability_deletion_requests WHERE id=? AND tenant_id=?').bind(requestId,tenantId).first<Record<string,unknown>>();if(!req||req.status!=='pending')throw new Error('DELETION_REQUEST_NOT_PENDING');if(new Date(String(req.scheduled_for)).getTime()>Date.now())throw new Error('DELETION_GRACE_PERIOD_ACTIVE');
  const userRows=(await env.DB.prepare('SELECT DISTINCT u.id FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=?').bind(tenantId).all<{id:string}>()).results??[];
  await env.DB.prepare("UPDATE tenants SET status='deleting',updated_at=? WHERE id=?").bind(new Date().toISOString(),tenantId).run();
  const domain=[...config.resources].sort((a,b)=>b.restoreOrder-a.restoreOrder);
  for(let i=0;i<domain.length;i+=40)await env.DB.batch(domain.slice(i,i+40).map(r=>env.DB.prepare(`DELETE FROM ${r.table} WHERE ${r.tenantColumn}=?`).bind(tenantId)));
  for(let i=0;i<userRows.length;i+=50){
    const statements:D1PreparedStatementLike[]=userRows.slice(i,i+50).map(u=>env.DB.prepare('DELETE FROM users WHERE id=? AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=?)').bind(u.id,u.id));
    if(statements.length)await env.DB.batch(statements);
  }
  const filesDeleted=await deleteTenantObjects(env,tenantId);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM portability_files WHERE tenant_id=?').bind(tenantId),
    env.DB.prepare('DELETE FROM portability_import_runs WHERE tenant_id=?').bind(tenantId),
    env.DB.prepare('DELETE FROM portability_audit_events WHERE tenant_id=?').bind(tenantId),
    env.DB.prepare("UPDATE portability_deletion_requests SET status='completed',completed_at=?,completed_by=? WHERE id=?").bind(new Date().toISOString(),auth.userId,requestId),
    env.DB.prepare(`DELETE FROM ${config.tenantTable} WHERE ${config.tenantIdColumn}=?`).bind(tenantId),
  ]);
  return{deleted:true,filesDeleted};
}
