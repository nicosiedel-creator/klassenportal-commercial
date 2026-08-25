import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform, requireRole } from './permissions.js';
import { audit } from './audit.js';
import { id, nowIso, safeString } from './utils.js';

type PlanPriceRow={
  id:string;name:string;monthly_price_cents:number|null;setup_price_cents:number|null;is_active:number;
  included_courses:number|null;max_courses:number|null;extra_course_monthly_cents:number|null;currency:string|null;
  offer_valid_days:number|null;self_service_expansion:number|null;pricing_enabled:number|null;
};
export type PriceCalculation={
  planId:string;planName:string;courseCount:number;includedCourses:number|null;extraCourses:number;
  maxCourses:number|null;monthlyBaseCents:number;extraCourseMonthlyCents:number|null;
  recurringMonthlyCents:number;setupCents:number;firstTotalCents:number;currency:string;
  offerValidDays:number;selfServiceExpansion:boolean;pricingReady:boolean;
};

function int(v:unknown,min=0,max=1000000):number{const n=Number(v);if(!Number.isFinite(n))throw new Error('NUMBER_INVALID');return Math.max(min,Math.min(max,Math.round(n)));}
function nullableInt(v:unknown,min=0,max=1000000):number|null{if(v===null||v===undefined||v==='')return null;return int(v,min,max);}
function docNumber(prefix:string):string{const d=new Date(),date=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;return `${prefix}-${date}-${id('').replace(/[^a-zA-Z0-9]/g,'').slice(-8).toUpperCase()}`;}

async function planRow(env:Env,planId:string):Promise<PlanPriceRow>{
  const row=await env.DB.prepare(`SELECT p.id,p.name,p.monthly_price_cents,p.setup_price_cents,p.is_active,
    r.included_courses,r.max_courses,r.extra_course_monthly_cents,r.currency,r.offer_valid_days,r.self_service_expansion,r.pricing_enabled
    FROM plans p LEFT JOIN plan_commerce_rules r ON r.plan_id=p.id WHERE p.id=?`).bind(planId).first<PlanPriceRow>();
  if(!row||!row.is_active)throw new Error('PLAN_NOT_FOUND');return row;
}

export async function calculatePlanPrice(env:Env,planId:string,courseCountRaw:unknown):Promise<PriceCalculation>{
  const courseCount=int(courseCountRaw,1,10000),p=await planRow(env,planId),included=p.included_courses===null||p.included_courses===undefined?null:Number(p.included_courses),max=p.max_courses===null||p.max_courses===undefined?null:Number(p.max_courses);
  if(max!==null&&courseCount>max)throw new Error('PLAN_COURSE_LIMIT_EXCEEDED');
  const extra=included===null?0:Math.max(0,courseCount-included),extraPrice=p.extra_course_monthly_cents===null||p.extra_course_monthly_cents===undefined?null:Number(p.extra_course_monthly_cents);
  const base=Number(p.monthly_price_cents??0),setup=Number(p.setup_price_cents??0),pricingReady=!!p.pricing_enabled&&(extra===0||extraPrice!==null);
  const recurring=base+(extraPrice===null?0:extra*extraPrice);
  return{planId:p.id,planName:p.name,courseCount,includedCourses:included,extraCourses:extra,maxCourses:max,monthlyBaseCents:base,extraCourseMonthlyCents:extraPrice,recurringMonthlyCents:recurring,setupCents:setup,firstTotalCents:recurring+setup,currency:p.currency||'EUR',offerValidDays:Number(p.offer_valid_days??14),selfServiceExpansion:p.self_service_expansion!==0,pricingReady};
}

export async function listCommercePlans(env:Env,auth:CoreAuthContext):Promise<Record<string,unknown>[]>{
  requirePlatform(auth);const r=await env.DB.prepare(`SELECT p.id,p.name,p.monthly_price_cents,p.setup_price_cents,p.is_active,
    r.included_courses,r.max_courses,r.extra_course_monthly_cents,r.currency,r.offer_valid_days,r.self_service_expansion,r.pricing_enabled,r.updated_at
    FROM plans p LEFT JOIN plan_commerce_rules r ON r.plan_id=p.id ORDER BY COALESCE(p.monthly_price_cents,0),p.name`).all();return r.results??[];
}

