import type { CoreAuthContext, Env } from './types.js';

export async function requireAutopilotTenantAdminMfa(env:Env,auth:CoreAuthContext):Promise<void>{
  if(auth.isPlatformAdmin)throw new Error('AUTOPILOT_TENANT_ADMIN_REQUIRED');
  if(auth.role!=='tenant_admin')throw new Error('AUTOPILOT_TENANT_ADMIN_REQUIRED');
  const method=auth.session?.authMethod||'password';
  if(method==='oidc')return;
  const row=await env.DB.prepare('SELECT enabled_at FROM platform_mfa WHERE user_id=?').bind(auth.userId).first<{enabled_at:string|null}>().catch(()=>null);
  if(!row?.enabled_at)throw new Error('AUTOPILOT_MFA_ENROLLMENT_REQUIRED');
  if(method!=='mfa')throw new Error('AUTOPILOT_MFA_REQUIRED');
}

export async function tenantAdminCount(env:Env,tenantId:string){
  const row=await env.DB.prepare("SELECT COUNT(DISTINCT user_id) n FROM memberships WHERE tenant_id=? AND role='tenant_admin'").bind(tenantId).first<{n:number}>();return Number(row?.n||0);
}

export function safeAutopilotActionType(type:string){
  return new Set([
    'teacher_unavailability.upsert','lesson.assign_teacher','substitution.assign','notification.course',
    'lesson.set_activity','resource.unavailable','lesson.set_room','lesson.reserve_resource','exam.reschedule',
    'quality.create','deadline.create'
  ]).has(type);
}

const forbiddenAutopilotNamespaces=[
  'auth','account','role','membership','permission','billing','payment','grade','attendance','signature.sign','platform','tenant.delete','course.delete'
] as const;

export function forbiddenAutopilotNamespace(type:string){
  return forbiddenAutopilotNamespaces.some((namespace)=>type.startsWith(namespace));
}
