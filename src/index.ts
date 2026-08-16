import { handleCoreApi, handlePublicApi } from './core/router.js';
import { getSession, resolvePortabilityAuth } from './core/auth.js';
import { serveTenantLogo } from './core/branding.js';
import { refreshTrialStates } from './core/commerce-offers.js';
import { assertPaymentWriteAccess } from './core/payment-access.js';
import { augmentPaidOnboardingResponse, handlePaymentApi } from './core/payment-router.js';
import { publicOverview } from './core/public.js';
import type { Env } from './core/types.js';
import { handlePortabilityRequest, portabilityConfig, runScheduledTenantBackups } from './portability/index.js';

function accessError(e:unknown):Response{
  const code=(e as Error)?.message||'PAYMENT_REQUIRED';
  const status=code==='TRIAL_EXPIRED'?410:code==='TRIAL_READ_ONLY'?423:402;
  return new Response(JSON.stringify({ok:false,error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
}
function jsonError(code:string,status:number):Response{return new Response(JSON.stringify({ok:false,error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function publicError(e:unknown):Response{
  const code=(e as Error)?.message||'PUBLIC_PORTAL_ERROR';
  const status=code==='COURSE_NOT_FOUND'?404:['LOGIN_REQUIRED','ACCESS_CODE_REQUIRED','LOGIN_OR_CODE_REQUIRED'].includes(code)?401:400;
  return jsonError(code,status);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const logo = url.pathname.match(/^\/brand\/logo\/([^/]+)$/);
    if (logo) return serveTenantLogo(env, decodeURIComponent(logo[1]));
    if (url.pathname==='/plattform-admin' || url.pathname==='/plattform-admin/' || url.pathname==='/kunden-admin' || url.pathname==='/kunden-admin/') {
      if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Methode nicht erlaubt',{status:405});
      const isCustomer=url.pathname.startsWith('/kunden-admin');
      const assetUrl=new URL(isCustomer?'/customer-admin.html':'/platform-admin.html',request.url);
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

    const classOverview=url.pathname.match(/^\/public\/([^/]+)\/([^/]+)\/overview$/);
    if(classOverview&&request.method==='GET'){
      try{
        const accessCode=request.headers.get('X-Klassenportal-Access-Code')||url.searchParams.get('access_code')||undefined;
        const data=await publicOverview(env,decodeURIComponent(classOverview[1]),decodeURIComponent(classOverview[2]),await getSession(env,request),accessCode);
        return new Response(JSON.stringify({ok:true,...data}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
      }catch(e){return publicError(e);}
    }

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
  },
  async scheduled(_controller: unknown, env: Env): Promise<void> {
    await refreshTrialStates(env);
    await runScheduledTenantBackups(env, portabilityConfig, 'system:backup', 3);
    await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(new Date().toISOString()).run();
    await env.DB.prepare("UPDATE onboarding_invitations SET status='expired' WHERE status='open' AND expires_at <= ?").bind(new Date().toISOString()).run();
  },
};
