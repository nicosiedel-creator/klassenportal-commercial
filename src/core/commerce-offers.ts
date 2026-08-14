import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { calculatePlanPrice } from './commerce.js';
import { id, nowIso, safeString } from './utils.js';
import { requireRole } from './permissions.js';

export type BillingCycle = 'monthly' | 'annual';
export type OfferPurpose = 'trial' | 'paid';

type CommercePolicy = {
  trial_days:number;
  trial_course_limit:number;
  read_only_days:number;
  annual_months_charged:number;
  trial_requires_payment_method:number;
};

type SetupOption = {
  id:string;
  name:string;
  description:string|null;
  max_courses:number|null;
  price_cents:number;
  credit_on_later_setup_cents:number;
  is_trial_setup:number;
  is_active:number;
  sort_order:number;
};

export type CommercialOffer = Awaited<ReturnType<typeof calculatePlanPrice>> & {
  billingCycle:BillingCycle;
  annualMonthsCharged:number;
  annualTotalCents:number;
  billedSubscriptionCents:number;
  managedSetupOptionId:string;
  managedSetupName:string;
  managedSetupCents:number;
  firstTotalCents:number;
};

function normalizeCycle(v:unknown):BillingCycle{return String(v)==='annual'?'annual':'monthly';}

export async function getCommercePolicy(env:Env):Promise<CommercePolicy>{
  const p=await env.DB.prepare('SELECT trial_days,trial_course_limit,read_only_days,annual_months_charged,trial_requires_payment_method FROM commerce_policy WHERE id=1').first<CommercePolicy>();
  if(!p)throw new Error('COMMERCE_POLICY_NOT_FOUND');
  return p;
}

export async function listManagedSetupOptions(env:Env):Promise<SetupOption[]>{
  const r=await env.DB.prepare('SELECT id,name,description,max_courses,price_cents,credit_on_later_setup_cents,is_trial_setup,is_active,sort_order FROM managed_setup_options WHERE is_active=1 ORDER BY sort_order,name').all<SetupOption>();
  return r.results??[];
}

async function setupOption(env:Env,setupId:string,purpose:OfferPurpose,courseCount:number):Promise<SetupOption>{
  const row=await env.DB.prepare('SELECT id,name,description,max_courses,price_cents,credit_on_later_setup_cents,is_trial_setup,is_active,sort_order FROM managed_setup_options WHERE id=? AND is_active=1').bind(setupId).first<SetupOption>();
  if(!row)throw new Error('SETUP_OPTION_NOT_FOUND');
  if(row.max_courses!==null&&courseCount>Number(row.max_courses))throw new Error('SETUP_OPTION_COURSE_LIMIT');
  if(purpose==='trial'&&row.id!=='self_service'&&row.is_trial_setup!==1)throw new Error('SETUP_OPTION_NOT_AVAILABLE_FOR_TRIAL');
  if(purpose==='paid'&&row.is_trial_setup===1)throw new Error('SETUP_OPTION_TRIAL_ONLY');
  return row;
}

export async function calculateCommercialOffer(env:Env,args:{planId:string;courseCount:unknown;billingCycle?:unknown;setupOptionId?:unknown;purpose?:OfferPurpose}):Promise<CommercialOffer>{
  const base=await calculatePlanPrice(env,args.planId,args.courseCount);
  const cycle=normalizeCycle(args.billingCycle);
  const purpose=args.purpose??'paid';
  const setupId=safeString(args.setupOptionId||'self_service',80)||'self_service';
  const setup=await setupOption(env,setupId,purpose,base.courseCount);
  const policy=await getCommercePolicy(env);
  const annualMonths=Math.max(1,Number(policy.annual_months_charged||10));
  const annualTotal=base.recurringMonthlyCents*annualMonths;
  const subscriptionCharge=cycle==='annual'?annualTotal:base.recurringMonthlyCents;
  const managedSetupCents=purpose==='trial'&&setup.id==='self_service'?0:Number(setup.price_cents||0);
  return {
    ...base,
    setupCents:managedSetupCents,
    billingCycle:cycle,
    annualMonthsCharged:annualMonths,
    annualTotalCents:annualTotal,
    billedSubscriptionCents:subscriptionCharge,
    managedSetupOptionId:setup.id,
    managedSetupName:setup.name,
    managedSetupCents,
    firstTotalCents:subscriptionCharge+managedSetupCents,
  };
}

function documentNumber(prefix:string):string{
  const d=new Date();
  const date=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;
  return `${prefix}-${date}-${id('').replace(/[^a-zA-Z0-9]/g,'').slice(-8).toUpperCase()}`;
}

