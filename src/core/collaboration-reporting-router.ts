import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { assertSameOrigin, json } from './utils.js';
import { createDiscussionThread, listDiscussionMessages, listDiscussionThreads, listReportDefinitions, moderateDiscussionMessage, postDiscussionMessage, registerPushSubscription, revokePushSubscription, runSafeReport, saveDiscussionSettings, saveReportDefinition } from './collaboration-reporting.js';

async function body(r:Request):Promise<Record<string,unknown>>{try{return await r.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=String((e as Error)?.message||'COLLABORATION_ERROR');const status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('REQUIRED')||code.includes('DISABLED')?403:code.includes('NOT_FOUND')?404:code.includes('LOCKED')||code.includes('RATE_LIMIT')||code.includes('OWNED')?409:400;return json({ok:false,error:code},status);}
export async function handleCollaborationReportingApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),p=u.pathname;if(!p.startsWith('/api/collaboration')&&!p.startsWith('/api/reports')&&!p.startsWith('/api/push'))return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||'';if(!tenantId)throw new Error('TENANT_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId||undefined);if(!['GET','HEAD'].includes(request.method))await assertTenantWriteAllowed(env,tenantId);
    if(p==='/api/push/config'&&request.method==='GET')return json({ok:true,enabled:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_JWK),public_key:env.VAPID_PUBLIC_KEY||null});
    if(p==='/api/push/subscriptions'&&request.method==='POST'){const b=await body(request);return json({ok:true,...await registerPushSubscription(env,auth,tenantId,b)},201);}
    if(p==='/api/push/subscriptions'&&request.method==='DELETE'){const b=await body(request);await revokePushSubscription(env,auth,tenantId,String(b.endpoint||''));return json({ok:true});}
    if(p==='/api/collaboration/settings'&&request.method==='PUT')return json({ok:true,settings:await saveDiscussionSettings(env,auth,tenantId,await body(request))});
    if(p==='/api/collaboration/threads'&&request.method==='GET')return json({ok:true,threads:await listDiscussionThreads(env,auth,tenantId,courseId||undefined)});
    if(p==='/api/collaboration/threads'&&request.method==='POST')return json({ok:true,...await createDiscussionThread(env,auth,tenantId,courseId||null,await body(request))},201);
    const messages=p.match(/^\/api\/collaboration\/threads\/([^/]+)\/messages$/);if(messages&&request.method==='GET')return json({ok:true,messages:await listDiscussionMessages(env,auth,tenantId,decodeURIComponent(messages[1]))});if(messages&&request.method==='POST'){const b=await body(request);return json({ok:true,...await postDiscussionMessage(env,auth,tenantId,decodeURIComponent(messages[1]),String(b.body||''))},201);}
    const hide=p.match(/^\/api\/collaboration\/threads\/([^/]+)\/messages\/([^/]+)\/hide$/);if(hide&&request.method==='POST'){const b=await body(request);await moderateDiscussionMessage(env,auth,tenantId,decodeURIComponent(hide[1]),decodeURIComponent(hide[2]),String(b.reason||''));return json({ok:true});}
    if(p==='/api/reports/definitions'&&request.method==='GET')return json({ok:true,reports:await listReportDefinitions(env,auth,tenantId)});
    if(p==='/api/reports/definitions'&&request.method==='POST')return json({ok:true,...await saveReportDefinition(env,auth,tenantId,await body(request))},201);
    if(p==='/api/reports/run'&&request.method==='POST'){const result=await runSafeReport(env,auth,tenantId,await body(request));return json({ok:true,...result});}
    if(p==='/api/reports/export.csv'&&request.method==='POST'){const result=await runSafeReport(env,auth,tenantId,await body(request));return new Response('\uFEFF'+result.csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="bericht.csv"','cache-control':'no-store'}});}
    return json({ok:false,error:'COLLABORATION_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
