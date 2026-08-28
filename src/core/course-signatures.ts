import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { hasPermission } from './enterprise-access.js';
import { audit } from './audit.js';
import { assertSameOrigin, authStatus, id, json, nowIso, safeErrorCode, safeString } from './utils.js';

function admin(auth:any){return auth.isPlatformAdmin||auth.role==='tenant_admin';}
function text(v:unknown,max:number){const s=safeString(v,max);if(!s)throw new Error('FIELD_REQUIRED');return s;}
function optional(v:unknown,max:number){return safeString(v,max)||null;}
async function sha256(value:string){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));return[...new Uint8Array(hash)].map(x=>x.toString(16).padStart(2,'0')).join('');}
function fail(e:unknown){const code=safeErrorCode(e),status=authStatus(code)??(code.includes('NOT_FOUND')?404:code.includes('PROVIDER_REQUIRED')?503:code.includes('REQUIRED')||code.includes('INVALID')?400:500);return json({ok:false,error:code},status);}

export async function handleCourseSignatureApi(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);if(url.pathname!=='/api/education/course-signatures')return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
    const tenantId=url.searchParams.get('tenant_id')||'',courseId=url.searchParams.get('course_id')||'';if(!tenantId||!courseId)throw new Error('SIGNATURE_SCOPE_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId);if(!admin(auth)&&!hasPermission(auth,'content.manage'))throw new Error('FORBIDDEN_SIGNATURE_CREATE');if(!admin(auth)&&!auth.courseIds.includes(courseId))throw new Error('FORBIDDEN_COURSE_SCOPE');await assertTenantWriteAllowed(env,tenantId);
    const input=await request.json() as Record<string,unknown>,title=text(input.title,400),body=text(input.body,12000),documentType=String(input.document_type||'custom');if(!['excursion_consent','practice_evidence','certificate_acknowledgement','custom'].includes(documentType))throw new Error('SIGNATURE_DOCUMENT_TYPE_INVALID');const signatureLevel=String(input.signature_level||'platform_authenticated');if(!['platform_authenticated','external_advanced','external_qualified'].includes(signatureLevel))throw new Error('SIGNATURE_LEVEL_INVALID');if(signatureLevel!=='platform_authenticated')throw new Error('EXTERNAL_SIGNATURE_PROVIDER_REQUIRED');
    const entityType=optional(input.entity_type,120)||'course_notice',entityId=optional(input.entity_id,160)||id('ack_'),dueAt=optional(input.due_at,50),ts=nowIso();const course=await env.DB.prepare('SELECT id,name,code FROM courses WHERE tenant_id=? AND id=?').bind(tenantId,courseId).first<Record<string,unknown>>();if(!course)throw new Error('COURSE_NOT_FOUND');
    const members=(await env.DB.prepare("SELECT DISTINCT m.user_id,u.display_name,u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.course_id=? AND m.role IN ('participant','class_admin') AND u.status='active' ORDER BY u.display_name").bind(tenantId,courseId).all<Record<string,unknown>>()).results??[];if(!members.length)throw new Error('NO_PARTICIPANTS_FOR_SIGNATURE');
    const snapshot=JSON.stringify({title,body,course:{id:course.id,name:course.name,code:course.code},entity_type:entityType,entity_id:entityId,created_at:ts}),hash=await sha256(snapshot),documentId=id('sigdoc_');await env.DB.prepare("INSERT INTO signature_documents(id,tenant_id,course_id,document_type,entity_type,entity_id,title,snapshot_json,snapshot_sha256,signature_level,status,created_by,created_at,completed_at) VALUES(?,?,?,?,?,?,?,?,?,?,'open',?,?,NULL)").bind(documentId,tenantId,courseId,documentType,entityType,entityId,title,snapshot,hash,signatureLevel,auth.userId,ts).run();
    for(const m of members)await env.DB.prepare("INSERT INTO signature_requests(id,tenant_id,document_id,signer_user_id,signer_role,signing_order,status,due_at,reminder_after,signed_at,created_at,updated_at) VALUES(?,?,?,?, 'participant',0,'pending',?,NULL,NULL,?,?)").bind(id('sigreq_'),tenantId,documentId,String(m.user_id),dueAt,ts,ts).run();
    await audit(env.DB,auth.userId,'education.course_signature_requested',tenantId,courseId,'signature_document',documentId,{documentType,signatureLevel,recipients:members.length,entityType,entityId});return json({ok:true,document_id:documentId,requests:members.length,sha256:hash},201);
  }catch(e){return fail(e);}
}
