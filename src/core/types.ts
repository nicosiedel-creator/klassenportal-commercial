import type { D1DatabaseLike, R2BucketLike } from '../portability/types.js';

export interface AssetBindingLike { fetch(request: Request): Promise<Response>; }
export interface WorkerVersionMetadataLike { id:string; tag?:string; timestamp?:string; }
export interface SendEmailBindingLike {
  send(message:{
    to:string|{email:string;name?:string}|Array<string|{email:string;name?:string}>;
    from:string|{email:string;name?:string};
    subject:string;
    html?:string;
    text?:string;
    replyTo?:string|{email:string;name?:string};
    headers?:Record<string,string>;
  }):Promise<{messageId:string}>;
}

export interface Env {
  DB: D1DatabaseLike;
  FILES: R2BucketLike;
  LEGACY_FILES?: R2BucketLike;
  ASSETS: AssetBindingLike;
  EMAIL?: SendEmailBindingLike;
  APP_ORIGIN?: string;
  PAYMENTS_ENABLED?: string;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  TENANT_SECRETS_ENCRYPTION_KEY?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_REDIRECT_URI?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_SAAS_CNAME_TARGET?: string;
  INBOUND_MAIL_DOMAIN?: string;
  MAIL_FROM?: string;
  DATA_RESIDENCY_MODE?: 'eu_strict'|'standard';
  EU_D1_JURISDICTION_ATTESTED?: string;
  EU_R2_JURISDICTION_ATTESTED?: string;
  EU_WORKER_PROCESSING_ATTESTED?: string;
  EU_METADATA_BOUNDARY_ATTESTED?: string;
  EU_BACKUP_STORAGE_ATTESTED?: string;
  EU_STORAGE_MIGRATION_REQUIRED?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_JWK?: string;
  VAPID_SUBJECT?: string;
  ERP_WEBHOOK_URL?: string;
  ERP_WEBHOOK_SIGNING_SECRET?: string;
  CF_VERSION_METADATA?: WorkerVersionMetadataLike;
}

export type Role = 'platform_admin' | 'tenant_admin' | 'class_admin' | 'participant' | 'guest';
export type AuthMethod = 'password'|'oidc'|'api'|'scim';

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  tenantRoles: Array<{ tenantId: string; courseId: string | null; role: Exclude<Role,'platform_admin'> }>;
  authMethod?: AuthMethod;
  authTenantId?: string | null;
}

export interface CoreAuthContext {
  userId: string;
  role: Role;
  tenantIds: string[];
  courseIds: string[];
  orgUnitIds?: string[];
  permissions?: string[];
  isPlatformAdmin: boolean;
  session: SessionUser;
}
