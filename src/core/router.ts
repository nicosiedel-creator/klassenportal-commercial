import type { Env } from './types.js';
import { assertSameOrigin, json } from './utils.js';
import { changePassword, getSession, login, logout, resolveCoreAuth } from './auth.js';
import { provisionTenant } from './provision.js';
import { createContent, createCourse, deleteContent, deletePersonalGrade, getModules, getSettings, listContent, listCourses, listPersonalGrades, listTenants, savePersonalGrade, setExamVisibility, setModule, updateContent, updateCourse, updatePersonalGrade, updateSettings } from './data.js';
import { publicOverview } from './public.js';
import { requirePlatform } from './permissions.js';
import { createTenantUser, deleteTenantMembership, listTenantUsers, resetTenantUserPassword, updateTenantMembership } from './users.js';
import { uploadTenantLogo } from './branding.js';
import { applyTimetable, getTimetableUpdatePreference, previewTimetable, setTimetableUpdatePreference } from './timetable-v2.js';
import { prepareHierarchyAwareTimetableRequest } from './timetable-hierarchy-targeting.js';
import { storeTimetableSource } from './timetable-source.js';
import { createOnboardingInvitation, getPublicOnboarding, getPublicOnboardingQuote, listOnboardingInvitations, revokeOnboardingInvitation, submitPublicOnboarding } from './onboarding.js';
import { billingSummary, enforceCourseEntitlement, getSellerProfile, listCommercePlans, quoteExpansion, requestExpansion, updateCommercePlan, updateSellerProfile } from './commerce.js';
import { assertTenantWriteAllowed, calculateCommercialOffer, createPaidBooking, getCommercePolicy, listManagedSetupOptions, tenantTrialSummary } from './commerce-offers.js';
import { deleteLearningMaterial, downloadLearningMaterial, listLearningMaterials, updateLearningMaterial, uploadLearningMaterial } from './materials.js';
import { listTenantAudit, listUserNotifications, markAllNotificationsRead, markNotificationRead } from './support.js';
import { closeSurvey, createOrRotateCalendarFeed, createSubstitutionUpdate, createSurvey, deleteSubstitutionUpdate, deleteSurvey, getTeamsIntegration, listCalendarFeeds, listSubstitutionUpdates, listSurveys, saveTeamsIntegration, statisticsSummary, testTeamsIntegration, voteSurvey } from './advanced-modules.js';

function err(e:unknown):Response{
  const ex=e as Error&{issues?:unknown;targeting?:unknown};const code=ex?.message||'INTERNAL_ERROR';
  const status=code==='UNAUTHENTICATED'||code==='LOGIN_REQUIRED'?401
    :code==='PASSWORD_CHANGE_REQUIRED'?428
    :code==='TRIAL_READ_ONLY'?423
    :code==='TRIAL_EXPIRED'||code==='ONBOARDING_EXPIRED'||code==='ONBOARDING_UNAVAILABLE'?410
    :code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')||code==='PLATFORM_ADMIN_REQUIRED'||code==='PLATFORM_ADMIN_RESET_FORBIDDEN'||code==='MODULE_NOT_ACTIVE'?403
    :code.includes('NOT_FOUND')?404
    :['ONBOARDING_ALREADY_IN_PROGRESS','ONBOARDING_ALREADY_COMPLETED','COURSE_LIMIT_REACHED','PRICING_NOT_CONFIGURED','SELF_SERVICE_DOWNGRADE_NOT_ALLOWED','NO_CHANGE','PAYMENT_ALREADY_PENDING','TIMETABLE_BATCH_CONFIRMATION_REQUIRED','TIMETABLE_INDIVIDUAL_CONFIRMATION_INVALID','CANNOT_REMOVE_OWN_TENANT_ADMIN','SURVEY_ALREADY_VOTED','SURVEY_CLOSED'].includes(code)?409
    :code.includes('TOO_LARGE')||code.includes('TOO_MANY')?413
    :code==='LOGIN_RATE_LIMITED'?429
    :code==='INTERNAL_ERROR'?500:400;
  return json({ok:false,error:code,issues:ex?.issues,targeting:ex?.targeting},status);
}
async function body(request:Request):Promise<Record<string,unknown>>{try{const b=await request.json() as Record<string,unknown>;if(b.course_id==='')b.course_id=null;return b;}catch{return{};}}

