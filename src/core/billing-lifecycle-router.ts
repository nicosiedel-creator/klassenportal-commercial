import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { listModuleCancellations, scheduleModuleCancellation, undoModuleCancellation } from './module-cancellation.js';
import { paymentsEnabled } from './payment-policy.js';
import { assertSameOrigin, authStatus, json, safeString } from './utils.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function failure(e:unknown):Response{const code=String((e as Error)?.message||'INTERNAL_ERROR');const status=authStatus(code)??(code==='UNAUTHENTICATED'?401:code==='FORBIDDEN'||code==='CSRF_ORIGIN_MISMATCH'?403:code.includes('NOT_FOUND')?404:['MODULE_CANCELLATION_ALREADY_SCHEDULED','MODULE_CANCELLATION_ALREADY_DUE'].includes(code)?409:code.includes('REQUIRED')||code.includes('INVALID')||code.includes('NOT_ALLOWED')?400:code==='STRIPE_NOT_CONFIGURED'||code==='PAYMENT_DISABLED'?503:500);return json({ok:false,error:code},status);}

export async function handleBillingLifecycleApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);if(!u.pathname.startsWith('/api/billing/modules/cancel'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);const tenantId=safeString(u.searchParams.get('tenant_id'),100);if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId);
    if(u.pathname==='/api/billing/modules/cancellations'&&request.method==='GET')return json({ok:true,cancellations:await listModuleCancellations(env,auth,tenantId),paymentProcessing:paymentsEnabled(env)?'enabled':'disabled'});
    if(!paymentsEnabled(env)&&(request.method==='POST'||request.method==='PUT'||request.method==='PATCH'||request.method==='DELETE'))throw new Error('PAYMENT_DISABLED');
    if(u.pathname==='/api/billing/modules/cancel'&&request.method==='POST')return json({ok:true,cancellation:await scheduleModuleCancellation(env,auth,tenantId,await body(request))},201);
    if(u.pathname==='/api/billing/modules/cancel/undo'&&request.method==='POST'){const b=await body(request),key=safeString(b.feature_key,80);if(!key)throw new Error('FEATURE_KEY_REQUIRED');return json({ok:true,cancellation:await undoModuleCancellation(env,auth,tenantId,key)});}
    return new Response('Methode nicht erlaubt',{status:405});
  }catch(e){return failure(e);}
}
