import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { assertSameOrigin, json } from './utils.js';
import { addQuestion, bulkGrade, cloneCourseTemplate, createQuestionBank, createQuiz, getQuizAttempt, listCourseTemplates, listQuizzes, manualGradeQuizAttempt, publishQuiz, saveCourseTemplate, saveQuizAnswer, startQuizAttempt, submitQuizAttempt } from './learning-suite.js';
import { listBankQuestions, listQuestionBanks, listQuizAttemptsAdmin, setGradebookItemPolicy } from './learning-suite-management.js';
import { safeAdvancedGradebook, safeOfficialGradeCsv, safeOfficialGradeReport, safeSaveGradebookCategory, safeSaveGradingScale } from './gradebook-correctness.js';

async function body(r:Request):Promise<Record<string,unknown>>{try{return await r.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=String((e as Error)?.message||'LEARNING_SUITE_ERROR');const status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.endsWith('_REQUIRED')?403:code.includes('NOT_FOUND')||code.includes('NOT_AVAILABLE')?404:code.includes('LOCKED')||code.includes('EXHAUSTED')||code.includes('CLOSED')||code.includes('EXPIRED')||code.includes('LIMIT_REACHED')?409:400;return json({ok:false,error:code},status);}

export async function handleLearningSuiteApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),p=u.pathname;if(!p.startsWith('/api/learning-suite'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||'';if(!tenantId)throw new Error('TENANT_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId||undefined);const write=!['GET','HEAD'].includes(request.method);if(write)await assertTenantWriteAllowed(env,tenantId);
    if(p==='/api/learning-suite/gradebook'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await safeAdvancedGradebook(env,auth,tenantId,courseId)});}
    if(p==='/api/learning-suite/gradebook/report'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await safeOfficialGradeReport(env,auth,tenantId,courseId)});}
    if(p==='/api/learning-suite/gradebook/export.csv'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_REQUIRED');return new Response(await safeOfficialGradeCsv(env,auth,tenantId,courseId),{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="leistungsuebersicht.csv"','cache-control':'no-store'}});}
    if(p==='/api/learning-suite/gradebook/categories'&&request.method==='PUT'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,category:await safeSaveGradebookCategory(env,auth,tenantId,courseId,await body(request))});}
    if(p==='/api/learning-suite/gradebook/scales'&&request.method==='PUT'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await safeSaveGradingScale(env,auth,tenantId,courseId,await body(request))});}
    if(p==='/api/learning-suite/gradebook/bulk'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await bulkGrade(env,auth,tenantId,courseId,await body(request))});}
    const itemPolicy=p.match(/^\/api\/learning-suite\/gradebook\/items\/([^/]+)$/);if(itemPolicy&&request.method==='PUT'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await setGradebookItemPolicy(env,auth,tenantId,courseId,decodeURIComponent(itemPolicy[1]),await body(request))});}
    if(p==='/api/learning-suite/question-banks'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,banks:await listQuestionBanks(env,auth,tenantId,courseId)});}
    if(p==='/api/learning-suite/question-banks'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,bank:await createQuestionBank(env,auth,tenantId,courseId,await body(request))},201);}
    const q=p.match(/^\/api\/learning-suite\/question-banks\/([^/]+)\/questions$/);if(q&&request.method==='GET'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,questions:await listBankQuestions(env,auth,tenantId,courseId,decodeURIComponent(q[1]))});}if(q&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,question_id:await addQuestion(env,auth,tenantId,courseId,decodeURIComponent(q[1]),await body(request))},201);}
    if(p==='/api/learning-suite/quizzes'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,quizzes:await listQuizzes(env,auth,tenantId,courseId)});}
    if(p==='/api/learning-suite/quizzes'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,quiz:await createQuiz(env,auth,tenantId,courseId,await body(request))},201);}
    const attempts=p.match(/^\/api\/learning-suite\/quizzes\/([^/]+)\/attempts$/);if(attempts&&request.method==='GET'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,attempts:await listQuizAttemptsAdmin(env,auth,tenantId,courseId,decodeURIComponent(attempts[1]))});}
    const pub=p.match(/^\/api\/learning-suite\/quizzes\/([^/]+)\/publish$/);if(pub&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await publishQuiz(env,auth,tenantId,courseId,decodeURIComponent(pub[1]))});}
    const start=p.match(/^\/api\/learning-suite\/quizzes\/([^/]+)\/start$/);if(start&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await startQuizAttempt(env,auth,tenantId,courseId,decodeURIComponent(start[1]))},201);}
    const attempt=p.match(/^\/api\/learning-suite\/attempts\/([^/]+)$/);if(attempt&&request.method==='GET'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await getQuizAttempt(env,auth,tenantId,courseId,decodeURIComponent(attempt[1]))});}
    const answer=p.match(/^\/api\/learning-suite\/attempts\/([^/]+)\/answers\/([^/]+)$/);if(answer&&request.method==='PUT'){if(!courseId)throw new Error('COURSE_REQUIRED');const b=await body(request);return json({ok:true,...await saveQuizAnswer(env,auth,tenantId,courseId,decodeURIComponent(answer[1]),decodeURIComponent(answer[2]),b.answer)});}
    const submit=p.match(/^\/api\/learning-suite\/attempts\/([^/]+)\/submit$/);if(submit&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await submitQuizAttempt(env,auth,tenantId,courseId,decodeURIComponent(submit[1]))});}
    const manual=p.match(/^\/api\/learning-suite\/attempts\/([^/]+)\/grade$/);if(manual&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await manualGradeQuizAttempt(env,auth,tenantId,courseId,decodeURIComponent(manual[1]),await body(request))});}
    if(p==='/api/learning-suite/templates'&&request.method==='GET')return json({ok:true,templates:await listCourseTemplates(env,auth,tenantId)});
    if(p==='/api/learning-suite/templates'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await saveCourseTemplate(env,auth,tenantId,courseId,await body(request))},201);}
    const clone=p.match(/^\/api\/learning-suite\/templates\/([^/]+)\/clone$/);if(clone&&request.method==='POST')return json({ok:true,...await cloneCourseTemplate(env,auth,tenantId,decodeURIComponent(clone[1]),await body(request))},201);
    return json({ok:false,error:'LEARNING_SUITE_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
