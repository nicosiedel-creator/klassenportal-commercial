import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { getCustomDomain, reconcileCustomDomain, removeCustomDomain, requestCustomDomain } from './custom-domains.js';
import { assertSameOrigin, json } from './utils.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown):Response{const code=String((e as Error)?.message||'INTERNAL_ERROR');const status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')?403:code.includes('NOT_FOUND')?404:code.includes('ALREADY')||code.includes('REPLACEMENT')?409:code.includes('NOT_CONFIGURED')?503:code.includes('REQUIRED')||code.includes('INVALID')||code.includes('RESERVED')||code.includes('NOT_ACTIVE')?400:500;return json({ok:false,error:code},status);}
export async function handleCustomDomainApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);if(!u.pathname.startsWith('/api/custom-domain'))return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId);
    if(u.pathname==='/api/custom-domain'&&request.method==='GET')return json({ok:true,...await getCustomDomain(env,auth,tenantId)});
    if(u.pathname==='/api/custom-domain'&&request.method==='POST')return json({ok:true,...await requestCustomDomain(env,auth,tenantId,await body(request))},201);
    if(u.pathname==='/api/custom-domain/reconcile'&&request.method==='POST'){const row=await reconcileCustomDomain(env,auth,tenantId);return json({ok:true,...await getCustomDomain(env,auth,tenantId),reconciledStatus:row.status});}
    if(u.pathname==='/api/custom-domain'&&request.method==='DELETE')return json({ok:true,...await removeCustomDomain(env,auth,tenantId)});
    return new Response('Methode nicht erlaubt',{status:405});
  }catch(e){return fail(e);}
}
