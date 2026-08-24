import type { CoreAuthContext, Env } from './types.js';
import { hasPermission } from './enterprise-access.js';

// Delegated Fachbereich/quality roles remain `guest` at the base membership level so they
// never inherit class-admin/student-data powers. Every non-admin report request must carry
// the explicit delegated `reports.view` permission resolved for the current tenant scope.
export async function requireDelegatedPrivilegeAccess(_env:Env,auth:CoreAuthContext):Promise<void>{
  if(auth.isPlatformAdmin||auth.role==='tenant_admin')return;
  if(!hasPermission(auth,'reports.view'))throw new Error('FORBIDDEN_DELEGATED_REPORT_ACCESS');
}
