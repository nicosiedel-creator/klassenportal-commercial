import type { Env } from './types.js';
import type { BillingCycle, CommercialOffer } from './commerce-offers.js';
import type { PriceCalculation } from './commerce.js';
import { nowIso, safeString } from './utils.js';

type StripeObj=Record<string,any>;
export type TaxCatalogRow={plan_id:string;billing_cycle:BillingCycle;currency:string;base_product_id:string;base_price_id:string;base_amount_cents:number;extra_product_id:string|null;extra_price_id:string|null;extra_amount_cents:number|null;tax_behavior:string;tax_code:string};
const API='https://api.stripe.com/v1';
const SAAS_TAX_CODE='txcd_10103001';
const SERVICE_TAX_CODE='txcd_20030000';
const TAX_BEHAVIOR='exclusive';

function sid(v:any):string|null{return typeof v==='string'?v:v&&typeof v.id==='string'?v.id:null;}
function params(entries:Array<[string,unknown]>):URLSearchParams{const p=new URLSearchParams();for(const [k,v] of entries)if(v!==undefined&&v!==null&&String(v)!=='')p.append(k,String(v));return p;}
async function stripe(env:Env,method:'GET'|'POST',path:string,entries:Array<[string,unknown]>=[],idem?:string):Promise<StripeObj>{
  if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)throw new Error('STRIPE_NOT_CONFIGURED');
  const p=params(entries);let url=`${API}${path}`;if(method==='GET'&&p.toString())url+=`?${p}`;
  const headers:Record<string,string>={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`};if(method==='POST')headers['content-type']='application/x-www-form-urlencoded';if(idem)headers['Idempotency-Key']=idem.slice(0,255);
  const r=await fetch(url,{method,headers,body:method==='POST'?p:undefined});let d:any={};try{d=await r.json();}catch{}
  if(!r.ok){const code=String(d?.error?.code||d?.error?.type||'API_ERROR').toUpperCase().replace(/[^A-Z0-9]+/g,'_');throw new Error(`STRIPE_${code}`);}return d;
}
async function product(env:Env,name:string,planId:string,component:'base'|'extra',existing?:string|null):Promise<string>{
  if(existing){
    await stripe(env,'POST',`/products/${encodeURIComponent(existing)}`,[['tax_code',SAAS_TAX_CODE]]);
    return existing;
  }
  const p=await stripe(env,'POST','/products',[
    ['name',name],['tax_code',SAAS_TAX_CODE],['metadata[klassenportal_plan_id]',planId],['metadata[klassenportal_component]',component],
  ],`tax-product:${planId}:${component}`);const id=sid(p);if(!id)throw new Error('STRIPE_PRODUCT_CREATE_FAILED');return id;
}

export async function ensureTaxStripeCatalog(env:Env,price:PriceCalculation|CommercialOffer,cycle:BillingCycle):Promise<TaxCatalogRow>{
  const annualMonths='annualMonthsCharged' in price?Number((price as CommercialOffer).annualMonthsCharged||10):10;
  const baseAmount=cycle==='annual'?Number(price.monthlyBaseCents)*annualMonths:Number(price.monthlyBaseCents),extraMonthly=price.extraCourseMonthlyCents===null?null:Number(price.extraCourseMonthlyCents),extraAmount=extraMonthly===null?null:(cycle==='annual'?extraMonthly*annualMonths:extraMonthly),currency=String(price.currency||'EUR').toUpperCase();
  let row=await env.DB.prepare('SELECT * FROM stripe_plan_prices WHERE plan_id=? AND billing_cycle=?').bind(price.planId,cycle).first<TaxCatalogRow>();
  const baseProduct=await product(env,`Klassenportal ${price.planName}`,price.planId,'base',row?.base_product_id),extraProduct=extraAmount!==null?await product(env,`Klassenportal ${price.planName} – zusätzliche Klasse/Kurs`,price.planId,'extra',row?.extra_product_id):null;
  let basePrice=row?.base_price_id||null,extraPrice=row?.extra_price_id||null;
  const baseNeeds=!row||Number(row.base_amount_cents)!==baseAmount||row.currency!==currency||row.tax_behavior!==TAX_BEHAVIOR||row.tax_code!==SAAS_TAX_CODE;
  if(baseNeeds){const p=await stripe(env,'POST','/prices',[
    ['currency',currency.toLowerCase()],['unit_amount',baseAmount],['product',baseProduct],['tax_behavior',TAX_BEHAVIOR],['recurring[interval]',cycle==='annual'?'year':'month'],['nickname',`${price.planName} ${cycle==='annual'?'jährlich':'monatlich'} netto`],['metadata[klassenportal_plan_id]',price.planId],['metadata[klassenportal_component]','base'],['metadata[klassenportal_cycle]',cycle],
  ],`tax-price:${price.planId}:${cycle}:base:${baseAmount}:${currency}`);basePrice=sid(p);if(!basePrice)throw new Error('STRIPE_PRICE_CREATE_FAILED');}
  const extraNeeds=extraAmount!==null&&extraProduct&&(!row||Number(row.extra_amount_cents)!==extraAmount||row.currency!==currency||row.tax_behavior!==TAX_BEHAVIOR||row.tax_code!==SAAS_TAX_CODE||!extraPrice);
  if(extraNeeds){const p=await stripe(env,'POST','/prices',[
    ['currency',currency.toLowerCase()],['unit_amount',extraAmount],['product',extraProduct],['tax_behavior',TAX_BEHAVIOR],['recurring[interval]',cycle==='annual'?'year':'month'],['nickname',`${price.planName} Zusatzklasse ${cycle==='annual'?'jährlich':'monatlich'} netto`],['metadata[klassenportal_plan_id]',price.planId],['metadata[klassenportal_component]','extra'],['metadata[klassenportal_cycle]',cycle],
  ],`tax-price:${price.planId}:${cycle}:extra:${extraAmount}:${currency}`);extraPrice=sid(p);if(!extraPrice)throw new Error('STRIPE_PRICE_CREATE_FAILED');}
  const ts=nowIso();await env.DB.prepare(`INSERT INTO stripe_plan_prices(plan_id,billing_cycle,currency,base_product_id,base_price_id,base_amount_cents,extra_product_id,extra_price_id,extra_amount_cents,tax_behavior,tax_code,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(plan_id,billing_cycle) DO UPDATE SET currency=excluded.currency,base_product_id=excluded.base_product_id,base_price_id=excluded.base_price_id,base_amount_cents=excluded.base_amount_cents,extra_product_id=excluded.extra_product_id,extra_price_id=excluded.extra_price_id,extra_amount_cents=excluded.extra_amount_cents,tax_behavior=excluded.tax_behavior,tax_code=excluded.tax_code,updated_at=excluded.updated_at`)
    .bind(price.planId,cycle,currency,baseProduct,basePrice,baseAmount,extraProduct,extraPrice,extraAmount,TAX_BEHAVIOR,SAAS_TAX_CODE,ts).run();
  return{plan_id:price.planId,billing_cycle:cycle,currency,base_product_id:baseProduct,base_price_id:basePrice!,base_amount_cents:baseAmount,extra_product_id:extraProduct,extra_price_id:extraPrice,extra_amount_cents:extraAmount,tax_behavior:TAX_BEHAVIOR,tax_code:SAAS_TAX_CODE};
}

function countryCode(v:unknown):string|null{const s=String(v??'').trim();if(/^[A-Za-z]{2}$/.test(s))return s.toUpperCase();const n=s.toLocaleLowerCase('de-DE');if(n==='deutschland'||n==='germany')return'DE';return null;}
async function ensureCustomer(env:Env,tenantId:string):Promise<string>{
  const account=await env.DB.prepare('SELECT stripe_customer_id FROM tenant_payment_accounts WHERE tenant_id=?').bind(tenantId).first<{stripe_customer_id:string|null}>();if(account?.stripe_customer_id)return account.stripe_customer_id;
  const p=await env.DB.prepare('SELECT legal_name,contact_name,contact_email,billing_email,street,postal_code,city,country FROM tenant_profiles WHERE tenant_id=?').bind(tenantId).first<Record<string,unknown>>()??{},cc=countryCode(p.country);
  const entries:Array<[string,unknown]>=[['name',safeString(p.legal_name||p.contact_name,250)],['email',safeString(p.billing_email||p.contact_email,250)],['address[line1]',safeString(p.street,250)],['address[postal_code]',safeString(p.postal_code,40)],['address[city]',safeString(p.city,160)],['metadata[tenant_id]',tenantId]];if(cc)entries.push(['address[country]',cc]);
  const c=await stripe(env,'POST','/customers',entries,`customer:${tenantId}`),customer=sid(c);if(!customer)throw new Error('STRIPE_CUSTOMER_CREATE_FAILED');
  await env.DB.prepare(`INSERT INTO tenant_payment_accounts(tenant_id,provider,stripe_customer_id,updated_at) VALUES(?,'stripe',?,?) ON CONFLICT(tenant_id) DO UPDATE SET stripe_customer_id=excluded.stripe_customer_id,updated_at=excluded.updated_at`).bind(tenantId,customer,nowIso()).run();return customer;
}

export async function createTaxStripeCheckout(env:Env,args:{tenantId:string;orderId:string;invoiceId:string;offer:CommercialOffer;request:Request}):Promise<{checkoutSessionId:string;checkoutUrl:string}>{
  const catalog=await ensureTaxStripeCatalog(env,args.offer,args.offer.billingCycle),customer=await ensureCustomer(env,args.tenantId),origin=env.APP_ORIGIN||new URL(args.request.url).origin;
  const e:Array<[string,unknown]>=[['mode','subscription'],['locale','de'],['customer',customer],['client_reference_id',args.orderId],['success_url',`${origin}/zahlung/erfolg?session_id={CHECKOUT_SESSION_ID}`],['cancel_url',`${origin}/zahlung/abgebrochen`],['payment_method_types[0]','card'],['payment_method_types[1]','sepa_debit'],['billing_address_collection','required'],['customer_update[address]','auto'],['customer_update[name]','auto'],['automatic_tax[enabled]','true'],['tax_id_collection[enabled]','true'],['tax_id_collection[required]','if_supported'],['line_items[0][price]',catalog.base_price_id],['line_items[0][quantity]','1'],['metadata[tenant_id]',args.tenantId],['metadata[order_id]',args.orderId],['metadata[invoice_id]',args.invoiceId],['metadata[plan_id]',args.offer.planId],['metadata[course_limit]',args.offer.courseCount],['metadata[billing_cycle]',args.offer.billingCycle],['subscription_data[metadata][tenant_id]',args.tenantId],['subscription_data[metadata][order_id]',args.orderId],['subscription_data[metadata][plan_id]',args.offer.planId],['subscription_data[metadata][course_limit]',args.offer.courseCount],['subscription_data[metadata][billing_cycle]',args.offer.billingCycle]];
  let line=1;if(args.offer.extraCourses>0&&catalog.extra_price_id){e.push([`line_items[${line}][price]`,catalog.extra_price_id],[`line_items[${line}][quantity]`,args.offer.extraCourses]);line++;}
  if(args.offer.managedSetupCents>0)e.push([`line_items[${line}][price_data][currency]`,args.offer.currency.toLowerCase()],[`line_items[${line}][price_data][unit_amount]`,args.offer.managedSetupCents],[`line_items[${line}][price_data][tax_behavior]`,TAX_BEHAVIOR],[`line_items[${line}][price_data][product_data][name]`,args.offer.managedSetupName],[`line_items[${line}][price_data][product_data][tax_code]`,SERVICE_TAX_CODE],[`line_items[${line}][quantity]`,'1']);
  const session=await stripe(env,'POST','/checkout/sessions',e,`tax-checkout:${args.orderId}`),sessionId=sid(session),url=String(session.url||'');if(!sessionId||!url)throw new Error('STRIPE_CHECKOUT_CREATE_FAILED');
  await env.DB.batch([env.DB.prepare('UPDATE commercial_orders SET external_checkout_id=? WHERE id=? AND tenant_id=?').bind(sessionId,args.orderId,args.tenantId),env.DB.prepare(`UPDATE tenant_payment_accounts SET stripe_checkout_session_id=?,billing_cycle=?,current_plan_id=?,current_course_limit=?,updated_at=? WHERE tenant_id=?`).bind(sessionId,args.offer.billingCycle,args.offer.planId,args.offer.courseCount,nowIso(),args.tenantId)]);return{checkoutSessionId:sessionId,checkoutUrl:url};
}
