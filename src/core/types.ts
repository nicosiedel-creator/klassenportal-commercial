import type { D1DatabaseLike, R2BucketLike } from '../portability/types.js';

export interface AssetBindingLike { fetch(request: Request): Promise<Response>; }

export interface Env {
  DB: D1DatabaseLike;
  FILES: R2BucketLike;
  ASSETS: AssetBindingLike;
  BOOTSTRAP_SECRET?: string;
  APP_ORIGIN?: string;
}

export type Role = 'platform_admin' | 'tenant_admin' | 'class_admin' | 'participant' | 'guest';

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  tenantRoles: Array<{ tenantId: string; courseId: string | null; role: Exclude<Role,'platform_admin'> }>;
}

export interface CoreAuthContext {
  userId: string;
  role: Role;
  tenantIds: string[];
  courseIds: string[];
  isPlatformAdmin: boolean;
  session: SessionUser;
}