export async function startTenantTrial(env:Env,args:{tenantId:string;planId:string;requestedCourseCount:number;setupOptionId?:string;actorId:string}):Promise<Record<string,unknown>>{
  const policy=await getCommercePolicy(env);
  const offer=await calculateCommercialOffer(env,{planId:args.planId,courseCount:args.requestedCourseCount,billingCycle:'monthly',setupOptionId:args.setupOptionId||'self_service',purpose:'trial'});
  const now=new Date();
  const trialEnd=new Date(now.getTime()+Number(policy.trial_days)*86400000);
  const readOnlyEnd=new Date(trialEnd.getTime()+Number(policy.read_only_days)*86400000);
  const ts=now.toISOString();
  const limit=Math.max(1,Number(policy.trial_course_limit||2));
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tenant_trials(tenant_id,target_plan_id,requested_course_count,trial_course_limit,status,started_at,trial_ends_at,read_only_ends_at,setup_option_id,pricing_snapshot_json,updated_at)
      VALUES(?,?,?,?,'active',?,?,?,?,?,?)
      ON CONFLICT(tenant_id) DO UPDATE SET target_plan_id=excluded.target_plan_id,requested_course_count=excluded.requested_course_count,trial_course_limit=excluded.trial_course_limit,status='active',started_at=excluded.started_at,trial_ends_at=excluded.trial_ends_at,read_only_ends_at=excluded.read_only_ends_at,converted_at=NULL,setup_option_id=excluded.setup_option_id,pricing_snapshot_json=excluded.pricing_snapshot_json,updated_at=excluded.updated_at`)
      .bind(args.tenantId,args.planId,args.requestedCourseCount,limit,ts,trialEnd.toISOString(),readOnlyEnd.toISOString(),offer.managedSetupOptionId,JSON.stringify(offer),ts),
    env.DB.prepare(`INSERT INTO tenant_entitlements(tenant_id,plan_id,course_limit,currency,recurring_monthly_cents,setup_cents,pricing_snapshot_json,updated_at,billing_cycle,annual_total_cents)
      VALUES(?,?,?,?,0,0,?,?,?,?)
      ON CONFLICT(tenant_id) DO UPDATE SET plan_id=excluded.plan_id,course_limit=excluded.course_limit,currency=excluded.currency,recurring_monthly_cents=0,setup_cents=0,pricing_snapshot_json=excluded.pricing_snapshot_json,updated_at=excluded.updated_at,billing_cycle=excluded.billing_cycle,annual_total_cents=excluded.annual_total_cents`)
      .bind(args.tenantId,args.planId,limit,offer.currency,JSON.stringify(offer),ts,'monthly',offer.annualTotalCents),
    env.DB.prepare("UPDATE subscriptions SET plan_id=?,status='trial',starts_at=?,ends_at=? WHERE tenant_id=?").bind(args.planId,ts,trialEnd.toISOString(),args.tenantId),
  ]);
  await audit(env.DB,args.actorId,'commerce.trial.started',args.tenantId,undefined,'tenant_trial',args.tenantId,{trialDays:policy.trial_days,readOnlyDays:policy.read_only_days,trialCourseLimit:limit,targetCourseCount:args.requestedCourseCount,targetPlanId:args.planId});
  return {status:'active',trialEndsAt:trialEnd.toISOString(),readOnlyEndsAt:readOnlyEnd.toISOString(),trialCourseLimit:limit,targetOffer:offer};
}

export async function createPaidBooking(env:Env,args:{tenantId:string;invitationId?:string;planId:string;courseCount:number;billingCycle?:unknown;setupOptionId?:unknown;accepted:boolean;request:Request;actorId:string}):Promise<Record<string,unknown>>{
  const offer=await calculateCommercialOffer(env,{planId:args.planId,courseCount:args.courseCount,billingCycle:args.billingCycle,setupOptionId:args.setupOptionId,purpose:'paid'});
  if(!offer.pricingReady)throw new Error('PRICING_NOT_CONFIGURED');
  if(!args.accepted)throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');
  const ts=nowIso(),snapshot=JSON.stringify(offer),qid=id('quo_'),oid=id('ord_'),iid=id('inv_');
  const valid=new Date(Date.now()+offer.offerValidDays*86400000).toISOString();
  const ip=args.request.headers.get('CF-Connecting-IP')||null;
  const ua=safeString(args.request.headers.get('User-Agent'),500)||null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tenant_entitlements(tenant_id,plan_id,course_limit,currency,recurring_monthly_cents,setup_cents,pricing_snapshot_json,updated_at,billing_cycle,annual_total_cents)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET plan_id=excluded.plan_id,course_limit=excluded.course_limit,currency=excluded.currency,recurring_monthly_cents=excluded.recurring_monthly_cents,setup_cents=excluded.setup_cents,pricing_snapshot_json=excluded.pricing_snapshot_json,updated_at=excluded.updated_at,billing_cycle=excluded.billing_cycle,annual_total_cents=excluded.annual_total_cents`)
      .bind(args.tenantId,args.planId,args.courseCount,offer.currency,offer.recurringMonthlyCents,offer.managedSetupCents,snapshot,ts,offer.billingCycle,offer.annualTotalCents),
    env.DB.prepare(`INSERT INTO commercial_quotes(id,quote_number,onboarding_invitation_id,tenant_id,plan_id,requested_courses,currency,recurring_monthly_cents,setup_cents,first_total_cents,status,valid_until,pricing_snapshot_json,accepted_at,accepted_ip,accepted_user_agent,created_at,updated_at,billing_cycle,managed_setup_option_id,annual_total_cents)
      VALUES(?,?,?,?,?,?,?,?,?,?,'accepted',?,?,?,?,?,?,?,?,?,?)`)
      .bind(qid,documentNumber('ANG'),args.invitationId||null,args.tenantId,args.planId,args.courseCount,offer.currency,offer.recurringMonthlyCents,offer.managedSetupCents,offer.firstTotalCents,valid,snapshot,ts,ip,ua,ts,ts,offer.billingCycle,offer.managedSetupOptionId,offer.annualTotalCents),
    env.DB.prepare(`INSERT INTO commercial_orders(id,order_number,tenant_id,quote_id,plan_id,course_limit,status,currency,recurring_monthly_cents,setup_cents,booked_at,billing_cycle,managed_setup_option_id,annual_total_cents)
      VALUES(?,?,?,?,?,?,'pending_payment',?,?,?,?,?,?,?)`)
      .bind(oid,documentNumber('AUF'),args.tenantId,qid,args.planId,args.courseCount,offer.currency,offer.recurringMonthlyCents,offer.managedSetupCents,ts,offer.billingCycle,offer.managedSetupOptionId,offer.annualTotalCents),
    env.DB.prepare(`INSERT INTO commercial_invoices(id,invoice_number,tenant_id,order_id,type,status,currency,net_cents,tax_cents,gross_cents,snapshot_json,created_at)
      VALUES(?,?,?,?,'initial','pending_provider',?,?,0,?,?,?)`)
      .bind(iid,documentNumber('ENTW'),args.tenantId,oid,offer.currency,offer.firstTotalCents,offer.firstTotalCents,snapshot,ts),
    env.DB.prepare("UPDATE subscriptions SET plan_id=?,status='past_due',starts_at=?,ends_at=NULL WHERE tenant_id=?").bind(args.planId,ts,args.tenantId),
  ]);
  await audit(env.DB,args.actorId,'commerce.booking.requested',args.tenantId,undefined,'order',oid,{quoteId:qid,invoiceId:iid,planId:args.planId,courseCount:args.courseCount,billingCycle:offer.billingCycle,managedSetupOptionId:offer.managedSetupOptionId,firstTotalCents:offer.firstTotalCents});
  return {quoteId:qid,orderId:oid,invoiceId:iid,status:'pending_payment',offer};
}

