import type { CoreAuthContext, Env } from './types.js';
import { nowIso, safeString, sha256Text } from './utils.js';
import { requireAutopilotTenantAdmin } from './autopilot-security.js';
import { createPartnerGrant, scanComplianceTenant, upsertComplianceProgram } from './training-moat.js';

const SAFE_PARTNER_CAPABILITIES=new Set(['course_schedule','reportbook_status','signature_status','participant_identity']);
const FORBIDDEN_PARTNER_TERMS=['grade','attendance','health','private','billing','role','permission'];

function requireTenantAdmin(auth:CoreAuthContext){if(auth.isPlatformAdmin||auth.role!=='tenant_admin')throw new Error('TENANT_ADMIN_REQUIRED');}
function capabilities(input:unknown){
  const list=Array.isArray(input)?[...new Set(input.map(String))]:[];
  if(!list.length)throw new Error('PARTNER_CAPABILITIES_REQUIRED');
  for(const cap of list){if(!SAFE_PARTNER_CAPABILITIES.has(cap)||FORBIDDEN_PARTNER_TERMS.some(x=>cap.toLowerCase().includes(x)))throw new Error('PARTNER_CAPABILITY_FORBIDDEN');}
  return list;
}

export async function upsertComplianceProgramHardened(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  await requireAutopilotTenantAdmin(env,auth);
  const status=String(input.status||'draft'),version=safeString(input.rules_version,100),source=safeString(input.source_reference,1000);
  if(status==='active'){
    if(input.verification_confirmed!==true)throw new Error('COMPLIANCE_RULE_VERIFICATION_REQUIRED');
    if(!version)throw new Error('COMPLIANCE_RULE_VERSION_REQUIRED');
    if(!source||!/^https:\/\//i.test(source))throw new Error('COMPLIANCE_OFFICIAL_SOURCE_REQUIRED');
  }
  return upsertComplianceProgram(env,auth,tenantId,{...input,rules_version:version,source_reference:source});
}

async function validatePartnerScope(env:Env,tenantId:string,courseId:string|null,participantId:string|null){
  if(courseId){const c=await env.DB.prepare('SELECT id FROM courses WHERE tenant_id=? AND id=? AND is_active=1').bind(tenantId,courseId).first<{id:string}>();if(!c)throw new Error('COURSE_NOT_FOUND');}
  if(participantId){
    const sql=courseId
      ? "SELECT 1 ok FROM memberships WHERE tenant_id=? AND user_id=? AND course_id=? AND role IN ('participant','class_admin','guest') LIMIT 1"
      : "SELECT 1 ok FROM memberships WHERE tenant_id=? AND user_id=? AND role IN ('participant','class_admin','guest') LIMIT 1";
    const row=courseId?await env.DB.prepare(sql).bind(tenantId,participantId,courseId).first<{ok:number}>():await env.DB.prepare(sql).bind(tenantId,participantId).first<{ok:number}>();
    if(!row)throw new Error('PARTNER_PARTICIPANT_SCOPE_INVALID');
  }
}
export async function createPartnerGrantHardened(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  await requireAutopilotTenantAdmin(env,auth);
  const courseId=safeString(input.course_id,120)||null,participantId=safeString(input.participant_user_id,120)||null,caps=capabilities(input.capabilities);
  await validatePartnerScope(env,tenantId,courseId,participantId);
  return createPartnerGrant(env,auth,tenantId,{...input,course_id:courseId,participant_user_id:participantId,capabilities:caps});
}

async function rows<T extends Record<string,unknown>>(env:Env,sql:string,args:unknown[]){try{return((await env.DB.prepare(sql).bind(...args).all<T>()).results??[]);}catch{return[];}}
export async function publicPartnerContextHardened(env:Env,token:string){
  if(token.length<32||token.length>200)throw new Error('PARTNER_ACCESS_NOT_FOUND');
  const hash=await sha256Text(token),grant=await env.DB.prepare("SELECT * FROM partner_access_grants WHERE token_hash=? AND status='active' AND expires_at>?").bind(hash,nowIso()).first<Record<string,unknown>>();
  if(!grant)throw new Error('PARTNER_ACCESS_NOT_FOUND');
  const caps=capabilities(JSON.parse(String(grant.capabilities_json||'[]'))),tenantId=String(grant.tenant_id),courseId=safeString(grant.course_id,120)||null,participantId=safeString(grant.participant_user_id,120)||null;
  await validatePartnerScope(env,tenantId,courseId,participantId);
  const data:Record<string,unknown>={};
  if(courseId&&caps.includes('course_schedule'))data.schedule=await rows(env,'SELECT starts_at,ends_at,room,notes FROM lessons WHERE tenant_id=? AND course_id=? AND ends_at>=? ORDER BY starts_at LIMIT 30',[tenantId,courseId,nowIso()]);
  if(courseId&&participantId&&caps.includes('reportbook_status'))data.report_book=await rows(env,'SELECT period_start,period_end,status,updated_at FROM report_book_periods WHERE tenant_id=? AND course_id=? AND participant_user_id=? ORDER BY period_end DESC LIMIT 12',[tenantId,courseId,participantId]);
  if(courseId&&participantId&&caps.includes('signature_status'))data.signatures=await rows(env,`SELECT d.document_type,r.status,r.due_at FROM signature_requests r JOIN signature_documents d ON d.id=r.document_id AND d.tenant_id=r.tenant_id WHERE r.tenant_id=? AND d.course_id=? AND r.signer_user_id=? ORDER BY r.created_at DESC LIMIT 20`,[tenantId,courseId,participantId]);
  if(participantId&&caps.includes('participant_identity')){
    const sql=courseId
      ? `SELECT u.display_name FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.tenant_id=? AND m.course_id=? AND m.role IN ('participant','class_admin','guest') LIMIT 1`
      : `SELECT u.display_name FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.tenant_id=? AND m.role IN ('participant','class_admin','guest') LIMIT 1`;
    const u=courseId?await env.DB.prepare(sql).bind(participantId,tenantId,courseId).first<Record<string,unknown>>():await env.DB.prepare(sql).bind(participantId,tenantId).first<Record<string,unknown>>();
    if(u)data.participant={display_name:u.display_name};
  }
  return{partner:{type:grant.partner_type,name:grant.partner_name},scope:{course_id:courseId,participant_scoped:!!participantId},capabilities:caps,data,privacy:{grades:false,individual_attendance:false,health:false,private_notes:false,billing:false,role_management:false}};
}

export async function runComplianceRadarBounded(env:Env,limit=25){
  const take=Math.max(1,Math.min(100,Math.trunc(limit)||25)),state=await env.DB.prepare("SELECT last_tenant_id FROM compliance_automation_state WHERE id='singleton'").first<{last_tenant_id:string|null}>().catch(()=>null),after=state?.last_tenant_id||'';
  let tenants=await rows<{tenant_id:string}>(env,"SELECT DISTINCT tenant_id FROM tenant_compliance_programs WHERE status='active' AND tenant_id>? ORDER BY tenant_id LIMIT ?",[after,take]);
  let wrapped=false;if(!tenants.length&&after){tenants=await rows<{tenant_id:string}>(env,"SELECT DISTINCT tenant_id FROM tenant_compliance_programs WHERE status='active' ORDER BY tenant_id LIMIT ?",[take]);wrapped=true;}
  let findings=0;for(const t of tenants){const r=await scanComplianceTenant(env,String(t.tenant_id));findings+=Number(r.findings_created||0);}
  const last=tenants.at(-1)?.tenant_id||'';if(last)await env.DB.prepare("INSERT INTO compliance_automation_state(id,last_tenant_id,updated_at) VALUES('singleton',?,?) ON CONFLICT(id) DO UPDATE SET last_tenant_id=excluded.last_tenant_id,updated_at=excluded.updated_at").bind(last,nowIso()).run();
  return{tenants_scanned:tenants.length,findings_created:findings,batch_limit:take,wrapped,last_tenant_id:last||null};
}

export async function scanComplianceTenantHardened(env:Env,auth:CoreAuthContext,tenantId:string){
  requireTenantAdmin(auth);await requireAutopilotTenantAdmin(env,auth);return scanComplianceTenant(env,tenantId);
}

