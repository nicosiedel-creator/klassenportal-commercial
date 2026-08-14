import type { Env, CoreAuthContext } from './types.js';
import type { CommercialOffer, BillingCycle } from './commerce-offers.js';
import type { PriceCalculation } from './commerce.js';
import { audit } from './audit.js';
import { id, nowIso, safeString } from './utils.js';
import { requireRole } from './permissions.js';

type StripeObj = Record<string, any>;
type CatalogRow = {
  plan_id:string;billing_cycle:BillingCycle;currency:string;base_product_id:string;base_price_id:string;base_amount_cents:number;
  extra_product_id:string|null;extra_price_id:string|null;extra_amount_cents:number|null;
};
type PaymentAccount = {
  tenant_id:string;stripe_customer_id:string|null;stripe_subscription_id:string|null;stripe_checkout_session_id:string|null;
  stripe_subscription_status:string|null;billing_cycle:BillingCycle|null;current_plan_id:string|null;current_course_limit:number|null;
};

const STRIPE_API='https://api.stripe.com/v1';
const enc=new TextEncoder();

function sid(v:any):string|null{
  if(typeof v==='string')return v;
  if(v&&typeof v==='object'&&typeof v.id==='string')return v.id;
  return null;
}
function unixIso(v:any):string|null{
  const n=Number(v);return Number.isFinite(n)&&n>0?new Date(n*1000).toISOString():null;
}
function bool(v:any):boolean{return v===true||v===1||v==='true'||v==='1';}
function form(entries:Array<[string,unknown]>):URLSearchParams{
  const p=new URLSearchParams();for(const [k,v] of entries){if(v===undefined||v===null)continue;p.append(k,String(v));}return p;
}
function stripeMessage(d:any):string{
  const code=safeString(d?.error?.code||d?.error?.type,80);return code?`STRIPE_${code.toUpperCase().replace(/[^A-Z0-9]+/g,'_')}`:'STRIPE_API_ERROR';
}