export async function getTenantTrial(env:Env,tenantId:string):Promise<Record<string,unknown>|null>{
  return env.DB.prepare('SELECT * FROM tenant_trials WHERE tenant_id=?').bind(tenantId).first<Record<string,unknown>>();
}

export async function refreshTrialStates(env:Env):Promise<void>{
  const now=nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE tenant_trials SET status='read_only',updated_at=? WHERE status='active' AND trial_ends_at<=?").bind(now,now),
    env.DB.prepare("UPDATE tenant_trials SET status='expired',updated_at=? WHERE status='read_only' AND read_only_ends_at<=?").bind(now,now),
  ]);
}

export async function assertTenantWriteAllowed(env:Env,tenantId:string):Promise<void>{
  const sub=await env.DB.prepare('SELECT status FROM subscriptions WHERE tenant_id=?').bind(tenantId).first<{status:string}>();
  if(sub?.status==='active')return;
  const trial=await env.DB.prepare('SELECT status,trial_ends_at,read_only_ends_at FROM tenant_trials WHERE tenant_id=?').bind(tenantId).first<{status:string;trial_ends_at:string;read_only_ends_at:string}>();
  if(!trial)return;
  const now=Date.now();
  if(trial.status==='active'&&Date.parse(trial.trial_ends_at)<=now){await refreshTrialStates(env);throw new Error('TRIAL_READ_ONLY');}
  if(trial.status==='read_only'&&Date.parse(trial.read_only_ends_at)<=now){await refreshTrialStates(env);throw new Error('TRIAL_EXPIRED');}
  if(trial.status==='read_only')throw new Error('TRIAL_READ_ONLY');
  if(trial.status==='expired')throw new Error('TRIAL_EXPIRED');
}

export async function tenantTrialSummary(env:Env,auth:CoreAuthContext,tenantId:string):Promise<Record<string,unknown>|null>{
  requireRole(auth,'tenant_admin');
  await refreshTrialStates(env);
  return getTenantTrial(env,tenantId);
}
