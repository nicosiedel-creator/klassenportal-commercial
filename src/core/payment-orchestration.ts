import type { CoreAuthContext, Env } from './types.js';
import { billingSummary, quoteExpansion, requestExpansion } from './commerce.js';
import { createPaidBooking } from './commerce-offers.js';
import { requireRole } from './permissions.js';
import { applyStripeExpansion, createStripeCheckout, previewStripeExpansion, syncStripeProviderState } from './stripe.js';
import { nowIso } from './utils.js';

export async function createPaidBookingWithStripe(env:Env,args:Parameters<typeof createPaidBooking>[1]):Promise<Record<string,unknown>>{
  const booking=await createPaidBooking(env,args) as Record<string,any>;
  const orderId=String(booking.orderId||''),invoiceId=String(booking.invoiceId||'');
  if(!orderId||!invoiceId||!booking.offer)throw new Error('PAYMENT_BOOKING_INVALID');
  try{
    const checkout=await createStripeCheckout(env,{tenantId:args.tenantId,orderId,invoiceId,offer:booking.offer,request:args.request});
    return{...booking,...checkout,paymentProvider:'stripe'};
  }catch(e){
    await env.DB.batch([
      env.DB.prepare("UPDATE commercial_orders SET status='cancelled',cancelled_at=? WHERE id=? AND tenant_id=? AND status='pending_payment'").bind(nowIso(),orderId,args.tenantId),
      env.DB.prepare("UPDATE commercial_invoices SET status='failed',external_provider='stripe' WHERE id=? AND tenant_id=? AND status='pending_provider'").bind(invoiceId,args.tenantId),
    ]);
    throw e;
  }
}

export async function billingSummaryWithStripe(env:Env,auth:CoreAuthContext,tenantId:string):Promise<Record<string,unknown>>{
  const provider=await syncStripeProviderState(env);
  const result=await billingSummary(env,auth,tenantId);
  const paymentAccount=await env.DB.prepare(`SELECT provider,stripe_customer_id,stripe_subscription_id,stripe_checkout_session_id,stripe_subscription_status,billing_cycle,current_plan_id,current_course_limit,current_period_end,cancel_at_period_end,last_invoice_id,updated_at
    FROM tenant_payment_accounts WHERE tenant_id=?`).bind(tenantId).first<Record<string,unknown>>();
  return{...result,billingProvider:provider,paymentAccount:paymentAccount??null};
}

export async function retryInitialCheckout(env:Env,auth:CoreAuthContext,tenantId:string,request:Request):Promise<Record<string,unknown>>{
  requireRole(auth,'tenant_admin');
  const row=await env.DB.prepare(`SELECT o.id AS order_id,o.status AS order_status,i.id AS invoice_id,i.status AS invoice_status,i.snapshot_json
    FROM commercial_orders o JOIN commercial_invoices i ON i.order_id=o.id
    WHERE o.tenant_id=? AND i.type='initial' AND o.status IN ('pending_payment','cancelled') AND i.status IN ('pending_provider','failed','open','void')
    ORDER BY o.booked_at DESC,i.created_at DESC LIMIT 1`).bind(tenantId).first<{order_id:string;order_status:string;invoice_id:string;invoice_status:string;snapshot_json:string}>();
  if(!row)throw new Error('PAYMENT_RETRY_NOT_FOUND');
  let offer:any;try{offer=JSON.parse(row.snapshot_json);}catch{throw new Error('PAYMENT_SNAPSHOT_INVALID');}
  if(!offer?.planId||!offer?.courseCount||!offer?.billingCycle)throw new Error('PAYMENT_SNAPSHOT_INVALID');
  const ts=nowIso();
  await env.DB.batch([
    env.DB.prepare("UPDATE commercial_orders SET status='pending_payment',cancelled_at=NULL WHERE id=? AND tenant_id=?").bind(row.order_id,tenantId),
    env.DB.prepare("UPDATE commercial_invoices SET status='pending_provider',external_provider='stripe' WHERE id=? AND tenant_id=?").bind(row.invoice_id,tenantId),
  ]);
  try{
    const checkout=await createStripeCheckout(env,{tenantId,orderId:row.order_id,invoiceId:row.invoice_id,offer,request});
    return{orderId:row.order_id,invoiceId:row.invoice_id,...checkout,paymentProvider:'stripe'};
  }catch(e){
    await env.DB.batch([
      env.DB.prepare("UPDATE commercial_orders SET status='cancelled',cancelled_at=? WHERE id=? AND tenant_id=?").bind(ts,row.order_id,tenantId),
      env.DB.prepare("UPDATE commercial_invoices SET status='failed' WHERE id=? AND tenant_id=?").bind(row.invoice_id,tenantId),
    ]);
    throw e;
  }
}

export async function quoteExpansionWithStripe(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>):Promise<Record<string,unknown>>{
  const local=await quoteExpansion(env,auth,tenantId,input) as Record<string,any>;
  const stripe=await previewStripeExpansion(env,tenantId,local.price);
  const immediate=stripe.immediateChargeCents;
  return{
    ...local,
    providerConnected:stripe.providerConnected,
    billingCycle:stripe.billingCycle,
    prorationDate:stripe.prorationDate,
    immediateChargeCents:immediate,
    immediateChargeEstimated:immediate===null,
  };
}

export async function requestExpansionWithStripe(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>):Promise<Record<string,unknown>>{
  const preview=await quoteExpansionWithStripe(env,auth,tenantId,input) as Record<string,any>;
  if(!preview.providerConnected)throw new Error('STRIPE_NOT_CONFIGURED');
  const local=await requestExpansion(env,auth,tenantId,input) as Record<string,any>;
  const changeId=String(local.changeId||''),invoiceId=String(local.invoiceId||'');
  if(!changeId||!invoiceId)throw new Error('PAYMENT_CHANGE_INVALID');
  const immediate=Math.max(0,Number(preview.immediateChargeCents??preview.monthlyDifferenceCents??0));
  await env.DB.batch([
    env.DB.prepare('UPDATE subscription_changes SET immediate_charge_cents=?,pricing_snapshot_json=? WHERE id=? AND tenant_id=?').bind(immediate,JSON.stringify(preview),changeId,tenantId),
    env.DB.prepare('UPDATE commercial_invoices SET net_cents=?,gross_cents=?,snapshot_json=? WHERE id=? AND tenant_id=?').bind(immediate,immediate,JSON.stringify(preview),invoiceId,tenantId),
  ]);
  try{
    const stripe=await applyStripeExpansion(env,{tenantId,changeId,invoiceId,targetPrice:preview.price,prorationDate:Number(preview.prorationDate)||null});
    return{...local,quote:preview,...stripe,paymentProviderConnected:true};
  }catch(e){
    await env.DB.batch([
      env.DB.prepare("UPDATE subscription_changes SET status='failed' WHERE id=? AND tenant_id=? AND status='pending_payment'").bind(changeId,tenantId),
      env.DB.prepare("UPDATE commercial_invoices SET status='failed' WHERE id=? AND tenant_id=? AND status IN ('pending_provider','open')").bind(invoiceId,tenantId),
    ]);
    throw e;
  }
}
