import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireRole } from './permissions.js';
import { id, nowIso, safeString } from './utils.js';
import { prepareStripeModeState } from './stripe-mode-state.js';

const API='https://api.stripe.com/v1';

async function ensureSchema(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS module_cancellations (
    id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,feature_key TEXT NOT NULL,external_subscription_item_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('scheduled','cancelled','completed','error')) DEFAULT 'scheduled',effective_at TEXT NOT NULL,
    requested_by TEXT NOT NULL,requested_at TEXT NOT NULL,cancelled_at TEXT,completed_at TEXT,last_attempt_at TEXT,attempt_count INTEGER NOT NULL DEFAULT 0,last_error TEXT,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,FOREIGN KEY(feature_key) REFERENCES module_commerce_rules(feature_key))`).run();
  await env.DB.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_module_cancellations_open ON module_cancellations(tenant_id,feature_key) WHERE status IN ('scheduled','error')").run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_module_cancellations_due ON module_cancellations(status,effective_at)').run();
}
function headers(env:Env):Record<string,string>{if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)throw new Error('STRIPE_NOT_CONFIGURED');return{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`};}
async function stripeItem(env:Env,itemId:string):Promise<Record<string,any>>{
  await prepareStripeModeState(env);const r=await fetch(`${API}/subscription_items/${encodeURIComponent(itemId)}`,{headers:headers(env)});let d:any={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(`STRIPE_${String(d?.error?.code||d?.error?.type||'API_ERROR').toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`);return d;
}
async function removeStripeItem(env:Env,itemId:string):Promise<void>{
  await prepareStripeModeState(env);const p=new URLSearchParams({proration_behavior:'none'});const h={...headers(env),'content-type':'application/x-www-form-urlencoded'};const r=await fetch(`${API}/subscription_items/${encodeURIComponent(itemId)}`,{method:'DELETE',headers:h,body:p});let d:any={};try{d=await r.json();}catch{}
  if(r.ok)return;const code=String(d?.error?.code||d?.error?.type||'API_ERROR').toUpperCase().replace(/[^A-Z0-9]+/g,'_');if(r.status===404||code==='RESOURCE_MISSING')return;throw new Error(`STRIPE_${code}`);
}

export async function listModuleCancellations(env:Env,auth:CoreAuthContext,tenantId:string){
  requireRole(auth,'tenant_admin');await ensureSchema(env);return (await env.DB.prepare("SELECT id,feature_key,status,effective_at,requested_at,cancelled_at,completed_at,last_error FROM module_cancellations WHERE tenant_id=? AND status IN ('scheduled','error') ORDER BY effective_at").bind(tenantId).all<Record<string,unknown>>()).results??[];
}

export async function scheduleModuleCancellation(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireRole(auth,'tenant_admin');await ensureSchema(env);if(input.confirm_cancel!==true)throw new Error('CANCELLATION_CONFIRMATION_REQUIRED');const key=safeString(input.feature_key,80);if(!key)throw new Error('FEATURE_KEY_REQUIRED');
  const entitlement=await env.DB.prepare("SELECT feature_key,status,external_subscription_item_id FROM tenant_module_entitlements WHERE tenant_id=? AND feature_key=?").bind(tenantId,key).first<{feature_key:string;status:string;external_subscription_item_id:string|null}>();
  if(!entitlement||entitlement.status!=='active'||!entitlement.external_subscription_item_id)throw new Error('MODULE_CANCELLATION_NOT_ALLOWED');
  const existing=await env.DB.prepare("SELECT id FROM module_cancellations WHERE tenant_id=? AND feature_key=? AND status IN ('scheduled','error')").bind(tenantId,key).first();if(existing)throw new Error('MODULE_CANCELLATION_ALREADY_SCHEDULED');
  const remote=await stripeItem(env,entitlement.external_subscription_item_id),periodEnd=Number(remote.current_period_end||0);if(!Number.isFinite(periodEnd)||periodEnd<=Math.floor(Date.now()/1000))throw new Error('STRIPE_PERIOD_END_INVALID');
  const effectiveAt=new Date(periodEnd*1000).toISOString(),cid=id('mcan_'),ts=nowIso();await env.DB.prepare("INSERT INTO module_cancellations(id,tenant_id,feature_key,external_subscription_item_id,status,effective_at,requested_by,requested_at) VALUES(?,?,?,?,'scheduled',?,?,?)").bind(cid,tenantId,key,entitlement.external_subscription_item_id,effectiveAt,auth.userId,ts).run();
  await audit(env.DB,auth.userId,'module.cancellation.scheduled',tenantId,undefined,'module',key,{cancellationId:cid,effectiveAt});return{id:cid,featureKey:key,status:'scheduled',effectiveAt};
}

export async function undoModuleCancellation(env:Env,auth:CoreAuthContext,tenantId:string,key:string){
  requireRole(auth,'tenant_admin');await ensureSchema(env);const row=await env.DB.prepare("SELECT id,effective_at FROM module_cancellations WHERE tenant_id=? AND feature_key=? AND status IN ('scheduled','error') ORDER BY requested_at DESC LIMIT 1").bind(tenantId,key).first<{id:string;effective_at:string}>();if(!row)throw new Error('MODULE_CANCELLATION_NOT_FOUND');if(Date.parse(row.effective_at)<=Date.now())throw new Error('MODULE_CANCELLATION_ALREADY_DUE');
  const ts=nowIso();await env.DB.prepare("UPDATE module_cancellations SET status='cancelled',cancelled_at=?,last_error=NULL WHERE id=?").bind(ts,row.id).run();await audit(env.DB,auth.userId,'module.cancellation.withdrawn',tenantId,undefined,'module',key,{cancellationId:row.id});return{featureKey:key,status:'active'};
}

export async function processScheduledModuleCancellations(env:Env,limit=25):Promise<{completed:number;failed:number}>{
  await ensureSchema(env);const now=nowIso(),rows=(await env.DB.prepare("SELECT * FROM module_cancellations WHERE status IN ('scheduled','error') AND effective_at<=? ORDER BY effective_at LIMIT ?").bind(now,Math.max(1,Math.min(100,limit))).all<Record<string,any>>()).results??[];let completed=0,failed=0;
  for(const row of rows){
    try{
      await removeStripeItem(env,String(row.external_subscription_item_id));const ts=nowIso();await env.DB.batch([
        env.DB.prepare("UPDATE module_cancellations SET status='completed',completed_at=?,last_attempt_at=?,attempt_count=attempt_count+1,last_error=NULL WHERE id=?").bind(ts,ts,row.id),
        env.DB.prepare("UPDATE tenant_module_entitlements SET status='cancelled',updated_at=? WHERE tenant_id=? AND feature_key=?").bind(ts,row.tenant_id,row.feature_key),
        env.DB.prepare("UPDATE feature_flags SET enabled=0,source='manual',updated_at=? WHERE tenant_id=? AND feature_key=?").bind(ts,row.tenant_id,row.feature_key),
      ]);await audit(env.DB,'system:billing','module.cancellation.completed',String(row.tenant_id),undefined,'module',String(row.feature_key),{cancellationId:row.id,effectiveAt:row.effective_at});completed++;
    }catch(e){const msg=String((e as Error)?.message||'CANCELLATION_FAILED').slice(0,500),ts=nowIso();await env.DB.prepare("UPDATE module_cancellations SET status='error',last_attempt_at=?,attempt_count=attempt_count+1,last_error=? WHERE id=?").bind(ts,msg,row.id).run();console.error('Module cancellation failed',{id:row.id,tenantId:row.tenant_id,featureKey:row.feature_key,error:msg});failed++;}
  }
  return{completed,failed};
}
