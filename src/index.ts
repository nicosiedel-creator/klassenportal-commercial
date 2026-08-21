import { handleCoreApi, handlePublicApi } from './core/router.js';
import { getSession, resolvePortabilityAuth } from './core/auth.js';
import { serveTenantLogo } from './core/branding.js';
import { refreshTrialStates } from './core/commerce-offers.js';
import { assertPaymentWriteAccess } from './core/payment-access.js';
import { augmentPaidOnboardingResponse, handlePaymentApi } from './core/payment-router.js';
import { handleBillingLifecycleApi } from './core/billing-lifecycle-router.js';
import { processScheduledModuleCancellations } from './core/module-cancellation.js';
import { handleOwnerSecurityApi } from './core/owner-security-router.js';
import { handleCustomDomainApi } from './core/custom-domain-router.js';
import { reconcilePendingCustomDomains } from './core/custom-domains.js';
import { ensureCustomDomainGuards } from './core/custom-domain-guards.js';
import { handleAccountRecoveryApi } from './core/account-recovery-router.js';
import { cleanupAccountActions } from './core/account-recovery.js';
import { handleLaunchReadinessApi } from './core/launch-readiness-router.js';
import { renderLegalDocument } from './core/legal-documents-eu.js';
import { verifyPendingBackups } from './core/backup-verification.js';
import { productionReleaseAccess } from './core/production-release-state.js';
import { acceptanceModeAllowsLockedRequest } from './core/acceptance-mode.js';
import { publicMaterialDownload, publicOverview, publicPortalMetadata } from './core/public.js';
import { publicAdvancedBySlug } from './core/public-advanced.js';
import { calendarFeedResponse } from './core/advanced-modules.js';
import { handleRuntimeSchemaApi } from './core/runtime-schema-router.js';
import { handleEnterpriseRouter } from './core/enterprise-router.js';
import { cleanupOidcStates } from './core/enterprise-sso.js';
import { cleanupIntake } from './core/intake-center.js';
import { handlePublicIntakeRoute } from './core/intake-router.js';
import { handleCommunicationsApi } from './core/communications-router.js';
import { runCommunicationAutomation } from './core/secure-communications.js';
import { handleAttendanceApi } from './core/attendance-router.js';
import { runAttendanceAttention } from './core/attendance-classbook.js';
import { handleParticipant360Api } from './core/participant-360-router.js';
import { runPlatformAutomationCycle } from './core/automation-cycle.js';
import { handleMicrosoftGraphApi } from './core/microsoft-graph-router.js';
import { handleCollaborationReportingApi } from './core/collaboration-reporting-router.js';
import { handleLiveStudyApi } from './core/live-study-router.js';
import type { Env } from './core/types.js';
import { handlePortabilityRequest, portabilityConfig, runScheduledTenantBackups } from './portability/index.js';

