import { handleCoreApi, handlePublicApi } from './core/router.js';
import { getSession, resolvePortabilityAuth } from './core/auth.js';
import { serveTenantLogo } from './core/branding.js';
import { refreshTrialStates } from './core/commerce-offers.js';
import { assertPaymentWriteAccess } from './core/payment-access.js';
import { augmentPaidOnboardingResponse, handlePaymentApi } from './core/payment-router.js';
import { publicMaterialDownload, publicOverview, publicPortalMetadata } from './core/public.js';
import { handleRuntimeSchemaApi } from './core/runtime-schema-router.js';
import type { Env } from './core/types.js';
import { handlePortabilityRequest, portabilityConfig, runScheduledTenantBackups } from './portability/index.js';

const SECURITY_HEADERS:Record<string,string>={
  'x-content-type-options':'nosniff',
  'x-frame-options':'DENY',
  'referrer-policy':'strict-origin-when-cross-origin',
  'permissions-policy':'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy':'same-origin',
  'strict-transport-security':'max-age=31536000; includeSubDomains',
  'content-security-policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://checkout.stripe.com",
};

function harden(response:Response):Response{
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(SECURITY_HEADERS))if(!headers.has(key))headers.set(key,value);
  headers.set('x-request-id',crypto.randomUUID());
  const type=headers.get('content-type')||'';
  if(type.includes('text/html'))headers.set('cache-control','no-store');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
