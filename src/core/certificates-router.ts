import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { certificateEligibleParticipants } from './certificate-eligible.js';
import { prepareCertificatesForCourse,approveCertificate, createVerificationLink, issueCertificate, listCertificateRecords, listCertificateTemplates, myCertificates, prepareCertificate, revokeCertificate, saveCertificateTemplate, verifyCertificate } from './certificates.js';
import { assertSameOrigin, authStatus, json, safeErrorCode, safeString } from './utils.js';

async function body(request:Request){try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=safeErrorCode(e),status=authStatus(code)??(code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')?403:code.includes('NOT_FOUND')?404:code.includes('NOT_APPROVABLE')||code.includes('NOT_ISSUABLE')||code.includes('NOT_REVOCABLE')||code.includes('CRITERIA_NOT_MET')?409:400);return json({ok:false,error:code},status);}
export async function handleCertificatesApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),path=u.pathname;
  const verify=path.match(/^\/api\/certificates\/verify\/([^/]+)$/);if(verify&&request.method==='GET'){try{return json({ok:true,verification:await verifyCertificate(env,decodeURIComponent(verify[1]))});}catch(e){return fail(e);}}
  if(!path.startsWith('/api/certificates'))return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||undefined;if(!tenantId)throw new Error('TENANT_ID_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId);
    if(path==='/api/certificates/my'&&request.method==='GET')return json({ok:true,certificates:await myCertificates(env,auth,tenantId,courseId)});
    if(path==='/api/certificates/templates'&&request.method==='GET')return json({ok:true,templates:await listCertificateTemplates(env,auth,tenantId)});
    if(path==='/api/certificates/templates'&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,template:await saveCertificateTemplate(env,auth,tenantId,await body(request))},201);}
    if(path==='/api/certificates/eligible'&&request.method==='GET'){const course=safeString(courseId||u.searchParams.get('target_course_id'),120);if(!course)throw new Error('COURSE_ID_REQUIRED');return json({ok:true,participants:await certificateEligibleParticipants(env,auth,tenantId,course)});}
    if(path==='/api/certificates/records'&&request.method==='GET')return json({ok:true,records:await listCertificateRecords(env,auth,tenantId,courseId)});
    if(path==='/api/certificates/prepare'&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);const b=await body(request),course=safeString(b.course_id||courseId,120),user=safeString(b.user_id,120),template=safeString(b.template_id,120);if(!course||!user||!template)throw new Error('CERTIFICATE_PREPARE_FIELDS_REQUIRED');return json({ok:true,certificate:await prepareCertificate(env,auth,tenantId,course,user,template)},201);}
    if(path==='/api/certificates/prepare-course'&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);const b=await body(request),course=safeString(b.course_id||courseId,120),template=safeString(b.template_id,120);if(!course||!template)throw new Error('CERTIFICATE_PREPARE_FIELDS_REQUIRED');return json({ok:true,batch:await prepareCertificatesForCourse(env,auth,tenantId,course,template)},201);}
    const approve=path.match(/^\/api\/certificates\/([^/]+)\/approve$/);if(approve&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,certificate:await approveCertificate(env,auth,tenantId,decodeURIComponent(approve[1]))});}
    const issue=path.match(/^\/api\/certificates\/([^/]+)\/issue$/);if(issue&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,certificate:await issueCertificate(env,auth,tenantId,decodeURIComponent(issue[1]))});}
    const revoke=path.match(/^\/api\/certificates\/([^/]+)\/revoke$/);if(revoke&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);const b=await body(request);return json({ok:true,certificate:await revokeCertificate(env,auth,tenantId,decodeURIComponent(revoke[1]),b.reason)});}
    const link=path.match(/^\/api\/certificates\/([^/]+)\/verification-link$/);if(link&&request.method==='POST')return json({ok:true,...await createVerificationLink(env,auth,tenantId,decodeURIComponent(link[1]),request)});
    return json({ok:false,error:'CERTIFICATE_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
