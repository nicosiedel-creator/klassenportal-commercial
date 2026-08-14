import type { CoreAuthContext, Env } from './types.js';
import { billingSummary, quoteExpansion, requestExpansion } from './commerce.js';
import { createPaidBooking } from './commerce-offers.js';
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
  return{...result,billingProvider:provider};
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
