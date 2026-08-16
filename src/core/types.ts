import type { D1DatabaseLike, R2BucketLike } from '../portability/types.js';

export interface AssetBindingLike { fetch(request: Request): Promise<Response>; }

export interface Env {
  DB: D1DatabaseLike;
  FILES: R2BucketLike;
  ASSETS: AssetBindingLike;
  APP_ORIGIN?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  OWNER_MFA_ENCRYPTION_KEY?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_SAAS_CNAME_TARGET?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
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
