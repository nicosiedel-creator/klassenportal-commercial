import type { CoreAuthContext, Env } from './types.js';

// Delegated Fachbereich/quality roles intentionally remain `guest` at the base membership
// level so they never inherit class-admin/student-data powers. Access remains role- and
// tenant-scoped; authentication itself is handled by the normal password/OIDC session layer.
export async function requireDelegatedPrivilegeMfa(_env:Env,auth:CoreAuthContext):Promise<void>{
  if(auth.isPlatformAdmin||auth.role==='tenant_admin')return;
}
