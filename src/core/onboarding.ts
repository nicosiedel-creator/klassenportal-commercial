import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { audit } from './audit.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, safeString, sha256Text } from './utils.js';
import { provisionTenantFromOnboarding } from './provision.js';
import { calculateCommercialOffer, getCommercePolicy, listManagedSetupOptions, startTenantTrial, createPaidBooking } from './commerce-offers.js';

type InvitationRow={
  id:string;token_hash:string;customer_email:string;plan_id:string;status:string;expires_at:string;
  created_by:string;created_at:string;completed_at:string|null;tenant_id:string|null;form_json:string|null;
};

type OnboardingInput={
  legal_name?:unknown;portal_name?:unknown;contact_name?:unknown;contact_email?:unknown;phone?:unknown;website?:unknown;
  street?:unknown;postal_code?:unknown;city?:unknown;country?:unknown;billing_email?:unknown;vat_id?:unknown;
  admin_name?:unknown;admin_email?:unknown;admin_password?:unknown;admin_password_confirm?:unknown;
  desired_course_count?:unknown;first_course_name?:unknown;first_course_code?:unknown;access_mode?:unknown;
  commercial_action?:unknown;billing_cycle?:unknown;managed_setup_option_id?:unknown;
  commercial_acceptance?:unknown;commercial_cost_confirmation?:unknown;
};

