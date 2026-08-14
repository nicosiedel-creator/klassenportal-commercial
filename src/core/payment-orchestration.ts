import type { CoreAuthContext, Env } from './types.js';
import { billingSummary, quoteExpansion, requestExpansion } from './commerce.js';
import { createPaidBooking } from './commerce-offers.js';
import { requireRole } from './permissions.js';
import { syncStripeProviderState } from './stripe.js';
import { createTaxStripeCheckout, ensureTaxStripeCatalog } from './stripe-tax-billing.js';
import { nowIso } from './utils.js';

const STRIPE_API='https://api.stripe.com/v1';
async function stripeCall(env:Env,method:'GET'|'POST',path:string,entries:Array<[string,unknown]>=[],idempotency?:string):Promise<Record<string,any>>{
  if(!env.STRIPE_SECRET_KEY)throw new Error('STRIPE_NOT_CONFIGURED');
  const p=new URLSearchParams();for(const [k,v] of entries)if(v!==null&&v!==undefined)p.append(k,String(v));
  let url=`${STRIPE_API}${path}`;if(method==='GET'&&p.toString())url+=`?${p}`;
  const headers:Record<string,string>={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`};if(method==='POST')headers['content-type']='application/x-www-form-urlencoded';if(idempotency)headers['Idempotency-Key']=idempotency.slice(0,255);
  const r=await fetch(url,{method,headers,body:method==='POST'?p:undefined});let d:any={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(`STRIPE_${String(d?.error?.code||d?.error?.type||'API_ERROR').toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`);return d;
}
function stripeId(v:any):string|null{return typeof v==='string'?v:v&&typeof v.id==='string'?v.id:null;}
function subscriptionPreviewItems(sub:Record<string,any>,target:any,extraCourses:number,prefix='subscription_details[items]'):Array<[string,unknown]>{
  const items=Array.isArray(sub?.items?.data)?sub.items.data:[],base=items.find((x:any)=>x?.price?.metadata?.klassenportal_component==='base')??items[0],extra=items.find((x:any)=>x?.price?.metadata?.klassenportal_component==='extra')??items.find((x:any)=>x!==base),e:Array<[string,unknown]>=[];let i=0;
  if(base?.id)e.push([`${prefix}[${i}][id]`,base.id]);e.push([`${prefix}[${i}][price]`,target.base_price_id],[`${prefix}[${i}][quantity]`,1]);i++;
  if(extraCourses>0&&target.extra_price_id){if(extra?.id)e.push([`${prefix}[${i}][id]`,extra.id]);e.push([`${prefix}[${i}][price]`,target.extra_price_id],[`${prefix}[${i}][quantity]`,extraCourses]);}
  else if(extra?.id)e.push([`${prefix}[${i}][id]`,extra.id],[`${prefix}[${i}][deleted]`,'true']);
  return e;
}
async function previewSafeStripeExpansion(env:Env,tenantId:string,targetPrice:any):Promise<{providerConnected:boolean;immediateChargeCents:number|null;prorationDate:number|null;billingCycle:'monthly'|'annual'|null}>{
  const state=await syncStripeProviderState(env),account=await env.DB.prepare('SELECT stripe_subscription_id,billing_cycle FROM tenant_payment_accounts WHERE tenant_id=?').bind(tenantId).first<{stripe_subscription_id:string|null;billing_cycle:string|null}>();
  if(!state.configured||!account?.stripe_subscription_id)return{providerConnected:false,immediateChargeCents:null,prorationDate:null,billingCycle:account?.billing_cycle==='annual'?'annual':account?.billing_cycle==='monthly'?'monthly':null};
  const cycle=account.billing_cycle==='annual'?'annual':'monthly',target=await ensureTaxStripeCatalog(env,targetPrice,cycle),sub=await stripeCall(env,'GET',`/subscriptions/${encodeURIComponent(account.stripe_subscription_id)}`,[['expand[]','items.data.price']]),prorationDate=Math.floor(Date.now()/1000);
  const preview=await stripeCall(env,'POST','/invoices/create_preview',[['subscription',account.stripe_subscription_id],['subscription_details[proration_behavior]','always_invoice'],['subscription_details[proration_date]',prorationDate],...subscriptionPreviewItems(sub,target,targetPrice.extraCourses)]);
  const lines=Array.isArray(preview?.lines?.data)?preview.lines.data:[],prorations=lines.filter((l:any)=>l?.parent?.subscription_item_details?.proration===true||l?.proration===true),amount=prorations.length?prorations.reduce((s:number,l:any)=>s+Number(l.amount||0),0):Number(preview.amount_due??0);
  return{providerConnected:true,immediateChargeCents:Math.max(0,amount),prorationDate,billingCycle:cycle};
}
async function applySafeStripeExpansion(env:Env,args:{tenantId:string;changeId:string;invoiceId:string;targetPrice:any;prorationDate?:number|null}):Promise<{externalInvoiceId:string|null;paymentUrl:string|null;stripeStatus:string}>{
  const account=await env.DB.prepare('SELECT stripe_subscription_id,billing_cycle FROM tenant_payment_accounts WHERE tenant_id=?').bind(args.tenantId).first<{stripe_subscription_id:string|null;billing_cycle:string|null}>();
  if(!account?.stripe_subscription_id)throw new Error('STRIPE_SUBSCRIPTION_NOT_FOUND');
  const cycle=account.billing_cycle==='annual'?'annual':'monthly',target=await ensureTaxStripeCatalog(env,args.targetPrice,cycle),sub=await stripeCall(env,'GET',`/subscriptions/${encodeURIComponent(account.stripe_subscription_id)}`,[['expand[]','items.data.price']]);
  const e:Array<[string,unknown]>=[...subscriptionPreviewItems(sub,target,args.targetPrice.extraCourses,'items'),['proration_behavior','always_invoice'],['payment_behavior','pending_if_incomplete'],['expand[]','latest_invoice']];if(args.prorationDate)e.push(['proration_date',args.prorationDate]);
  const updated=await stripeCall(env,'POST',`/subscriptions/${encodeURIComponent(account.stripe_subscription_id)}`,e,`upgrade:${args.changeId}`),invoice=updated.latest_invoice&&typeof updated.latest_invoice==='object'?updated.latest_invoice:null,externalInvoiceId=stripeId(updated.latest_invoice),paymentUrl=invoice?.hosted_invoice_url?String(invoice.hosted_invoice_url):null;
  await env.DB.batch([
    env.DB.prepare('UPDATE subscription_changes SET external_invoice_id=? WHERE id=? AND tenant_id=?').bind(externalInvoiceId,args.changeId,args.tenantId),
    env.DB.prepare("UPDATE commercial_invoices SET external_provider='stripe',external_invoice_id=?,external_invoice_url=? WHERE id=? AND tenant_id=?").bind(externalInvoiceId,paymentUrl,args.invoiceId,args.tenantId),
  ]);
  return{externalInvoiceId,paymentUrl,stripeStatus:String(updated.status||'unknown')};
}

export async function createPaidBookingWithStripe(env:Env,args:Parameters<typeof createPaidBooking>[1]):Promise<Record<string,unknown>>{
  const booking=await createPaidBooking(env,args) as Record<string,any>;
  const orderId=String(booking.orderId||''),invoiceId=String(booking.invoiceId||'');
  if(!orderId||!invoiceId||!booking.offer)throw new Error('PAYMENT_BOOKING_INVALID');
  try{
    const checkout=await createTaxStripeCheckout(env,{tenantId:args.tenantId,orderId,invoiceId,offer:booking.offer,request:args.request});
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
    const checkout=await createTaxStripeCheckout(env,{tenantId,orderId:row.order_id,invoiceId:row.invoice_id,offer,request});
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
  const stripe=await previewSafeStripeExpansion(env,tenantId,local.price);
  const immediate=stripe.immediateChargeCents;
  return{...local,providerConnected:stripe.providerConnected,billingCycle:stripe.billingCycle,prorationDate:stripe.prorationDate,immediateChargeCents:immediate,immediateChargeEstimated:immediate===null};
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
    const stripe=await applySafeStripeExpansion(env,{tenantId,changeId,invoiceId,targetPrice:preview.price,prorationDate:Number(preview.prorationDate)||null});
    return{...local,quote:preview,...stripe,paymentProviderConnected:true};
  }catch(e){
    await env.DB.batch([
      env.DB.prepare("UPDATE subscription_changes SET status='failed' WHERE id=? AND tenant_id=? AND status='pending_payment'").bind(changeId,tenantId),
      env.DB.prepare("UPDATE commercial_invoices SET status='failed' WHERE id=? AND tenant_id=? AND status IN ('pending_provider','open')").bind(invoiceId,tenantId),
    ]);
    throw e;
  }
}
