import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin, json } from './utils.js';
import { teacherOperationalInsights } from './education-role-insights.js';

function fail(e:unknown){const code=String((e as Error)?.message||'EDUCATION_ROLE_INSIGHT_ERROR'),status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')?403:code.includes('NOT_FOUND')?404:400;return json({ok:false,error:code},status);}
export async function handleEducationRoleInsightsApi(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);if(url.pathname!=='/api/education-os/teacher-insights')return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);if(request.method!=='GET')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);const tenantId=url.searchParams.get('tenant_id')||'',courseId=url.searchParams.get('course_id')||'';if(!tenantId||!courseId)throw new Error('TEACHER_INSIGHT_SCOPE_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId);return json({ok:true,insights:await teacherOperationalInsights(env,auth,tenantId,courseId)});}catch(e){return fail(e);}
}

