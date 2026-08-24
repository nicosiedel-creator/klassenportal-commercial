import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { verifyPassword } from './auth.js';
import { requirePlatform } from './permissions.js';
import { portabilityConfig } from '../portability/config.js';
import { cancelTenantDeletion, finalizeTenantDeletion, requestTenantDeletion } from '../portability/delete.js';
import { paymentPolicy } from './payment-policy.js';
import { mailConfigured } from './mail.js';
import { nowIso, safeString } from './utils.js';

async function verifyOwnerPassword(env:Env,auth:CoreAuthContext,password:unknown):Promise<void>{
  requirePlatform(auth);const p=String(password??'');if(!p)throw new Error('CURRENT_PASSWORD_REQUIRED');const row=await env.DB.prepare("SELECT password_hash FROM users WHERE id=? AND status='active' AND is_platform_admin=1").bind(auth.userId).first<{password_hash:string}>();if(!row||!(await verifyPassword(p,row.password_hash)))throw new Error('CURRENT_PASSWORD_INVALID');
}
async function requireOwnerStepUp(env:Env,auth:CoreAuthContext,password:unknown):Promise<void>{await verifyOwnerPassword(env,auth,password);}
async function activeBilling(env:Env,tenantId:string):Promise<boolean>{
  const row=await env.DB.prepare('SELECT stripe_subscription_id,stripe_subscription_status FROM tenant_payment_accounts WHERE tenant_id=?').bind(tenantId).first<{stripe_subscription_id:string|null;stripe_subscription_status:string|null}>();if(!row?.stripe_subscription_id)return false;const s=String(row.stripe_subscription_status||'').toLowerCase();return !['canceled','cancelled','ended','incomplete_expired'].includes(s);
}
async function safe<T>(work:Promise<T>,fallback:T):Promise<T>{try{return await work;}catch{return fallback;}}

export async function ownerSystemHealth(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);let db=false,r2=false;try{db=Number(await env.DB.prepare('SELECT 1 AS ok').first<number>('ok'))===1;}catch{}try{await env.FILES.list({prefix:'health/',limit:1});r2=true;}catch{}
  const payment=paymentPolicy(env),[counts,auditRows,providerRows,backupRows,deletions,cancellationErrors,essentialTables]=await Promise.all([
    safe(env.DB.prepare(`SELECT
      (SELECT COUNT(*) FROM tenants WHERE status='active') AS active_tenants,
      (SELECT COUNT(*) FROM courses WHERE is_active=1) AS active_courses,
      (SELECT COUNT(*) FROM users WHERE status='active') AS active_users,
      (SELECT COUNT(*) FROM managed_setup_jobs WHERE status<>'completed') AS open_managed_setups`).first<Record<string,unknown>>(),{}),
    safe(env.DB.prepare(`SELECT a.id,a.tenant_id,t.name AS tenant_name,a.course_id,a.actor_user_id,u.display_name AS actor_name,a.action,a.entity_type,a.entity_id,a.created_at
      FROM audit_log a LEFT JOIN tenants t ON t.id=a.tenant_id LEFT JOIN users u ON u.id=a.actor_user_id ORDER BY a.created_at DESC LIMIT 100`).all<Record<string,unknown>>(),{success:false,results:[]}),
    safe(env.DB.prepare('SELECT event_id,event_type,status,received_at,processed_at,error_message FROM payment_provider_events ORDER BY received_at DESC LIMIT 30').all<Record<string,unknown>>(),{success:false,results:[]}),
    safe(env.DB.prepare('SELECT id,tenant_id,reason,status,size_bytes,created_at,completed_at,error_message FROM portability_backups ORDER BY created_at DESC LIMIT 30').all<Record<string,unknown>>(),{success:false,results:[]}),
    safe(env.DB.prepare("SELECT d.id,d.tenant_id,t.name AS tenant_name,d.reason,d.status,d.final_backup_id,d.final_export_key,d.scheduled_for,d.created_at FROM portability_deletion_requests d LEFT JOIN tenants t ON t.id=d.tenant_id WHERE d.status='pending' ORDER BY d.scheduled_for").all<Record<string,unknown>>(),{success:false,results:[]}),
    safe(env.DB.prepare("SELECT COUNT(*) AS n FROM module_cancellations WHERE status='error'").first<number>('n'),0),
    safe(env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('managed_setup_jobs','module_cancellations','payment_provider_events','portability_backups','audit_log')").all<{name:string}>(),{success:false,results:[]}),
  ]);
  const tableSet=new Set((essentialTables.results??[]).map(x=>x.name)),missingTables=['managed_setup_jobs','module_cancellations','payment_provider_events','portability_backups','audit_log'].filter(x=>!tableSet.has(x));
  const failedProvider=payment.enabled?(providerRows.results??[]).filter(x=>x.status==='failed').length:0,failedBackups=(backupRows.results??[]).filter(x=>x.status==='failed').length;
  const stripeConfigured=!!env.STRIPE_SECRET_KEY&&!!env.STRIPE_WEBHOOK_SECRET,mailReady=mailConfigured(env),blockers:string[]=[];
  if(!db)blockers.push('Datenbank nicht erreichbar');if(!r2)blockers.push('Dateispeicher nicht erreichbar');if(missingTables.length)blockers.push(`Datenbankschema unvollständig: ${missingTables.join(', ')}`);if(!mailReady)blockers.push('Cloudflare Email Service ist nicht vollständig konfiguriert');if(payment.enabled&&!stripeConfigured)blockers.push('Stripe-Konfiguration unvollständig');if(failedProvider)blockers.push(`${failedProvider} fehlgeschlagene Stripe-Ereignisse in der aktuellen Übersicht`);if(failedBackups)blockers.push(`${failedBackups} fehlgeschlagene Backups in der aktuellen Übersicht`);if(Number(cancellationErrors||0)>0)blockers.push(`${cancellationErrors} fehlgeschlagene Modul-Kündigungen werden erneut versucht`);
  return{ready:blockers.length===0,blockers,services:{database:db,fileStorage:r2,transactionalMail:mailReady,paymentsEnabled:payment.enabled,stripeConfigured:!payment.enabled||stripeConfigured,schemaComplete:missingTables.length===0},counts:counts??{},recentAudit:auditRows.results??[],recentProviderEvents:providerRows.results??[],recentBackups:backupRows.results??[],pendingDeletions:deletions.results??[],moduleCancellationErrors:Number(cancellationErrors||0),checkedAt:nowIso()};
}

