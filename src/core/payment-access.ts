import type { Env } from './types.js';
import { nowIso } from './utils.js';

export async function assertPaymentWriteAccess(env:Env,tenantId:string):Promise<void>{
  const sub=await env.DB.prepare('SELECT status FROM subscriptions WHERE tenant_id=?').bind(tenantId).first<{status:string}>();
  if(sub?.status==='active')return;

  const trial=await env.DB.prepare('SELECT status,trial_ends_at,read_only_ends_at FROM tenant_trials WHERE tenant_id=?').bind(tenantId).first<{status:string;trial_ends_at:string;read_only_ends_at:string}>();
  const now=Date.now();
  if(trial?.status==='active'&&Date.parse(trial.trial_ends_at)>now)return;

  if(trial?.status==='active'&&Date.parse(trial.trial_ends_at)<=now){
    await env.DB.prepare("UPDATE tenant_trials SET status='read_only',updated_at=? WHERE tenant_id=? AND status='active'").bind(nowIso(),tenantId).run();
    throw new Error('TRIAL_READ_ONLY');
  }
  if(trial?.status==='read_only'&&Date.parse(trial.read_only_ends_at)<=now){
    await env.DB.prepare("UPDATE tenant_trials SET status='expired',updated_at=? WHERE tenant_id=? AND status='read_only'").bind(nowIso(),tenantId).run();
    throw new Error('TRIAL_EXPIRED');
  }
  if(trial?.status==='read_only')throw new Error('TRIAL_READ_ONLY');
  if(trial?.status==='expired')throw new Error('TRIAL_EXPIRED');

  if(sub&&['past_due','cancelled','ended'].includes(sub.status))throw new Error('PAYMENT_REQUIRED');
  if(sub?.status==='trial')throw new Error('TRIAL_EXPIRED');
  throw new Error('PAYMENT_REQUIRED');
}
