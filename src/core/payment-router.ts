import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { calculateCommercialOffer, getCommercePolicy, listManagedSetupOptions, tenantTrialSummary } from './commerce-offers.js';
import { billingSummaryWithoutPayments } from './commerce.js';
import { billingSummaryWithStripe, createPaidBookingWithStripe, quoteExpansionWithStripe, requestExpansionWithStripe, retryInitialCheckout } from './payment-orchestration.js';
import { createStripePortalSessionModeSafe, handleStripeWebhookModeSafe } from './stripe-mode-safe.js';
import { createTaxStripeCheckout } from './stripe-tax-billing.js';
import { ensureTenantCommerceState } from './commerce-state.js';
import { listManagedSetupJobs, updateManagedSetupJob } from './managed-setup.js';
import { customerSetupProgress } from './setup-progress.js';
import { listPlatformModuleRules, quoteModuleSubscription, subscribeModule, tenantModuleCatalog, updatePlatformModuleRule } from './module-commerce.js';
import { paymentPolicy, paymentsEnabled } from './payment-policy.js';
import { assertSameOrigin, authStatus, nowIso, safeErrorCode, safeString } from './utils.js';

function out(data:unknown,status=200):Response{return Response.json(data,{status,headers:{'cache-control':'no-store'}});}
async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function error(e:unknown):Response{
  const code=safeErrorCode(e);
  const status=authStatus(code)??(code==='UNAUTHENTICATED'||code==='LOGIN_REQUIRED'?401
    :code==='FORBIDDEN'||code==='PASSWORD_CHANGE_REQUIRED'||code==='ORIGIN_MISMATCH'||code==='CSRF_ORIGIN_MISMATCH'||code==='MODULE_SELF_SERVICE_DISABLED'?403
    :code==='STRIPE_NOT_CONFIGURED'||code==='PAYMENT_DISABLED'?503
    :code.includes('NOT_FOUND')?404
    :code.includes('REQUIRED')||code.includes('INVALID')||code.includes('CONFIRMATION')?400
    :['SELF_SERVICE_DOWNGRADE_NOT_ALLOWED','NO_CHANGE','PAYMENT_ALREADY_PENDING','MODULE_ALREADY_ACTIVE','MODULE_PAYMENT_PENDING','MODULE_ALREADY_ON_SUBSCRIPTION'].includes(code)?409:500);
  return out({ok:false,error:code},status);
}
function disabled():Response{return error(new Error('PAYMENT_DISABLED'));}

async function checkoutStatus(request:Request,env:Env,u:URL):Promise<Response>{
  const sessionId=safeString(u.searchParams.get('session_id'),255);if(!sessionId||!/^cs_(?:test_|live_)?[A-Za-z0-9_]+$/.test(sessionId))throw new Error('CHECKOUT_SESSION_INVALID');
  const row=await env.DB.prepare(`SELECT o.tenant_id,o.id AS order_id,o.order_number,o.status AS order_status,o.plan_id,o.course_limit,o.activated_at,
      i.id AS invoice_id,i.invoice_number,i.status AS invoice_status,i.paid_at,i.external_invoice_url,i.external_invoice_pdf_url
    FROM commercial_orders o
    LEFT JOIN commercial_invoices i ON i.order_id=o.id AND i.type='initial'
    WHERE o.external_checkout_id=?
    ORDER BY i.created_at DESC LIMIT 1`).bind(sessionId).first<Record<string,any>>();
  if(!row?.tenant_id)throw new Error('CHECKOUT_SESSION_NOT_FOUND');
  await resolveCoreAuth(env,request,String(row.tenant_id));
  const orderStatus=String(row.order_status||''),invoiceStatus=String(row.invoice_status||'');
  const state=orderStatus==='active'||invoiceStatus==='paid'?'paid':orderStatus==='cancelled'||['failed','void'].includes(invoiceStatus)?'failed':'pending';
  return out({ok:true,state,order:{number:row.order_number,status:orderStatus,planId:row.plan_id,courseLimit:row.course_limit,activatedAt:row.activated_at},invoice:row.invoice_id?{number:row.invoice_number,status:invoiceStatus,paidAt:row.paid_at,url:row.external_invoice_url||null,pdfUrl:row.external_invoice_pdf_url||null}:null});
}

