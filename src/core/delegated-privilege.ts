import type { CoreAuthContext, Env } from './types.js';

// Delegated Fachbereich/quality roles intentionally remain `guest` at the base membership
// level so they never inherit class-admin/student-data powers. Their report/review access is
// nevertheless privileged and therefore requires the same strong authentication principle
// as the teacher portal unless the session came from the tenant's OIDC provider.
export async function requireDelegatedPrivilegeMfa(env:Env,auth:CoreAuthContext):Promise<void>{
  if(auth.isPlatformAdmin||auth.role==='tenant_admin')return;
  const method=auth.session?.authMethod||'password';
  if(method==='oidc')return;
  const row=await env.DB.prepare('SELECT enabled_at FROM platform_mfa WHERE user_id=?').bind(auth.userId).first<{enabled_at:string|null}>().catch(()=>null);
  if(!row?.enabled_at)throw new Error('MFA_ENROLLMENT_REQUIRED');
  if(method!=='mfa')throw new Error('MFA_REQUIRED');
}
