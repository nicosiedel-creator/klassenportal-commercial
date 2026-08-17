import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { acknowledgeCommunication, closeCommunication, createCommunication, getCommunication, listCommunications, markCommunicationRead, myCommunications, publishCommunication } from './secure-communications.js';
import { assertSameOrigin, json } from './utils.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=String((e as Error)?.message||'COMMUNICATION_ERROR'),status=code==='UNAUTHENTICATED'||code==='LOGIN_REQUIRED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')?403:code.includes('NOT_FOUND')?404:code.includes('NOT_PUBLISHABLE')||code.includes('ACK_NOT_AVAILABLE')?409:code.includes('TOO_MANY')?413:400;return json({ok:false,error:code},status);}

export async function handleCommunicationsApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),path=u.pathname;if(!path.startsWith('/api/communications'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||undefined;if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId);
    if(path==='/api/communications/my'&&request.method==='GET')return json({ok:true,messages:await myCommunications(env,auth,tenantId,courseId)});
    const read=path.match(/^\/api\/communications\/([^/]+)\/read$/);if(read&&request.method==='PATCH')return json({ok:true,...await markCommunicationRead(env,auth,tenantId,decodeURIComponent(read[1]))});
    const ack=path.match(/^\/api\/communications\/([^/]+)\/ack$/);if(ack&&request.method==='POST')return json({ok:true,...await acknowledgeCommunication(env,auth,tenantId,decodeURIComponent(ack[1]))});
    if(path==='/api/communications'&&request.method==='GET')return json({ok:true,messages:await listCommunications(env,auth,tenantId)});
    if(path==='/api/communications'&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,message:await createCommunication(env,auth,tenantId,await body(request))},201);}
    const publish=path.match(/^\/api\/communications\/([^/]+)\/publish$/);if(publish&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,message:await publishCommunication(env,auth,tenantId,decodeURIComponent(publish[1]))});}
    const close=path.match(/^\/api\/communications\/([^/]+)\/close$/);if(close&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);await closeCommunication(env,auth,tenantId,decodeURIComponent(close[1]));return json({ok:true});}
    const detail=path.match(/^\/api\/communications\/([^/]+)$/);if(detail&&request.method==='GET')return json({ok:true,message:await getCommunication(env,auth,tenantId,decodeURIComponent(detail[1]))});
    return json({ok:false,error:'COMMUNICATION_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
