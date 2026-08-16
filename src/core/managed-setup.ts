import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requirePlatform } from './permissions.js';
import { ensureManagedSetupSchema } from './managed-setup-schema.js';
import { nowIso, safeString } from './utils.js';

type ManagedSetupStatus='ready'|'in_progress'|'completed';

export async function listManagedSetupJobs(env:Env,auth:CoreAuthContext):Promise<Record<string,unknown>[]>{
  requirePlatform(auth);
  await ensureManagedSetupSchema(env);
  const rows=await env.DB.prepare(`SELECT j.id,j.tenant_id,t.name AS tenant_name,j.order_id,o.order_number,
      j.setup_option_id,j.setup_name,j.course_count,j.status,j.paid_at,j.started_at,j.completed_at,
      j.internal_note,j.created_at,j.updated_at
    FROM managed_setup_jobs j
    JOIN tenants t ON t.id=j.tenant_id
    JOIN commercial_orders o ON o.id=j.order_id
    ORDER BY CASE j.status WHEN 'ready' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
             j.paid_at DESC,j.created_at DESC
    LIMIT 500`).all<Record<string,unknown>>();
  return rows.results??[];
}

function status(v:unknown):ManagedSetupStatus{
  const s=String(v||'');
  if(s==='ready'||s==='in_progress'||s==='completed')return s;
  throw new Error('MANAGED_SETUP_STATUS_INVALID');
}
function assertTransition(from:ManagedSetupStatus,to:ManagedSetupStatus):void{
  if(from===to)return;
  if(from==='ready'&&to==='in_progress')return;
  if(from==='in_progress'&&to==='completed')return;
  throw new Error('MANAGED_SETUP_TRANSITION_INVALID');
}

export async function updateManagedSetupJob(env:Env,auth:CoreAuthContext,jobId:string,input:Record<string,unknown>):Promise<Record<string,unknown>>{
  requirePlatform(auth);
  await ensureManagedSetupSchema(env);
  const current=await env.DB.prepare('SELECT id,tenant_id,status FROM managed_setup_jobs WHERE id=?').bind(jobId).first<{id:string;tenant_id:string;status:string}>();
  if(!current)throw new Error('MANAGED_SETUP_NOT_FOUND');
  const currentStatus=status(current.status),next=status(input.status??current.status);assertTransition(currentStatus,next);
  const note=safeString(input.internal_note,2000)||null,ts=nowIso();
  const started=next==='in_progress'?ts:null,completed=next==='completed'?ts:null;
  await env.DB.prepare(`UPDATE managed_setup_jobs
    SET status=?,
        started_at=CASE WHEN ?='in_progress' THEN COALESCE(started_at,?) ELSE started_at END,
        completed_at=CASE WHEN ?='completed' THEN COALESCE(completed_at,?) ELSE completed_at END,
        internal_note=?,updated_at=?
    WHERE id=?`)
    .bind(next,next,started,next,completed,note,ts,jobId).run();
  await audit(env.DB,auth.userId,'managed_setup.updated',current.tenant_id,undefined,'managed_setup_job',jobId,{from:currentStatus,to:next});
  return await env.DB.prepare(`SELECT j.id,j.tenant_id,t.name AS tenant_name,j.order_id,o.order_number,
      j.setup_option_id,j.setup_name,j.course_count,j.status,j.paid_at,j.started_at,j.completed_at,
      j.internal_note,j.created_at,j.updated_at
    FROM managed_setup_jobs j JOIN tenants t ON t.id=j.tenant_id JOIN commercial_orders o ON o.id=j.order_id
    WHERE j.id=?`).bind(jobId).first<Record<string,unknown>>()??{};
}
