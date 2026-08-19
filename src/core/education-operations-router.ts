import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { assertSameOrigin, json } from './utils.js';
import { requireDelegatedPrivilegeMfa } from './delegated-privilege.js';
import {
  bindCurriculumToCourse,courseLifecycle,curriculumForParticipant,curriculumForTeacher,educationOperationsOverview,getCurriculumFramework,
  linkSessionToCurriculum,listCurriculumFrameworks,listDeadlines,listEducationDocuments,listExamWorkflows,listPracticePhases,listQualityActions,
  listSubstitutionCases,listTeacherQualifications,replaceCurriculumItems,saveCourseLifecycle,saveCurriculumFramework,saveDeadline,saveEducationDocument,
  saveExamWorkflow,savePracticePhase,saveQualityAction,saveSubstitutionCase,saveTeacherQualification,updateLifecycleItem,
} from './education-operations.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function errorResponse(error:unknown){const code=String((error as Error)?.message||'EDUCATION_OPERATIONS_ERROR');const status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')||code.includes('MFA_REQUIRED')?403:code.includes('NOT_FOUND')?404:code.includes('TOO_MANY')||code.includes('TOO_LARGE')?413:code.includes('REQUIRED')||code.includes('INVALID')?400:500;return json({ok:false,error:code},status);}

export async function handleEducationOperationsApi(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/education/'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    const tenantId=url.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_REQUIRED');const courseParam=url.searchParams.get('course_id')||undefined;
    const auth=await resolveCoreAuth(env,request,tenantId,courseParam);
    if(request.method!=='GET'&&request.method!=='HEAD')await assertTenantWriteAllowed(env,tenantId);
    const delegated=!auth.isPlatformAdmin&&auth.role!=='tenant_admin'&&(auth.permissions||[]).length>0;if(delegated)await requireDelegatedPrivilegeMfa(env,auth);

    if(path==='/api/education/overview'&&request.method==='GET')return json({ok:true,...await educationOperationsOverview(env,auth,tenantId)});

    if(path==='/api/education/curricula'&&request.method==='GET')return json({ok:true,frameworks:await listCurriculumFrameworks(env,auth,tenantId)});
    if(path==='/api/education/curricula'&&request.method==='POST')return json({ok:true,...await saveCurriculumFramework(env,auth,tenantId,await body(request))},201);
    const framework=path.match(/^\/api\/education\/curricula\/([^/]+)$/);if(framework&&request.method==='GET')return json({ok:true,...await getCurriculumFramework(env,auth,tenantId,decodeURIComponent(framework[1]))});
    const items=path.match(/^\/api\/education\/curricula\/([^/]+)\/items$/);if(items&&request.method==='PUT')return json({ok:true,...await replaceCurriculumItems(env,auth,tenantId,decodeURIComponent(items[1]),await body(request))});
    const bind=path.match(/^\/api\/education\/courses\/([^/]+)\/curriculum$/);if(bind&&request.method==='PUT'){const b=await body(request);return json({ok:true,binding:await bindCurriculumToCourse(env,auth,tenantId,decodeURIComponent(bind[1]),String(b.framework_id||''))});}
    const teacherCurriculum=path.match(/^\/api\/education\/courses\/([^/]+)\/curriculum\/teacher$/);if(teacherCurriculum&&request.method==='GET')return json({ok:true,...await curriculumForTeacher(env,auth,tenantId,decodeURIComponent(teacherCurriculum[1]))});
    const myCurriculum=path.match(/^\/api\/education\/courses\/([^/]+)\/curriculum\/me$/);if(myCurriculum&&request.method==='GET')return json({ok:true,...await curriculumForParticipant(env,auth,tenantId,decodeURIComponent(myCurriculum[1]))});
    const sessionCurriculum=path.match(/^\/api\/education\/courses\/([^/]+)\/sessions\/([^/]+)\/curriculum$/);if(sessionCurriculum&&request.method==='PUT')return json({ok:true,...await linkSessionToCurriculum(env,auth,tenantId,decodeURIComponent(sessionCurriculum[1]),decodeURIComponent(sessionCurriculum[2]),await body(request))});

    if(path==='/api/education/practice'&&request.method==='GET')return json({ok:true,phases:await listPracticePhases(env,auth,tenantId,courseParam,url.searchParams.get('include_people')==='1')});
    if(path==='/api/education/practice'&&request.method==='POST')return json({ok:true,...await savePracticePhase(env,auth,tenantId,await body(request))},201);
    if(path==='/api/education/exams'&&request.method==='GET')return json({ok:true,workflows:await listExamWorkflows(env,auth,tenantId,courseParam,url.searchParams.get('include_people')==='1')});
    if(path==='/api/education/exams'&&request.method==='POST')return json({ok:true,...await saveExamWorkflow(env,auth,tenantId,await body(request))},201);
    if(path==='/api/education/deadlines'&&request.method==='GET')return json({ok:true,deadlines:await listDeadlines(env,auth,tenantId,courseParam)});
    if(path==='/api/education/deadlines'&&request.method==='POST')return json({ok:true,...await saveDeadline(env,auth,tenantId,await body(request))},201);
    if(path==='/api/education/teacher-qualifications'&&request.method==='GET')return json({ok:true,qualifications:await listTeacherQualifications(env,auth,tenantId)});
    if(path==='/api/education/teacher-qualifications'&&request.method==='POST')return json({ok:true,...await saveTeacherQualification(env,auth,tenantId,await body(request))},201);
    if(path==='/api/education/substitutions'&&request.method==='GET')return json({ok:true,cases:await listSubstitutionCases(env,auth,tenantId,courseParam)});
    if(path==='/api/education/substitutions'&&request.method==='POST')return json({ok:true,...await saveSubstitutionCase(env,auth,tenantId,await body(request))},201);
    if(path==='/api/education/quality'&&request.method==='GET')return json({ok:true,actions:await listQualityActions(env,auth,tenantId,courseParam)});
    if(path==='/api/education/quality'&&request.method==='POST')return json({ok:true,...await saveQualityAction(env,auth,tenantId,await body(request))},201);
    if(path==='/api/education/documents'&&request.method==='GET')return json({ok:true,documents:await listEducationDocuments(env,auth,tenantId,courseParam,url.searchParams.get('include_people')==='1')});
    if(path==='/api/education/documents'&&request.method==='POST')return json({ok:true,...await saveEducationDocument(env,auth,tenantId,await body(request))},201);

    const lifecycle=path.match(/^\/api\/education\/courses\/([^/]+)\/lifecycle$/);if(lifecycle&&request.method==='GET')return json({ok:true,...await courseLifecycle(env,auth,tenantId,decodeURIComponent(lifecycle[1]))});if(lifecycle&&request.method==='PUT')return json({ok:true,...await saveCourseLifecycle(env,auth,tenantId,decodeURIComponent(lifecycle[1]),await body(request))});
    const lifecycleItem=path.match(/^\/api\/education\/courses\/([^/]+)\/lifecycle\/items\/([^/]+)$/);if(lifecycleItem&&request.method==='PUT')return json({ok:true,...await updateLifecycleItem(env,auth,tenantId,decodeURIComponent(lifecycleItem[1]),decodeURIComponent(lifecycleItem[2]),await body(request))});

    return json({ok:false,error:'EDUCATION_ROUTE_NOT_FOUND'},404);
  }catch(error){return errorResponse(error);}
}
