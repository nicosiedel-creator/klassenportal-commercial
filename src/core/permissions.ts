import type { CoreAuthContext } from './types.js';

const ranks: Record<string,number>={platform_admin:5,tenant_admin:4,class_admin:3,participant:2,guest:1};
export function requireRole(auth: CoreAuthContext, minimum: 'tenant_admin'|'class_admin'|'participant'|'guest'): void {
  if((ranks[auth.role]??0)<ranks[minimum]) throw new Error('FORBIDDEN_ROLE');
}
export function requirePlatform(auth: CoreAuthContext): void { if(!auth.isPlatformAdmin) throw new Error('PLATFORM_ADMIN_REQUIRED'); }