const SECURITY_HEADERS:Record<string,string>={
  'x-content-type-options':'nosniff','x-frame-options':'DENY','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=()','cross-origin-opener-policy':'same-origin','strict-origin-agent-cluster':'?1','strict-transport-security':'max-age=31536000; includeSubDomains',
  'content-security-policy':"default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://api.stripe.com https://checkout.stripe.com https://login.microsoftonline.com; frame-src https://www.youtube-nocookie.com; worker-src 'self' blob:; manifest-src 'self'; upgrade-insecure-requests",
};
function harden(response:Response):Response{const headers=new Headers(response.headers);for(const [k,v] of Object.entries(SECURITY_HEADERS))if(!headers.has(k))headers.set(k,v);headers.set('x-request-id',crypto.randomUUID());if((headers.get('content-type')||'').includes('text/html'))headers.set('cache-control','no-store');return new Response(response.body,{status:response.status,statusText:response.statusText,headers});}
function accessError(e:unknown):Response{const raw=String((e as Error)?.message||'PAYMENT_REQUIRED'),code=/^[A-Z][A-Z0-9_]{2,80}$/.test(raw)?raw:'PAYMENT_REQUIRED',status=code==='TRIAL_EXPIRED'?410:code==='TRIAL_READ_ONLY'?423:402;return new Response(JSON.stringify({ok:false,error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function jsonError(code:string,status:number):Response{return new Response(JSON.stringify({ok:false,error:code}),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function publicError(e:unknown):Response{const raw=String((e as Error)?.message||'PUBLIC_PORTAL_ERROR'),code=/^[A-Z][A-Z0-9_]{2,80}$/.test(raw)?raw:'PUBLIC_PORTAL_ERROR',status=code.includes('NOT_FOUND')?404:['LOGIN_REQUIRED','ACCESS_CODE_REQUIRED','LOGIN_OR_CODE_REQUIRED'].includes(code)?401:code==='PUBLIC_PORTAL_ERROR'?500:400;return jsonError(code,status);}
function jsonOk(data:unknown):Response{return new Response(JSON.stringify({ok:true,...(data as Record<string,unknown>)}),{status:200,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}

const LEGAL_PATHS=['/impressum','/datenschutz','/agb','/avv','/unterauftragsverarbeiter','/datenportabilitaet','/rechtsverstoss-melden'] as const;
function releaseGateBypass(path:string):boolean{
  const normalized=path==='/'?'/':path.replace(/\/+$/,'');
  if(normalized==='/'||normalized==='/plattform-admin'||normalized==='/api/platform'||normalized.startsWith('/api/platform/')||normalized==='/api/auth'||normalized.startsWith('/api/auth/')||normalized==='/api/public/legal'||normalized==='/api/legal/report'||normalized==='/api/payments/stripe/webhook'||normalized==='/api/integrations/microsoft/callback')return true;
  if(normalized==='/lernabend-vfa13'||normalized.startsWith('/quiz/vfa13/')||normalized.startsWith('/api/live-study/'))return true;
  if(['/passwort-vergessen','/passwort-zuruecksetzen','/konto-aktivieren',...LEGAL_PATHS].includes(normalized as any))return true;
  if(normalized.startsWith('/brand/logo/'))return true;
  return /\.(?:js|css|mjs|map|png|jpe?g|webp|svg|ico|woff2?|ttf)$/i.test(normalized);
}
async function releaseGateAllowsLockedRequest(path:string,request:Request,env:Env):Promise<boolean>{
  if(releaseGateBypass(path))return true;
  if(await acceptanceModeAllowsLockedRequest(env,request))return true;
  if(!path.startsWith('/api/'))return false;
  try{return !!(await getSession(env,request))?.isPlatformAdmin;}catch{return false;}
}
function productionLockedResponse(path:string,reason:string|null):Response{
  const headers={'cache-control':'no-store','retry-after':'300'};
  if(path.startsWith('/api/')||path.startsWith('/public/')||path.startsWith('/calendar/')||path.startsWith('/scim/'))return new Response(JSON.stringify({ok:false,error:'PRODUCTION_RELEASE_LOCKED'}),{status:503,headers:{...headers,'content-type':'application/json; charset=utf-8'}});
  const html='<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Klassenportal</title><body style="font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#f8fafc;color:#0f172a"><main style="max-width:560px;margin:24px;padding:28px;background:#fff;border:1px solid #e2e8f0;border-radius:18px"><h1 style="margin-top:0">Klassenportal vorübergehend nicht verfügbar</h1><p>Diese Version ist noch nicht für den Produktivbetrieb freigegeben. Bitte versuche es später erneut.</p></main></body></html>';
  void reason;return new Response(html,{status:503,headers:{...headers,'content-type':'text/html; charset=utf-8'}});
}

async function routeRequest(request:Request,env:Env):Promise<Response>{
  const url=new URL(request.url),clean=url.pathname.replace(/\/$/,'');
  const release=await productionReleaseAccess(env,request);if(release.production&&!release.allowed&&!await releaseGateAllowsLockedRequest(url.pathname,request,env))return productionLockedResponse(url.pathname,release.reason);

  const intakePublic=await handlePublicIntakeRoute(request,env);if(intakePublic)return intakePublic;
  const enterprisePublic=url.pathname.startsWith('/sso/')||url.pathname.startsWith('/scim/')||url.pathname.startsWith('/api/v1/');
  if(enterprisePublic){const r=await handleEnterpriseRouter(request,env);if(r)return r;}
  const logo=url.pathname.match(/^\/brand\/logo\/([^/]+)$/);if(logo)return serveTenantLogo(env,decodeURIComponent(logo[1]));
  const calendarFeed=url.pathname.match(/^\/calendar\/([A-Za-z0-9]+)\.ics$/);if(calendarFeed){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return calendarFeedResponse(env,calendarFeed[1]);}
  if(['/passwort-vergessen','/passwort-zuruecksetzen','/konto-aktivieren'].includes(clean)){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return env.ASSETS.fetch(new Request(new URL('/account-action.html',request.url),{method:request.method,headers:request.headers}));}
  if((LEGAL_PATHS as readonly string[]).includes(clean)){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return renderLegalDocument(env,clean.slice(1) as any);}
  if(clean==='/produkt'){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return env.ASSETS.fetch(new Request(new URL('/produkt.html',request.url),{method:request.method,headers:request.headers}));}
  if(['/plattform-admin','/kunden-admin','/klassen-admin'].includes(clean)){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});const asset=clean==='/kunden-admin'?'/customer-admin.html':clean==='/klassen-admin'?'/class-admin.html':'/platform-admin.html';return env.ASSETS.fetch(new Request(new URL(asset,request.url),{method:request.method,headers:request.headers}));}
  if(clean==='/dozentenportal'||clean==='/dozentenportal.html'){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return env.ASSETS.fetch(new Request(new URL('/dozentenportal.html',request.url),{method:request.method,headers:request.headers}));}
  if(clean==='/lernabend-vfa13'){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return env.ASSETS.fetch(new Request(new URL('/vfa-study-presenter.html',request.url),{method:request.method,headers:request.headers}));}
  if(/^\/quiz\/vfa13\/[a-f0-9]{24}\/?$/.test(url.pathname)){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return env.ASSETS.fetch(new Request(new URL('/vfa-study-quiz.html',request.url),{method:request.method,headers:request.headers}));}
  if(/^\/portal\/[^/]+\/[^/]+\/?$/.test(url.pathname)){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return env.ASSETS.fetch(new Request(new URL('/class-portal.html',request.url),{method:request.method,headers:request.headers}));}
  if(url.pathname.startsWith('/einrichtung/')){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return env.ASSETS.fetch(new Request(new URL('/onboarding.html',request.url),{method:request.method,headers:request.headers}));}
  if(/^\/angebot\/[^/]+\/?$/.test(url.pathname)){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return env.ASSETS.fetch(new Request(new URL('/angebot.html',request.url),{method:request.method,headers:request.headers}));}
  if(clean==='/zahlung/erfolg'||clean==='/zahlung/abgebrochen'){if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Methode nicht erlaubt',{status:405});return env.ASSETS.fetch(new Request(new URL('/payment-result.html',request.url),{method:request.method,headers:request.headers}));}

  const classMeta=url.pathname.match(/^\/public\/([^/]+)\/([^/]+)\/meta$/);if(classMeta){if(request.method!=='GET')return new Response('Methode nicht erlaubt',{status:405});try{return jsonOk(await publicPortalMetadata(env,decodeURIComponent(classMeta[1]),decodeURIComponent(classMeta[2])));}catch(e){return publicError(e);}}
  const classMaterial=url.pathname.match(/^\/public\/([^/]+)\/([^/]+)\/materials\/([^/]+)$/);if(classMaterial){if(request.method!=='GET')return new Response('Methode nicht erlaubt',{status:405});try{return await publicMaterialDownload(env,decodeURIComponent(classMaterial[1]),decodeURIComponent(classMaterial[2]),decodeURIComponent(classMaterial[3]),await getSession(env,request),request.headers.get('X-Klassenportal-Access-Code')||undefined);}catch(e){return publicError(e);}}
  const classOverview=url.pathname.match(/^\/public\/([^/]+)\/([^/]+)\/overview$/);if(classOverview){if(request.method!=='GET')return new Response('Methode nicht erlaubt',{status:405});try{const tenantSlug=decodeURIComponent(classOverview[1]),courseCode=decodeURIComponent(classOverview[2]),session=await getSession(env,request),accessCode=request.headers.get('X-Klassenportal-Access-Code')||url.searchParams.get('access_code')||undefined,base=await publicOverview(env,tenantSlug,courseCode,session,accessCode),advanced=await publicAdvancedBySlug(env,tenantSlug,courseCode,session,env.APP_ORIGIN||url.origin);return jsonOk({...base,...advanced});}catch(e){return publicError(e);}}

  const liveStudy=await handleLiveStudyApi(request,env);if(liveStudy)return liveStudy;
  const microsoftGraph=await handleMicrosoftGraphApi(request,env);if(microsoftGraph)return microsoftGraph;
  const collaboration=await handleCollaborationReportingApi(request,env);if(collaboration)return collaboration;
  const accountRecovery=await handleAccountRecoveryApi(request,env);if(accountRecovery)return accountRecovery;
  const launch=await handleLaunchReadinessApi(request,env);if(launch)return launch;
  const ownerSecurity=await handleOwnerSecurityApi(request,env);if(ownerSecurity)return ownerSecurity;
  const customDomain=await handleCustomDomainApi(request,env);if(customDomain)return customDomain;
  const schemaApi=await handleRuntimeSchemaApi(request,env);if(schemaApi)return schemaApi;
  const lifecycle=await handleBillingLifecycleApi(request,env);if(lifecycle)return lifecycle;
  const payment=await handlePaymentApi(request,env);if(payment)return payment;
  const communications=await handleCommunicationsApi(request,env);if(communications)return communications;
  const attendance=await handleAttendanceApi(request,env);if(attendance)return attendance;
  const participant360Response=await handleParticipant360Api(request,env);if(participant360Response)return participant360Response;

  const onboardingPost=request.method==='POST'&&/^\/api\/onboarding\/[^/]+$/.test(url.pathname);if(onboardingPost){const payload=await request.clone().json().catch(()=>({})) as Record<string,unknown>;if(String(payload.commercial_action||'trial')==='book'&&(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET))return jsonError('STRIPE_NOT_CONFIGURED',503);}
  const tenantId=url.searchParams.get('tenant_id'),mutating=request.method!=='GET'&&request.method!=='HEAD',exemptMutation=url.pathname==='/api/timetable/preview'||url.pathname.startsWith('/api/auth/')||url.pathname.startsWith('/api/onboarding/')||url.pathname.startsWith('/api/platform/');if(tenantId&&mutating&&!exemptMutation){try{await assertPaymentWriteAccess(env,tenantId);}catch(e){return accessError(e);}}
  if(url.pathname.startsWith('/api/enterprise/')){const enterprise=await handleEnterpriseRouter(request,env);if(enterprise)return enterprise;}
  const portability=await handlePortabilityRequest(request,env,portabilityConfig,(r)=>resolvePortabilityAuth(env,r));if(portability)return portability;
  const api=await handleCoreApi(request,env);if(api){if(onboardingPost)return augmentPaidOnboardingResponse(env,request,api);return api;}
  const pub=await handlePublicApi(request,env);if(pub)return pub;
  return env.ASSETS.fetch(request);
}

export default{
  async fetch(request:Request,env:Env):Promise<Response>{try{return harden(await routeRequest(request,env));}catch(error){console.error('Unhandled request error',{path:new URL(request.url).pathname,error:String((error as Error)?.message||error)});return harden(jsonError('INTERNAL_ERROR',500));}},
  async scheduled(controller:{cron?:string},env:Env):Promise<void>{
    await runCommunicationAutomation(env).catch(e=>console.error('Communication automation failed',{error:String((e as Error)?.message||e)}));
    await runAttendanceAttention(env).catch(e=>console.error('Attendance attention automation failed',{error:String((e as Error)?.message||e)}));
    await runPlatformAutomationCycle(env).catch(e=>console.error('Platform automation cycle failed',{error:String((e as Error)?.message||e)}));
    if(controller?.cron==='*/5 * * * *')return;
    await refreshTrialStates(env);await processScheduledModuleCancellations(env,25);await ensureCustomDomainGuards(env).catch(()=>undefined);await reconcilePendingCustomDomains(env,25).catch(e=>console.error('Custom domain reconciliation failed',{error:String((e as Error)?.message||e)}));await runScheduledTenantBackups(env,portabilityConfig,'system:backup',3);await verifyPendingBackups(env,2).catch(e=>console.error('Backup verification failed',{error:String((e as Error)?.message||e)}));await cleanupAccountActions(env).catch(()=>undefined);await cleanupOidcStates(env).catch(()=>undefined);await cleanupIntake(env).catch(e=>console.error('Intake cleanup failed',{error:String((e as Error)?.message||e)}));
    const now=new Date(),nowIso=now.toISOString();await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(nowIso).run();await env.DB.prepare('DELETE FROM platform_mfa_challenges WHERE expires_at <= ?').bind(nowIso).run().catch(()=>undefined);await env.DB.prepare("UPDATE onboarding_invitations SET status='expired' WHERE status='open' AND expires_at <= ?").bind(nowIso).run();await env.DB.prepare('DELETE FROM login_attempts WHERE window_started_at <= ?').bind(new Date(now.getTime()-24*60*60_000).toISOString()).run();await env.DB.prepare('DELETE FROM legal_content_report_limits WHERE window_started_at <= ?').bind(new Date(now.getTime()-24*60*60_000).toISOString()).run().catch(()=>undefined);await env.DB.prepare('DELETE FROM integration_rate_limits WHERE window_started_at <= ?').bind(new Date(now.getTime()-24*60*60_000).toISOString()).run().catch(()=>undefined);await env.DB.prepare("UPDATE org_import_batches SET status='expired' WHERE status='previewed' AND expires_at<=?").bind(nowIso).run().catch(()=>undefined);await env.DB.prepare("DELETE FROM participant_import_batches WHERE (status='preview' AND expires_at<=?) OR (status IN ('applied','cancelled','expired') AND COALESCE(applied_at,created_at)<=?)").bind(nowIso,new Date(now.getTime()-90*86400000).toISOString()).run().catch(()=>undefined);await env.DB.prepare('DELETE FROM microsoft_oauth_states WHERE expires_at<=?').bind(nowIso).run().catch(()=>undefined);await env.DB.prepare('DELETE FROM live_study_sessions WHERE expires_at<=?').bind(nowIso).run().catch(()=>undefined);
  },
};