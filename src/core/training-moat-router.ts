import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin, json, safeString } from './utils.js';
import { requireAutopilotTenantAdminMfa } from './autopilot-security.js';
import {
  SUPPORTED_PORTAL_LOCALES,COMPLIANCE_PACK_CATALOG,getPortalLanguagePreference,savePortalLanguagePreference,
  buildPersonalLearnerTwin,capturePersonalLearnerTwin,createLearningCoachPlan,listCompliancePrograms,upsertComplianceProgram,
  listComplianceRequirements,createComplianceRequirement,attachComplianceEvidence,scanComplianceTenant,complianceOverview,
  createComplianceEvidencePackage,migrationQualityPreflight,listPartnerGrants,createPartnerGrant,revokePartnerGrant,
  publicPartnerContext,integrationCapabilityCatalog,actionCopilotPreview
} from './training-moat.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(error:unknown){
  const code=String((error as Error)?.message||'TRAINING_MOAT_ERROR');
  let status=400;
  if(code==='UNAUTHENTICATED')status=401;
  else if(code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')||code.includes('MFA_REQUIRED')||code.includes('MFA_ENROLLMENT_REQUIRED'))status=403;
  else if(code.includes('NOT_FOUND'))status=404;
  else if(code.includes('TOO_MANY')||code.includes('TOO_LARGE'))status=413;
  else if(code.includes('VERIFICATION_REQUIRED')||code.includes('NOT_ACTIVE'))status=409;
  return json({ok:false,error:code},status);
}
export async function handleTrainingMoatApi(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/moat/'))return null;
  try{
    if(path==='/api/moat/locales'&&request.method==='GET')return json({ok:true,locales:SUPPORTED_PORTAL_LOCALES});
    const publicPartner=path.match(/^\/api\/moat\/partner-access\/([^/]+)$/);
    if(publicPartner&&request.method==='GET')return json({ok:true,context:await publicPartnerContext(env,decodeURIComponent(publicPartner[1]))});

    assertSameOrigin(request,env.APP_ORIGIN);
    const tenantId=url.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_ID_REQUIRED');
    const courseId=url.searchParams.get('course_id')||undefined,auth=await resolveCoreAuth(env,request,tenantId,courseId);

    if(path==='/api/moat/language'&&request.method==='GET')return json({ok:true,preference:await getPortalLanguagePreference(env,auth,tenantId),locales:SUPPORTED_PORTAL_LOCALES});
    if(path==='/api/moat/language'&&request.method==='PUT')return json({ok:true,preference:await savePortalLanguagePreference(env,auth,tenantId,await body(request))});
    if(path==='/api/moat/learner-twin'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,twin:await buildPersonalLearnerTwin(env,auth,tenantId,courseId)});}
    if(path==='/api/moat/learner-twin/snapshot'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,snapshot:await capturePersonalLearnerTwin(env,auth,tenantId,courseId)},201);}
    if(path==='/api/moat/learning-coach/plan'&&request.method==='POST'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,plan:await createLearningCoachPlan(env,auth,tenantId,courseId,await body(request))},201);}

    if(path==='/api/moat/compliance/catalog'&&request.method==='GET')return json({ok:true,packs:COMPLIANCE_PACK_CATALOG,notice:'Vor Aktivierung müssen Regelstand und offizielle Quelle vom Kundenadmin bestätigt werden.'});
    if(path==='/api/moat/compliance/overview'&&request.method==='GET')return json({ok:true,overview:await complianceOverview(env,auth,tenantId)});
    if(path==='/api/moat/compliance/programs'&&request.method==='GET')return json({ok:true,programs:await listCompliancePrograms(env,auth,tenantId)});
    if(path==='/api/moat/compliance/programs'&&request.method==='PUT')return json({ok:true,program:await upsertComplianceProgram(env,auth,tenantId,await body(request))});
    if(path==='/api/moat/compliance/requirements'&&request.method==='GET')return json({ok:true,requirements:await listComplianceRequirements(env,auth,tenantId,courseId)});
    if(path==='/api/moat/compliance/requirements'&&request.method==='POST')return json({ok:true,requirement:await createComplianceRequirement(env,auth,tenantId,await body(request))},201);
    if(path==='/api/moat/compliance/evidence'&&request.method==='POST')return json({ok:true,evidence:await attachComplianceEvidence(env,auth,tenantId,await body(request))},201);
    if(path==='/api/moat/compliance/scan'&&request.method==='POST'){await requireAutopilotTenantAdminMfa(env,auth);return json({ok:true,scan:await scanComplianceTenant(env,tenantId)});}
    if(path==='/api/moat/compliance/evidence-package'&&request.method==='POST'){const input=await body(request),cid=safeString(input.course_id,120)||courseId;if(!cid)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,package:await createComplianceEvidencePackage(env,auth,tenantId,cid,input)},201);}

    if(path==='/api/moat/migration/preflight'&&request.method==='POST')return json({ok:true,quality:await migrationQualityPreflight(env,auth,tenantId,await body(request))});

    if(path==='/api/moat/partners/grants'&&request.method==='GET')return json({ok:true,grants:await listPartnerGrants(env,auth,tenantId)});
    if(path==='/api/moat/partners/grants'&&request.method==='POST')return json({ok:true,grant:await createPartnerGrant(env,auth,tenantId,await body(request))},201);
    const revoke=path.match(/^\/api\/moat\/partners\/grants\/([^/]+)\/revoke$/);
    if(revoke&&request.method==='POST')return json({ok:true,...await revokePartnerGrant(env,auth,tenantId,decodeURIComponent(revoke[1]))});

    if(path==='/api/moat/integrations/capabilities'&&request.method==='GET')return json({ok:true,integrations:integrationCapabilityCatalog()});
    if(path==='/api/moat/copilot/preview'&&request.method==='POST')return json({ok:true,preview:await actionCopilotPreview(env,auth,tenantId,await body(request))});

    return json({ok:false,error:'TRAINING_MOAT_ROUTE_NOT_FOUND'},404);
  }catch(error){return fail(error);}
}
