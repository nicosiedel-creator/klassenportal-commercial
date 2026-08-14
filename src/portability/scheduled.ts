import type { AuthContext, PortabilityConfig, PortabilityEnv } from './types.js';
import { createTenantBackup } from './backup.js';
export async function runScheduledTenantBackups(env:PortabilityEnv,config:PortabilityConfig,systemUserId='system:backup',tenantsPerRun=3):Promise<{backedUp:string[];nextCursor:string|null}>{
  const state=await env.DB.prepare("SELECT value FROM portability_scheduler_state WHERE key = 'backup_cursor'").first<Record<string,unknown>>(),cursor=String(state?.value??'');
  let res=await env.DB.prepare(`SELECT ${config.tenantIdColumn} AS id FROM ${config.tenantTable} WHERE ${config.tenantIdColumn} > ? ORDER BY ${config.tenantIdColumn} ASC LIMIT ?`).bind(cursor,tenantsPerRun).all<{id:string}>();
  if(!res.results.length&&cursor)res=await env.DB.prepare(`SELECT ${config.tenantIdColumn} AS id FROM ${config.tenantTable} ORDER BY ${config.tenantIdColumn} ASC LIMIT ?`).bind(tenantsPerRun).all<{id:string}>();
  const backedUp:string[]=[];let last:string|null=null;
  for(const row of res.results){const tenantId=String(row.id);last=tenantId;const auth:AuthContext={userId:systemUserId,role:'system',isPlatformAdmin:true};await createTenantBackup(env,config,auth,tenantId,'automatic');backedUp.push(tenantId);}
  if(last)await env.DB.prepare("INSERT INTO portability_scheduler_state (key, value, updated_at) VALUES ('backup_cursor', ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(last,new Date().toISOString()).run();
  return {backedUp,nextCursor:last};
}
