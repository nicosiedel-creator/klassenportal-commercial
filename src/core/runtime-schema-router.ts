import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { applyReleaseSchema, releaseSchemaStatus } from './runtime-schema.js';
import { getPortalLayout, resetPortalLayout, savePortalLayout } from './portal-layout.js';
import { createDemoFixturePhase, demoFixtureStatus, platformTenantDetail, updatePlatformTenant } from './platform-owner.js';
import { handlePlatformOfferApi } from './platform-offer-router.js';
import { ensureOfferSchema } from './offer-schema.js';
import { ensureOnboardingSchema, recoverOnboardingRequestState } from './onboarding-schema.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { applyTimetable, previewTimetable } from './timetable-v2.js';
import { deleteTimetableTargetAlias, listTimetableTargetAliases, prepareHierarchyAwareTimetableRequest, saveTimetableTargetAlias } from './timetable-hierarchy-targeting.js';
import { assertSameOrigin, authStatus, json, safeErrorCode } from './utils.js';

type RoutedError=Error&{issues?:unknown;targeting?:unknown};
function error(e:unknown):Response{
  const ex=e as RoutedError,code=safeErrorCode(e);
  const status=authStatus(code)??(code==='UNAUTHENTICATED'?401:code==='PLATFORM_ADMIN_REQUIRED'||code==='FORBIDDEN'||code==='FORBIDDEN_COURSE'||code==='TENANT_ADMIN_REQUIRED'?403:code.includes('NOT_FOUND')?404:code==='TIMETABLE_TARGET_REVIEW_REQUIRED'||code==='ONBOARDING_RECOVERY_REQUIRED'?409:code==='ONBOARDING_SCHEMA_INCOMPATIBLE'?503:code.includes('EXISTS')||code.includes('INVALID')||code.includes('REQUIRED')?400:500);
  return json({ok:false,error:code,issues:ex.issues,targeting:ex.targeting},status);
}
async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}

export async function handleRuntimeSchemaApi(request:Request,env:Env):Promise<Response|null>{
  const offerApi=await handlePlatformOfferApi(request,env);if(offerApi)return offerApi;
  const u=new URL(request.url);
  if(u.pathname.startsWith('/api/onboarding/')||u.pathname.startsWith('/api/platform/onboarding-invitations')){
    try{
      await ensureOnboardingSchema(env);
      await ensureOfferSchema(env);
      const publicMatch=u.pathname.match(/^\/api\/onboarding\/([^/]+)/);
      if(publicMatch)await recoverOnboardingRequestState(env,decodeURIComponent(publicMatch[1]));
    }catch(e){return error(e);}
  }

  if((u.pathname==='/api/timetable/preview'||u.pathname==='/api/timetable/apply')&&request.method==='POST'){
    try{
      assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_ID_REQUIRED');
      // Resolve the full authorized tenant scope instead of narrowing to one selected course: one source file may contain several sites/classes.
      const auth=await resolveCoreAuth(env,request,tenantId),prepared=await prepareHierarchyAwareTimetableRequest(env,auth,tenantId,request);
      if(u.pathname==='/api/timetable/apply'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,...await applyTimetable(env,auth,tenantId,prepared.request),targeting:prepared.targeting});}
      return json({ok:true,...await previewTimetable(env,auth,tenantId,prepared.request),targeting:prepared.targeting});
    }catch(e){return error(e);}
  }
  if(u.pathname==='/api/timetable/target-aliases'){
    try{assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId);if(request.method==='GET')return json({ok:true,aliases:await listTimetableTargetAliases(env,auth,tenantId)});if(request.method==='POST')return json({ok:true,alias:await saveTimetableTargetAlias(env,auth,tenantId,await body(request))},201);return new Response('Methode nicht erlaubt',{status:405});}catch(e){return error(e);}
  }
  const timetableAlias=u.pathname.match(/^\/api\/timetable\/target-aliases\/([^/]+)$/);if(timetableAlias&&request.method==='DELETE'){
    try{assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId);await deleteTimetableTargetAlias(env,auth,tenantId,decodeURIComponent(timetableAlias[1]));return json({ok:true});}catch(e){return error(e);}
  }

  if(u.pathname==='/api/personal/portal-layout'){
    try{
      assertSameOrigin(request,env.APP_ORIGIN);
      const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||'';
      if(!tenantId)throw new Error('TENANT_ID_REQUIRED');if(!courseId)throw new Error('COURSE_ID_REQUIRED');
      const auth=await resolveCoreAuth(env,request,tenantId,courseId);
      if(request.method==='GET')return json({ok:true,order:await getPortalLayout(env,auth,tenantId,courseId)});
      if(request.method==='PUT')return json({ok:true,order:await savePortalLayout(env,auth,tenantId,courseId,await body(request))});
      if(request.method==='DELETE'){await resetPortalLayout(env,auth,tenantId,courseId);return json({ok:true,order:[]});}
      return new Response('Methode nicht erlaubt',{status:405});
    }catch(e){return error(e);}
  }
  const ownerTenant=u.pathname.match(/^\/api\/platform\/owner\/tenants\/([^/]+)$/);
  if(ownerTenant){
    try{
      assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request),tenantId=decodeURIComponent(ownerTenant[1]);
      if(request.method==='GET')return json({ok:true,...await platformTenantDetail(env,auth,tenantId)});
      if(request.method==='PATCH')return json({ok:true,...await updatePlatformTenant(env,auth,tenantId,await body(request))});
      return new Response('Methode nicht erlaubt',{status:405});
    }catch(e){return error(e);}
  }
  if(u.pathname==='/api/platform/owner/demo-fixture'){
    try{
      assertSameOrigin(request,env.APP_ORIGIN);const auth=await resolveCoreAuth(env,request);
      if(request.method==='GET')return json({ok:true,demo:await demoFixtureStatus(env,auth)});
      if(request.method==='POST')return json({ok:true,result:await createDemoFixturePhase(env,auth,await body(request))});
      return new Response('Methode nicht erlaubt',{status:405});
    }catch(e){return error(e);}
  }
  if(u.pathname!=='/api/platform/system/schema')return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    const auth=await resolveCoreAuth(env,request);
    if(request.method==='GET')return json({ok:true,schema:await releaseSchemaStatus(env,auth)});
    if(request.method==='POST')return json({ok:true,schema:await applyReleaseSchema(env,auth)});
    return new Response('Methode nicht erlaubt',{status:405});
  }catch(e){return error(e);}
}