async function stripeRequest(env:Env,method:'GET'|'POST',path:string,entries:Array<[string,unknown]>=[],idempotencyKey?:string):Promise<StripeObj>{
  if(!env.STRIPE_SECRET_KEY)throw new Error('STRIPE_NOT_CONFIGURED');
  let url=`${STRIPE_API}${path}`;const body=form(entries);
  if(method==='GET'&&body.size)url+=`?${body.toString()}`;
  const headers:Record<string,string>={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`};
  if(method==='POST')headers['content-type']='application/x-www-form-urlencoded';
  if(idempotencyKey)headers['Idempotency-Key']=idempotencyKey.slice(0,255);
  const r=await fetch(url,{method,headers,body:method==='POST'?body:undefined});
  let d:any={};try{d=await r.json();}catch{}
  if(!r.ok)throw new Error(stripeMessage(d));
  return d as StripeObj;
}

export async function syncStripeProviderState(env:Env):Promise<{provider:string;status:string;automatic_collection:number;configured:boolean;livemode:boolean}>{
  const hasKey=!!env.STRIPE_SECRET_KEY,hasWebhook=!!env.STRIPE_WEBHOOK_SECRET,ready=hasKey&&hasWebhook;
  const live=!!env.STRIPE_SECRET_KEY?.startsWith('sk_live_');
  const status=ready?(live?'active':'test'):'not_connected';
  await env.DB.prepare("UPDATE billing_provider_state SET provider='stripe',status=?,automatic_collection=?,updated_at=? WHERE id=1")
    .bind(status,ready?1:0,nowIso()).run();
  return{provider:'stripe',status,automatic_collection:ready?1:0,configured:ready,livemode:live};
}
function requireStripeReady(env:Env):void{if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)throw new Error('STRIPE_NOT_CONFIGURED');}

async function ensureProduct(env:Env,name:string,planId:string,component:'base'|'extra',existing?:string|null):Promise<string>{
  if(existing)return existing;
  const p=await stripeRequest(env,'POST','/products',[
    ['name',name],['metadata[klassenportal_plan_id]',planId],['metadata[klassenportal_component]',component],
  ],`product:${planId}:${component}`);
  const product=sid(p);if(!product)throw new Error('STRIPE_PRODUCT_CREATE_FAILED');return product;
}

export async function ensureStripeCatalog(env:Env,price:PriceCalculation|CommercialOffer,cycle:BillingCycle):Promise<CatalogRow>{
  requireStripeReady(env);
  const annualMonths='annualMonthsCharged' in price?Number((price as CommercialOffer).annualMonthsCharged||10):10;
  const baseAmount=cycle==='annual'?Number(price.monthlyBaseCents)*annualMonths:Number(price.monthlyBaseCents);
  const extraMonth=price.extraCourseMonthlyCents===null?null:Number(price.extraCourseMonthlyCents);
  const extraAmount=extraMonth===null?null:(cycle==='annual'?extraMonth*annualMonths:extraMonth);
  const currency=String(price.currency||'EUR').toUpperCase();
  let row=await env.DB.prepare('SELECT * FROM stripe_plan_prices WHERE plan_id=? AND billing_cycle=?').bind(price.planId,cycle).first<CatalogRow>();
  const baseProduct=await ensureProduct(env,`Klassenportal ${price.planName}`,price.planId,'base',row?.base_product_id);
  const extraProduct=extraAmount!==null?await ensureProduct(env,`Klassenportal ${price.planName} – zusätzliche Klasse/Kurs`,price.planId,'extra',row?.extra_product_id):null;
  let basePrice=row?.base_price_id||null,extraPrice=row?.extra_price_id||null;
  if(!row||Number(row.base_amount_cents)!==baseAmount||row.currency!==currency){
    const p=await stripeRequest(env,'POST','/prices',[
      ['currency',currency.toLowerCase()],['unit_amount',baseAmount],['product',baseProduct],['recurring[interval]',cycle==='annual'?'year':'month'],
      ['nickname',`${price.planName} ${cycle==='annual'?'jährlich':'monatlich'}`],
      ['metadata[klassenportal_plan_id]',price.planId],['metadata[klassenportal_component]','base'],['metadata[klassenportal_cycle]',cycle],
    ],`price:${price.planId}:${cycle}:base:${baseAmount}:${currency}`);
    basePrice=sid(p);if(!basePrice)throw new Error('STRIPE_PRICE_CREATE_FAILED');
  }
  if(extraAmount!==null&&extraProduct&&(!row||Number(row.extra_amount_cents)!==extraAmount||row.currency!==currency||!extraPrice)){
    const p=await stripeRequest(env,'POST','/prices',[
      ['currency',currency.toLowerCase()],['unit_amount',extraAmount],['product',extraProduct],['recurring[interval]',cycle==='annual'?'year':'month'],
      ['nickname',`${price.planName} Zusatzklasse ${cycle==='annual'?'jährlich':'monatlich'}`],
      ['metadata[klassenportal_plan_id]',price.planId],['metadata[klassenportal_component]','extra'],['metadata[klassenportal_cycle]',cycle],
    ],`price:${price.planId}:${cycle}:extra:${extraAmount}:${currency}`);
    extraPrice=sid(p);if(!extraPrice)throw new Error('STRIPE_PRICE_CREATE_FAILED');
  }
  const ts=nowIso();
  await env.DB.prepare(`INSERT INTO stripe_plan_prices(plan_id,billing_cycle,currency,base_product_id,base_price_id,base_amount_cents,extra_product_id,extra_price_id,extra_amount_cents,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plan_id,billing_cycle) DO UPDATE SET currency=excluded.currency,base_product_id=excluded.base_product_id,base_price_id=excluded.base_price_id,base_amount_cents=excluded.base_amount_cents,extra_product_id=excluded.extra_product_id,extra_price_id=excluded.extra_price_id,extra_amount_cents=excluded.extra_amount_cents,updated_at=excluded.updated_at`)
    .bind(price.planId,cycle,currency,baseProduct,basePrice,baseAmount,extraProduct,extraPrice,extraAmount,ts).run();
  row={plan_id:price.planId,billing_cycle:cycle,currency,base_product_id:baseProduct,base_price_id:basePrice!,base_amount_cents:baseAmount,extra_product_id:extraProduct,extra_price_id:extraPrice,extra_amount_cents:extraAmount};
  return row;
}

async function tenantProfile(env:Env,tenantId:string):Promise<Record<string,unknown>>{
  return await env.DB.prepare('SELECT legal_name,contact_name,contact_email,billing_email,street,postal_code,city,country FROM tenant_profiles WHERE tenant_id=?').bind(tenantId).first<Record<string,unknown>>()??{};
}
async function paymentAccount(env:Env,tenantId:string):Promise<PaymentAccount|null>{
  return env.DB.prepare('SELECT tenant_id,stripe_customer_id,stripe_subscription_id,stripe_checkout_session_id,stripe_subscription_status,billing_cycle,current_plan_id,current_course_limit FROM tenant_payment_accounts WHERE tenant_id=?').bind(tenantId).first<PaymentAccount>();
}

export async function createStripeCheckout(env:Env,args:{tenantId:string;orderId:string;invoiceId:string;offer:CommercialOffer;request:Request}):Promise<{checkoutSessionId:string;checkoutUrl:string}>{
  requireStripeReady(env);await syncStripeProviderState(env);
  const catalog=await ensureStripeCatalog(env,args.offer,args.offer.billingCycle),profile=await tenantProfile(env,args.tenantId),account=await paymentAccount(env,args.tenantId);
  const origin=env.APP_ORIGIN||new URL(args.request.url).origin;
  const entries:Array<[string,unknown]>=[
    ['mode','subscription'],['locale','de'],['client_reference_id',args.orderId],
    ['success_url',`${origin}/zahlung/erfolg?session_id={CHECKOUT_SESSION_ID}`],['cancel_url',`${origin}/zahlung/abgebrochen`],
    ['payment_method_types[0]','card'],['payment_method_types[1]','sepa_debit'],
    ['billing_address_collection','required'],['tax_id_collection[enabled]','true'],
    ['line_items[0][price]',catalog.base_price_id],['line_items[0][quantity]','1'],
    ['metadata[tenant_id]',args.tenantId],['metadata[order_id]',args.orderId],['metadata[invoice_id]',args.invoiceId],
    ['metadata[plan_id]',args.offer.planId],['metadata[course_limit]',args.offer.courseCount],['metadata[billing_cycle]',args.offer.billingCycle],
    ['subscription_data[metadata][tenant_id]',args.tenantId],['subscription_data[metadata][order_id]',args.orderId],
    ['subscription_data[metadata][plan_id]',args.offer.planId],['subscription_data[metadata][course_limit]',args.offer.courseCount],['subscription_data[metadata][billing_cycle]',args.offer.billingCycle],
  ];
  let line=1;
  if(args.offer.extraCourses>0&&catalog.extra_price_id){entries.push([`line_items[${line}][price]`,catalog.extra_price_id],[`line_items[${line}][quantity]`,args.offer.extraCourses]);line++;}
  if(args.offer.managedSetupCents>0){entries.push(
    [`line_items[${line}][price_data][currency]`,args.offer.currency.toLowerCase()],
    [`line_items[${line}][price_data][unit_amount]`,args.offer.managedSetupCents],
    [`line_items[${line}][price_data][product_data][name]`,args.offer.managedSetupName],
    [`line_items[${line}][quantity]`,'1'],
  );}
  if(account?.stripe_customer_id)entries.push(['customer',account.stripe_customer_id]);
  else entries.push(['customer_email',safeString(profile.billing_email||profile.contact_email,250)]);
  const session=await stripeRequest(env,'POST','/checkout/sessions',entries,`checkout:${args.orderId}`),sessionId=sid(session),url=String(session.url||'');
  if(!sessionId||!url)throw new Error('STRIPE_CHECKOUT_CREATE_FAILED');
  const ts=nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE commercial_orders SET external_checkout_id=? WHERE id=? AND tenant_id=?').bind(sessionId,args.orderId,args.tenantId),
    env.DB.prepare(`INSERT INTO tenant_payment_accounts(tenant_id,provider,stripe_customer_id,stripe_subscription_id,stripe_checkout_session_id,billing_cycle,current_plan_id,current_course_limit,updated_at)
      VALUES(?,'stripe',?,?,?, ?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_checkout_session_id=excluded.stripe_checkout_session_id,billing_cycle=excluded.billing_cycle,current_plan_id=excluded.current_plan_id,current_course_limit=excluded.current_course_limit,updated_at=excluded.updated_at`)
      .bind(args.tenantId,account?.stripe_customer_id??null,account?.stripe_subscription_id??null,sessionId,args.offer.billingCycle,args.offer.planId,args.offer.courseCount,ts),
  ]);
  return{checkoutSessionId:sessionId,checkoutUrl:url};
}

async function ensurePortalConfiguration(env:Env):Promise<string>{
  requireStripeReady(env);
  const state=await env.DB.prepare('SELECT external_config_id FROM billing_provider_state WHERE id=1').first<{external_config_id:string|null}>();
  if(state?.external_config_id)return state.external_config_id;
  const c=await stripeRequest(env,'POST','/billing_portal/configurations',[
    ['name','Klassenportal Kundenportal'],
    ['features[customer_update][enabled]','true'],
    ['features[customer_update][allowed_updates][0]','address'],['features[customer_update][allowed_updates][1]','email'],['features[customer_update][allowed_updates][2]','name'],['features[customer_update][allowed_updates][3]','phone'],['features[customer_update][allowed_updates][4]','tax_id'],
    ['features[invoice_history][enabled]','true'],['features[payment_method_update][enabled]','true'],
    ['features[subscription_cancel][enabled]','false'],['features[subscription_update][enabled]','false'],
  ],'portal-config:klassenportal-v1');
  const cid=sid(c);if(!cid)throw new Error('STRIPE_PORTAL_CONFIG_FAILED');
  await env.DB.prepare('UPDATE billing_provider_state SET external_config_id=?,updated_at=? WHERE id=1').bind(cid,nowIso()).run();return cid;
}

export async function createStripePortalSession(env:Env,auth:CoreAuthContext,tenantId:string,request:Request):Promise<{url:string}>{
  requireRole(auth,'tenant_admin');requireStripeReady(env);
  const a=await paymentAccount(env,tenantId);if(!a?.stripe_customer_id)throw new Error('STRIPE_CUSTOMER_NOT_FOUND');
  const origin=env.APP_ORIGIN||new URL(request.url).origin,configuration=await ensurePortalConfiguration(env);
  const s=await stripeRequest(env,'POST','/billing_portal/sessions', [['customer',a.stripe_customer_id],['configuration',configuration],['return_url',`${origin}/`]]);
  if(!s.url)throw new Error('STRIPE_PORTAL_SESSION_FAILED');return{url:String(s.url)};
}

function subscriptionItemsPayload(sub:StripeObj,target:CatalogRow,extraCourses:number):{entries:Array<[string,unknown]>;prorationDate:number}{
  const items=Array.isArray(sub?.items?.data)?sub.items.data:[];
  const currentBase=items.find((x:any)=>x?.price?.metadata?.klassenportal_component==='base')??items[0];
  const currentExtra=items.find((x:any)=>x?.price?.metadata?.klassenportal_component==='extra')??items.find((x:any)=>x!==currentBase);
  const entries:Array<[string,unknown]>=[];let i=0;
  if(currentBase?.id){entries.push([`subscription_details[items][${i}][id]`,currentBase.id],[`subscription_details[items][${i}][price]`,target.base_price_id],[`subscription_details[items][${i}][quantity]`,1]);i++;}
  else entries.push([`subscription_details[items][${i}][price]`,target.base_price_id],[`subscription_details[items][${i}][quantity]`,1]),i++;
  if(extraCourses>0&&target.extra_price_id){
    if(currentExtra?.id)entries.push([`subscription_details[items][${i}][id]`,currentExtra.id]);
    entries.push([`subscription_details[items][${i}][price]`,target.extra_price_id],[`subscription_details[items][${i}][quantity]`,extraCourses]);i++;
  }else if(currentExtra?.id){entries.push([`subscription_details[items][${i}][id]`,currentExtra.id],[`subscription_details[items][${i}][deleted]`,'true']);i++;}
  return{entries,prorationDate:Math.floor(Date.now()/1000)};
}
function updateItemsPayload(sub:StripeObj,target:CatalogRow,extraCourses:number):Array<[string,unknown]>{
  const items=Array.isArray(sub?.items?.data)?sub.items.data:[];
  const currentBase=items.find((x:any)=>x?.price?.metadata?.klassenportal_component==='base')??items[0];
  const currentExtra=items.find((x:any)=>x?.price?.metadata?.klassenportal_component==='extra')??items.find((x:any)=>x!==currentBase);
  const entries:Array<[string,unknown]>=[];let i=0;
  if(currentBase?.id)entries.push([`items[${i}][id]`,currentBase.id]);entries.push([`items[${i}][price]`,target.base_price_id],[`items[${i}][quantity]`,1]);i++;
  if(extraCourses>0&&target.extra_price_id){if(currentExtra?.id)entries.push([`items[${i}][id]`,currentExtra.id]);entries.push([`items[${i}][price]`,target.extra_price_id],[`items[${i}][quantity]`,extraCourses]);i++;}
  else if(currentExtra?.id){entries.push([`items[${i}][id]`,currentExtra.id],[`items[${i}][deleted]`,'true']);}
  return entries;
}

export async function previewStripeExpansion(env:Env,tenantId:string,targetPrice:PriceCalculation):Promise<{providerConnected:boolean;immediateChargeCents:number|null;prorationDate:number|null;billingCycle:BillingCycle|null}>{
  const state=await syncStripeProviderState(env),a=await paymentAccount(env,tenantId);if(!state.configured||!a?.stripe_subscription_id)return{providerConnected:false,immediateChargeCents:null,prorationDate:null,billingCycle:a?.billing_cycle??null};
  const cycle=a.billing_cycle||'monthly',target=await ensureStripeCatalog(env,targetPrice,cycle),sub=await stripeRequest(env,'GET',`/subscriptions/${encodeURIComponent(a.stripe_subscription_id)}`,[['expand[]','items.data.price']]);
  const x=subscriptionItemsPayload(sub,target,targetPrice.extraCourses),entries:Array<[string,unknown]>=[['subscription',a.stripe_subscription_id],['subscription_details[proration_behavior]','always_invoice'],['subscription_details[proration_date]',x.prorationDate],...x.entries];
  const preview=await stripeRequest(env,'POST','/invoices/create_preview',entries);
  let amount=0;const lines=Array.isArray(preview?.lines?.data)?preview.lines.data:[];
  const prorations=lines.filter((l:any)=>bool(l?.parent?.subscription_item_details?.proration)||bool(l?.proration));
  if(prorations.length)amount=prorations.reduce((s:number,l:any)=>s+Number(l.amount||0),0);else amount=Number(preview.amount_due??0);
  return{providerConnected:true,immediateChargeCents:Math.max(0,amount),prorationDate:x.prorationDate,billingCycle:cycle};
}

export async function applyStripeExpansion(env:Env,args:{tenantId:string;changeId:string;invoiceId:string;targetPrice:PriceCalculation;prorationDate?:number|null}):Promise<{externalInvoiceId:string|null;paymentUrl:string|null;stripeStatus:string}>{
  requireStripeReady(env);const a=await paymentAccount(env,args.tenantId);if(!a?.stripe_subscription_id)throw new Error('STRIPE_SUBSCRIPTION_NOT_FOUND');
  const cycle=a.billing_cycle||'monthly',target=await ensureStripeCatalog(env,args.targetPrice,cycle),sub=await stripeRequest(env,'GET',`/subscriptions/${encodeURIComponent(a.stripe_subscription_id)}`,[['expand[]','items.data.price']]);
  const entries:Array<[string,unknown]>=[...updateItemsPayload(sub,target,args.targetPrice.extraCourses),['proration_behavior','always_invoice'],['payment_behavior','pending_if_incomplete'],['metadata[tenant_id]',args.tenantId],['metadata[plan_id]',args.targetPrice.planId],['metadata[course_limit]',args.targetPrice.courseCount],['metadata[billing_cycle]',cycle],['expand[]','latest_invoice']];
  if(args.prorationDate)entries.push(['proration_date',args.prorationDate]);
  const updated=await stripeRequest(env,'POST',`/subscriptions/${encodeURIComponent(a.stripe_subscription_id)}`,entries,`upgrade:${args.changeId}`),invoice=updated.latest_invoice&&typeof updated.latest_invoice==='object'?updated.latest_invoice:null,externalInvoiceId=sid(updated.latest_invoice),paymentUrl=invoice?.hosted_invoice_url?String(invoice.hosted_invoice_url):null;
  await env.DB.batch([
    env.DB.prepare('UPDATE subscription_changes SET external_invoice_id=? WHERE id=? AND tenant_id=?').bind(externalInvoiceId,args.changeId,args.tenantId),
    env.DB.prepare("UPDATE commercial_invoices SET external_provider='stripe',external_invoice_id=?,external_invoice_url=? WHERE id=? AND tenant_id=?").bind(externalInvoiceId,paymentUrl,args.invoiceId,args.tenantId),
  ]);
  return{externalInvoiceId,paymentUrl,stripeStatus:String(updated.status||'unknown')};
}

async function hmacHex(secret:string,payload:string):Promise<string>{
  const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const sig=await crypto.subtle.sign('HMAC',key,enc.encode(payload));return [...new Uint8Array(sig)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
function sameHex(a:string,b:string):boolean{if(a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;}
async function verifyWebhook(env:Env,raw:string,header:string|null):Promise<boolean>{
  if(!env.STRIPE_WEBHOOK_SECRET||!header)return false;let timestamp='';const signatures:string[]=[];
  for(const part of header.split(',')){const [k,v]=part.trim().split('=',2);if(k==='t')timestamp=v||'';if(k==='v1'&&v)signatures.push(v);}
  const t=Number(timestamp);if(!Number.isFinite(t)||Math.abs(Math.floor(Date.now()/1000)-t)>300||!signatures.length)return false;
  const expected=await hmacHex(env.STRIPE_WEBHOOK_SECRET,`${timestamp}.${raw}`);return signatures.some(x=>sameHex(x,expected));
}

async function resolveTenant(env:Env,obj:StripeObj):Promise<string|null>{
  const direct=safeString(obj?.metadata?.tenant_id||obj?.parent?.subscription_details?.metadata?.tenant_id,120);if(direct)return direct;
  const customer=sid(obj.customer),subscription=sid(obj.subscription)||sid(obj?.parent?.subscription_details?.subscription);
  if(subscription){const a=await env.DB.prepare('SELECT tenant_id FROM tenant_payment_accounts WHERE stripe_subscription_id=?').bind(subscription).first<{tenant_id:string}>();if(a)return a.tenant_id;}
  if(customer){const a=await env.DB.prepare('SELECT tenant_id FROM tenant_payment_accounts WHERE stripe_customer_id=?').bind(customer).first<{tenant_id:string}>();if(a)return a.tenant_id;}
  if(subscription&&env.STRIPE_SECRET_KEY){try{const sub=await stripeRequest(env,'GET',`/subscriptions/${encodeURIComponent(subscription)}`),tenant=safeString(sub?.metadata?.tenant_id,120);if(tenant){await upsertPaymentAccount(env,tenant,customer||sid(sub.customer),subscription,sub);return tenant;}}catch{}}
  return null;
}
async function upsertPaymentAccount(env:Env,tenantId:string,customer:string|null,subscription:string|null,sub?:StripeObj,checkout?:string|null):Promise<void>{
  const plan=safeString(sub?.metadata?.plan_id,80)||null,limit=Number(sub?.metadata?.course_limit),cycle=String(sub?.metadata?.billing_cycle)==='annual'?'annual':String(sub?.metadata?.billing_cycle)==='monthly'?'monthly':null;
  await env.DB.prepare(`INSERT INTO tenant_payment_accounts(tenant_id,provider,stripe_customer_id,stripe_subscription_id,stripe_checkout_session_id,stripe_subscription_status,billing_cycle,current_plan_id,current_course_limit,current_period_end,cancel_at_period_end,updated_at)
    VALUES(?,'stripe',?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_customer_id=COALESCE(excluded.stripe_customer_id,tenant_payment_accounts.stripe_customer_id),stripe_subscription_id=COALESCE(excluded.stripe_subscription_id,tenant_payment_accounts.stripe_subscription_id),stripe_checkout_session_id=COALESCE(excluded.stripe_checkout_session_id,tenant_payment_accounts.stripe_checkout_session_id),stripe_subscription_status=COALESCE(excluded.stripe_subscription_status,tenant_payment_accounts.stripe_subscription_status),billing_cycle=COALESCE(excluded.billing_cycle,tenant_payment_accounts.billing_cycle),current_plan_id=COALESCE(excluded.current_plan_id,tenant_payment_accounts.current_plan_id),current_course_limit=COALESCE(excluded.current_course_limit,tenant_payment_accounts.current_course_limit),current_period_end=COALESCE(excluded.current_period_end,tenant_payment_accounts.current_period_end),cancel_at_period_end=excluded.cancel_at_period_end,updated_at=excluded.updated_at`)
    .bind(tenantId,customer,subscription,checkout??null,sub?.status?String(sub.status):null,cycle,plan,Number.isFinite(limit)&&limit>0?limit:null,unixIso(sub?.current_period_end),bool(sub?.cancel_at_period_end)?1:0,nowIso()).run();
}

function invoiceSubscription(inv:StripeObj):string|null{return sid(inv.subscription)||sid(inv?.parent?.subscription_details?.subscription);}
function invoicePayment(inv:StripeObj):string|null{return sid(inv.payment_intent)||sid(inv?.payments?.data?.[0]?.payment?.payment_intent)||sid(inv?.charge);}
async function recordInvoice(env:Env,inv:StripeObj,status:'open'|'paid'|'failed'|'void'):Promise<{tenantId:string|null;localId:string|null;orderId:string|null;changeId:string|null}>{
  const tenantId=await resolveTenant(env,inv);if(!tenantId)return{tenantId:null,localId:null,orderId:null,changeId:null};
  const ext=sid(inv);if(!ext)return{tenantId,localId:null,orderId:null,changeId:null};
  let row=await env.DB.prepare('SELECT id,order_id,change_id FROM commercial_invoices WHERE external_invoice_id=?').bind(ext).first<{id:string;order_id:string|null;change_id:string|null}>();
  const reason=String(inv.billing_reason||''),subId=invoiceSubscription(inv);
  if(!row&&reason==='subscription_create')row=await env.DB.prepare("SELECT id,order_id,change_id FROM commercial_invoices WHERE tenant_id=? AND type='initial' AND status IN ('pending_provider','open') ORDER BY created_at DESC LIMIT 1").bind(tenantId).first<{id:string;order_id:string|null;change_id:string|null}>();
  if(!row&&reason==='subscription_update')row=await env.DB.prepare("SELECT id,order_id,change_id FROM commercial_invoices WHERE tenant_id=? AND type='upgrade' AND status IN ('pending_provider','open') ORDER BY created_at DESC LIMIT 1").bind(tenantId).first<{id:string;order_id:string|null;change_id:string|null}>();
  const gross=Number(inv.total??inv.amount_due??inv.amount_paid??0),net=Number(inv.total_excluding_tax??inv.subtotal_excluding_tax??inv.subtotal??gross),tax=Math.max(0,gross-net),paidAt=status==='paid'?(unixIso(inv?.status_transitions?.paid_at)||nowIso()):null,dueAt=unixIso(inv.due_date),number=safeString(inv.number||`STRIPE-${ext}`,120),url=safeString(inv.hosted_invoice_url,1000)||null,pdf=safeString(inv.invoice_pdf,1000)||null,payment=invoicePayment(inv),snapshot=JSON.stringify({stripe_invoice_id:ext,billing_reason:reason,subscription_id:subId,status:inv.status,total:gross,currency:inv.currency,customer:sid(inv.customer)});
  if(row){await env.DB.prepare(`UPDATE commercial_invoices SET status=?,currency=?,net_cents=?,tax_cents=?,gross_cents=?,external_provider='stripe',external_invoice_id=?,external_payment_id=?,external_invoice_url=?,external_invoice_pdf_url=?,due_at=?,paid_at=?,snapshot_json=? WHERE id=?`)
    .bind(status,String(inv.currency||'eur').toUpperCase(),net,tax,gross,ext,payment,url,pdf,dueAt,paidAt,snapshot,row.id).run();return{tenantId,localId:row.id,orderId:row.order_id,changeId:row.change_id};}
  const local=id('inv_'),type=reason==='subscription_update'?'upgrade':reason==='subscription_create'?'initial':'recurring';
  await env.DB.prepare(`INSERT INTO commercial_invoices(id,invoice_number,tenant_id,type,status,currency,net_cents,tax_cents,gross_cents,external_provider,external_invoice_id,external_payment_id,external_invoice_url,external_invoice_pdf_url,due_at,paid_at,snapshot_json,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,'stripe',?,?,?,?,?,?,?,?,?)`).bind(local,number,tenantId,type,status,String(inv.currency||'eur').toUpperCase(),net,tax,gross,ext,payment,url,pdf,dueAt,paidAt,snapshot,nowIso()).run();
  return{tenantId,localId:local,orderId:null,changeId:null};
}

async function onInvoicePaid(env:Env,inv:StripeObj):Promise<void>{
  const rec=await recordInvoice(env,inv,'paid');if(!rec.tenantId)return;const tenantId=rec.tenantId,subId=invoiceSubscription(inv),customer=sid(inv.customer);
  if(subId){let sub:StripeObj={};try{sub=await stripeRequest(env,'GET',`/subscriptions/${encodeURIComponent(subId)}`,[['expand[]','items.data.price']]);}catch{}await upsertPaymentAccount(env,tenantId,customer,subId,sub);}
  let change=rec.changeId?await env.DB.prepare('SELECT * FROM subscription_changes WHERE id=? AND tenant_id=?').bind(rec.changeId,tenantId).first<Record<string,any>>():null;
  if(!change&&sid(inv))change=await env.DB.prepare("SELECT * FROM subscription_changes WHERE tenant_id=? AND external_invoice_id=? AND status='pending_payment'").bind(tenantId,sid(inv)).first<Record<string,any>>();
  const ts=nowIso();
  if(change){
    await env.DB.batch([
      env.DB.prepare("UPDATE subscription_changes SET status='active',activated_at=? WHERE id=?").bind(ts,change.id),
      env.DB.prepare('UPDATE tenant_entitlements SET plan_id=?,course_limit=?,recurring_monthly_cents=?,pricing_snapshot_json=?,updated_at=? WHERE tenant_id=?').bind(change.to_plan_id,change.to_course_limit,change.new_monthly_cents,change.pricing_snapshot_json,ts,tenantId),
      env.DB.prepare("UPDATE subscriptions SET plan_id=?,status='active',ends_at=NULL WHERE tenant_id=?").bind(change.to_plan_id,tenantId),
    ]);
    await audit(env.DB,'stripe:webhook','commerce.expansion.paid',tenantId,undefined,'subscription_change',String(change.id),{stripeInvoiceId:sid(inv)});
  }else{
    let order=rec.orderId?await env.DB.prepare('SELECT * FROM commercial_orders WHERE id=? AND tenant_id=?').bind(rec.orderId,tenantId).first<Record<string,any>>():null;
    if(!order&&subId)order=await env.DB.prepare("SELECT * FROM commercial_orders WHERE tenant_id=? AND (external_subscription_id=? OR status='pending_payment') ORDER BY booked_at DESC LIMIT 1").bind(tenantId,subId).first<Record<string,any>>();
    if(order){await env.DB.batch([
      env.DB.prepare("UPDATE commercial_orders SET status='active',activated_at=?,external_subscription_id=COALESCE(?,external_subscription_id) WHERE id=?").bind(ts,subId,order.id),
      env.DB.prepare("UPDATE subscriptions SET plan_id=?,status='active',starts_at=COALESCE(starts_at,?),ends_at=NULL WHERE tenant_id=?").bind(order.plan_id,ts,tenantId),
      env.DB.prepare("UPDATE tenant_trials SET status='converted',converted_at=?,updated_at=? WHERE tenant_id=? AND status IN ('active','read_only')").bind(ts,ts,tenantId),
    ]);await audit(env.DB,'stripe:webhook','commerce.booking.paid',tenantId,undefined,'order',String(order.id),{stripeInvoiceId:sid(inv),stripeSubscriptionId:subId});}
  }
  await env.DB.prepare('UPDATE tenant_payment_accounts SET last_invoice_id=?,updated_at=? WHERE tenant_id=?').bind(sid(inv),ts,tenantId).run();
}
async function onInvoiceFailed(env:Env,inv:StripeObj):Promise<void>{
  const rec=await recordInvoice(env,inv,'failed');if(!rec.tenantId)return;await env.DB.prepare("UPDATE subscriptions SET status='past_due' WHERE tenant_id=? AND status<>'ended'").bind(rec.tenantId).run();
  if(rec.changeId)await env.DB.prepare("UPDATE subscription_changes SET status='failed' WHERE id=? AND status='pending_payment'").bind(rec.changeId).run();
  await audit(env.DB,'stripe:webhook','commerce.payment.failed',rec.tenantId,undefined,'stripe_invoice',sid(inv)||undefined,{stripeInvoiceId:sid(inv)});
}
async function onCheckoutCompleted(env:Env,s:StripeObj):Promise<void>{
  const tenantId=safeString(s?.metadata?.tenant_id,120);if(!tenantId)return;const customer=sid(s.customer),subscription=sid(s.subscription),checkout=sid(s),orderId=safeString(s?.metadata?.order_id,120);
  let sub:StripeObj={};if(subscription){try{sub=await stripeRequest(env,'GET',`/subscriptions/${encodeURIComponent(subscription)}`,[['expand[]','items.data.price']]);}catch{}}
  await upsertPaymentAccount(env,tenantId,customer,subscription,sub,checkout);
  if(orderId)await env.DB.prepare('UPDATE commercial_orders SET external_subscription_id=COALESCE(?,external_subscription_id),external_checkout_id=COALESCE(?,external_checkout_id) WHERE id=? AND tenant_id=?').bind(subscription,checkout,orderId,tenantId).run();
}
async function onCheckoutExpired(env:Env,s:StripeObj):Promise<void>{
  const orderId=safeString(s?.metadata?.order_id,120),tenantId=safeString(s?.metadata?.tenant_id,120);if(!orderId||!tenantId)return;
  await env.DB.batch([
    env.DB.prepare("UPDATE commercial_orders SET status='cancelled',cancelled_at=? WHERE id=? AND tenant_id=? AND status='pending_payment'").bind(nowIso(),orderId,tenantId),
    env.DB.prepare("UPDATE commercial_invoices SET status='void' WHERE order_id=? AND tenant_id=? AND status IN ('pending_provider','open')").bind(orderId,tenantId),
  ]);
}
async function onSubscriptionEvent(env:Env,sub:StripeObj,deleted=false):Promise<void>{
  const tenantId=await resolveTenant(env,sub);if(!tenantId)return;const subscription=sid(sub),customer=sid(sub.customer);await upsertPaymentAccount(env,tenantId,customer,subscription,sub);
  const status=deleted?'ended':String(sub.status||'');
  if(deleted||status==='canceled'){await env.DB.prepare("UPDATE subscriptions SET status='ended',ends_at=? WHERE tenant_id=?").bind(nowIso(),tenantId).run();return;}
  if(['past_due','unpaid','incomplete','incomplete_expired','paused'].includes(status))await env.DB.prepare("UPDATE subscriptions SET status='past_due' WHERE tenant_id=? AND status<>'ended'").bind(tenantId).run();
}

export async function handleStripeWebhook(env:Env,request:Request):Promise<Response>{
  requireStripeReady(env);const raw=await request.text();if(!(await verifyWebhook(env,raw,request.headers.get('Stripe-Signature'))))return new Response('Ungültige Stripe-Signatur',{status:400});
  let event:StripeObj;try{event=JSON.parse(raw);}catch{return new Response('Ungültiges JSON',{status:400});}
  const eventId=sid(event),eventType=safeString(event.type,120);if(!eventId||!eventType)return new Response('Ungültiges Ereignis',{status:400});
  const old=await env.DB.prepare('SELECT status FROM payment_provider_events WHERE event_id=?').bind(eventId).first<{status:string}>();if(old?.status==='processed'||old?.status==='ignored')return Response.json({received:true,duplicate:true});
  if(old)await env.DB.prepare("UPDATE payment_provider_events SET status='processing',error_message=NULL WHERE event_id=?").bind(eventId).run();
  else await env.DB.prepare("INSERT INTO payment_provider_events(event_id,provider,event_type,status,received_at) VALUES(?,'stripe',?,'processing',?)").bind(eventId,eventType,nowIso()).run();
  try{
    const obj=(event?.data?.object||{}) as StripeObj;let handled=true;
    if(eventType==='checkout.session.completed'||eventType==='checkout.session.async_payment_succeeded')await onCheckoutCompleted(env,obj);
    else if(eventType==='checkout.session.expired')await onCheckoutExpired(env,obj);
    else if(eventType==='invoice.paid')await onInvoicePaid(env,obj);
    else if(eventType==='invoice.payment_failed')await onInvoiceFailed(env,obj);
    else if(eventType==='invoice.voided')await recordInvoice(env,obj,'void');
    else if(eventType==='invoice.finalized')await recordInvoice(env,obj,'open');
    else if(eventType==='customer.subscription.updated'||eventType==='customer.subscription.created')await onSubscriptionEvent(env,obj,false);
    else if(eventType==='customer.subscription.deleted')await onSubscriptionEvent(env,obj,true);
    else handled=false;
    await env.DB.prepare('UPDATE payment_provider_events SET status=?,processed_at=? WHERE event_id=?').bind(handled?'processed':'ignored',nowIso(),eventId).run();return Response.json({received:true,handled});
  }catch(e){await env.DB.prepare("UPDATE payment_provider_events SET status='failed',processed_at=?,error_message=? WHERE event_id=?").bind(nowIso(),String((e as Error)?.message||e).slice(0,1000),eventId).run();throw e;}
}
