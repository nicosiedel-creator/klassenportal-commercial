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
import {
  applyLegacyClassbookImport,createSignatureDocument,ensureReportBookPeriod,generateReportBookFromSchedule,generateTimetablePlanEntries,getTimetablePlan,
  listCourseActivities,listExcursions,listLegacyImports,listMyReportBooks,listMySignatureRequests,listTimetablePlans,publishTimetablePlan,
  previewLegacyImport,reviewReportBook,saveActivityDetail,saveExcursion,saveReportBookEntry,saveTimetablePlan,saveTimetablePlanEntry,
  signDocument,submitReportBook,teacherReportBooks,validateTimetablePlan,
} from './learning-operations.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function errorResponse(error:unknown){const code=String((error as Error)?.message||'EDUCATION_OPERATIONS_ERROR');const status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')||code.includes('MFA_REQUIRED')?403:code.includes('NOT_FOUND')?404:code.includes('LOCKED')||code.includes('CONFLICT')||code.includes('CLOSED')||code.includes('HAS_ERRORS')?409:code.includes('TOO_MANY')||code.includes('TOO_LARGE')?413:code.includes('REQUIRED')||code.includes('INVALID')||code.includes('MISMATCH')||code.includes('UNSUPPORTED')?400:500;return json({ok:false,error:code},status);}

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

    const activities=path.match(/^\/api\/education\/courses\/([^/]+)\/activities$/);if(activities&&request.method==='GET')return json({ok:true,activities:await listCourseActivities(env,auth,tenantId,decodeURIComponent(activities[1]))});if(activities&&request.method==='POST')return json({ok:true,...await saveActivityDetail(env,auth,tenantId,decodeURIComponent(activities[1]),await body(request))},201);
    if(path==='/api/education/excursions'&&request.method==='GET')return json({ok:true,excursions:await listExcursions(env,auth,tenantId,courseParam)});if(path==='/api/education/excursions'&&request.method==='POST')return json({ok:true,...await saveExcursion(env,auth,tenantId,await body(request))},201);

    if(path==='/api/education/timetable-plans'&&request.method==='GET')return json({ok:true,plans:await listTimetablePlans(env,auth,tenantId)});if(path==='/api/education/timetable-plans'&&request.method==='POST')return json({ok:true,...await saveTimetablePlan(env,auth,tenantId,await body(request))},201);
    const plan=path.match(/^\/api\/education\/timetable-plans\/([^/]+)$/);if(plan&&request.method==='GET')return json({ok:true,...await getTimetablePlan(env,auth,tenantId,decodeURIComponent(plan[1]))});if(plan&&request.method==='PUT')return json({ok:true,...await saveTimetablePlan(env,auth,tenantId,{...(await body(request)),id:decodeURIComponent(plan[1])})});
    const planEntries=path.match(/^\/api\/education\/timetable-plans\/([^/]+)\/entries$/);if(planEntries&&request.method==='POST')return json({ok:true,...await saveTimetablePlanEntry(env,auth,tenantId,decodeURIComponent(planEntries[1]),await body(request))},201);
    const planGenerate=path.match(/^\/api\/education\/timetable-plans\/([^/]+)\/generate$/);if(planGenerate&&request.method==='POST')return json({ok:true,...await generateTimetablePlanEntries(env,auth,tenantId,decodeURIComponent(planGenerate[1]),await body(request))},201);
    const planValidate=path.match(/^\/api\/education\/timetable-plans\/([^/]+)\/validate$/);if(planValidate&&request.method==='POST')return json({ok:true,...await validateTimetablePlan(env,auth,tenantId,decodeURIComponent(planValidate[1]))});
    const planPublish=path.match(/^\/api\/education\/timetable-plans\/([^/]+)\/publish$/);if(planPublish&&request.method==='POST')return json({ok:true,...await publishTimetablePlan(env,auth,tenantId,decodeURIComponent(planPublish[1]))});

    if(path==='/api/education/signatures/mine'&&request.method==='GET')return json({ok:true,requests:await listMySignatureRequests(env,auth,tenantId)});if(path==='/api/education/signatures/documents'&&request.method==='POST')return json({ok:true,...await createSignatureDocument(env,auth,tenantId,await body(request))},201);
    const sign=path.match(/^\/api\/education\/signatures\/([^/]+)\/sign$/);if(sign&&request.method==='POST')return json({ok:true,...await signDocument(env,auth,tenantId,decodeURIComponent(sign[1]),await body(request))});

    const reportMine=path.match(/^\/api\/education\/courses\/([^/]+)\/report-book\/mine$/);if(reportMine&&request.method==='GET')return json({ok:true,periods:await listMyReportBooks(env,auth,tenantId,decodeURIComponent(reportMine[1]))});
    const reportPeriods=path.match(/^\/api\/education\/courses\/([^/]+)\/report-book\/periods$/);if(reportPeriods&&request.method==='POST')return json({ok:true,...await ensureReportBookPeriod(env,auth,tenantId,decodeURIComponent(reportPeriods[1]),await body(request))},201);
    const reportEntry=path.match(/^\/api\/education\/courses\/([^/]+)\/report-book\/periods\/([^/]+)\/entries$/);if(reportEntry&&request.method==='POST')return json({ok:true,...await saveReportBookEntry(env,auth,tenantId,decodeURIComponent(reportEntry[1]),decodeURIComponent(reportEntry[2]),await body(request))},201);
    const reportGenerate=path.match(/^\/api\/education\/courses\/([^/]+)\/report-book\/periods\/([^/]+)\/generate$/);if(reportGenerate&&request.method==='POST')return json({ok:true,...await generateReportBookFromSchedule(env,auth,tenantId,decodeURIComponent(reportGenerate[1]),decodeURIComponent(reportGenerate[2]))});
    const reportSubmit=path.match(/^\/api\/education\/courses\/([^/]+)\/report-book\/periods\/([^/]+)\/submit$/);if(reportSubmit&&request.method==='POST')return json({ok:true,...await submitReportBook(env,auth,tenantId,decodeURIComponent(reportSubmit[1]),decodeURIComponent(reportSubmit[2]))});
    const reportTeacher=path.match(/^\/api\/education\/courses\/([^/]+)\/report-book\/teacher$/);if(reportTeacher&&request.method==='GET')return json({ok:true,periods:await teacherReportBooks(env,auth,tenantId,decodeURIComponent(reportTeacher[1]))});
    const reportReview=path.match(/^\/api\/education\/courses\/([^/]+)\/report-book\/periods\/([^/]+)\/review$/);if(reportReview&&request.method==='POST')return json({ok:true,...await reviewReportBook(env,auth,tenantId,decodeURIComponent(reportReview[1]),decodeURIComponent(reportReview[2]),await body(request))});

    if(path==='/api/education/legacy-imports'&&request.method==='GET')return json({ok:true,batches:await listLegacyImports(env,auth,tenantId)});if(path==='/api/education/legacy-imports/preview'&&request.method==='POST')return json({ok:true,...await previewLegacyImport(env,auth,tenantId,request)},201);
    const legacyApply=path.match(/^\/api\/education\/legacy-imports\/([^/]+)\/apply-classbook$/);if(legacyApply&&request.method==='POST')return json({ok:true,...await applyLegacyClassbookImport(env,auth,tenantId,decodeURIComponent(legacyApply[1]))});

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
