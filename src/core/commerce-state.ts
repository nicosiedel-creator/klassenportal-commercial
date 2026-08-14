import type { Env } from './types.js';
import { nowIso } from './utils.js';

type SubscriptionRow={plan_id:string;status:string;starts_at:string;};
type PlanRow={
  id:string;monthly_price_cents:number|null;included_courses:number|null;
  extra_course_monthly_cents:number|null;currency:string|null;
};
type PolicyRow={trial_days:number;trial_course_limit:number;read_only_days:number;};

function isoAfter(base:string,days:number):string{
  const parsed=Date.parse(base),start=Number.isFinite(parsed)?parsed:Date.now();
  return new Date(start+Math.max(0,days)*86400000).toISOString();
}

/**
 * Repariert ausschließlich fehlende kommerzielle Zustandsdatensätze älterer Mandanten.
 * Bereits vorhandene Entitlements, Testphasen und Abos werden niemals überschrieben.
 */
export async function ensureTenantCommerceState(env:Env,tenantId:string):Promise<void>{
  const tenant=await env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(tenantId).first<{id:string}>();
  if(!tenant)throw new Error('TENANT_NOT_FOUND');

  const ts=nowIso();
  let sub=await env.DB.prepare('SELECT plan_id,status,starts_at FROM subscriptions WHERE tenant_id=?').bind(tenantId).first<SubscriptionRow>();
  if(!sub){
    const fallback=await env.DB.prepare("SELECT id FROM plans WHERE is_active=1 ORDER BY CASE id WHEN 'starter' THEN 0 WHEN 'provider' THEN 1 ELSE 2 END, COALESCE(monthly_price_cents,0) LIMIT 1").first<{id:string}>();
    if(!fallback)throw new Error('PLAN_NOT_FOUND');
    await env.DB.prepare("INSERT INTO subscriptions(tenant_id,plan_id,status,starts_at) VALUES(?,?,'trial',?)").bind(tenantId,fallback.id,ts).run();
    sub={plan_id:fallback.id,status:'trial',starts_at:ts};
  }

  const plan=await env.DB.prepare(`SELECT p.id,p.monthly_price_cents,r.included_courses,r.extra_course_monthly_cents,r.currency
    FROM plans p LEFT JOIN plan_commerce_rules r ON r.plan_id=p.id WHERE p.id=? AND p.is_active=1`).bind(sub.plan_id).first<PlanRow>();
  if(!plan)throw new Error('PLAN_NOT_FOUND');

  const countRow=await env.DB.prepare('SELECT COUNT(*) AS n FROM courses WHERE tenant_id=? AND is_active=1').bind(tenantId).first<{n:number}>();
  const activeCourses=Math.max(0,Number(countRow?.n??0));
  const requestedCourses=Math.max(1,activeCourses);
  const policy=await env.DB.prepare('SELECT trial_days,trial_course_limit,read_only_days FROM commerce_policy WHERE id=1').first<PolicyRow>()??{trial_days:30,trial_course_limit:2,read_only_days:7};
  const included=plan.included_courses==null?null:Number(plan.included_courses);
  const extraPrice=plan.extra_course_monthly_cents==null?0:Number(plan.extra_course_monthly_cents);
  const extra=included==null?0:Math.max(0,requestedCourses-included);
  const recurring=Math.max(0,Number(plan.monthly_price_cents??0)+extra*extraPrice);
  const entitlementLimit=sub.status==='trial'
    ? Math.max(Number(policy.trial_course_limit||2),activeCourses)
    : Math.max(activeCourses,included??requestedCourses);

  const existingEntitlement=await env.DB.prepare('SELECT tenant_id FROM tenant_entitlements WHERE tenant_id=?').bind(tenantId).first<{tenant_id:string}>();
  if(!existingEntitlement){
    const snapshot=JSON.stringify({source:'legacy_repair',planId:plan.id,requestedCourses,courseLimit:entitlementLimit,recurringMonthlyCents:recurring,currency:plan.currency||'EUR'});
    await env.DB.prepare(`INSERT INTO tenant_entitlements(tenant_id,plan_id,course_limit,currency,recurring_monthly_cents,setup_cents,pricing_snapshot_json,updated_at)
      VALUES(?,?,?,?,?,0,?,?)`).bind(tenantId,plan.id,entitlementLimit,plan.currency||'EUR',recurring,snapshot,ts).run();
  }

  if(sub.status==='trial'){
    const existingTrial=await env.DB.prepare('SELECT tenant_id FROM tenant_trials WHERE tenant_id=?').bind(tenantId).first<{tenant_id:string}>();
    if(!existingTrial){
      const startedAt=Number.isFinite(Date.parse(sub.starts_at))?new Date(Date.parse(sub.starts_at)).toISOString():ts;
      const trialEndsAt=isoAfter(startedAt,Number(policy.trial_days||30));
      const readOnlyEndsAt=isoAfter(trialEndsAt,Number(policy.read_only_days||7));
      const now=Date.now(),trialEnd=Date.parse(trialEndsAt),readEnd=Date.parse(readOnlyEndsAt);
      const status=now<trialEnd?'active':now<readEnd?'read_only':'expired';
      const snapshot=JSON.stringify({source:'legacy_repair',planId:plan.id,requestedCourses,trialCourseLimit:entitlementLimit,recurringMonthlyCents:recurring,currency:plan.currency||'EUR'});
      await env.DB.prepare(`INSERT INTO tenant_trials(tenant_id,target_plan_id,requested_course_count,trial_course_limit,status,started_at,trial_ends_at,read_only_ends_at,setup_option_id,pricing_snapshot_json,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?)`).bind(tenantId,plan.id,requestedCourses,entitlementLimit,status,startedAt,trialEndsAt,readOnlyEndsAt,'self_service',snapshot,ts).run();
    }
  }
}
