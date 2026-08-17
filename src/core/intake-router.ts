import type { CoreAuthContext, Env } from './types.js';
import { addIntakeSubmitter, applyIntakeBatch, completeAutomationTask, createIntakeChannel, createIntakeUploadLink, getIntakeBatch, getIntakeDocument, getIntakeOverview, handleIntakePublicUpload, handleResendInboundWebhook, previewIntakeBatch, renderIntakeUploadPage, revokeIntakeChannel, revokeIntakeSubmitter, updateIntakeSettings } from './intake-center.js';

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
function fail(e:unknown){const code=String((e as Error)?.message||'INTAKE_ERROR'),status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')?403:code.includes('NOT_FOUND')?404:code.includes('RATE_LIMITED')?429:code.includes('EXPIRED')||code.includes('INVALID')&&code.includes('LINK')?410:code.includes('TOO_LARGE')||code.includes('TOO_MANY')?413:code.includes('REQUIRED')||code.includes('INVALID')?400:500;return json({ok:false,error:code},status);}
async function body(request:Request){try{return await request.json() as Record<string,unknown>;}catch{return{};}}

export async function handlePublicIntakeRoute(request:Request,env:Env):Promise<Response|null>{
  const path=new URL(request.url).pathname;
  if(path==='/api/inbound/resend'){if(request.method!=='POST')return new Response('Methode nicht erlaubt',{status:405});return handleResendInboundWebhook(env,request);}
  const page=path.match(/^\/eingang\/([^/]+)$/);if(page&&request.method==='GET')return renderIntakeUploadPage(env,decodeURIComponent(page[1]));
  const upload=path.match(/^\/api\/intake\/upload\/([^/]+)$/);if(upload&&request.method==='POST'){try{return json({ok:true,...await handleIntakePublicUpload(env,decodeURIComponent(upload[1]),request)},201);}catch(e){return fail(e);}}
  return null;
}

export async function handleEnterpriseIntakeRoute(request:Request,env:Env,auth:CoreAuthContext,tenantId:string):Promise<Response|null>{
  const path=new URL(request.url).pathname;if(!path.startsWith('/api/enterprise/intake'))return null;
  try{
    if(path==='/api/enterprise/intake/overview'&&request.method==='GET')return json({ok:true,...await getIntakeOverview(env,auth,tenantId)});
    if(path==='/api/enterprise/intake/settings'&&request.method==='PUT')return json({ok:true,...await updateIntakeSettings(env,auth,tenantId,await body(request))});
    if(path==='/api/enterprise/intake/channels'&&request.method==='POST')return json({ok:true,channel:await createIntakeChannel(env,auth,tenantId,await body(request))},201);
    const channel=path.match(/^\/api\/enterprise\/intake\/channels\/([^/]+)$/);if(channel&&request.method==='DELETE'){await revokeIntakeChannel(env,auth,tenantId,decodeURIComponent(channel[1]));return json({ok:true});}
    if(path==='/api/enterprise/intake/submitters'&&request.method==='POST')return json({ok:true,submitter:await addIntakeSubmitter(env,auth,tenantId,await body(request))},201);
    const submitter=path.match(/^\/api\/enterprise\/intake\/submitters\/([^/]+)$/);if(submitter&&request.method==='DELETE'){await revokeIntakeSubmitter(env,auth,tenantId,decodeURIComponent(submitter[1]));return json({ok:true});}
    if(path==='/api/enterprise/intake/upload-links'&&request.method==='POST')return json({ok:true,link:await createIntakeUploadLink(env,auth,tenantId,await body(request),request)},201);
    const doc=path.match(/^\/api\/enterprise\/intake\/documents\/([^/]+)$/);if(doc&&request.method==='GET')return getIntakeDocument(env,auth,tenantId,decodeURIComponent(doc[1]));
    const batch=path.match(/^\/api\/enterprise\/intake\/batches\/([^/]+)$/);if(batch&&request.method==='GET')return json({ok:true,...await getIntakeBatch(env,auth,tenantId,decodeURIComponent(batch[1]))});
    const preview=path.match(/^\/api\/enterprise\/intake\/batches\/([^/]+)\/preview$/);if(preview&&request.method==='POST')return json({ok:true,...await previewIntakeBatch(env,auth,tenantId,decodeURIComponent(preview[1]),await body(request))});
    const apply=path.match(/^\/api\/enterprise\/intake\/batches\/([^/]+)\/apply$/);if(apply&&request.method==='POST')return json({ok:true,...await applyIntakeBatch(env,auth,tenantId,decodeURIComponent(apply[1]),await body(request))});
    const task=path.match(/^\/api\/enterprise\/intake\/tasks\/([^/]+)\/(done|dismiss)$/);if(task&&request.method==='POST'){await completeAutomationTask(env,auth,tenantId,decodeURIComponent(task[1]),task[2]==='dismiss'?'dismissed':'done');return json({ok:true});}
    return json({ok:false,error:'INTAKE_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
