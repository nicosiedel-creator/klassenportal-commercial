import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { assertSameOrigin, json } from './utils.js';
import { cancelTeamsMeeting, createOrSyncTeamsMeeting, disconnectMicrosoftAccount, finishMicrosoftConnection, getLessonMeeting, getMicrosoftConnectionStatus, linkTeamsMeeting, listCourseMeetings, startMicrosoftConnection } from './microsoft-graph.js';
import { listMeetingReadyLessons } from './microsoft-meeting-lessons.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function errorResponse(error:unknown):Response{
  const code=String((error as Error)?.message||'MICROSOFT_INTEGRATION_ERROR');
  const status=code==='UNAUTHENTICATED'?401
    :code.startsWith('FORBIDDEN')||code.includes('MFA_')||code.includes('PERMISSION_REQUIRED')||code.includes('ORGANIZER_MISMATCH')?403
    :code.includes('NOT_FOUND')?404
    :code.includes('RATE_LIMITED')?429
    :code.includes('NOT_CONNECTED')||code.includes('REAUTH_REQUIRED')?409
    :code.includes('CLIENT_ID_REQUIRED')||code.includes('CLIENT_SECRET_REQUIRED')||code.includes('REDIRECT_URI_REQUIRED')||code.includes('ENCRYPTION_KEY_REQUIRED')?503
    :400;
  return json({ok:false,error:code},status);
}
function callbackHtml(ok:boolean,message:string):Response{
  const title=ok?'Microsoft 365 verbunden':'Microsoft-365-Verbindung fehlgeschlagen';
  const safe=message.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));
  return new Response(`<!doctype html><html lang="de"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><body><main><h1>${title}</h1><p>${safe}</p><p>Du kannst dieses Fenster jetzt schließen und zum Klassenportal zurückkehren.</p></main></body></html>`,{status:ok?200:400,headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}});
}

export async function handleMicrosoftGraphApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),p=u.pathname;
  if(!p.startsWith('/api/integrations/microsoft'))return null;
  try{
    if(p==='/api/integrations/microsoft/callback'&&request.method==='GET'){
      const providerError=u.searchParams.get('error');if(providerError)return callbackHtml(false,'Microsoft hat die Verbindung nicht freigegeben.');
      await finishMicrosoftConnection(env,u.searchParams.get('code')||'',u.searchParams.get('state')||'');
      return callbackHtml(true,'Die Verbindung wurde sicher gespeichert.');
    }
    assertSameOrigin(request,env.APP_ORIGIN);
    const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||'';if(!tenantId)throw new Error('TENANT_ID_REQUIRED');
    const auth=await resolveCoreAuth(env,request,tenantId,courseId||undefined);
    if(!['GET','HEAD'].includes(request.method))await assertTenantWriteAllowed(env,tenantId);

    if(p==='/api/integrations/microsoft/status'&&request.method==='GET')return json({ok:true,...await getMicrosoftConnectionStatus(env,auth,tenantId,courseId||undefined)});
    if(p==='/api/integrations/microsoft/connect'&&request.method==='POST')return json({ok:true,...await startMicrosoftConnection(env,auth,tenantId,courseId||undefined)});
    if(p==='/api/integrations/microsoft/connect'&&request.method==='DELETE')return json({ok:true,...await disconnectMicrosoftAccount(env,auth,tenantId,courseId||undefined)});
    if(p==='/api/integrations/microsoft/lessons'&&request.method==='GET'){
      if(!courseId)throw new Error('COURSE_ID_REQUIRED');
      return json({ok:true,lessons:await listMeetingReadyLessons(env,auth,tenantId,courseId)});
    }
    if(p==='/api/integrations/microsoft/meetings'&&request.method==='GET'){
      if(!courseId)throw new Error('COURSE_ID_REQUIRED');
      return json({ok:true,meetings:await listCourseMeetings(env,auth,tenantId,courseId,u.searchParams.get('from')||undefined,u.searchParams.get('to')||undefined)});
    }
    const lessonRoute=p.match(/^\/api\/integrations\/microsoft\/lessons\/([^/]+)\/meeting$/);
    if(lessonRoute){
      if(!courseId)throw new Error('COURSE_ID_REQUIRED');const lessonId=decodeURIComponent(lessonRoute[1]);
      if(request.method==='GET')return json({ok:true,meeting:await getLessonMeeting(env,auth,tenantId,courseId,lessonId)});
      if(request.method==='POST')return json({ok:true,meeting:await createOrSyncTeamsMeeting(env,auth,tenantId,courseId,lessonId)});
      if(request.method==='PUT'){const b=await body(request);return json({ok:true,meeting:await linkTeamsMeeting(env,auth,tenantId,courseId,lessonId,b.join_url)});}
      if(request.method==='DELETE')return json({ok:true,...await cancelTeamsMeeting(env,auth,tenantId,courseId,lessonId)});
    }
    return json({ok:false,error:'MICROSOFT_ROUTE_NOT_FOUND'},404);
  }catch(e){return errorResponse(e);}
}
