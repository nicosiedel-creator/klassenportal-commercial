import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { calculateCommercialOffer, getCommercePolicy, listManagedSetupOptions, tenantTrialSummary } from './commerce-offers.js';
import { billingSummaryWithStripe, createPaidBookingWithStripe, quoteExpansionWithStripe, requestExpansionWithStripe, retryInitialCheckout } from './payment-orchestration.js';
import { createStripePortalSession, handleStripeWebhook } from './stripe.js';
import { createTaxStripeCheckout } from './stripe-tax-billing.js';
import { ensureTenantCommerceState } from './commerce-state.js';
import { assertSameOrigin, nowIso } from './utils.js';

function out(data:unknown,status=200):Response{return Response.json(data,{status});}
async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function error(e:unknown):Response{
  const code=(e as Error)?.message||'INTERNAL_ERROR';
  const status=code==='UNAUTHENTICATED'||code==='LOGIN_REQUIRED'?401:code==='ORIGIN_MISMATCH'?403:code==='STRIPE_NOT_CONFIGURED'?503:code.includes('NOT_FOUND')?404:code.includes('REQUIRED')||code.includes('INVALID')||code.includes('CONFIRMATION')?400:code==='SELF_SERVICE_DOWNGRADE_NOT_ALLOWED'||code==='NO_CHANGE'||code==='PAYMENT_ALREADY_PENDING'?409:500;
  return out({ok:false,error:code},status);
}

export async function handlePaymentApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);
  if(u.pathname==='/api/payments/stripe/webhook'&&request.method==='POST'){
    try{return await handleStripeWebhook(env,request);}catch(e){return error(e);}
  }
  if(!u.pathname.startsWith('/api/billing/'))return null;
  const tenantId=u.searchParams.get('tenant_id')||'';if(!tenantId)return out({ok:false,error:'TENANT_ID_REQUIRED'},400);
  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    const auth=await resolveCoreAuth(env,request,tenantId,u.searchParams.get('course_id')||undefined);
    await ensureTenantCommerceState(env,tenantId);
    if(u.pathname==='/api/billing/summary'&&request.method==='GET')return out({ok:true,...await billingSummaryWithStripe(env,auth,tenantId),trial:await tenantTrialSummary(env,auth,tenantId),commercePolicy:await getCommercePolicy(env),setupOptions:await listManagedSetupOptions(env)});
    if(u.pathname==='/api/billing/change-quote'&&request.method==='POST')return out({ok:true,quote:await quoteExpansionWithStripe(env,auth,tenantId,await body(request))});
    if(u.pathname==='/api/billing/expand'&&request.method==='POST'){
      const b=await body(request);if(b.confirm_change!==true||b.confirm_costs!==true)throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');
      return out({ok:true,...await requestExpansionWithStripe(env,auth,tenantId,b)},201);
    }
    if(u.pathname==='/api/billing/convert-trial'&&request.method==='POST'){
      const b=await body(request);if(b.confirm_change!==true||b.confirm_costs!==true)throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');
      const trial=await tenantTrialSummary(env,auth,tenantId) as Record<string,any>|null;if(!trial||!['active','read_only'].includes(String(trial.status||'')))throw new Error('TRIAL_NOT_CONVERTIBLE');
      const booked=await createPaidBookingWithStripe(env,{tenantId,planId:String(b.plan_id||trial.target_plan_id),courseCount:Number(b.course_count||trial.requested_course_count),billingCycle:b.billing_cycle,setupOptionId:b.managed_setup_option_id,accepted:true,request,actorId:auth.userId});
      return out({ok:true,...booked},201);
    }
    if(u.pathname==='/api/billing/retry-checkout'&&request.method==='POST')return out({ok:true,...await retryInitialCheckout(env,auth,tenantId,request)});
    if(u.pathname==='/api/billing/stripe-portal'&&request.method==='POST')return out({ok:true,...await createStripePortalSession(env,auth,tenantId,request)});
    if(u.pathname==='/api/billing/trial-quote'&&request.method==='POST'){
      const b=await body(request),trial=await tenantTrialSummary(env,auth,tenantId) as Record<string,any>|null;if(!trial||!['active','read_only'].includes(String(trial.status||'')))throw new Error('TRIAL_NOT_CONVERTIBLE');
      const quote=await calculateCommercialOffer(env,{planId:String(b.plan_id||trial.target_plan_id),courseCount:Number(b.course_count||trial.requested_course_count),billingCycle:b.billing_cycle,setupOptionId:b.managed_setup_option_id||'self_service',purpose:'paid'});
      return out({ok:true,quote});
    }
    return null;
  }catch(e){return error(e);}
}

export async function augmentPaidOnboardingResponse(env:Env,request:Request,response:Response):Promise<Response>{
  if(!response.ok)return response;
  let data:any;try{data=await response.clone().json();}catch{return response;}
  if(data?.commercial_action!=='book'||!data?.commercial?.orderId||!data?.commercial?.invoiceId||!data?.commercial?.offer)return response;
  const tenantId=String(data.tenant_id||''),orderId=String(data.commercial.orderId),invoiceId=String(data.commercial.invoiceId);
  try{
    const checkout=await createTaxStripeCheckout(env,{tenantId,orderId,invoiceId,offer:data.commercial.offer,request});
    return out({...data,commercial:{...data.commercial,...checkout,paymentProvider:'stripe'}});
  }catch(e){
    await env.DB.batch([
      env.DB.prepare("UPDATE commercial_orders SET status='cancelled',cancelled_at=? WHERE id=? AND tenant_id=? AND status='pending_payment'").bind(nowIso(),orderId,tenantId),
      env.DB.prepare("UPDATE commercial_invoices SET status='failed',external_provider='stripe' WHERE id=? AND tenant_id=? AND status='pending_provider'").bind(invoiceId,tenantId),
    ]);
    return error(e);
  }
}