export async function updateCommercePlan(env:Env,auth:CoreAuthContext,planId:string,input:Record<string,unknown>):Promise<void>{
  requirePlatform(auth);const p=await planRow(env,planId),monthly=int(input.monthly_price_cents??p.monthly_price_cents??0,0,100000000),setup=int(input.setup_price_cents??p.setup_price_cents??0,0,100000000);
  const included=nullableInt(input.included_courses,1,10000),max=nullableInt(input.max_courses,1,10000),extra=nullableInt(input.extra_course_monthly_cents,0,100000000),days=int(input.offer_valid_days??14,1,90),enabled=Number(input.pricing_enabled)?1:0,self=Number(input.self_service_expansion)===0?0:1,currency=safeString(input.currency||'EUR',3).toUpperCase();
  if(max!==null&&included!==null&&max<included)throw new Error('PLAN_LIMIT_INVALID');if(!/^[A-Z]{3}$/.test(currency))throw new Error('CURRENCY_INVALID');
  await env.DB.batch([
    env.DB.prepare('UPDATE plans SET monthly_price_cents=?,setup_price_cents=? WHERE id=?').bind(monthly,setup,planId),
    env.DB.prepare(`INSERT INTO plan_commerce_rules(plan_id,included_courses,max_courses,extra_course_monthly_cents,currency,offer_valid_days,self_service_expansion,pricing_enabled,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(plan_id) DO UPDATE SET included_courses=excluded.included_courses,max_courses=excluded.max_courses,extra_course_monthly_cents=excluded.extra_course_monthly_cents,currency=excluded.currency,offer_valid_days=excluded.offer_valid_days,self_service_expansion=excluded.self_service_expansion,pricing_enabled=excluded.pricing_enabled,updated_at=excluded.updated_at`)
      .bind(planId,included,max,extra,currency,days,self,enabled,nowIso()),
  ]);
  await audit(env.DB,auth.userId,'commerce.plan.updated',undefined,undefined,'plan',planId,{monthly,setup,included,max,extra,currency,days,selfService:!!self,pricingEnabled:!!enabled});
}

export async function getSellerProfile(env:Env,auth:CoreAuthContext):Promise<Record<string,unknown>>{requirePlatform(auth);return await env.DB.prepare('SELECT * FROM seller_billing_profile WHERE id=1').first<Record<string,unknown>>()??{};}
export async function updateSellerProfile(env:Env,auth:CoreAuthContext,input:Record<string,unknown>):Promise<void>{
  requirePlatform(auth);const fields=['legal_name','street','postal_code','city','country','email','phone','website','tax_number','vat_id','iban','bic','invoice_prefix'] as const,current=await getSellerProfile(env,auth),vals=fields.map(k=>safeString(input[k]??current[k],k==='website'?250:200)||null);const prefix=safeString(input.invoice_prefix??current.invoice_prefix??'KP',20).toUpperCase();vals[vals.length-1]=prefix;
  await env.DB.prepare(`UPDATE seller_billing_profile SET legal_name=?,street=?,postal_code=?,city=?,country=?,email=?,phone=?,website=?,tax_number=?,vat_id=?,iban=?,bic=?,invoice_prefix=?,updated_at=? WHERE id=1`).bind(...vals,nowIso()).run();
  await audit(env.DB,auth.userId,'commerce.seller_profile.updated',undefined,undefined,'seller_billing_profile','1');
}

