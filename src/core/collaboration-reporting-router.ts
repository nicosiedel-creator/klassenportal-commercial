import type { CoreAuthContext, Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { assertSameOrigin, authStatus, json, safeErrorCode } from './utils.js';
import { createDiscussionThread, listDiscussionMessages, listDiscussionThreads, listReportDefinitions, moderateDiscussionMessage, postDiscussionMessage, registerPushSubscription, revokePushSubscription, runSafeReport, saveDiscussionSettings, saveReportDefinition } from './collaboration-reporting.js';
import { asStudentView, forbidClassAdminStudentData } from './student-role.js';
import { classbookExportCsv, classbookExportHtml, deleteExamAuthorityProfile, listExamAuthorityProfiles, previewClassbookExport, reviewClassbookEntry, saveCourseExamAuthorityProfile, saveExamAuthorityProfile } from './exam-documentation.js';
import { departmentQualityOverviewSafe } from './department-quality.js';
import { requireDelegatedPrivilegeAccess } from './delegated-privilege.js';
import { teacherAttendanceAuth } from './teacher-portal.js';

async function body(r:Request):Promise<Record<string,unknown>>{try{return await r.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=safeErrorCode(e);const status=authStatus(code)??(code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('REQUIRED')||code.includes('DISABLED')||code.includes('ADMIN_REQUIRED')?403:code.includes('NOT_FOUND')?404:code.includes('LOCKED')||code.includes('RATE_LIMIT')||code.includes('OWNED')?409:code.includes('TOO_LARGE')?413:400);return json({ok:false,error:code},status);}

async function chatAuth(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string):Promise<CoreAuthContext>{
  if(auth.role==='class_admin')return asStudentView(auth);
  if(auth.role==='guest'&&courseId)return teacherAttendanceAuth(env,auth,tenantId,courseId);
  return auth;
}
async function moderationAuth(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string):Promise<CoreAuthContext>{
  if(auth.role==='tenant_admin')return auth;
  if(auth.role==='guest'&&courseId)return teacherAttendanceAuth(env,auth,tenantId,courseId);
  throw new Error('FORBIDDEN_DISCUSSION_MODERATION');
}

export async function handleCollaborationReportingApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),p=u.pathname;if(!p.startsWith('/api/collaboration')&&!p.startsWith('/api/reports')&&!p.startsWith('/api/push'))return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||'';if(!tenantId)throw new Error('TENANT_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId||undefined),studentAuth=asStudentView(auth),discussionAuth=await chatAuth(env,auth,tenantId,courseId);if(!['GET','HEAD'].includes(request.method))await assertTenantWriteAllowed(env,tenantId);
    if(p==='/api/push/config'&&request.method==='GET')return json({ok:true,enabled:!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_JWK),public_key:env.VAPID_PUBLIC_KEY||null});
    if(p==='/api/push/subscriptions'&&request.method==='POST'){const b=await body(request);return json({ok:true,...await registerPushSubscription(env,discussionAuth,tenantId,b)},201);}
    if(p==='/api/push/subscriptions'&&request.method==='DELETE'){const b=await body(request);await revokePushSubscription(env,discussionAuth,tenantId,String(b.endpoint||''));return json({ok:true});}
    if(p==='/api/collaboration/settings'&&request.method==='PUT')return json({ok:true,settings:await saveDiscussionSettings(env,auth,tenantId,await body(request))});
    if(p==='/api/collaboration/threads'&&request.method==='GET')return json({ok:true,threads:await listDiscussionThreads(env,discussionAuth,tenantId,courseId||undefined)});
    if(p==='/api/collaboration/threads'&&request.method==='POST')return json({ok:true,...await createDiscussionThread(env,discussionAuth,tenantId,courseId||null,await body(request))},201);
    const messages=p.match(/^\/api\/collaboration\/threads\/([^/]+)\/messages$/);if(messages&&request.method==='GET')return json({ok:true,messages:await listDiscussionMessages(env,discussionAuth,tenantId,decodeURIComponent(messages[1]))});if(messages&&request.method==='POST'){const b=await body(request);return json({ok:true,...await postDiscussionMessage(env,discussionAuth,tenantId,decodeURIComponent(messages[1]),String(b.body||''))},201);}
    const hide=p.match(/^\/api\/collaboration\/threads\/([^/]+)\/messages\/([^/]+)\/hide$/);if(hide&&request.method==='POST'){const b=await body(request),moderator=await moderationAuth(env,auth,tenantId,courseId);await moderateDiscussionMessage(env,moderator,tenantId,decodeURIComponent(hide[1]),decodeURIComponent(hide[2]),String(b.reason||''));return json({ok:true});}

    if(p.startsWith('/api/reports/')){forbidClassAdminStudentData(auth);await requireDelegatedPrivilegeAccess(env,auth);}

    if(p==='/api/reports/classbook/profiles'&&request.method==='GET')return json({ok:true,...await listExamAuthorityProfiles(env,auth,tenantId,courseId||undefined)});
    if(p==='/api/reports/classbook/profiles'&&request.method==='POST')return json({ok:true,profile:await saveExamAuthorityProfile(env,auth,tenantId,await body(request))},201);
    const examProfile=p.match(/^\/api\/reports\/classbook\/profiles\/([^/]+)$/);if(examProfile&&request.method==='DELETE'){await deleteExamAuthorityProfile(env,auth,tenantId,decodeURIComponent(examProfile[1]));return json({ok:true});}
    if(p==='/api/reports/classbook/course-profile'&&request.method==='PUT'){if(!courseId)throw new Error('COURSE_REQUIRED');const b=await body(request);return json({ok:true,setting:await saveCourseExamAuthorityProfile(env,auth,tenantId,courseId,String(b.profile_ref||''))});}
    if(p==='/api/reports/classbook/preview'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,...await previewClassbookExport(env,auth,tenantId,courseId,await body(request))});}
    if(p==='/api/reports/classbook/export.csv'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');const x=await classbookExportCsv(env,auth,tenantId,courseId,await body(request));return new Response(x.text,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':`attachment; filename="${x.filename}"`,'cache-control':'no-store','x-content-digest':x.digest}});}
    if(p==='/api/reports/classbook/export.html'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_REQUIRED');const x=await classbookExportHtml(env,auth,tenantId,courseId,await body(request));return new Response(x.html,{headers:{'content-type':'text/html; charset=utf-8','content-disposition':`inline; filename="${x.filename}"`,'cache-control':'no-store','x-content-digest':x.digest}});}
    if(p==='/api/reports/department/overview'&&request.method==='GET')return json({ok:true,...await departmentQualityOverviewSafe(env,auth,tenantId)});
    const classbookReview=p.match(/^\/api\/reports\/classbook\/sessions\/([^/]+)\/review$/);if(classbookReview&&request.method==='PUT'){if(!courseId)throw new Error('COURSE_REQUIRED');return json({ok:true,review:await reviewClassbookEntry(env,auth,tenantId,courseId,decodeURIComponent(classbookReview[1]),await body(request))});}

    if(p==='/api/reports/definitions'&&request.method==='GET')return json({ok:true,reports:await listReportDefinitions(env,auth,tenantId)});
    if(p==='/api/reports/definitions'&&request.method==='POST')return json({ok:true,...await saveReportDefinition(env,auth,tenantId,await body(request))},201);
    if(p==='/api/reports/run'&&request.method==='POST'){const result=await runSafeReport(env,auth,tenantId,await body(request));return json({ok:true,...result});}
    if(p==='/api/reports/export.csv'&&request.method==='POST'){const result=await runSafeReport(env,auth,tenantId,await body(request));return new Response('\uFEFF'+result.csv,{headers:{'content-type':'text/csv; charset=utf-8','content-disposition':'attachment; filename="bericht.csv"','cache-control':'no-store'}});}
    void studentAuth;return json({ok:false,error:'COLLABORATION_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