function validEmail(value:string):boolean{return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);}
function safeJson(value:unknown):Record<string,unknown>{return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function courseCount(v:unknown):number{const n=Number(v);if(!Number.isFinite(n)||n<1||n>10000)throw new Error('COURSE_COUNT_INVALID');return Math.round(n);}
function action(v:unknown):'trial'|'book'{return String(v)==='book'?'book':'trial';}
function publicInvitation(row:InvitationRow){return{customer_email:row.customer_email,plan_id:row.plan_id,status:row.status,expires_at:row.expires_at};}

export async function createOnboardingInvitation(env:Env,auth:CoreAuthContext,request:Request):Promise<Record<string,unknown>>{
  requirePlatform(auth);
  const body=safeJson(await request.json().catch(()=>({})));
  const email=normalizeEmail(body.customer_email);if(!validEmail(email))throw new Error('CUSTOMER_EMAIL_INVALID');
  const planId=safeString(body.plan_id||'provider',80);
  const plan=await env.DB.prepare('SELECT id,name FROM plans WHERE id=? AND is_active=1').bind(planId).first<{id:string;name:string}>();
  if(!plan)throw new Error('PLAN_NOT_FOUND');
  let days=Number(body.valid_days??14);if(!Number.isFinite(days))days=14;days=Math.max(1,Math.min(60,Math.round(days)));
  const raw=b64(randomBytes(32)).replace(/[+/=]/g,'').slice(0,43),hash=await sha256Text(raw),invitationId=id('obi_'),created=nowIso();
  const expires=new Date(Date.now()+days*86400000).toISOString();
  await env.DB.prepare("INSERT INTO onboarding_invitations(id,token_hash,customer_email,plan_id,status,expires_at,created_by,created_at) VALUES(?,?,?,?,'open',?,?,?)")
    .bind(invitationId,hash,email,planId,expires,auth.userId,created).run();
  await audit(env.DB,auth.userId,'onboarding.invitation.created',undefined,undefined,'onboarding_invitation',invitationId,{customerEmail:email,planId,expiresAt:expires});
  const origin=env.APP_ORIGIN||new URL(request.url).origin;
  return{id:invitationId,customer_email:email,plan_id:planId,plan_name:plan.name,expires_at:expires,url:`${origin}/einrichtung/${encodeURIComponent(raw)}`};
}

export async function listOnboardingInvitations(env:Env,auth:CoreAuthContext):Promise<Record<string,unknown>[]> {
  requirePlatform(auth);
  await env.DB.prepare("UPDATE onboarding_invitations SET status='expired' WHERE status='open' AND expires_at<=?").bind(nowIso()).run();
  const rows=await env.DB.prepare(`SELECT i.id,i.customer_email,i.plan_id,p.name AS plan_name,i.status,i.expires_at,i.created_at,i.completed_at,i.tenant_id,t.name AS tenant_name
    FROM onboarding_invitations i LEFT JOIN plans p ON p.id=i.plan_id LEFT JOIN tenants t ON t.id=i.tenant_id ORDER BY i.created_at DESC LIMIT 200`).all<Record<string,unknown>>();
  return rows.results??[];
}

export async function revokeOnboardingInvitation(env:Env,auth:CoreAuthContext,invitationId:string):Promise<void>{
  requirePlatform(auth);
  const row=await env.DB.prepare('SELECT id,status FROM onboarding_invitations WHERE id=?').bind(invitationId).first<{id:string;status:string}>();
  if(!row)throw new Error('ONBOARDING_NOT_FOUND');
  if(row.status==='completed')throw new Error('ONBOARDING_ALREADY_COMPLETED');
  const claim=await env.DB.prepare('SELECT invitation_id FROM onboarding_claims WHERE invitation_id=?').bind(invitationId).first();
  if(claim)throw new Error('ONBOARDING_ALREADY_IN_PROGRESS');
  await env.DB.prepare("UPDATE onboarding_invitations SET status='revoked' WHERE id=? AND status='open'").bind(invitationId).run();
  await audit(env.DB,auth.userId,'onboarding.invitation.revoked',undefined,undefined,'onboarding_invitation',invitationId);
}

async function invitationByToken(env:Env,token:string):Promise<InvitationRow|null>{
  if(token.length<20||token.length>100)return null;
  const hash=await sha256Text(token);
  return env.DB.prepare('SELECT * FROM onboarding_invitations WHERE token_hash=?').bind(hash).first<InvitationRow>();
}

async function requireOpenInvitation(env:Env,token:string):Promise<InvitationRow>{
  const row=await invitationByToken(env,token);if(!row)throw new Error('ONBOARDING_NOT_FOUND');
  if(row.status==='open'&&row.expires_at<=nowIso()){await env.DB.prepare("UPDATE onboarding_invitations SET status='expired' WHERE id=? AND status='open'").bind(row.id).run();row.status='expired';}
  if(row.status!=='open')throw new Error(row.status==='expired'?'ONBOARDING_EXPIRED':'ONBOARDING_UNAVAILABLE');
  return row;
}

export async function getPublicOnboarding(env:Env,token:string):Promise<Record<string,unknown>>{
  const row=await invitationByToken(env,token);if(!row)throw new Error('ONBOARDING_NOT_FOUND');
  if(row.status==='open'&&row.expires_at<=nowIso()){await env.DB.prepare("UPDATE onboarding_invitations SET status='expired' WHERE id=? AND status='open'").bind(row.id).run();row.status='expired';}
  const policy=await getCommercePolicy(env);
  const setupOptions=await listManagedSetupOptions(env);
  return {...publicInvitation(row),trial:{days:policy.trial_days,course_limit:policy.trial_course_limit,read_only_days:policy.read_only_days,requires_payment_method:!!policy.trial_requires_payment_method},setup_options:setupOptions};
}

export async function getPublicOnboardingQuote(env:Env,token:string,args:{courses:unknown;billingCycle?:unknown;setupOptionId?:unknown;purpose?:unknown}){
  const row=await requireOpenInvitation(env,token);
  const purpose=String(args.purpose)==='trial'?'trial':'paid';
  return calculateCommercialOffer(env,{planId:row.plan_id,courseCount:courseCount(args.courses),billingCycle:args.billingCycle,setupOptionId:purpose==='trial'?'self_service':args.setupOptionId,purpose});
}

export async function submitPublicOnboarding(env:Env,token:string,request:Request):Promise<Record<string,unknown>>{
  const invitation=await requireOpenInvitation(env,token);
  const raw=safeJson(await request.json().catch(()=>({}))) as OnboardingInput;
  const legalName=safeString(raw.legal_name,200),portalName=safeString(raw.portal_name||legalName,200),contactName=safeString(raw.contact_name,200),contactEmail=normalizeEmail(raw.contact_email||invitation.customer_email);
  const adminName=safeString(raw.admin_name||contactName,200),adminEmail=normalizeEmail(raw.admin_email||contactEmail),password=safeString(raw.admin_password,256),confirm=safeString(raw.admin_password_confirm,256);
  const street=safeString(raw.street,250),postal=safeString(raw.postal_code,30),city=safeString(raw.city,120),country=safeString(raw.country||'Deutschland',120),requestedCourses=courseCount(raw.desired_course_count??1);
  if(!legalName||!contactName||!validEmail(contactEmail)||!adminName||!validEmail(adminEmail)||!street||!postal||!city)throw new Error('ONBOARDING_REQUIRED_FIELDS');
  if(password.length<10||password.length>256)throw new Error('PASSWORD_LENGTH');
  if(password!==confirm)throw new Error('PASSWORD_CONFIRMATION_MISMATCH');

  const commercialAction=action(raw.commercial_action);
  const billingCycle=String(raw.billing_cycle)==='annual'?'annual':'monthly';
  const setupOptionId=commercialAction==='trial'?'self_service':safeString(raw.managed_setup_option_id||'self_service',80);
  const acceptedOffer=String(raw.commercial_acceptance??'')==='1';
  const acceptedCosts=String(raw.commercial_cost_confirmation??'')==='1';
  if(commercialAction==='book'&&(!acceptedOffer||!acceptedCosts))throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');

  const firstCourse=safeString(raw.first_course_name,200),firstCourseCode=safeString(raw.first_course_code,80),accessMode=['public','login'].includes(String(raw.access_mode||''))?String(raw.access_mode):'login';
  const nonce=id('claim_');
  try{await env.DB.prepare('INSERT INTO onboarding_claims(invitation_id,nonce,claimed_at) VALUES(?,?,?)').bind(invitation.id,nonce,nowIso()).run();}
  catch{throw new Error('ONBOARDING_ALREADY_IN_PROGRESS');}

  let provisioned:Awaited<ReturnType<typeof provisionTenantFromOnboarding>>|undefined;
  try{
    const stillOpen=await env.DB.prepare("SELECT id FROM onboarding_invitations WHERE id=? AND status='open' AND expires_at>?").bind(invitation.id,nowIso()).first();
    if(!stillOpen)throw new Error('ONBOARDING_UNAVAILABLE');
    provisioned=await provisionTenantFromOnboarding(env,`onboarding:${invitation.id}`,{
      name:legalName,portal_name:portalName,admin_name:adminName,admin_email:adminEmail,admin_password:password,
      course_name:firstCourse||undefined,course_code:firstCourseCode||undefined,access_mode:accessMode,plan_id:invitation.plan_id,
    });

    let commercial:Record<string,unknown>;
    if(commercialAction==='trial'){
      commercial=await startTenantTrial(env,{tenantId:provisioned.tenantId,planId:invitation.plan_id,requestedCourseCount:requestedCourses,setupOptionId:'self_service',actorId:`onboarding:${invitation.id}`});
    }else{
      commercial=await createPaidBooking(env,{tenantId:provisioned.tenantId,invitationId:invitation.id,planId:invitation.plan_id,courseCount:requestedCourses,billingCycle,setupOptionId,accepted:acceptedOffer&&acceptedCosts,request,actorId:`onboarding:${invitation.id}`});
    }

    const profile={legal_name:legalName,portal_name:portalName,contact_name:contactName,contact_email:contactEmail,phone:safeString(raw.phone,80),website:safeString(raw.website,250),street,postal_code:postal,city,country,billing_email:normalizeEmail(raw.billing_email||contactEmail),vat_id:safeString(raw.vat_id,80)||null,admin_name:adminName,admin_email:adminEmail,desired_course_count:requestedCourses,first_course_name:firstCourse||null,first_course_code:firstCourseCode||null,commercial_action:commercialAction,billing_cycle:billingCycle,managed_setup_option_id:setupOptionId,double_cost_confirmation:commercialAction==='book'&&(acceptedOffer&&acceptedCosts)};
    const ts=nowIso();
    await env.DB.batch([
      env.DB.prepare(`INSERT INTO tenant_profiles(tenant_id,legal_name,contact_name,contact_email,phone,website,street,postal_code,city,country,billing_email,onboarding_invitation_id,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(provisioned.tenantId,legalName,contactName,contactEmail,safeString(raw.phone,80)||null,safeString(raw.website,250)||null,street,postal,city,country,normalizeEmail(raw.billing_email||contactEmail),invitation.id,ts),
      env.DB.prepare("UPDATE onboarding_invitations SET status='completed',completed_at=?,tenant_id=?,form_json=? WHERE id=? AND status='open'").bind(ts,provisioned.tenantId,JSON.stringify(profile),invitation.id),
      env.DB.prepare('DELETE FROM onboarding_claims WHERE invitation_id=? AND nonce=?').bind(invitation.id,nonce),
    ]);
    await audit(env.DB,`onboarding:${invitation.id}`,'onboarding.completed',provisioned.tenantId,provisioned.courseId,'onboarding_invitation',invitation.id,{customerEmail:invitation.customer_email,requestedCourses,commercialAction,billingCycle,setupOptionId});
    return{ok:true,tenant_id:provisioned.tenantId,login_email:adminEmail,commercial_action:commercialAction,commercial};
  }catch(e){
    if(!provisioned)await env.DB.prepare('DELETE FROM onboarding_claims WHERE invitation_id=? AND nonce=?').bind(invitation.id,nonce).run();
    else await env.DB.batch([
      env.DB.prepare("UPDATE onboarding_invitations SET status='completed',completed_at=?,tenant_id=? WHERE id=? AND status='open'").bind(nowIso(),provisioned.tenantId,invitation.id),
      env.DB.prepare('DELETE FROM onboarding_claims WHERE invitation_id=? AND nonce=?').bind(invitation.id,nonce),
    ]);
    throw e;
  }
}
