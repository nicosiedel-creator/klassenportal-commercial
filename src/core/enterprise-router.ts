import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin } from './utils.js';
import { apiOpenApi, createApiToken, handlePublicApiV1, listApiTokens, revokeApiToken } from './enterprise-api.js';
import { applyOrgImport, createOrgGrant, createOrgUnit, linkCourseOrgUnits, listCourseOrgLinks, listOrgGrants, listOrgUnits, listOrgUnitTypes, previewOrgImport, revokeOrgGrant, saveOrgUnitType, updateOrgUnit } from './enterprise-organization.js';
import { previewOrgImportFile } from './enterprise-import-file.js';
import { createScimTokenV2, handleScimRequestV2, listScimGroupsForAdminV2, listScimTokensV2, mapScimGroupV2, revokeScimTokenV2 } from './enterprise-scim-v2.js';
import { finishTenantSso, getTenantSso, saveTenantSso, startTenantSso } from './enterprise-sso.js';
import { applyParticipantImport, previewParticipantImport } from './participant-document-import.js';
import { previewParticipantImportFile } from './participant-import-file.js';
import { createResponsibility, listResponsibilities, revokeResponsibility } from './responsibilities.js';
import { handleEnterpriseIntakeRoute } from './intake-router.js';

function json(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}
async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=(e as Error).message||'ENTERPRISE_ERROR',status=code==='UNAUTHENTICATED'||code==='SSO_REQUIRED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')||code==='SELF_ELEVATION_FORBIDDEN'||code==='PRIMARY_RESPONSIBILITY_TENANT_ADMIN_REQUIRED'?403:code.includes('NOT_FOUND')?404:code.includes('EXISTS')||code.includes('CYCLE')||code.includes('ALREADY')||code.includes('CHANGED')?409:code.includes('EXPIRED')?410:code.includes('RATE_LIMITED')?429:code.includes('TOO_LARGE')?413:code.includes('NOT_READY')||code.includes('REQUIRED')&&code.includes('KEY')?428:400;return json({ok:false,error:code},status);}

