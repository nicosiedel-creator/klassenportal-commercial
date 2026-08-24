import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin, json, safeString } from './utils.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { buildEducationTwin, captureEducationTwinSnapshot, getEducationTwinSnapshot, twinSummary } from './education-twin.js';
import { getEducationScenario, listEducationScenarios, simulateEducationScenario } from './education-scenarios.js';
import { previewEducationIntent, simulateEducationIntent } from './education-intent.js';
import { getAutopilotPolicy, listAutopilotExecutions, saveAutopilotPolicy } from './education-autopilot.js';
import { approveGuardedScenarioOption, executeGuardedScenarioOption, rollbackGuardedAutopilotExecution } from './education-autopilot-guarded.js';
import { listEducationRisks, scanTenantFutureRadar, updateRiskStatus } from './education-radar.js';
import { listConsistencyFindings, scanTenantConsistency, updateConsistencyFinding } from './education-consistency.js';
import { buildCourseProofGraph, createCourseProofPackage, getCourseProofPackage, listCourseProofPackages } from './education-proof-graph.js';
import { computeCourseReadiness, computeTenantReadiness, captureCourseReadiness, readinessTrend } from './education-readiness.js';
import { requireAutopilotTenantAdmin } from './autopilot-security.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(error:unknown){const code=String((error as Error)?.message||'EDUCATION_OS_ERROR');let status=400;if(code==='UNAUTHENTICATED')status=401;else if(code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED'))status=403;else if(code.includes('NOT_FOUND'))status=404;else if(code.includes('LOCKED')||code.includes('STALE')||code.includes('RESIMULATE')||code.includes('EXPIRED')||code.includes('APPROVAL_REQUIRED')||code.includes('PRECONDITION')||code.includes('RECOMMEND_ONLY')||code.includes('GUARDRAIL'))status=409;else if(code.includes('LIMIT'))status=413;return json({ok:false,error:code},status);}
function scope(url:URL){const courseId=url.searchParams.get('course_id'),orgId=url.searchParams.get('org_unit_id');if(courseId)return{scope_type:'course' as const,scope_id:courseId};if(orgId)return{scope_type:'org' as const,scope_id:orgId};return{scope_type:'tenant' as const};}