function accessError(e:unknown):Response{
  const raw=String((e as Error)?.message||'PAYMENT_REQUIRED');
  const code=/^[A-Z][A-Z0-9_]{2,80}$/.test(raw)?raw:'PAYMENT_REQUIRED';
  const status=code==='TRIAL_EXPIRED'?410:code==='TRIAL_READ_ONLY'?423:402;
  return new Response(JSON.stringify({ok:false,error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function jsonError(code:string,status:number):Response{return new Response(JSON.stringify({ok:false,error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function publicError(e:unknown):Response{
  const raw=String((e as Error)?.message||'PUBLIC_PORTAL_ERROR');
  const code=/^[A-Z][A-Z0-9_]{2,80}$/.test(raw)?raw:'PUBLIC_PORTAL_ERROR';
  const status=code.includes('NOT_FOUND')?404:['LOGIN_REQUIRED','ACCESS_CODE_REQUIRED','LOGIN_OR_CODE_REQUIRED'].includes(code)?401:code==='PUBLIC_PORTAL_ERROR'?500:400;
  return jsonError(code,status);
}
function jsonOk(data:unknown):Response{return new Response(JSON.stringify({ok:true,...(data as Record<string,unknown>)}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}

async function routeRequest(request:Request,env:Env):Promise<Response>{
  const url = new URL(request.url);
  const logo = url.pathname.match(/^\/brand\/logo\/([^/]+)$/);
  if (logo) return serveTenantLogo(env, decodeURIComponent(logo[1]));
  const adminPath=url.pathname.replace(/\/$/,'');
  if (['/plattform-admin','/kunden-admin','/klassen-admin'].includes(adminPath)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Methode nicht erlaubt',{status:405});
    const asset=adminPath==='/kunden-admin'?'/customer-admin.html':adminPath==='/klassen-admin'?'/class-admin.html':'/platform-admin.html';
    const assetUrl=new URL(asset,request.url);
    return env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
  }
  if (/^\/portal\/[^/]+\/[^/]+\/?$/.test(url.pathname)) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Methode nicht erlaubt',{status:405});
    const assetUrl=new URL('/class-portal.html',request.url);
    return env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
  }
  if (url.pathname.startsWith('/einrichtung/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Methode nicht erlaubt',{status:405});
    const assetUrl=new URL('/onboarding.html',request.url);
    return env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
  }
  if (url.pathname==='/zahlung/erfolg' || url.pathname==='/zahlung/abgebrochen') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Methode nicht erlaubt',{status:405});
    const assetUrl=new URL('/payment-result.html',request.url);
    return env.ASSETS.fetch(new Request(assetUrl,{method:request.method,headers:request.headers}));
  }

  const classMeta=url.pathname.match(/^\/public\/([^/]+)\/([^/]+)\/meta$/);
  if(classMeta){
    if(request.method!=='GET')return new Response('Methode nicht erlaubt',{status:405});
    try{return jsonOk(await publicPortalMetadata(env,decodeURIComponent(classMeta[1]),decodeURIComponent(classMeta[2])));}catch(e){return publicError(e);}
  }
  const classMaterial=url.pathname.match(/^\/public\/([^/]+)\/([^/]+)\/materials\/([^/]+)$/);
  if(classMaterial){
    if(request.method!=='GET')return new Response('Methode nicht erlaubt',{status:405});
    try{
      const accessCode=request.headers.get('X-Klassenportal-Access-Code')||undefined;
      return await publicMaterialDownload(env,decodeURIComponent(classMaterial[1]),decodeURIComponent(classMaterial[2]),decodeURIComponent(classMaterial[3]),await getSession(env,request),accessCode);
    }catch(e){return publicError(e);}
  }
  const classOverview=url.pathname.match(/^\/public\/([^/]+)\/([^/]+)\/overview$/);
  if(classOverview){
    if(request.method!=='GET')return new Response('Methode nicht erlaubt',{status:405});
    try{
      const accessCode=request.headers.get('X-Klassenportal-Access-Code')||url.searchParams.get('access_code')||undefined;
      return jsonOk(await publicOverview(env,decodeURIComponent(classOverview[1]),decodeURIComponent(classOverview[2]),await getSession(env,request),accessCode));
    }catch(e){return publicError(e);}
  }

  const schemaApi=await handleRuntimeSchemaApi(request,env);if(schemaApi)return schemaApi;
  const payment=await handlePaymentApi(request,env);if(payment)return payment;

  const onboardingPost=request.method==='POST'&&/^\/api\/onboarding\/[^/]+$/.test(url.pathname);
  if(onboardingPost){
    const payload=await request.clone().json().catch(()=>({})) as Record<string,unknown>;
    if(String(payload.commercial_action||'trial')==='book'&&(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET))return jsonError('STRIPE_NOT_CONFIGURED',503);
  }

  const tenantId=url.searchParams.get('tenant_id');
  const mutating=request.method!=='GET'&&request.method!=='HEAD';
  const exemptMutation=url.pathname==='/api/timetable/preview'||url.pathname.startsWith('/api/auth/')||url.pathname.startsWith('/api/onboarding/')||url.pathname.startsWith('/api/platform/');
  if(tenantId&&mutating&&!exemptMutation){
    try{await assertPaymentWriteAccess(env,tenantId);}catch(e){return accessError(e);}
  }

  const portability = await handlePortabilityRequest(request, env, portabilityConfig, (r) => resolvePortabilityAuth(env, r));
  if (portability) return portability;
  const api = await handleCoreApi(request, env);
  if (api) {
    if(onboardingPost)return augmentPaidOnboardingResponse(env,request,api);
    return api;
  }
  const pub = await handlePublicApi(request, env); if (pub) return pub;
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try{return harden(await routeRequest(request,env));}
    catch(error){
      console.error('Unhandled request error',{path:new URL(request.url).pathname,error:String((error as Error)?.message||error)});
      return harden(jsonError('INTERNAL_ERROR',500));
    }
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await refreshTrialStates(env);
    await runScheduledTenantBackups(env, portabilityConfig, 'system:backup', 3);
    const now=new Date();
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now.toISOString()).run();
    await env.DB.prepare("UPDATE onboarding_invitations SET status='expired' WHERE status='open' AND expires_at <= ?").bind(now.toISOString()).run();
    await env.DB.prepare('DELETE FROM login_attempts WHERE window_started_at <= ?').bind(new Date(now.getTime()-24*60*60*1000).toISOString()).run();
  },
};
