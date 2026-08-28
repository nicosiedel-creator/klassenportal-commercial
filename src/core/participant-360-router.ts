import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { participant360, participant360Candidates } from './participant-360.js';
import { forbidClassAdminStudentData } from './student-role.js';
import { assertSameOrigin, authStatus, json, safeErrorCode } from './utils.js';
import { handleEducationOperationsApi } from './education-operations-router.js';
import { handleEducationOsApi } from './education-os-router.js';
import { handleEducationRoleInsightsApi } from './education-role-insights-router.js';
import { handleAdaptiveRecoveryApi } from './adaptive-recovery-router.js';
import { handleLearningAdminApi } from './learning-admin-router.js';
import { handleSecureSignatureMine } from './signature-request-access.js';
import { handleCourseSignatureApi } from './course-signatures.js';
import { handlePlanningApi } from './planning-router.js';
import { handlePersonalCompassApi } from './education-personal-compass-router.js';
import { handleTrainingMoatApi } from './training-moat-router.js';

function fail(e:unknown){const code=safeErrorCode(e),status=authStatus(code)??(code.includes('NOT_FOUND')?404:400);return json({ok:false,error:code},status);}
export async function handleParticipant360Api(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),path=u.pathname;
  const moat=await handleTrainingMoatApi(request,env);if(moat)return moat;
  const compass=await handlePersonalCompassApi(request,env);if(compass)return compass;
  const roleInsight=await handleEducationRoleInsightsApi(request,env);if(roleInsight)return roleInsight;
  const recovery=await handleAdaptiveRecoveryApi(request,env);if(recovery)return recovery;
  if(path.startsWith('/api/education-os/'))return handleEducationOsApi(request,env);
  if(path==='/api/education/signatures/mine')return handleSecureSignatureMine(request,env);
  if(path==='/api/education/course-signatures')return handleCourseSignatureApi(request,env);
  const planning=await handlePlanningApi(request,env);if(planning)return planning;
  if(path.startsWith('/api/education/'))return handleEducationOperationsApi(request,env);
  if(path.startsWith('/api/learning-admin/'))return handleLearningAdminApi(request,env);
  if(!path.startsWith('/api/participant-360'))return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||undefined;if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId);forbidClassAdminStudentData(auth);
    if(path==='/api/participant-360/candidates')return json({ok:true,participants:await participant360Candidates(env,auth,tenantId)});
    const match=path.match(/^\/api\/participant-360\/([^/]+)$/);if(match)return json({ok:true,overview:await participant360(env,auth,tenantId,decodeURIComponent(match[1]))});
    return json({ok:false,error:'PARTICIPANT_360_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