export async function handleEducationOsApi(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/education-os/'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);const tenantId=url.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_REQUIRED');const courseId=url.searchParams.get('course_id')||undefined,auth=await resolveCoreAuth(env,request,tenantId,courseId);const write=request.method!=='GET'&&request.method!=='HEAD';if(write)await assertTenantWriteAllowed(env,tenantId);

    if(path==='/api/education-os/twin'&&request.method==='GET'){const twin=await buildEducationTwin(env,auth,tenantId,scope(url));return json({ok:true,twin:{captured_at:twin.captured_at,digest:twin.digest,scope:twin.scope,summary:twinSummary(twin),source_clock:twin.source_clock,privacy:(twin.payload as any).privacy}});}
    if(path==='/api/education-os/twin/snapshot'&&request.method==='POST'){const input=await body(request),s=input.scope_type?{scope_type:String(input.scope_type) as 'tenant'|'course'|'org',scope_id:safeString(input.scope_id,120)||undefined}:scope(url);if(!['tenant','course','org'].includes(s.scope_type))throw new Error('TWIN_SCOPE_INVALID');const twin=await captureEducationTwinSnapshot(env,auth,tenantId,s);return json({ok:true,snapshot:{snapshot_id:twin.snapshot_id,captured_at:twin.captured_at,digest:twin.digest,expires_at:twin.expires_at,summary:twinSummary(twin),source_clock:twin.source_clock}},201);}
    const snapshot=path.match(/^\/api\/education-os\/twin\/snapshots\/([^/]+)$/);if(snapshot&&request.method==='GET')return json({ok:true,snapshot:await getEducationTwinSnapshot(env,auth,tenantId,decodeURIComponent(snapshot[1]))});

    if(path==='/api/education-os/readiness'&&request.method==='GET')return json({ok:true,readiness:courseId?await computeCourseReadiness(env,auth,tenantId,courseId):await computeTenantReadiness(env,auth,tenantId)});
    if(path==='/api/education-os/readiness/snapshot'&&request.method==='POST'){const input=await body(request),cid=safeString(input.course_id,120)||courseId;if(!cid)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,snapshot:await captureCourseReadiness(env,auth,tenantId,cid)},201);}
    if(path==='/api/education-os/readiness/trend'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,trend:await readinessTrend(env,auth,tenantId,courseId,Number(url.searchParams.get('limit')||60))});}

    if(path==='/api/education-os/scenarios'&&request.method==='GET')return json({ok:true,scenarios:await listEducationScenarios(env,auth,tenantId,Number(url.searchParams.get('limit')||50))});
    if(path==='/api/education-os/scenarios/simulate'&&request.method==='POST'){const input=await body(request),type=safeString(input.scenario_type,120);if(!type)throw new Error('SCENARIO_TYPE_REQUIRED');const scenarioInput=input.input&&typeof input.input==='object'?input.input as Record<string,unknown>:input;return json({ok:true,...await simulateEducationScenario(env,auth,tenantId,type,scenarioInput,safeString(input.intent_text,5000)||null)},201);}
    const scenario=path.match(/^\/api\/education-os\/scenarios\/([^/]+)$/);if(scenario&&request.method==='GET')return json({ok:true,...await getEducationScenario(env,auth,tenantId,decodeURIComponent(scenario[1]))});
    const approval=path.match(/^\/api\/education-os\/scenarios\/([^/]+)\/options\/([^/]+)\/approve$/);if(approval&&request.method==='POST')return json({ok:true,...await approveGuardedScenarioOption(env,auth,tenantId,decodeURIComponent(approval[1]),decodeURIComponent(approval[2]),await body(request))});
    const execute=path.match(/^\/api\/education-os\/scenarios\/([^/]+)\/options\/([^/]+)\/execute$/);if(execute&&request.method==='POST'){const input=await body(request),key=request.headers.get('Idempotency-Key')||safeString(input.idempotency_key,200)||'';return json({ok:true,...await executeGuardedScenarioOption(env,auth,tenantId,decodeURIComponent(execute[1]),decodeURIComponent(execute[2]),key)});}

    if(path==='/api/education-os/intent/preview'&&request.method==='POST'){const input=await body(request),intent=safeString(input.intent,5000)||'';return json({ok:true,preview:await previewEducationIntent(env,auth,tenantId,intent,input.context&&typeof input.context==='object'?input.context as Record<string,unknown>:{})});}
    if(path==='/api/education-os/intent/simulate'&&request.method==='POST'){const input=await body(request),intent=safeString(input.intent,5000)||'';return json({ok:true,...await simulateEducationIntent(env,auth,tenantId,intent,input.context&&typeof input.context==='object'?input.context as Record<string,unknown>:{})},201);}

    if(path==='/api/education-os/policy'&&request.method==='GET')return json({ok:true,policy:await getAutopilotPolicy(env,auth,tenantId)});
    if(path==='/api/education-os/policy'&&request.method==='PUT')return json({ok:true,policy:await saveAutopilotPolicy(env,auth,tenantId,await body(request))});
    if(path==='/api/education-os/executions'&&request.method==='GET')return json({ok:true,executions:await listAutopilotExecutions(env,auth,tenantId,Number(url.searchParams.get('limit')||50))});
    const rollback=path.match(/^\/api\/education-os\/executions\/([^/]+)\/rollback$/);if(rollback&&request.method==='POST')return json({ok:true,...await rollbackGuardedAutopilotExecution(env,auth,tenantId,decodeURIComponent(rollback[1]))});

    if(path==='/api/education-os/risks'&&request.method==='GET')return json({ok:true,risks:await listEducationRisks(env,auth,tenantId,url.searchParams.get('status')||'open')});
    if(path==='/api/education-os/risks/scan'&&request.method==='POST'){await requireAutopilotTenantAdmin(env,auth);return json({ok:true,scan:await scanTenantFutureRadar(env,tenantId)});}
    const risk=path.match(/^\/api\/education-os\/risks\/([^/]+)\/status$/);if(risk&&request.method==='PUT'){await requireAutopilotTenantAdmin(env,auth);const input=await body(request);return json({ok:true,...await updateRiskStatus(env,auth,tenantId,decodeURIComponent(risk[1]),String(input.status||''))});}

    if(path==='/api/education-os/consistency'&&request.method==='GET')return json({ok:true,findings:await listConsistencyFindings(env,auth,tenantId,url.searchParams.get('status')||'open')});
    if(path==='/api/education-os/consistency/scan'&&request.method==='POST'){await requireAutopilotTenantAdmin(env,auth);return json({ok:true,scan:await scanTenantConsistency(env,tenantId)});}
    const finding=path.match(/^\/api\/education-os\/consistency\/([^/]+)\/status$/);if(finding&&request.method==='PUT'){await requireAutopilotTenantAdmin(env,auth);const input=await body(request);return json({ok:true,...await updateConsistencyFinding(env,auth,tenantId,decodeURIComponent(finding[1]),String(input.status||''))});}

    if(path==='/api/education-os/proof'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');const input={from_date:url.searchParams.get('from_date'),to_date:url.searchParams.get('to_date')};return json({ok:true,graph:await buildCourseProofGraph(env,auth,tenantId,courseId,input)});}
    if(path==='/api/education-os/proof/packages'&&request.method==='GET'){if(!courseId)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,packages:await listCourseProofPackages(env,auth,tenantId,courseId)});}
    if(path==='/api/education-os/proof/packages'&&request.method==='POST'){const input=await body(request),cid=safeString(input.course_id,120)||courseId;if(!cid)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,...await createCourseProofPackage(env,auth,tenantId,cid,input)},201);}
    const proof=path.match(/^\/api\/education-os\/proof\/packages\/([^/]+)$/);if(proof&&request.method==='GET')return json({ok:true,package:await getCourseProofPackage(env,auth,tenantId,decodeURIComponent(proof[1]))});

    return json({ok:false,error:'EDUCATION_OS_ROUTE_NOT_FOUND'},404);
  }catch(error){return fail(error);}
}

