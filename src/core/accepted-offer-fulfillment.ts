import type { Env } from './types.js';
import { audit } from './audit.js';
import { acceptedQuoteForOnboarding } from './platform-offers.js';
import { id, nowIso } from './utils.js';

function number(prefix:string):string{const d=new Date(),date=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;return `${prefix}-${date}-${id('').replace(/[^a-zA-Z0-9]/g,'').slice(-8).toUpperCase()}`;}

export async function startPilotFromAcceptedOffer(env:Env,args:{tenantId:string;quoteId:string;invitationId:string;actorId:string}){
  const {row,offer}=await acceptedQuoteForOnboarding(env,args.quoteId);if(String(offer.offerKind)!=='pilot')throw new Error('OFFER_NOT_PILOT');
  const now=new Date(),days=Math.max(1,Math.min(365,Number(offer.pilotDays||90))),readOnly=Math.max(1,Math.min(60,Number(offer.pilotReadOnlyDays||14))),limit=Math.max(1,Math.min(10_000,Number(offer.pilotCourseLimit||row.requested_courses||1))),trialEnd=new Date(now.getTime()+days*86400000),readOnlyEnd=new Date(trialEnd.getTime()+readOnly*86400000),ts=now.toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tenant_trials(tenant_id,target_plan_id,requested_course_count,trial_course_limit,status,started_at,trial_ends_at,read_only_ends_at,setup_option_id,pricing_snapshot_json,updated_at)
      VALUES(?,?,?,?,'active',?,?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET target_plan_id=excluded.target_plan_id,requested_course_count=excluded.requested_course_count,trial_course_limit=excluded.trial_course_limit,status='active',started_at=excluded.started_at,trial_ends_at=excluded.trial_ends_at,read_only_ends_at=excluded.read_only_ends_at,converted_at=NULL,setup_option_id=excluded.setup_option_id,pricing_snapshot_json=excluded.pricing_snapshot_json,updated_at=excluded.updated_at`)
      .bind(args.tenantId,row.plan_id,row.requested_courses,limit,ts,trialEnd.toISOString(),readOnlyEnd.toISOString(),'self_service',JSON.stringify(offer),ts),
    env.DB.prepare(`INSERT INTO tenant_entitlements(tenant_id,plan_id,course_limit,currency,recurring_monthly_cents,setup_cents,pricing_snapshot_json,updated_at)
      VALUES(?,?,?,?,0,0,?,?) ON CONFLICT(tenant_id) DO UPDATE SET plan_id=excluded.plan_id,course_limit=excluded.course_limit,currency=excluded.currency,recurring_monthly_cents=0,setup_cents=0,pricing_snapshot_json=excluded.pricing_snapshot_json,updated_at=excluded.updated_at`)
      .bind(args.tenantId,row.plan_id,limit,row.currency,JSON.stringify(offer),ts),
    env.DB.prepare("UPDATE subscriptions SET plan_id=?,status='trial',starts_at=?,ends_at=? WHERE tenant_id=?").bind(row.plan_id,ts,trialEnd.toISOString(),args.tenantId),
    env.DB.prepare('UPDATE commercial_quotes SET tenant_id=?,onboarding_invitation_id=?,updated_at=? WHERE id=?').bind(args.tenantId,args.invitationId,ts,row.id),
  ]);
  await audit(env.DB,args.actorId,'commerce.pilot.started_from_offer',args.tenantId,undefined,'commercial_quote',row.id,{days,readOnlyDays:readOnly,courseLimit:limit,quoteNumber:row.quote_number});
  return{status:'active',trialEndsAt:trialEnd.toISOString(),readOnlyEndsAt:readOnlyEnd.toISOString(),trialCourseLimit:limit,targetOffer:offer,quoteId:row.id,quoteNumber:row.quote_number};
}

export async function createPaidBookingFromAcceptedOffer(env:Env,args:{tenantId:string;quoteId:string;invitationId:string;actorId:string}){
  const {row,offer}=await acceptedQuoteForOnboarding(env,args.quoteId);if(String(offer.offerKind)!=='paid')throw new Error('OFFER_NOT_PAID');
  const pending=await env.DB.prepare("SELECT id FROM commercial_orders WHERE tenant_id=? AND status='pending_payment' ORDER BY booked_at DESC LIMIT 1").bind(args.tenantId).first<{id:string}>();if(pending)throw new Error('PAYMENT_ALREADY_PENDING');
  const recurring=Number(offer.recurringMonthlyCents??row.recurring_monthly_cents),setup=Number(offer.managedSetupCents??row.setup_cents),first=Number(offer.firstTotalCents??row.first_total_cents);if(!Number.isFinite(recurring)||recurring<1||!Number.isFinite(setup)||setup<0||!Number.isFinite(first)||first<1)throw new Error('ACCEPTED_OFFER_PRICE_INVALID');
  const ts=nowIso(),orderId=id('ord_'),invoiceId=id('inv_'),snapshot=JSON.stringify(offer);
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO tenant_entitlements(tenant_id,plan_id,course_limit,currency,recurring_monthly_cents,setup_cents,pricing_snapshot_json,updated_at)
      VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET plan_id=excluded.plan_id,course_limit=excluded.course_limit,currency=excluded.currency,recurring_monthly_cents=excluded.recurring_monthly_cents,setup_cents=excluded.setup_cents,pricing_snapshot_json=excluded.pricing_snapshot_json,updated_at=excluded.updated_at`)
      .bind(args.tenantId,row.plan_id,row.requested_courses,row.currency,recurring,setup,snapshot,ts),
    env.DB.prepare(`INSERT INTO commercial_orders(id,order_number,tenant_id,quote_id,plan_id,course_limit,status,currency,recurring_monthly_cents,setup_cents,booked_at)
      VALUES(?,?,?,?,?,?,'pending_payment',?,?,?,?)`).bind(orderId,number('AUF'),args.tenantId,row.id,row.plan_id,row.requested_courses,row.currency,recurring,setup,ts),
    env.DB.prepare(`INSERT INTO commercial_invoices(id,invoice_number,tenant_id,order_id,type,status,currency,net_cents,tax_cents,gross_cents,snapshot_json,created_at)
      VALUES(?,?,?,?,'initial','pending_provider',?,?,0,?,?,?)`).bind(invoiceId,number('ENTW'),args.tenantId,orderId,row.currency,first,first,snapshot,ts),
    env.DB.prepare("UPDATE subscriptions SET plan_id=?,status='past_due',starts_at=?,ends_at=NULL WHERE tenant_id=?").bind(row.plan_id,ts,args.tenantId),
    env.DB.prepare('UPDATE commercial_quotes SET tenant_id=?,onboarding_invitation_id=?,updated_at=? WHERE id=?').bind(args.tenantId,args.invitationId,ts,row.id),
  ]);
  await audit(env.DB,args.actorId,'commerce.booking.created_from_offer',args.tenantId,undefined,'order',orderId,{quoteId:row.id,quoteNumber:row.quote_number,invoiceId,planId:row.plan_id,courseCount:row.requested_courses,recurringMonthlyCents:recurring,setupCents:setup,firstTotalCents:first,manualPricing:!!offer.manualPricing});
  return{quoteId:row.id,orderId,invoiceId,status:'pending_payment',offer};
}