export async function handlePaymentApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),enabled=paymentsEnabled(env);
  if(u.pathname==='/api/payments/stripe/webhook'&&request.method==='POST'){
    if(!enabled)return out({ok:true,ignored:true,paymentProcessing:'disabled'});
    try{return await handleStripeWebhookModeSafe(env,request);}catch(e){return error(e);}
  }
  if(u.pathname.startsWith('/api/payments/')&&!enabled)return disabled();
  if(u.pathname==='/api/payments/checkout-status'&&request.method==='GET'){try{return await checkoutStatus(request,env,u);}catch(e){return error(e);}}
  if(u.pathname==='/api/platform/managed-setups'&&request.method==='GET'){try{assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);return out({ok:true,jobs:await listManagedSetupJobs(env,auth)});}catch(e){return error(e);}}
  const managedSetup=u.pathname.match(/^\/api\/platform\/managed-setups\/([^/]+)$/);
  if(managedSetup&&request.method==='PATCH'){try{assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);return out({ok:true,job:await updateManagedSetupJob(env,auth,decodeURIComponent(managedSetup[1]),await body(request))});}catch(e){return error(e);}}
  if(u.pathname==='/api/platform/commerce/modules'&&request.method==='GET'){try{assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);return out({ok:true,modules:await listPlatformModuleRules(env,auth),paymentPolicy:paymentPolicy(env)});}catch(e){return error(e);}}
  const platformModule=u.pathname.match(/^\/api\/platform\/commerce\/modules\/([^/]+)$/);
  if(platformModule&&request.method==='PUT'){try{assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);return out({ok:true,module:await updatePlatformModuleRule(env,auth,decodeURIComponent(platformModule[1]),await body(request))});}catch(e){return error(e);}}
  if(!u.pathname.startsWith('/api/billing/'))return null;
  if(!enabled&&request.method!=='GET')return disabled();
  const tenantId=u.searchParams.get('tenant_id')||'';if(!tenantId)return out({ok:false,error:'TENANT_ID_REQUIRED'},400);
  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    const auth=await resolveCoreAuth(env,request,tenantId,u.searchParams.get('course_id')||undefined);
    await ensureTenantCommerceState(env,tenantId);
    if(u.pathname==='/api/billing/summary'&&request.method==='GET'){const moduleCommerce=await tenantModuleCatalog(env,auth,tenantId).catch(()=>null),summary=enabled?await billingSummaryWithStripe(env,auth,tenantId):await billingSummaryWithoutPayments(env,auth,tenantId);return out({ok:true,...summary,trial:await tenantTrialSummary(env,auth,tenantId),commercePolicy:await getCommercePolicy(env),setupOptions:await listManagedSetupOptions(env),moduleCommerce,paymentPolicy:paymentPolicy(env)});}
    if(u.pathname==='/api/billing/modules'&&request.method==='GET')return out({ok:true,...await tenantModuleCatalog(env,auth,tenantId),paymentPolicy:paymentPolicy(env)});
    if(u.pathname==='/api/billing/modules/quote'&&request.method==='POST')return out({ok:true,quote:await quoteModuleSubscription(env,auth,tenantId,await body(request)),paymentPolicy:paymentPolicy(env)});
    if(u.pathname==='/api/billing/modules/subscribe'&&request.method==='POST'){if(!enabled)return disabled();return out({ok:true,...await subscribeModule(env,auth,tenantId,await body(request))},201);}
    if(u.pathname==='/api/billing/setup-progress'&&request.method==='GET')return out({ok:true,...await customerSetupProgress(env,auth,tenantId),paymentPolicy:paymentPolicy(env)});
    if(u.pathname==='/api/billing/change-quote'&&request.method==='POST')return out({ok:true,quote:await quoteExpansionWithStripe(env,auth,tenantId,await body(request)),paymentPolicy:paymentPolicy(env)});
    if(u.pathname==='/api/billing/expand'&&request.method==='POST'){if(!enabled)return disabled();const b=await body(request);if(b.confirm_change!==true||b.confirm_costs!==true)throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');return out({ok:true,...await requestExpansionWithStripe(env,auth,tenantId,b)},201);}
    if(u.pathname==='/api/billing/convert-trial'&&request.method==='POST'){if(!enabled)return disabled();const b=await body(request);if(b.confirm_change!==true||b.confirm_costs!==true)throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');const trial=await tenantTrialSummary(env,auth,tenantId) as Record<string,any>|null;if(!trial||!['active','read_only'].includes(String(trial.status||'')))throw new Error('TRIAL_NOT_CONVERTIBLE');const booked=await createPaidBookingWithStripe(env,{tenantId,planId:String(b.plan_id||trial.target_plan_id),courseCount:Number(b.course_count||trial.requested_course_count),billingCycle:b.billing_cycle,setupOptionId:b.managed_setup_option_id,accepted:true,request,actorId:auth.userId});return out({ok:true,...booked},201);}
    if(u.pathname==='/api/billing/retry-checkout'&&request.method==='POST'){if(!enabled)return disabled();return out({ok:true,...await retryInitialCheckout(env,auth,tenantId,request)});}
    if(u.pathname==='/api/billing/stripe-portal'&&request.method==='POST'){if(!enabled)return disabled();return out({ok:true,...await createStripePortalSessionModeSafe(env,auth,tenantId,request)});}
    if(u.pathname==='/api/billing/trial-quote'&&request.method==='POST'){const b=await body(request),trial=await tenantTrialSummary(env,auth,tenantId) as Record<string,any>|null;if(!trial||!['active','read_only'].includes(String(trial.status||'')))throw new Error('TRIAL_NOT_CONVERTIBLE');const quote=await calculateCommercialOffer(env,{planId:String(b.plan_id||trial.target_plan_id),courseCount:Number(b.course_count||trial.requested_course_count),billingCycle:b.billing_cycle,setupOptionId:b.managed_setup_option_id||'self_service',purpose:'paid'});return out({ok:true,quote,paymentPolicy:paymentPolicy(env)});}
    return null;
  }catch(e){return error(e);}
}