export async function requestOwnerTenantDeletion(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requirePlatform(auth);const tenant=await env.DB.prepare('SELECT id,name,status FROM tenants WHERE id=?').bind(tenantId).first<{id:string;name:string;status:string}>();if(!tenant)throw new Error('TENANT_NOT_FOUND');if(await activeBilling(env,tenantId))throw new Error('ACTIVE_BILLING_MUST_END_FIRST');const typed=safeString(input.confirm_name,200);if(typed!==tenant.name)throw new Error('TENANT_NAME_CONFIRMATION_REQUIRED');await requireOwnerStepUp(env,auth,input.current_password);
  const pAuth={userId:auth.userId,role:'platform_admin',tenantIds:[tenantId],isPlatformAdmin:true},result=await requestTenantDeletion(env,portabilityConfig,pAuth,tenantId,'manual');await env.DB.prepare("UPDATE tenants SET status='deleting',updated_at=? WHERE id=?").bind(nowIso(),tenantId).run();await audit(env.DB,auth.userId,'platform.tenant_deletion_requested',tenantId,undefined,'tenant',tenantId,{requestId:result.requestId,scheduledFor:result.scheduledFor,finalBackupId:result.finalBackupId});return result;
}
export async function cancelOwnerTenantDeletion(env:Env,auth:CoreAuthContext,tenantId:string,requestId:string){
  requirePlatform(auth);const pAuth={userId:auth.userId,role:'platform_admin',tenantIds:[tenantId],isPlatformAdmin:true};await cancelTenantDeletion(env,pAuth,tenantId,requestId);await env.DB.prepare("UPDATE tenants SET status='active',updated_at=? WHERE id=? AND status='deleting'").bind(nowIso(),tenantId).run();await audit(env.DB,auth.userId,'platform.tenant_deletion_cancelled',tenantId,undefined,'tenant',tenantId,{requestId});return{cancelled:true};
}
export async function finalizeOwnerTenantDeletion(env:Env,auth:CoreAuthContext,tenantId:string,requestId:string,input:Record<string,unknown>){
  requirePlatform(auth);if(await activeBilling(env,tenantId))throw new Error('ACTIVE_BILLING_MUST_END_FIRST');await requireOwnerStepUp(env,auth,input.current_password);const pAuth={userId:auth.userId,role:'platform_admin',tenantIds:[tenantId],isPlatformAdmin:true};return finalizeTenantDeletion(env,portabilityConfig,pAuth,tenantId,requestId,`DELETE:${tenantId}`);
}
