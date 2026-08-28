import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin, authStatus, json, safeErrorCode } from './utils.js';
import { personalLearningCompass } from './education-personal-compass.js';
function fail(e:unknown){const code=safeErrorCode(e),status=authStatus(code)??(code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')?403:code.includes('NOT_FOUND')?404:400);return json({ok:false,error:code},status);}
export async function handlePersonalCompassApi(request:Request,env:Env):Promise<Response|null>{const url=new URL(request.url);if(url.pathname!=='/api/education-os/my-compass')return null;try{assertSameOrigin(request,env.APP_ORIGIN);if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);const tenantId=url.searchParams.get('tenant_id')||'',courseId=url.searchParams.get('course_id')||'';if(!tenantId||!courseId)throw new Error('COMPASS_SCOPE_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId);return json({ok:true,compass:await personalLearningCompass(env,auth,tenantId,courseId)});}catch(e){return fail(e);}}
