import type { CoreAuthContext, Env } from './types.js';
import { handleStripeWebhook } from './stripe.js';
import { stripeMode } from './stripe-mode.js';
import { persistStripeModeState, prepareStripeModeState } from './stripe-mode-state.js';
import { requireRole } from './permissions.js';
import { nowIso } from './utils.js';
import { handleModuleInvoiceFailed, handleModuleInvoicePaid } from './module-commerce.js';

const API='https://api.stripe.com/v1';

type StripeObj=Record<string,any>;
function sid(v:any):string|null{return typeof v==='string'?v:v&&typeof v.id==='string'?v.id:null;}
function form(entries:Array<[string,unknown]>):URLSearchParams{const p=new URLSearchParams();for(const [k,v] of entries)if(v!==undefined&&v!==null&&String(v)!=='')p.append(k,String(v));return p;}
async function stripePost(env:Env,path:string,entries:Array<[string,unknown]>,idem?:string):Promise<StripeObj>{
  if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)throw new Error('STRIPE_NOT_CONFIGURED');
  const mode=stripeMode(env),headers:Record<string,string>={Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`,'content-type':'application/x-www-form-urlencoded'};if(idem)headers['Idempotency-Key']=`${mode}:${idem}`.slice(0,255);
  const r=await fetch(`${API}${path}`,{method:'POST',headers,body:form(entries)});let d:any={};try{d=await r.json();}catch{}if(!r.ok){const code=String(d?.error?.code||d?.error?.type||'API_ERROR').toUpperCase().replace(/[^A-Z0-9]+/g,'_');throw new Error(`STRIPE_${code}`);}return d;
}
async function settleModuleInvoice(env:Env,event:StripeObj):Promise<void>{
  const type=String(event?.type||''),invoiceId=sid(event?.data?.object);if(!invoiceId||!['invoice.paid','invoice.payment_failed'].includes(type))return;
  const local=await env.DB.prepare('SELECT tenant_id,change_id FROM commercial_invoices WHERE external_invoice_id=? ORDER BY created_at DESC LIMIT 1').bind(invoiceId).first<{tenant_id:string;change_id:string|null}>();if(!local?.tenant_id)return;
  if(type==='invoice.paid')await handleModuleInvoicePaid(env,local.tenant_id,local.change_id,invoiceId);
  else await handleModuleInvoiceFailed(env,local.tenant_id,local.change_id,invoiceId);
}

export async function handleStripeWebhookModeSafe(env:Env,request:Request):Promise<Response>{
  if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)throw new Error('STRIPE_NOT_CONFIGURED');
  const raw=await request.text();let event:StripeObj;try{event=JSON.parse(raw);}catch{return new Response('Ungültiges JSON',{status:400});}
  const mode=await prepareStripeModeState(env),eventMode=event?.livemode===true?'live':'test';if(eventMode!==mode)return new Response('Stripe-Modus stimmt nicht überein',{status:400});
  const forwarded=new Request(request.url,{method:'POST',headers:new Headers(request.headers),body:raw}),eventId=sid(event);let response:Response|undefined;
  try{
    response=await handleStripeWebhook(env,forwarded);
    if(response.ok)await settleModuleInvoice(env,event);
    return response;
  }finally{
    const ts=nowIso(),ops=[];
    if(eventId)ops.push(env.DB.prepare('UPDATE payment_provider_events SET stripe_mode=? WHERE event_id=?').bind(mode,eventId));
    if(response?.ok)ops.push(env.DB.prepare('UPDATE stripe_provider_modes SET last_verified_webhook_at=?,updated_at=? WHERE stripe_mode=?').bind(ts,ts,mode));
    if(ops.length)await env.DB.batch(ops);
    await persistStripeModeState(env);
  }
}

async function portalConfiguration(env:Env):Promise<string>{
  const mode=stripeMode(env),row=await env.DB.prepare('SELECT external_config_id FROM stripe_provider_modes WHERE stripe_mode=?').bind(mode).first<{external_config_id:string|null}>();if(row?.external_config_id)return row.external_config_id;
  const c=await stripePost(env,'/billing_portal/configurations',[
    ['name',`Klassenportal Kundenportal (${mode})`],
    ['features[customer_update][enabled]','true'],
    ['features[customer_update][allowed_updates][0]','address'],['features[customer_update][allowed_updates][1]','email'],['features[customer_update][allowed_updates][2]','name'],['features[customer_update][allowed_updates][3]','phone'],['features[customer_update][allowed_updates][4]','tax_id'],
    ['features[invoice_history][enabled]','true'],['features[payment_method_update][enabled]','true'],
    ['features[subscription_cancel][enabled]','false'],['features[subscription_update][enabled]','false'],
  ],'portal-config:klassenportal-v2');
  const id=sid(c);if(!id)throw new Error('STRIPE_PORTAL_CONFIG_FAILED');
  await env.DB.prepare('UPDATE stripe_provider_modes SET external_config_id=?,updated_at=? WHERE stripe_mode=?').bind(id,nowIso(),mode).run();return id;
}

export async function createStripePortalSessionModeSafe(env:Env,auth:CoreAuthContext,tenantId:string,request:Request):Promise<{url:string;stripeMode:'test'|'live'}>{
  requireRole(auth,'tenant_admin');if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET)throw new Error('STRIPE_NOT_CONFIGURED');
  const mode=await prepareStripeModeState(env),a=await env.DB.prepare('SELECT stripe_customer_id FROM tenant_payment_accounts WHERE tenant_id=? AND stripe_mode=?').bind(tenantId,mode).first<{stripe_customer_id:string|null}>();if(!a?.stripe_customer_id)throw new Error('STRIPE_CUSTOMER_NOT_FOUND');
  const origin=env.APP_ORIGIN||new URL(request.url).origin,configuration=await portalConfiguration(env),s=await stripePost(env,'/billing_portal/sessions',[['customer',a.stripe_customer_id],['configuration',configuration],['return_url',`${origin}/kunden-admin`]]);
  await persistStripeModeState(env);
  if(!s.url)throw new Error('STRIPE_PORTAL_SESSION_FAILED');return{url:String(s.url),stripeMode:mode};
}
