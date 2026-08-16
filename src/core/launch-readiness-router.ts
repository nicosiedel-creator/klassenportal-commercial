import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { ownerLegal, publicLegal, updateOwnerLegal } from './legal.js';
import { productionReadiness } from './launch-readiness.js';
import { verifyBackup } from './backup-verification.js';
import { assertSameOrigin, json } from './utils.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown):Response{const code=String((e as Error)?.message||'INTERNAL_ERROR');const status=code==='UNAUTHENTICATED'?401:code.includes('ADMIN_REQUIRED')||code.startsWith('FORBIDDEN')?403:code.includes('NOT_FOUND')?404:code.includes('NOT_READY')?409:code.includes('REQUIRED')||code.includes('INVALID')?400:500;return json({ok:false,error:code},status);}
export async function handleLaunchReadinessApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);
  try{
    if(u.pathname==='/api/public/legal'&&request.method==='GET')return json({ok:true,legal:await publicLegal(env)});
    if(!u.pathname.startsWith('/api/platform/legal')&&!u.pathname.startsWith('/api/platform/release-readiness')&&!u.pathname.startsWith('/api/platform/backups/'))return null;
    assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);
    if(u.pathname==='/api/platform/legal'&&request.method==='GET')return json({ok:true,legal:await ownerLegal(env,auth)});
    if(u.pathname==='/api/platform/legal'&&request.method==='PUT')return json({ok:true,legal:await updateOwnerLegal(env,auth,await body(request))});
    if(u.pathname==='/api/platform/release-readiness'&&request.method==='GET')return json({ok:true,readiness:await productionReadiness(env,auth)});
    const verify=u.pathname.match(/^\/api\/platform\/backups\/([^/]+)\/verify$/);if(verify&&request.method==='POST'){if(!auth.isPlatformAdmin)throw new Error('PLATFORM_ADMIN_REQUIRED');return json({ok:true,verification:await verifyBackup(env,decodeURIComponent(verify[1]))});}
    return new Response('Methode nicht erlaubt',{status:405});
  }catch(e){return fail(e);}
}