export async function createInitialCommerceBooking(env:Env,args:{tenantId:string;invitationId:string;planId:string;courseCount:number;accepted:boolean;request:Request;actorId:string}):Promise<{quoteId?:string;orderId?:string;invoiceId?:string;price:PriceCalculation}>{
  const price=await calculatePlanPrice(env,args.planId,args.courseCount),ts=nowIso(),snapshot=JSON.stringify(price);
  await env.DB.prepare(`INSERT INTO tenant_entitlements(tenant_id,plan_id,course_limit,currency,recurring_monthly_cents,setup_cents,pricing_snapshot_json,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET plan_id=excluded.plan_id,course_limit=excluded.course_limit,currency=excluded.currency,recurring_monthly_cents=excluded.recurring_monthly_cents,setup_cents=excluded.setup_cents,pricing_snapshot_json=excluded.pricing_snapshot_json,updated_at=excluded.updated_at`)
    .bind(args.tenantId,args.planId,args.courseCount,price.currency,price.pricingReady?price.recurringMonthlyCents:0,price.pricingReady?price.setupCents:0,snapshot,ts).run();
  if(!price.pricingReady||!args.accepted)return{price};
  const qid=id('quo_'),oid=id('ord_'),iid=id('inv_'),valid=new Date(Date.now()+price.offerValidDays*86400000).toISOString(),ip=args.request.headers.get('CF-Connecting-IP')||null,ua=safeString(args.request.headers.get('User-Agent'),500)||null;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO commercial_quotes(id,quote_number,onboarding_invitation_id,tenant_id,plan_id,requested_courses,currency,recurring_monthly_cents,setup_cents,first_total_cents,status,valid_until,pricing_snapshot_json,accepted_at,accepted_ip,accepted_user_agent,created_at,updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'accepted',?,?,?,?,?,?,?)`).bind(qid,docNumber('ANG'),args.invitationId,args.tenantId,args.planId,args.courseCount,price.currency,price.recurringMonthlyCents,price.setupCents,price.firstTotalCents,valid,snapshot,ts,ip,ua,ts,ts),
    env.DB.prepare(`INSERT INTO commercial_orders(id,order_number,tenant_id,quote_id,plan_id,course_limit,status,currency,recurring_monthly_cents,setup_cents,booked_at)
      VALUES(?,?,?,?,?,?,'pending_payment',?,?,?,?)`).bind(oid,docNumber('AUF'),args.tenantId,qid,args.planId,args.courseCount,price.currency,price.recurringMonthlyCents,price.setupCents,ts),
    env.DB.prepare(`INSERT INTO commercial_invoices(id,invoice_number,tenant_id,order_id,type,status,currency,net_cents,tax_cents,gross_cents,snapshot_json,created_at)
      VALUES(?,?,?,?,'initial','pending_provider',?,?,0,?,?,?)`).bind(iid,docNumber('ENTW'),args.tenantId,oid,price.currency,price.firstTotalCents,price.firstTotalCents,snapshot,ts),
  ]);
  await audit(env.DB,args.actorId,'commerce.initial_booking.created',args.tenantId,undefined,'order',oid,{quoteId:qid,invoiceId:iid,courseCount:args.courseCount,monthly:price.recurringMonthlyCents,setup:price.setupCents});
  return{quoteId:qid,orderId:oid,invoiceId:iid,price};
}

async function billingSummaryBase(env:Env,auth:CoreAuthContext,tenantId:string):Promise<Record<string,unknown>>{
  requireRole(auth,'tenant_admin');const entitlement=await env.DB.prepare(`SELECT e.*,p.name AS plan_name FROM tenant_entitlements e LEFT JOIN plans p ON p.id=e.plan_id WHERE e.tenant_id=?`).bind(tenantId).first<Record<string,unknown>>();
  const sub=await env.DB.prepare('SELECT * FROM subscriptions WHERE tenant_id=?').bind(tenantId).first<Record<string,unknown>>();
  const invoices=await env.DB.prepare('SELECT id,invoice_number,type,status,currency,net_cents,tax_cents,gross_cents,due_at,paid_at,created_at FROM commercial_invoices WHERE tenant_id=? ORDER BY created_at DESC LIMIT 25').bind(tenantId).all();
  const plans=await env.DB.prepare(`SELECT p.id,p.name,p.monthly_price_cents,p.setup_price_cents,r.included_courses,r.max_courses,r.extra_course_monthly_cents,r.currency,r.self_service_expansion,r.pricing_enabled FROM plans p LEFT JOIN plan_commerce_rules r ON r.plan_id=p.id WHERE p.is_active=1 ORDER BY COALESCE(p.monthly_price_cents,0)`).all();
  return{entitlement,subscription:sub,invoices:invoices.results??[],plans:plans.results??[]};
}

export async function billingSummary(env:Env,auth:CoreAuthContext,tenantId:string):Promise<Record<string,unknown>>{
  const result=await billingSummaryBase(env,auth,tenantId);
  const provider=await env.DB.prepare('SELECT provider,status,automatic_collection FROM billing_provider_state WHERE id=1').first<Record<string,unknown>>();
  return{...result,billingProvider:provider};
}

export async function billingSummaryWithoutPayments(env:Env,auth:CoreAuthContext,tenantId:string):Promise<Record<string,unknown>>{
  return{...await billingSummaryBase(env,auth,tenantId),billingProvider:{provider:'manual',status:'disabled',automatic_collection:0}};
}

export async function quoteExpansion(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>):Promise<Record<string,unknown>>{
  requireRole(auth,'tenant_admin');const cur=await env.DB.prepare('SELECT plan_id,course_limit,recurring_monthly_cents,currency FROM tenant_entitlements WHERE tenant_id=?').bind(tenantId).first<{plan_id:string;course_limit:number|null;recurring_monthly_cents:number;currency:string}>();if(!cur)throw new Error('ENTITLEMENT_NOT_FOUND');
  const targetPlan=safeString(input.plan_id||cur.plan_id,80),targetCourses=int(input.course_count??cur.course_limit??1,1,10000),price=await calculatePlanPrice(env,targetPlan,targetCourses);if(!price.pricingReady)throw new Error('PRICING_NOT_CONFIGURED');if(!price.selfServiceExpansion)throw new Error('SELF_SERVICE_EXPANSION_DISABLED');
  const oldCourses=cur.course_limit??0;if(targetCourses<oldCourses)throw new Error('SELF_SERVICE_DOWNGRADE_NOT_ALLOWED');if(price.recurringMonthlyCents<Number(cur.recurring_monthly_cents||0))throw new Error('SELF_SERVICE_DOWNGRADE_NOT_ALLOWED');if(targetPlan===cur.plan_id&&targetCourses===oldCourses)throw new Error('NO_CHANGE');
  const monthlyDifference=Math.max(0,price.recurringMonthlyCents-Number(cur.recurring_monthly_cents||0));
  return{fromPlanId:cur.plan_id,toPlanId:targetPlan,fromCourseCount:cur.course_limit,toCourseCount:targetCourses,oldMonthlyCents:Number(cur.recurring_monthly_cents||0),newMonthlyCents:price.recurringMonthlyCents,monthlyDifferenceCents:monthlyDifference,currency:price.currency,price};
}

export async function requestExpansion(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>):Promise<Record<string,unknown>>{
  const quote=await quoteExpansion(env,auth,tenantId,input) as any,ts=nowIso(),changeId=id('chg_'),invoiceId=id('inv_'),snapshot=JSON.stringify(quote),provider=await env.DB.prepare('SELECT provider,status,automatic_collection FROM billing_provider_state WHERE id=1').first<{provider:string;status:string;automatic_collection:number}>();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO subscription_changes(id,tenant_id,from_plan_id,to_plan_id,from_course_limit,to_course_limit,old_monthly_cents,new_monthly_cents,immediate_charge_cents,status,requested_by,requested_at,pricing_snapshot_json)
      VALUES(?,?,?,?,?,?,?,?,?,'pending_payment',?,?,?)`).bind(changeId,tenantId,quote.fromPlanId,quote.toPlanId,quote.fromCourseCount,quote.toCourseCount,quote.oldMonthlyCents,quote.newMonthlyCents,quote.monthlyDifferenceCents,auth.userId,ts,snapshot),
    env.DB.prepare(`INSERT INTO commercial_invoices(id,invoice_number,tenant_id,change_id,type,status,currency,net_cents,tax_cents,gross_cents,external_provider,snapshot_json,created_at)
      VALUES(?,?,?,?,'upgrade','pending_provider',?,?,0,?,?,?,?)`).bind(invoiceId,docNumber('ENTW'),tenantId,changeId,quote.currency,quote.monthlyDifferenceCents,quote.monthlyDifferenceCents,provider?.provider||null,snapshot,ts),
  ]);
  await audit(env.DB,auth.userId,'commerce.expansion.requested',tenantId,undefined,'subscription_change',changeId,{invoiceId,...quote});
  return{changeId,invoiceId,status:'pending_payment',paymentProviderConnected:provider?.status==='active'&&!!provider.automatic_collection,quote};
}

export async function enforceCourseEntitlement(env:Env,tenantId:string):Promise<void>{
  const e=await env.DB.prepare('SELECT course_limit FROM tenant_entitlements WHERE tenant_id=?').bind(tenantId).first<{course_limit:number|null}>();if(!e||e.course_limit===null)return;const c=await env.DB.prepare('SELECT COUNT(*) AS n FROM courses WHERE tenant_id=? AND is_active=1').bind(tenantId).first<{n:number}>();if(Number(c?.n??0)>=Number(e.course_limit))throw new Error('COURSE_LIMIT_REACHED');
}