export async function augmentPaidOnboardingResponse(env:Env,request:Request,response:Response):Promise<Response>{
  if(!response.ok)return response;
  let data:any;try{data=await response.clone().json();}catch{return response;}
  if(data?.commercial_action!=='book'||!data?.commercial?.orderId||!data?.commercial?.invoiceId||!data?.commercial?.offer)return response;
  if(!paymentsEnabled(env))return out({...data,commercial:{...data.commercial,checkoutUrl:null,paymentProvider:'manual',paymentProcessing:'disabled'}});
  const tenantId=String(data.tenant_id||''),orderId=String(data.commercial.orderId),invoiceId=String(data.commercial.invoiceId);
  try{const checkout=await createTaxStripeCheckout(env,{tenantId,orderId,invoiceId,offer:data.commercial.offer,request});return out({...data,commercial:{...data.commercial,...checkout,paymentProvider:'stripe',paymentProcessing:'enabled'}});}
  catch(e){await env.DB.batch([env.DB.prepare("UPDATE commercial_orders SET status='cancelled',cancelled_at=? WHERE id=? AND tenant_id=? AND status='pending_payment'").bind(nowIso(),orderId,tenantId),env.DB.prepare("UPDATE commercial_invoices SET status='failed',external_provider='stripe' WHERE id=? AND tenant_id=? AND status='pending_provider'").bind(invoiceId,tenantId)]);return error(e);}
}
