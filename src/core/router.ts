import type { Env } from './types.js';
import { assertSameOrigin, json } from './utils.js';
import { changePassword, getSession, login, logout, resolveCoreAuth } from './auth.js';
import { provisionTenant } from './provision.js';
import { createContent, createCourse, getModules, getSettings, listContent, listCourses, listPersonalGrades, listTenants, savePersonalGrade, setExamVisibility, setModule, updateSettings } from './data.js';
import { publicOverview } from './public.js';
import { requirePlatform } from './permissions.js';
import { createTenantUser, listTenantUsers } from './users.js';
import { uploadTenantLogo } from './branding.js';
import { applyTimetable, previewTimetable } from './timetable.js';
import { storeTimetableSource } from './timetable-source.js';
import { createOnboardingInvitation, getPublicOnboarding, getPublicOnboardingQuote, listOnboardingInvitations, revokeOnboardingInvitation, submitPublicOnboarding } from './onboarding.js';
import { billingSummary, enforceCourseEntitlement, getSellerProfile, listCommercePlans, quoteExpansion, requestExpansion, updateCommercePlan, updateSellerProfile } from './commerce.js';
import { assertTenantWriteAllowed, createPaidBooking, tenantTrialSummary } from './commerce-offers.js';

function err(e:unknown):Response{
  const ex=e as Error&{issues?:unknown};const code=ex?.message||'INTERNAL_ERROR';
  const status=code==='UNAUTHENTICATED'||code==='LOGIN_REQUIRED'?401
    :code==='PASSWORD_CHANGE_REQUIRED'?428
    :code==='TRIAL_READ_ONLY'?423
    :code==='TRIAL_EXPIRED'||code==='ONBOARDING_EXPIRED'||code==='ONBOARDING_UNAVAILABLE'?410
    :code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')||code==='PLATFORM_ADMIN_REQUIRED'?403
    :code.includes('NOT_FOUND')?404
    :['ONBOARDING_ALREADY_IN_PROGRESS','ONBOARDING_ALREADY_COMPLETED','COURSE_LIMIT_REACHED','PRICING_NOT_CONFIGURED','SELF_SERVICE_DOWNGRADE_NOT_ALLOWED','NO_CHANGE','PAYMENT_ALREADY_PENDING'].includes(code)?409
    :code.includes('TOO_LARGE')||code.includes('TOO_MANY')?413
    :code==='LOGIN_RATE_LIMITED'?429
    :code==='INTERNAL_ERROR'?500:400;
  return json({ok:false,error:code,issues:ex?.issues},status);
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
    if(publicQuote&&request.method==='GET')return json({ok:true,quote:await getPublicOnboardingQuote(env,decodeURIComponent(publicQuote[1]),{
      courses:u.searchParams.get('courses')||'1',
      billingCycle:u.searchParams.get('billing_cycle')||'monthly',
      setupOptionId:u.searchParams.get('setup')||'self_service',
      purpose:u.searchParams.get('purpose')||'paid',
    })});
    const publicOnboarding=u.pathname.match(/^\/api\/onboarding\/([^/]+)$/);
    if(publicOnboarding){
      const token=decodeURIComponent(publicOnboarding[1]);
      if(request.method==='GET')return json({ok:true,invitation:await getPublicOnboarding(env,token)});
      if(request.method==='POST')return json(await submitPublicOnboarding(env,token,request));
    }

    if(u.pathname==='/api/platform/onboarding-invitations'&&request.method==='GET'){
      const a=await resolveCoreAuth(env,request);requirePlatform(a);return json({ok:true,invitations:await listOnboardingInvitations(env,a)});
    }
    if(u.pathname==='/api/platform/onboarding-invitations'&&request.method==='POST'){
      const a=await resolveCoreAuth(env,request);requirePlatform(a);return json({ok:true,...await createOnboardingInvitation(env,a,request)},201);
    }
    const revoke=u.pathname.match(/^\/api\/platform\/onboarding-invitations\/([^/]+)\/revoke$/);
    if(revoke&&request.method==='POST'){
      const a=await resolveCoreAuth(env,request);requirePlatform(a);await revokeOnboardingInvitation(env,a,decodeURIComponent(revoke[1]));return json({ok:true});
    }
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

    if(u.pathname==='/api/billing/summary'&&request.method==='GET')return json({ok:true,...await billingSummary(env,a,tenantId),trial:await tenantTrialSummary(env,a,tenantId)});
    if(u.pathname==='/api/billing/change-quote'&&request.method==='POST')return json({ok:true,quote:await quoteExpansion(env,a,tenantId,await body(request))});
    if(u.pathname==='/api/billing/expand'&&request.method==='POST'){
      const b=await body(request);if(b.confirm_change!==true||b.confirm_costs!==true)throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');
      return json({ok:true,...await requestExpansion(env,a,tenantId,b)},201);
    }
    if(u.pathname==='/api/billing/convert-trial'&&request.method==='POST'){
      const b=await body(request);if(b.confirm_change!==true||b.confirm_costs!==true)throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');
      const trial=await tenantTrialSummary(env,a,tenantId);if(!trial||!['active','read_only'].includes(String(trial.status||'')))throw new Error('TRIAL_NOT_CONVERTIBLE');
      return json({ok:true,...await createPaidBooking(env,{tenantId,planId:String(b.plan_id||trial.target_plan_id),courseCount:Number(b.course_count||trial.requested_course_count),billingCycle:b.billing_cycle,setupOptionId:b.managed_setup_option_id,accepted:true,request,actorId:a.userId})},201);
    }

    const mutating=request.method!=='GET'&&request.method!=='HEAD'&&u.pathname!=='/api/timetable/preview';
    if(mutating)await assertTenantWriteAllowed(env,tenantId);

    if(u.pathname==='/api/tenant/logo'&&request.method==='POST')return json({ok:true,...await uploadTenantLogo(env,a,tenantId,request)});
    if(u.pathname==='/api/timetable/preview'&&request.method==='POST')return json({ok:true,...await previewTimetable(env,a,tenantId,request)});
    if(u.pathname==='/api/timetable/apply'&&request.method==='POST')return json({ok:true,...await applyTimetable(env,a,tenantId,request)});
    if(u.pathname==='/api/timetable/source'&&request.method==='POST')return json({ok:true,...await storeTimetableSource(env,a,tenantId,request)});
    if(u.pathname==='/api/tenant/settings'&&request.method==='GET')return json({ok:true,settings:await getSettings(env,a,tenantId)});
    if(u.pathname==='/api/tenant/settings'&&request.method==='PUT')return json({ok:true,settings:await updateSettings(env,a,tenantId,await body(request))});
    if(u.pathname==='/api/tenant/modules'&&request.method==='GET')return json({ok:true,modules:await getModules(env,a,tenantId)});
    if(u.pathname==='/api/tenant/modules'&&request.method==='PUT'){const b=await body(request);await setModule(env,a,tenantId,String(b.feature_key||''),!!b.enabled);return json({ok:true});}
    if(u.pathname==='/api/courses'&&request.method==='GET')return json({ok:true,courses:await listCourses(env,a,tenantId)});
    if(u.pathname==='/api/courses'&&request.method==='POST'){await enforceCourseEntitlement(env,tenantId);return json({ok:true,course:await createCourse(env,a,tenantId,await body(request))},201);}
    if(u.pathname==='/api/tenant/users'&&request.method==='GET')return json({ok:true,users:await listTenantUsers(env,a,tenantId)});
    if(u.pathname==='/api/tenant/users'&&request.method==='POST')return json({ok:true,...await createTenantUser(env,a,tenantId,await body(request))},201);
    if(u.pathname.startsWith('/api/content/')){const type=u.pathname.split('/')[3]||'';if(request.method==='GET')return json({ok:true,items:await listContent(env,a,tenantId,type,courseId)});if(request.method==='POST')return json({ok:true,item:await createContent(env,a,tenantId,type,await body(request))},201);}
    if(u.pathname.match(/^\/api\/exams\/[^/]+\/visibility$/)&&request.method==='PATCH'){const examId=u.pathname.split('/')[3];const b=await body(request);await setExamVisibility(env,a,tenantId,examId,!!b.visible);return json({ok:true});}
    if(u.pathname==='/api/personal/grades'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,grades:await listPersonalGrades(env,a,tenantId,courseId)});}
    if(u.pathname==='/api/personal/grades'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,grade:await savePersonalGrade(env,a,tenantId,courseId,await body(request))},201);}
    return json({ok:false,error:'NOT_FOUND'},404);
  }catch(e){return err(e);}
}

export async function handlePublicApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);const m=u.pathname.match(/^\/public\/([^/]+)\/([^/]+)\/overview$/);if(!m)return null;
  try{return json({ok:true,...await publicOverview(env,decodeURIComponent(m[1]),decodeURIComponent(m[2]),await getSession(env,request),u.searchParams.get('access_code')||undefined)});}catch(e){return err(e);}
}