export async function handleCoreApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);if(!u.pathname.startsWith('/api/'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    if(u.pathname==='/api/health')return json({ok:true,service:'klassenportal-commercial'});
    if(u.pathname==='/api/auth/login'&&request.method==='POST')return login(env,request);
    if(u.pathname==='/api/auth/logout'&&request.method==='POST')return logout(env,request);
    if(u.pathname==='/api/auth/me'&&request.method==='GET')return json({ok:true,user:await getSession(env,request)});
    if(u.pathname==='/api/auth/change-password'&&request.method==='POST')return changePassword(env,request);

    const publicQuote=u.pathname.match(/^\/api\/onboarding\/([^/]+)\/quote$/);
    if(publicQuote&&request.method==='GET')return json({ok:true,quote:await getPublicOnboardingQuote(env,decodeURIComponent(publicQuote[1]),{courses:u.searchParams.get('courses')||'1',billingCycle:u.searchParams.get('billing_cycle')||'monthly',setupOptionId:u.searchParams.get('setup')||'self_service',purpose:u.searchParams.get('purpose')||'paid'})});
    const publicOnboarding=u.pathname.match(/^\/api\/onboarding\/([^/]+)$/);
    if(publicOnboarding){const token=decodeURIComponent(publicOnboarding[1]);if(request.method==='GET')return json({ok:true,invitation:await getPublicOnboarding(env,token)});if(request.method==='POST')return json(await submitPublicOnboarding(env,token,request));}

    if(u.pathname==='/api/platform/onboarding-invitations'&&request.method==='GET'){const a=await resolveCoreAuth(env,request);requirePlatform(a);return json({ok:true,invitations:await listOnboardingInvitations(env,a)});}
    if(u.pathname==='/api/platform/onboarding-invitations'&&request.method==='POST'){const a=await resolveCoreAuth(env,request);requirePlatform(a);return json({ok:true,...await createOnboardingInvitation(env,a,request)},201);}
    const revoke=u.pathname.match(/^\/api\/platform\/onboarding-invitations\/([^/]+)\/revoke$/);
    if(revoke&&request.method==='POST'){const a=await resolveCoreAuth(env,request);requirePlatform(a);await revokeOnboardingInvitation(env,a,decodeURIComponent(revoke[1]));return json({ok:true});}
    if(u.pathname==='/api/platform/commerce/plans'&&request.method==='GET'){const a=await resolveCoreAuth(env,request);return json({ok:true,plans:await listCommercePlans(env,a)});}
    const planCommerce=u.pathname.match(/^\/api\/platform\/commerce\/plans\/([^/]+)$/);
    if(planCommerce&&request.method==='PUT'){const a=await resolveCoreAuth(env,request);await updateCommercePlan(env,a,decodeURIComponent(planCommerce[1]),await body(request));return json({ok:true});}
    if(u.pathname==='/api/platform/commerce/seller'&&request.method==='GET'){const a=await resolveCoreAuth(env,request);return json({ok:true,profile:await getSellerProfile(env,a)});}
    if(u.pathname==='/api/platform/commerce/seller'&&request.method==='PUT'){const a=await resolveCoreAuth(env,request);await updateSellerProfile(env,a,await body(request));return json({ok:true});}

    const tenantId=u.searchParams.get('tenant_id')||undefined;const courseId=u.searchParams.get('course_id')||undefined;
    if(u.pathname==='/api/platform/tenants'&&request.method==='GET'){const a=await resolveCoreAuth(env,request);return json({ok:true,tenants:await listTenants(env,a)});}
    if(u.pathname==='/api/platform/tenants'&&request.method==='POST'){const a=await resolveCoreAuth(env,request);requirePlatform(a);return json({ok:true,...await provisionTenant(env,a,await body(request))},201);}
    if(!tenantId)throw new Error('TENANT_ID_REQUIRED');
    const a=await resolveCoreAuth(env,request,tenantId,courseId);

    if(u.pathname==='/api/tenant/audit'&&request.method==='GET')return json({ok:true,events:await listTenantAudit(env,a,tenantId,Number(u.searchParams.get('limit')||100))});
    if(u.pathname==='/api/notifications'&&request.method==='GET')return json({ok:true,notifications:await listUserNotifications(env,a,tenantId,courseId,Number(u.searchParams.get('limit')||80))});
    const notification=u.pathname.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if(notification&&request.method==='PATCH')return json({ok:true,notification:await markNotificationRead(env,a,tenantId,decodeURIComponent(notification[1]))});
    if(u.pathname==='/api/notifications/read-all'&&request.method==='POST')return json({ok:true,...await markAllNotificationsRead(env,a,tenantId,courseId)});

    if(u.pathname==='/api/modules/statistics'&&request.method==='GET')return json({ok:true,statistics:await statisticsSummary(env,a,tenantId)});
    if(u.pathname==='/api/surveys'&&request.method==='GET')return json({ok:true,surveys:await listSurveys(env,a,tenantId,courseId)});
    if(u.pathname==='/api/surveys'&&request.method==='POST')return json({ok:true,survey:await createSurvey(env,a,tenantId,await body(request))},201);
    const surveyClose=u.pathname.match(/^\/api\/surveys\/([^/]+)\/close$/);
    if(surveyClose&&request.method==='POST'){await closeSurvey(env,a,tenantId,decodeURIComponent(surveyClose[1]));return json({ok:true});}
    const surveyVote=u.pathname.match(/^\/api\/surveys\/([^/]+)\/vote$/);
    if(surveyVote&&request.method==='POST'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');const b=await body(request);return json({ok:true,...await voteSurvey(env,a,tenantId,courseId,decodeURIComponent(surveyVote[1]),String(b.option_id||''))});}
    const survey=u.pathname.match(/^\/api\/surveys\/([^/]+)$/);
    if(survey&&request.method==='DELETE'){await deleteSurvey(env,a,tenantId,decodeURIComponent(survey[1]));return json({ok:true});}
    if(u.pathname==='/api/substitutions'&&request.method==='GET')return json({ok:true,updates:await listSubstitutionUpdates(env,a,tenantId,courseId)});
    if(u.pathname==='/api/substitutions'&&request.method==='POST')return json({ok:true,update:await createSubstitutionUpdate(env,a,tenantId,await body(request))},201);
    const substitution=u.pathname.match(/^\/api\/substitutions\/([^/]+)$/);
    if(substitution&&request.method==='DELETE'){await deleteSubstitutionUpdate(env,a,tenantId,decodeURIComponent(substitution[1]));return json({ok:true});}
    if(u.pathname==='/api/integrations/teams'&&request.method==='GET')return json({ok:true,integration:await getTeamsIntegration(env,a,tenantId)});
    if(u.pathname==='/api/integrations/teams'&&request.method==='PUT')return json({ok:true,integration:await saveTeamsIntegration(env,a,tenantId,await body(request))});
    if(u.pathname==='/api/integrations/teams/test'&&request.method==='POST')return json({ok:true,...await testTeamsIntegration(env,a,tenantId)});
    if(u.pathname==='/api/integrations/microsoft365/feeds'&&request.method==='GET')return json({ok:true,feeds:await listCalendarFeeds(env,a,tenantId,env.APP_ORIGIN||u.origin)});
    if(u.pathname==='/api/integrations/microsoft365/feeds'&&request.method==='POST'){const b=await body(request),cid=String(b.course_id||courseId||'');if(!cid)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,feed:await createOrRotateCalendarFeed(env,a,tenantId,cid,env.APP_ORIGIN||u.origin)});}

    if(u.pathname==='/api/billing/summary'&&request.method==='GET')return json({ok:true,...await billingSummary(env,a,tenantId),trial:await tenantTrialSummary(env,a,tenantId),commercePolicy:await getCommercePolicy(env),setupOptions:await listManagedSetupOptions(env)});
    if(u.pathname==='/api/billing/trial-quote'&&request.method==='POST'){const b=await body(request);const trial=await tenantTrialSummary(env,a,tenantId);if(!trial||!['active','read_only'].includes(String(trial.status||'')))throw new Error('TRIAL_NOT_CONVERTIBLE');return json({ok:true,quote:await calculateCommercialOffer(env,{planId:String(b.plan_id||trial.target_plan_id),courseCount:Number(b.course_count||trial.requested_course_count),billingCycle:b.billing_cycle,setupOptionId:b.managed_setup_option_id||'self_service',purpose:'paid'})});}
    if(u.pathname==='/api/billing/change-quote'&&request.method==='POST')return json({ok:true,quote:await quoteExpansion(env,a,tenantId,await body(request))});
    if(u.pathname==='/api/billing/expand'&&request.method==='POST'){const b=await body(request);if(b.confirm_change!==true||b.confirm_costs!==true)throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');return json({ok:true,...await requestExpansion(env,a,tenantId,b)},201);}
    if(u.pathname==='/api/billing/convert-trial'&&request.method==='POST'){const b=await body(request);if(b.confirm_change!==true||b.confirm_costs!==true)throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');const trial=await tenantTrialSummary(env,a,tenantId);if(!trial||!['active','read_only'].includes(String(trial.status||'')))throw new Error('TRIAL_NOT_CONVERTIBLE');return json({ok:true,...await createPaidBooking(env,{tenantId,planId:String(b.plan_id||trial.target_plan_id),courseCount:Number(b.course_count||trial.requested_course_count),billingCycle:b.billing_cycle,setupOptionId:b.managed_setup_option_id,accepted:true,request,actorId:a.userId})},201);}

    if(u.pathname==='/api/timetable/preferences'&&request.method==='GET')return json({ok:true,...await getTimetableUpdatePreference(env,a,tenantId)});
    const mutating=request.method!=='GET'&&request.method!=='HEAD'&&u.pathname!=='/api/timetable/preview';if(mutating)await assertTenantWriteAllowed(env,tenantId);
    if(u.pathname==='/api/timetable/preferences'&&request.method==='PUT')return json({ok:true,...await setTimetableUpdatePreference(env,a,tenantId,await body(request))});
    if(u.pathname==='/api/tenant/logo'&&request.method==='POST')return json({ok:true,...await uploadTenantLogo(env,a,tenantId,request)});
    if(u.pathname==='/api/timetable/preview'&&request.method==='POST'){const h=await prepareHierarchyAwareTimetableRequest(env,a,tenantId,request.clone());const source=h.targeting?h.request:request;return json({ok:true,...await previewTimetable(env,a,tenantId,source),targeting:h.targeting});}
    if(u.pathname==='/api/timetable/apply'&&request.method==='POST'){const h=await prepareHierarchyAwareTimetableRequest(env,a,tenantId,request.clone());const source=h.targeting?h.request:request;return json({ok:true,...await applyTimetable(env,a,tenantId,source),targeting:h.targeting});}
    if(u.pathname==='/api/timetable/source'&&request.method==='POST')return json({ok:true,...await storeTimetableSource(env,a,tenantId,request)});
    if(u.pathname==='/api/tenant/settings'&&request.method==='GET')return json({ok:true,settings:await getSettings(env,a,tenantId)});
    if(u.pathname==='/api/tenant/settings'&&request.method==='PUT')return json({ok:true,settings:await updateSettings(env,a,tenantId,await body(request))});
    if(u.pathname==='/api/tenant/modules'&&request.method==='GET')return json({ok:true,modules:await getModules(env,a,tenantId)});
    if(u.pathname==='/api/tenant/modules'&&request.method==='PUT'){const b=await body(request);await setModule(env,a,tenantId,String(b.feature_key||''),!!b.enabled);return json({ok:true});}

    if(u.pathname==='/api/courses'&&request.method==='GET')return json({ok:true,courses:await listCourses(env,a,tenantId)});
    if(u.pathname==='/api/courses'&&request.method==='POST'){await enforceCourseEntitlement(env,tenantId);return json({ok:true,course:await createCourse(env,a,tenantId,await body(request))},201);}
    const courseRoute=u.pathname.match(/^\/api\/courses\/([^/]+)$/);
    if(courseRoute&&request.method==='PATCH')return json({ok:true,course:await updateCourse(env,a,tenantId,decodeURIComponent(courseRoute[1]),await body(request))});

    if(u.pathname==='/api/tenant/users'&&request.method==='GET')return json({ok:true,users:await listTenantUsers(env,a,tenantId)});
    if(u.pathname==='/api/tenant/users'&&request.method==='POST')return json({ok:true,...await createTenantUser(env,a,tenantId,await body(request))},201);
    const passwordReset=u.pathname.match(/^\/api\/tenant\/users\/([^/]+)\/reset-password$/);
    if(passwordReset&&request.method==='POST')return json({ok:true,...await resetTenantUserPassword(env,a,tenantId,decodeURIComponent(passwordReset[1]))});
    const membership=u.pathname.match(/^\/api\/tenant\/memberships\/([^/]+)$/);
    if(membership&&request.method==='PATCH')return json({ok:true,membership:await updateTenantMembership(env,a,tenantId,decodeURIComponent(membership[1]),await body(request))});
    if(membership&&request.method==='DELETE'){await deleteTenantMembership(env,a,tenantId,decodeURIComponent(membership[1]));return json({ok:true});}

    if(u.pathname==='/api/materials'&&request.method==='GET')return json({ok:true,materials:await listLearningMaterials(env,a,tenantId,courseId)});
    if(u.pathname==='/api/materials'&&request.method==='POST')return json({ok:true,material:await uploadLearningMaterial(env,a,tenantId,request,courseId)},201);
    const materialDownload=u.pathname.match(/^\/api\/materials\/([^/]+)\/download$/);
    if(materialDownload&&request.method==='GET')return downloadLearningMaterial(env,a,tenantId,decodeURIComponent(materialDownload[1]));
    const material=u.pathname.match(/^\/api\/materials\/([^/]+)$/);
    if(material&&request.method==='PATCH')return json({ok:true,material:await updateLearningMaterial(env,a,tenantId,decodeURIComponent(material[1]),await body(request))});
    if(material&&request.method==='DELETE'){await deleteLearningMaterial(env,a,tenantId,decodeURIComponent(material[1]));return json({ok:true});}

    const contentRow=u.pathname.match(/^\/api\/content\/([^/]+)\/([^/]+)$/);
    if(contentRow&&request.method==='PATCH')return json({ok:true,item:await updateContent(env,a,tenantId,decodeURIComponent(contentRow[1]),decodeURIComponent(contentRow[2]),await body(request))});
    if(contentRow&&request.method==='DELETE'){await deleteContent(env,a,tenantId,decodeURIComponent(contentRow[1]),decodeURIComponent(contentRow[2]));return json({ok:true});}
    if(u.pathname.startsWith('/api/content/')){const type=u.pathname.split('/')[3]||'';if(request.method==='GET')return json({ok:true,items:await listContent(env,a,tenantId,type,courseId)});if(request.method==='POST')return json({ok:true,item:await createContent(env,a,tenantId,type,await body(request))},201);}
    if(u.pathname.match(/^\/api\/exams\/[^/]+\/visibility$/)&&request.method==='PATCH'){const examId=u.pathname.split('/')[3];const b=await body(request);await setExamVisibility(env,a,tenantId,examId,!!b.visible);return json({ok:true});}

    if(u.pathname==='/api/personal/grades'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,grades:await listPersonalGrades(env,a,tenantId,courseId)});}
    if(u.pathname==='/api/personal/grades'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,grade:await savePersonalGrade(env,a,tenantId,courseId,await body(request))},201);}
    const gradeRoute=u.pathname.match(/^\/api\/personal\/grades\/([^/]+)$/);
    if(gradeRoute&&request.method==='PATCH'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,grade:await updatePersonalGrade(env,a,tenantId,courseId,decodeURIComponent(gradeRoute[1]),await body(request))});}
    if(gradeRoute&&request.method==='DELETE'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');await deletePersonalGrade(env,a,tenantId,courseId,decodeURIComponent(gradeRoute[1]));return json({ok:true});}
    return json({ok:false,error:'NOT_FOUND'},404);
  }catch(e){return err(e);}
}

export async function handlePublicApi(request:Request,env:Env):Promise<Response|null>{const u=new URL(request.url);const m=u.pathname.match(/^\/public\/([^/]+)\/([^/]+)\/overview$/);if(!m)return null;try{return json({ok:true,...await publicOverview(env,decodeURIComponent(m[1]),decodeURIComponent(m[2]),await getSession(env,request),u.searchParams.get('access_code')||undefined)});}catch(e){return err(e);}}
