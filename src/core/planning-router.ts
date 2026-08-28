import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { requireDelegatedPrivilegeAccess } from './delegated-privilege.js';
import { assertSameOrigin, authStatus, json, safeErrorCode } from './utils.js';
import {
  getCourseSchedulingRules,linkPlanEntryResource,listPlanningBlackouts,listTeacherUnavailability,
  planningSuggestions,publishAdvancedTimetablePlan,saveCourseSchedulingRules,savePlanningBlackout,
  saveResourceUnavailability,saveTeacherWorkloadRules,substituteSuggestions,validateAdvancedTimetablePlan,
} from './planning-constraints.js';
import { saveTeacherUnavailabilityWithSubstitutions } from './planning-automation.js';
import {
  listPlanningResourcesManaged,listPlanningTeachersManaged,listResourceUnavailabilityManaged,savePlanningResourceManaged,
} from './planning-resource-management.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=safeErrorCode(e),status=authStatus(code)??(code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')?403:code.includes('NOT_FOUND')?404:code.includes('CONFLICT')||code.includes('LOCKED')||code.includes('EXISTS')?409:code.includes('REQUIRED')||code.includes('INVALID')?400:500);return json({ok:false,error:code},status);}

export async function handlePlanningApi(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url),path=url.pathname;
  const advancedPlan=/^\/api\/education\/timetable-plans\/[^/]+\/(?:validate|publish)$/.test(path);
  if(!path.startsWith('/api/education/planning/')&&!advancedPlan)return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    const tenantId=url.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_REQUIRED');
    const courseId=url.searchParams.get('course_id')||undefined,auth=await resolveCoreAuth(env,request,tenantId,courseId);
    if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'&&(auth.permissions||[]).length)await requireDelegatedPrivilegeAccess(env,auth);
    if(request.method!=='GET'&&request.method!=='HEAD')await assertTenantWriteAllowed(env,tenantId);

    const validate=path.match(/^\/api\/education\/timetable-plans\/([^/]+)\/validate$/);if(validate&&request.method==='POST')return json({ok:true,...await validateAdvancedTimetablePlan(env,auth,tenantId,decodeURIComponent(validate[1]))});
    const publish=path.match(/^\/api\/education\/timetable-plans\/([^/]+)\/publish$/);if(publish&&request.method==='POST')return json({ok:true,...await publishAdvancedTimetablePlan(env,auth,tenantId,decodeURIComponent(publish[1]))});

    if(path==='/api/education/planning/resources'&&request.method==='GET')return json({ok:true,resources:await listPlanningResourcesManaged(env,auth,tenantId)});
    if(path==='/api/education/planning/resources'&&request.method==='POST')return json({ok:true,...await savePlanningResourceManaged(env,auth,tenantId,await body(request))},201);
    if(path==='/api/education/planning/resources/unavailability'&&request.method==='GET')return json({ok:true,blocks:await listResourceUnavailabilityManaged(env,auth,tenantId)});
    if(path==='/api/education/planning/resources/unavailability'&&request.method==='POST')return json({ok:true,...await saveResourceUnavailability(env,auth,tenantId,await body(request))},201);
    if(path==='/api/education/planning/teachers'&&request.method==='GET')return json({ok:true,teachers:await listPlanningTeachersManaged(env,auth,tenantId)});

    if(path==='/api/education/planning/teacher-unavailability'&&request.method==='GET')return json({ok:true,blocks:await listTeacherUnavailability(env,auth,tenantId)});
    if(path==='/api/education/planning/teacher-unavailability'&&request.method==='POST')return json({ok:true,...await saveTeacherUnavailabilityWithSubstitutions(env,auth,tenantId,await body(request))},201);
    if(path==='/api/education/planning/blackouts'&&request.method==='GET')return json({ok:true,blackouts:await listPlanningBlackouts(env,auth,tenantId)});
    if(path==='/api/education/planning/blackouts'&&request.method==='POST')return json({ok:true,...await savePlanningBlackout(env,auth,tenantId,await body(request))},201);

    const courseRules=path.match(/^\/api\/education\/planning\/courses\/([^/]+)\/rules$/);
    if(courseRules&&request.method==='GET')return json({ok:true,rules:await getCourseSchedulingRules(env,auth,tenantId,decodeURIComponent(courseRules[1]))});
    if(courseRules&&request.method==='PUT')return json({ok:true,rules:await saveCourseSchedulingRules(env,auth,tenantId,decodeURIComponent(courseRules[1]),await body(request))});

    const teacherRules=path.match(/^\/api\/education\/planning\/teachers\/([^/]+)\/rules$/);if(teacherRules&&request.method==='PUT')return json({ok:true,...await saveTeacherWorkloadRules(env,auth,tenantId,decodeURIComponent(teacherRules[1]),await body(request))});
    const resourceLink=path.match(/^\/api\/education\/planning\/timetable-plans\/([^/]+)\/entries\/([^/]+)\/resources$/);if(resourceLink&&request.method==='POST')return json({ok:true,...await linkPlanEntryResource(env,auth,tenantId,decodeURIComponent(resourceLink[1]),decodeURIComponent(resourceLink[2]),await body(request))},201);
    if(path==='/api/education/planning/suggestions'&&request.method==='GET')return json({ok:true,...await planningSuggestions(env,auth,tenantId,{course_id:courseId,subject_id:url.searchParams.get('subject_id'),starts_at:url.searchParams.get('starts_at'),ends_at:url.searchParams.get('ends_at')})});
    const substitute=path.match(/^\/api\/education\/planning\/courses\/([^/]+)\/lessons\/([^/]+)\/substitutes$/);if(substitute&&request.method==='GET')return json({ok:true,...await substituteSuggestions(env,auth,tenantId,decodeURIComponent(substitute[1]),decodeURIComponent(substitute[2]))});
    return json({ok:false,error:'PLANNING_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
