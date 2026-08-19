import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { participant360, participant360Candidates } from './participant-360.js';
import { forbidClassAdminStudentData } from './student-role.js';
import { assertSameOrigin, json } from './utils.js';
import { handleEducationOperationsApi } from './education-operations-router.js';

function fail(e:unknown){const code=String((e as Error)?.message||'PARTICIPANT_360_ERROR'),status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')?403:code.includes('NOT_FOUND')?404:400;return json({ok:false,error:code},status);}
export async function handleParticipant360Api(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),path=u.pathname;
  if(path.startsWith('/api/education/'))return handleEducationOperationsApi(request,env);
  if(!path.startsWith('/api/participant-360'))return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||undefined;if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId);forbidClassAdminStudentData(auth);
    if(path==='/api/participant-360/candidates')return json({ok:true,participants:await participant360Candidates(env,auth,tenantId)});
    const match=path.match(/^\/api\/participant-360\/([^/]+)$/);if(match)return json({ok:true,overview:await participant360(env,auth,tenantId,decodeURIComponent(match[1]))});
    return json({ok:false,error:'PARTICIPANT_360_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
