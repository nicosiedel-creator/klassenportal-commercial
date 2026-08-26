import type { CoreAuthContext, Env } from './types.js';
import { hashPassword } from './auth.js';
import { audit } from './audit.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, safeString, slugify } from './utils.js';
import { requirePlatform } from './permissions.js';
import { createActivationForUser } from './account-recovery.js';
import { mailConfigured } from './mail.js';

const defaultFeatures=['schedule','homework','appointments','announcements','links','files','calendar','reminders','weekly_overview','exams_progress','personal_grades'];
const optionalFeatures=['microsoft_teams','microsoft_365','statistics','learning_materials','surveys','substitution_updates','custom_domain','white_label'];

export type ProvisionInput={name?:string;slug?:string;admin_email?:string;admin_name?:string;admin_password?:string;portal_name?:string;course_name?:string;course_code?:string;access_mode?:string;access_code?:string;plan_id?:string;};
export type ProvisionResult={tenantId:string;adminUserId:string;invitationSent?:boolean;courseId?:string};

async function tableExists(env:Env,name:string):Promise<boolean>{
  return !!(await env.DB.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?").bind(name).first());
}

async function uniqueTenantSlug(env:Env,value:string):Promise<string>{
  const base=slugify(value).slice(0,72);
  if(!base)throw new Error('TENANT_SLUG_REQUIRED');
  const exists=await env.DB.prepare('SELECT id FROM tenants WHERE slug=?').bind(base).first();
  if(!exists)return base;
  for(let i=2;i<=99;i++){
    const candidate=`${base.slice(0,75-String(i).length)}-${i}`;
    const row=await env.DB.prepare('SELECT id FROM tenants WHERE slug=?').bind(candidate).first();
    if(!row)return candidate;
  }
  return `${base.slice(0,65)}-${crypto.randomUUID().slice(0,8)}`;
}

async function cleanupProvisionedTenant(env:Env,tenantId:string,userId:string,removeUser:boolean):Promise<void>{
  const tenantUsersTable=await tableExists(env,'tenant_users');
  await env.DB.prepare('DELETE FROM tenants WHERE id=?').bind(tenantId).run();
  if(removeUser){
    if(tenantUsersTable){
      await env.DB.prepare(`DELETE FROM users
        WHERE id=? AND is_platform_admin=0
          AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=?)
          AND NOT EXISTS(SELECT 1 FROM tenant_users WHERE user_id=?)`)
        .bind(userId,userId,userId).run();
    }else{
      await env.DB.prepare(`DELETE FROM users
        WHERE id=? AND is_platform_admin=0
          AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=?)`)
        .bind(userId,userId).run();
    }
  }
}

async function provisionInternal(env:Env,actorUserId:string,input:ProvisionInput):Promise<ProvisionResult>{
  const name=safeString(input.name,200);
  if(!name)throw new Error('TENANT_NAME_REQUIRED');
  const slug=await uniqueTenantSlug(env,input.slug||name),email=normalizeEmail(input.admin_email),adminName=safeString(input.admin_name,200);
  if(!email||!adminName)throw new Error('ADMIN_REQUIRED');
  const planId=safeString(input.plan_id||'provider',80),plan=await env.DB.prepare('SELECT id FROM plans WHERE id=? AND is_active=1').bind(planId).first();
  if(!plan)throw new Error('PLAN_NOT_FOUND');

  const tenantId=id('ten_'),adminUserId=id('usr_'),ts=nowIso(),suppliedPassword=safeString(input.admin_password,256);
  const existing=await env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').bind(email).first<{id:string}>();
  const effectiveUserId=existing?.id??adminUserId,needsActivation=!existing&&!suppliedPassword;
  if(needsActivation&&!mailConfigured(env))throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');
  const unreachablePassword=needsActivation?b64(randomBytes(32)).replace(/[+/=]/g,'').slice(0,38)+'Aa1!':'',password=suppliedPassword||unreachablePassword;
  const tenantUsersTable=await tableExists(env,'tenant_users');

  const statements=[];
  statements.push(env.DB.prepare("INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)").bind(tenantId,name,slug,ts,ts));
  statements.push(env.DB.prepare('INSERT INTO tenant_settings(tenant_id,portal_name,welcome_text,updated_at) VALUES(?,?,?,?)').bind(tenantId,safeString(input.portal_name||name,200),`Willkommen bei ${name}`,ts));
  if(!existing)statements.push(env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES(?,?,?,?,?,0,'active',?,?)").bind(effectiveUserId,email,adminName,await hashPassword(password),suppliedPassword?0:1,ts,ts));
  if(tenantUsersTable)statements.push(env.DB.prepare("INSERT INTO tenant_users(tenant_id,user_id,status,external_id,source,created_at,updated_at) VALUES(?,?,'active',NULL,'manual',?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET status='active',updated_at=excluded.updated_at").bind(tenantId,effectiveUserId,ts,ts));
  statements.push(env.DB.prepare("INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES(?,?,?,?, 'tenant_admin',?)").bind(id('mem_'),tenantId,null,effectiveUserId,ts));
  statements.push(env.DB.prepare("INSERT INTO subscriptions(tenant_id,plan_id,status,starts_at) VALUES(?,?,'trial',?)").bind(tenantId,planId,ts));
  for(const f of defaultFeatures)statements.push(env.DB.prepare("INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES(?,?,1,'plan',?)").bind(tenantId,f,ts));
  for(const f of optionalFeatures)statements.push(env.DB.prepare("INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES(?,?,0,'plan',?)").bind(tenantId,f,ts));

  let courseId:string|undefined;
  if(input.course_name){
    const mode=['public','link_code','login','hybrid'].includes(input.access_mode||'')?String(input.access_mode):'login',accessCode=safeString(input.access_code,128);
    if((mode==='link_code'||mode==='hybrid')&&accessCode.length<6)throw new Error('ACCESS_CODE_REQUIRED');
    const accessHash=accessCode?await hashPassword(accessCode):null;
    courseId=id('crs_');
    statements.push(env.DB.prepare('INSERT INTO courses(id,tenant_id,name,code,access_mode,access_code_hash,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,1,?,?)').bind(courseId,tenantId,safeString(input.course_name,200),slugify(input.course_code||input.course_name).slice(0,40),mode,accessHash,ts,ts));
  }
  statements.push(env.DB.prepare("INSERT INTO provisioning_log(id,tenant_id,action,status,detail_json,created_at) VALUES(?,?,'tenant_created','completed',?,?)").bind(id('prv_'),tenantId,JSON.stringify({adminEmail:email,courseId,planId,actorUserId,tenantUsersLinked:tenantUsersTable}),ts));
  await env.DB.batch(statements);

  if(needsActivation){
    const pseudoAuth:CoreAuthContext={userId:actorUserId,role:'platform_admin',tenantIds:[tenantId],courseIds:[],isPlatformAdmin:true,session:{userId:actorUserId,email:'',displayName:'',isPlatformAdmin:true,mustChangePassword:false,tenantRoles:[]}};
    try{
      await createActivationForUser(env,pseudoAuth,effectiveUserId);
    }catch(e){
      await cleanupProvisionedTenant(env,tenantId,effectiveUserId,!existing);
      await audit(env.DB,actorUserId,'tenant.provisioning_rolled_back',undefined,undefined,'tenant',tenantId,{adminEmail:email,reason:'ACTIVATION_MAIL_FAILED'}).catch(()=>undefined);
      throw e;
    }
  }

  try{
    await audit(env.DB,actorUserId,'tenant.provisioned',tenantId,courseId,'tenant',tenantId,{adminEmail:email,planId,invitationSent:needsActivation,tenantUsersLinked:tenantUsersTable});
  }catch(e){
    await cleanupProvisionedTenant(env,tenantId,effectiveUserId,!existing);
    await audit(env.DB,actorUserId,'tenant.provisioning_rolled_back',undefined,undefined,'tenant',tenantId,{adminEmail:email,reason:'AUDIT_WRITE_FAILED'}).catch(()=>undefined);
    throw e;
  }
  return{tenantId,adminUserId:effectiveUserId,invitationSent:needsActivation,courseId};
}

export async function provisionTenant(env:Env,auth:CoreAuthContext,input:ProvisionInput):Promise<ProvisionResult>{requirePlatform(auth);return provisionInternal(env,auth.userId,input);}
export async function provisionTenantFromOnboarding(env:Env,actorUserId:string,input:ProvisionInput):Promise<ProvisionResult>{return provisionInternal(env,actorUserId,input);}