export async function handleEnterpriseRouter(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),path=u.pathname;
  try{
    const ssoStart=path.match(/^\/sso\/([^/]+)$/);if(ssoStart&&request.method==='GET')return startTenantSso(env,decodeURIComponent(ssoStart[1]),request);
    if(path==='/sso/callback'&&request.method==='GET')return finishTenantSso(env,request);
    const scim=path.match(/^\/scim\/v2\/([^/]+)(\/.*)?$/);if(scim)return handleScimRequestV2(env,request,decodeURIComponent(scim[1]),scim[2]||'/');
    if(path==='/api/v1/openapi.json'&&request.method==='GET')return json(apiOpenApi(env.APP_ORIGIN||u.origin));
    if(path.startsWith('/api/v1/'))return handlePublicApiV1(env,request);
    if(!path.startsWith('/api/enterprise/'))return null;
    assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,u.searchParams.get('course_id')||undefined);
    if(path.startsWith('/api/enterprise/intake')){const intake=await handleEnterpriseIntakeRoute(request,env,auth,tenantId);if(intake)return intake;}
    if(path==='/api/enterprise/context'&&request.method==='GET')return json({ok:true,context:{tenant_id:tenantId,role:auth.role,course_ids:auth.courseIds,org_unit_ids:auth.orgUnitIds??[],permissions:auth.permissions??[],is_platform_admin:auth.isPlatformAdmin}});
    if(path==='/api/enterprise/responsibilities'&&request.method==='GET')return json({ok:true,responsibilities:await listResponsibilities(env,auth,tenantId)});
    if(path==='/api/enterprise/responsibilities'&&request.method==='POST')return json({ok:true,responsibility:await createResponsibility(env,auth,tenantId,await body(request))},201);
    const responsibility=path.match(/^\/api\/enterprise\/responsibilities\/([^/]+)$/);if(responsibility&&request.method==='DELETE'){await revokeResponsibility(env,auth,tenantId,decodeURIComponent(responsibility[1]));return json({ok:true});}
    if(path==='/api/enterprise/org/types'&&request.method==='GET')return json({ok:true,types:await listOrgUnitTypes(env,auth,tenantId)});
    if(path==='/api/enterprise/org/types'&&request.method==='POST')return json({ok:true,type:await saveOrgUnitType(env,auth,tenantId,await body(request))},201);
    if(path==='/api/enterprise/org/units'&&request.method==='GET')return json({ok:true,units:await listOrgUnits(env,auth,tenantId,u.searchParams.get('archived')==='1')});
    if(path==='/api/enterprise/org/units'&&request.method==='POST')return json({ok:true,unit:await createOrgUnit(env,auth,tenantId,await body(request))},201);
    const unit=path.match(/^\/api\/enterprise\/org\/units\/([^/]+)$/);if(unit&&request.method==='PATCH')return json({ok:true,unit:await updateOrgUnit(env,auth,tenantId,decodeURIComponent(unit[1]),await body(request))});
    if(path==='/api/enterprise/org/course-links'&&request.method==='GET')return json({ok:true,links:await listCourseOrgLinks(env,auth,tenantId)});
    const links=path.match(/^\/api\/enterprise\/org\/courses\/([^/]+)\/links$/);if(links&&request.method==='PUT')return json({ok:true,links:await linkCourseOrgUnits(env,auth,tenantId,decodeURIComponent(links[1]),await body(request))});
    if(path==='/api/enterprise/org/grants'&&request.method==='GET')return json({ok:true,grants:await listOrgGrants(env,auth,tenantId)});
    if(path==='/api/enterprise/org/grants'&&request.method==='POST')return json({ok:true,grant:await createOrgGrant(env,auth,tenantId,await body(request))},201);
    const grant=path.match(/^\/api\/enterprise\/org\/grants\/([^/]+)$/);if(grant&&request.method==='DELETE'){await revokeOrgGrant(env,auth,tenantId,decodeURIComponent(grant[1]));return json({ok:true});}
    if(path==='/api/enterprise/org/import/preview'&&request.method==='POST')return json({ok:true,preview:await previewOrgImport(env,auth,tenantId,await body(request))});
    if(path==='/api/enterprise/org/import/file-preview'&&request.method==='POST')return json({ok:true,preview:await previewOrgImportFile(env,auth,tenantId,request)});
    const apply=path.match(/^\/api\/enterprise\/org\/import\/([^/]+)\/apply$/);if(apply&&request.method==='POST')return json({ok:true,result:await applyOrgImport(env,auth,tenantId,decodeURIComponent(apply[1]),await body(request))});
    if(path==='/api/enterprise/participants/import/preview'&&request.method==='POST')return json({ok:true,preview:await previewParticipantImport(env,auth,tenantId,await body(request))});
    if(path==='/api/enterprise/participants/import/file-preview'&&request.method==='POST')return json({ok:true,preview:await previewParticipantImportFile(env,auth,tenantId,request)});
    if(path==='/api/enterprise/participants/import/apply'&&request.method==='POST')return json({ok:true,result:await applyParticipantImport(env,auth,tenantId,await body(request))});
    if(path==='/api/enterprise/sso'&&request.method==='GET'){const c=await getTenantSso(env,auth,tenantId),t=await env.DB.prepare('SELECT slug FROM tenants WHERE id=?').bind(tenantId).first<{slug:string}>();return json({ok:true,sso:c,start_url:t?`${env.APP_ORIGIN||u.origin}/sso/${encodeURIComponent(t.slug)}`:null,callback_url:`${env.APP_ORIGIN||u.origin}/sso/callback`});}
    if(path==='/api/enterprise/sso'&&request.method==='PUT')return json({ok:true,sso:await saveTenantSso(env,auth,tenantId,await body(request))});
    if(path==='/api/enterprise/scim/tokens'&&request.method==='GET')return json({ok:true,tokens:await listScimTokensV2(env,auth,tenantId)});
    if(path==='/api/enterprise/scim/tokens'&&request.method==='POST'){const token=await createScimTokenV2(env,auth,tenantId,await body(request)),t=await env.DB.prepare('SELECT slug FROM tenants WHERE id=?').bind(tenantId).first<{slug:string}>();return json({ok:true,token,base_url:t?`${env.APP_ORIGIN||u.origin}/scim/v2/${encodeURIComponent(t.slug)}`:null},201);}
    const scimToken=path.match(/^\/api\/enterprise\/scim\/tokens\/([^/]+)$/);if(scimToken&&request.method==='DELETE'){await revokeScimTokenV2(env,auth,tenantId,decodeURIComponent(scimToken[1]));return json({ok:true});}
    if(path==='/api/enterprise/scim/groups'&&request.method==='GET')return json({ok:true,groups:await listScimGroupsForAdminV2(env,auth,tenantId)});
    const scimGroup=path.match(/^\/api\/enterprise\/scim\/groups\/([^/]+)\/mapping$/);if(scimGroup&&request.method==='PUT')return json({ok:true,group:await mapScimGroupV2(env,auth,tenantId,decodeURIComponent(scimGroup[1]),await body(request))});
    if(path==='/api/enterprise/api/tokens'&&request.method==='GET')return json({ok:true,tokens:await listApiTokens(env,auth,tenantId),scopes:['org.read','org.write','courses.read','courses.write','users.read','users.write','content.read','content.write','reports.read'],openapi_url:`${env.APP_ORIGIN||u.origin}/api/v1/openapi.json`});
    if(path==='/api/enterprise/api/tokens'&&request.method==='POST')return json({ok:true,token:await createApiToken(env,auth,tenantId,await body(request))},201);
    const apiToken=path.match(/^\/api\/enterprise\/api\/tokens\/([^/]+)$/);if(apiToken&&request.method==='DELETE'){await revokeApiToken(env,auth,tenantId,decodeURIComponent(apiToken[1]));return json({ok:true});}
    return json({ok:false,error:'ENTERPRISE_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
