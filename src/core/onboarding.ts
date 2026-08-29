import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { audit } from './audit.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, safeString, sha256Text } from './utils.js';
import { provisionTenantFromOnboarding } from './provision.js';
import { calculateCommercialOffer, getCommercePolicy, listManagedSetupOptions, startTenantTrial, createPaidBooking } from './commerce-offers.js';
import { acceptedQuoteForOnboarding } from './platform-offers.js';
import { createPaidBookingFromAcceptedOffer, startPilotFromAcceptedOffer } from './accepted-offer-fulfillment.js';

type InvitationRow={
  id:string;token_hash:string;customer_email:string;plan_id:string;status:string;expires_at:string;
  created_by:string;created_at:string;completed_at:string|null;tenant_id:string|null;form_json:string|null;quote_id:string|null;
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
function publicErrorCode(error:unknown):string{
  const code=error instanceof Error?error.message:String(error||'');
  return /^[A-Z][A-Z0-9_]{2,80}$/.test(code)?code:'ONBOARDING_ACTIVATION_FAILED';
}
// Eine echte Kundeneinrichtung scheiterte in Produktion mit ONBOARDING_PROVISIONING_FAILED, und es
// gab keinen Weg herauszufinden, warum: publicErrorCode ersetzt jede Meldung, die kein
// Grossbuchstaben-Code ist, durch einen Sammelcode - ein SQL-Fehler aus D1 etwa -, und dieser
// Sammelcode wurde hier noch einmal ersetzt. Die Ursache wurde weder protokolliert noch
// gespeichert. Der wichtigste Pfad des Portals konnte also fehlschlagen und hinterliess nichts.
//
// Dem Kunden gegenueber bleibt es beim Sammelcode - dort haben SQL und Stacktraces nichts
// verloren. Fuer den Betrieb wird die Ursache jetzt protokolliert: die Stufe, in der es scheiterte,
// und die tatsaechliche Meldung. Der Einrichtungs-Token wird dabei nie mitgeschrieben; die
// Meldung wird begrenzt, damit auch ein ausufernder Fehler das Protokoll nicht flutet.
function stageError(error:unknown,fallback:string,stage:string):Error{
  const code=publicErrorCode(error);
  if(code==='ONBOARDING_ACTIVATION_FAILED'){
    const detail=(error instanceof Error?error.message:String(error??'')).slice(0,400);
    console.error('Onboarding stage failed',{stage,reported:fallback,cause:detail||'(keine Meldung)'});
    return new Error(fallback);
  }
  return new Error(code);
}

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
  const rows=await env.DB.prepare(`SELECT i.id,i.customer_email,i.plan_id,p.name AS plan_name,i.status,i.expires_at,i.created_at,i.completed_at,i.tenant_id,i.quote_id,t.name AS tenant_name
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
  // A revoke that changed nothing - the link already expired, or a second click on the same
  // button - must not be reported as a fresh revocation or leave a second audit entry.
  const result=await env.DB.prepare("UPDATE onboarding_invitations SET status='revoked' WHERE id=? AND status='open'").bind(invitationId).run();
  if(!Number(result.meta?.changes||0)){if(row.status==='revoked')return;throw new Error('ONBOARDING_NOT_OPEN');}
  await audit(env.DB,auth.userId,'onboarding.invitation.revoked',undefined,undefined,'onboarding_invitation',invitationId);
}

async function invitationByToken(env:Env,token:string):Promise<InvitationRow|null>{
  if(token.length<20||token.length>100)return null;
  const hash=await sha256Text(token);
  return env.DB.prepare('SELECT * FROM onboarding_invitations WHERE token_hash=?').bind(hash).first<InvitationRow>();
}

async function rollbackProvisionedOnboarding(env:Env,args:{invitationId:string;tenantId:string;reason:string}):Promise<void>{
  try{
    const admins=await env.DB.prepare("SELECT DISTINCT user_id FROM memberships WHERE tenant_id=? AND role='tenant_admin'").bind(args.tenantId).all<{user_id:string}>();
    // Clear the invitation FK before deleting the tenant, in the same D1 batch. If any cleanup
    // statement fails, the batch remains fail-closed instead of exposing an open link plus orphan tenant.
    await env.DB.batch([
      env.DB.prepare("UPDATE onboarding_invitations SET status='open',completed_at=NULL,tenant_id=NULL,form_json=NULL WHERE id=? AND status='open'").bind(args.invitationId),
      env.DB.prepare('DELETE FROM tenants WHERE id=?').bind(args.tenantId),
      env.DB.prepare('DELETE FROM onboarding_claims WHERE invitation_id=?').bind(args.invitationId),
    ]);
    for(const admin of admins.results??[]){
      await env.DB.prepare(`DELETE FROM users
        WHERE id=? AND is_platform_admin=0
          AND NOT EXISTS(SELECT 1 FROM memberships WHERE user_id=?)
          AND NOT EXISTS(SELECT 1 FROM tenant_users WHERE user_id=?)`)
        .bind(admin.user_id,admin.user_id,admin.user_id).run().catch(()=>undefined);
    }
    await audit(env.DB,`onboarding:${args.invitationId}`,'onboarding.rollback.completed',undefined,undefined,'onboarding_invitation',args.invitationId,{tenantId:args.tenantId,reason:args.reason}).catch(()=>undefined);
  }catch(rollbackError){
    // Fail closed. Never write the historical `processing` status here: production databases
    // can still have the original 0024 CHECK constraint that does not allow it. Keeping the
    // claim blocks duplicate provisioning until deterministic stale-claim recovery succeeds.
    await audit(env.DB,`onboarding:${args.invitationId}`,'onboarding.rollback.failed',args.tenantId,undefined,'onboarding_invitation',args.invitationId,{reason:args.reason,error:publicErrorCode(rollbackError)}).catch(()=>undefined);
    throw new Error('ONBOARDING_RECOVERY_REQUIRED');
  }
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
  const policy=await getCommercePolicy(env),setupOptions=await listManagedSetupOptions(env);
  let lockedOffer:Record<string,unknown>|null=null;
  if(row.quote_id){const accepted=await acceptedQuoteForOnboarding(env,row.quote_id);lockedOffer={quote_id:accepted.row.id,quote_number:accepted.row.quote_number,kind:accepted.row.offer_kind,customer_name:accepted.row.customer_name,customer_contact_name:accepted.row.customer_contact_name,customer_email:accepted.row.customer_email,customer_street:accepted.row.customer_street,customer_postal_code:accepted.row.customer_postal_code,customer_city:accepted.row.customer_city,customer_country:accepted.row.customer_country,offer:accepted.offer};}
  return {...publicInvitation(row),trial:{days:policy.trial_days,course_limit:policy.trial_course_limit,read_only_days:policy.read_only_days,requires_payment_method:!!policy.trial_requires_payment_method},setup_options:setupOptions,locked_offer:lockedOffer};
}

export async function getPublicOnboardingQuote(env:Env,token:string,args:{courses:unknown;billingCycle?:unknown;setupOptionId?:unknown;purpose?:unknown}){
  const row=await requireOpenInvitation(env,token);
  if(row.quote_id)return (await acceptedQuoteForOnboarding(env,row.quote_id)).offer;
  const purpose=String(args.purpose)==='trial'?'trial':'paid';
  return calculateCommercialOffer(env,{planId:row.plan_id,courseCount:courseCount(args.courses),billingCycle:args.billingCycle,setupOptionId:purpose==='trial'?'self_service':args.setupOptionId,purpose});
}

export async function submitPublicOnboarding(env:Env,token:string,request:Request):Promise<Record<string,unknown>>{
  const invitation=await requireOpenInvitation(env,token),locked=invitation.quote_id?await acceptedQuoteForOnboarding(env,invitation.quote_id):null;
  const raw=safeJson(await request.json().catch(()=>({}))) as OnboardingInput;
  const lockedRow=locked?.row,lockedOffer=locked?.offer;
  const legalName=lockedRow?.customer_name||safeString(raw.legal_name,200),portalName=safeString(raw.portal_name||legalName,200),contactName=lockedRow?.customer_contact_name||safeString(raw.contact_name,200),contactEmail=normalizeEmail(lockedRow?.customer_email||raw.contact_email||invitation.customer_email);
  const adminName=safeString(raw.admin_name||contactName,200),adminEmail=normalizeEmail(raw.admin_email||contactEmail),password=safeString(raw.admin_password,256),confirm=safeString(raw.admin_password_confirm,256);
  const street=lockedRow?.customer_street||safeString(raw.street,250),postal=lockedRow?.customer_postal_code||safeString(raw.postal_code,30),city=lockedRow?.customer_city||safeString(raw.city,120),country=lockedRow?.customer_country||safeString(raw.country||'Deutschland',120),requestedCourses=lockedRow?Number(lockedRow.requested_courses):courseCount(raw.desired_course_count??1);
  if(!legalName||!contactName||!validEmail(contactEmail)||!adminName||!validEmail(adminEmail)||!street||!postal||!city)throw new Error('ONBOARDING_REQUIRED_FIELDS');
  if(password.length<10||password.length>256)throw new Error('PASSWORD_LENGTH');
  if(password!==confirm)throw new Error('PASSWORD_CONFIRMATION_MISMATCH');

  const commercialAction=lockedOffer?(String(lockedOffer.offerKind)==='pilot'?'trial':'book'):action(raw.commercial_action);
  const billingCycle=lockedOffer?(String(lockedOffer.billingCycle)==='annual'?'annual':'monthly'):(String(raw.billing_cycle)==='annual'?'annual':'monthly');
  const setupOptionId=lockedOffer?safeString(lockedOffer.managedSetupOptionId||'self_service',80):(commercialAction==='trial'?'self_service':safeString(raw.managed_setup_option_id||'self_service',80));
  const acceptedOffer=String(raw.commercial_acceptance??'')==='1',acceptedCosts=String(raw.commercial_cost_confirmation??'')==='1';
  if(commercialAction==='book'&&(!acceptedOffer||!acceptedCosts))throw new Error('DOUBLE_COST_CONFIRMATION_REQUIRED');

  const firstCourse=safeString(raw.first_course_name,200),firstCourseCode=safeString(raw.first_course_code,80),accessMode=['public','login'].includes(String(raw.access_mode||''))?String(raw.access_mode):'login';
  const nonce=id('claim_');
  try{await env.DB.prepare('INSERT INTO onboarding_claims(invitation_id,nonce,claimed_at) VALUES(?,?,?)').bind(invitation.id,nonce,nowIso()).run();}
  catch{
    const tombstone=await env.DB.prepare('SELECT invitation_id FROM onboarding_claim_tombstones WHERE invitation_id=?').bind(invitation.id).first().catch(()=>null);
    if(tombstone)throw new Error('ONBOARDING_ALREADY_COMPLETED');
    const existing=await env.DB.prepare('SELECT invitation_id FROM onboarding_claims WHERE invitation_id=?').bind(invitation.id).first().catch(()=>null);
    throw new Error(existing?'ONBOARDING_ALREADY_IN_PROGRESS':'ONBOARDING_CLAIM_FAILED');
  }

  let provisioned:Awaited<ReturnType<typeof provisionTenantFromOnboarding>>|undefined;
  try{
    const stillOpen=await env.DB.prepare("SELECT id FROM onboarding_invitations WHERE id=? AND status='open' AND expires_at>?").bind(invitation.id,nowIso()).first();
    if(!stillOpen)throw new Error('ONBOARDING_UNAVAILABLE');
    try{
      provisioned=await provisionTenantFromOnboarding(env,`onboarding:${invitation.id}`,{
        name:legalName,portal_name:portalName,admin_name:adminName,admin_email:adminEmail,admin_password:password,
        course_name:firstCourse||undefined,course_code:firstCourseCode||undefined,access_mode:accessMode,plan_id:invitation.plan_id,
      });
    }catch(e){throw stageError(e,'ONBOARDING_PROVISIONING_FAILED','provisioning');}

    let commercial:Record<string,unknown>;
    try{
      if(invitation.quote_id&&lockedOffer){
        commercial=String(lockedOffer.offerKind)==='pilot'
          ?await startPilotFromAcceptedOffer(env,{tenantId:provisioned.tenantId,quoteId:invitation.quote_id,invitationId:invitation.id,actorId:`onboarding:${invitation.id}`})
          :await createPaidBookingFromAcceptedOffer(env,{tenantId:provisioned.tenantId,quoteId:invitation.quote_id,invitationId:invitation.id,actorId:`onboarding:${invitation.id}`});
      }else if(commercialAction==='trial'){
        commercial=await startTenantTrial(env,{tenantId:provisioned.tenantId,planId:invitation.plan_id,requestedCourseCount:requestedCourses,setupOptionId:'self_service',actorId:`onboarding:${invitation.id}`});
      }else{
        commercial=await createPaidBooking(env,{tenantId:provisioned.tenantId,invitationId:invitation.id,planId:invitation.plan_id,courseCount:requestedCourses,billingCycle,setupOptionId,accepted:acceptedOffer&&acceptedCosts,request,actorId:`onboarding:${invitation.id}`});
      }
    }catch(e){throw stageError(e,'ONBOARDING_COMMERCE_FAILED','commerce');}

    const profile={legal_name:legalName,portal_name:portalName,contact_name:contactName,contact_email:contactEmail,phone:safeString(raw.phone,80),website:safeString(raw.website,250),street,postal_code:postal,city,country,billing_email:normalizeEmail(raw.billing_email||contactEmail),vat_id:safeString(raw.vat_id,80)||null,admin_name:adminName,admin_email:adminEmail,desired_course_count:requestedCourses,first_course_name:firstCourse||null,first_course_code:firstCourseCode||null,commercial_action:commercialAction,billing_cycle:billingCycle,managed_setup_option_id:setupOptionId,double_cost_confirmation:commercialAction==='book'&&(acceptedOffer&&acceptedCosts),quote_id:invitation.quote_id||null};
    const ts=nowIso(),actorId=`onboarding:${invitation.id}`,auditDetails={customerEmail:invitation.customer_email,requestedCourses,commercialAction,billingCycle,setupOptionId,quoteId:invitation.quote_id||null};
    try{
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO tenant_profiles(tenant_id,legal_name,contact_name,contact_email,phone,website,street,postal_code,city,country,billing_email,onboarding_invitation_id,updated_at)
          VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(provisioned.tenantId,legalName,contactName,contactEmail,safeString(raw.phone,80)||null,safeString(raw.website,250)||null,street,postal,city,country,normalizeEmail(raw.billing_email||contactEmail),invitation.id,ts),
        env.DB.prepare("UPDATE onboarding_invitations SET status='completed',completed_at=?,tenant_id=?,form_json=? WHERE id=? AND status='open'").bind(ts,provisioned.tenantId,JSON.stringify(profile),invitation.id),
        env.DB.prepare('DELETE FROM onboarding_claims WHERE invitation_id=? AND nonce=?').bind(invitation.id,nonce),
        env.DB.prepare('INSERT INTO audit_log(id,tenant_id,course_id,actor_user_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
          .bind(id('aud_'),provisioned.tenantId,provisioned.courseId??null,actorId,'onboarding.completed','onboarding_invitation',invitation.id,JSON.stringify(auditDetails),ts),
      ]);
      const completed=await env.DB.prepare("SELECT id FROM onboarding_invitations WHERE id=? AND status='completed' AND tenant_id=? AND form_json IS NOT NULL").bind(invitation.id,provisioned.tenantId).first();
      if(!completed)throw new Error('ONBOARDING_FINALIZATION_FAILED');
    }catch(e){throw stageError(e,'ONBOARDING_FINALIZATION_FAILED','finalization');}
    return{ok:true,tenant_id:provisioned.tenantId,login_email:adminEmail,commercial_action:commercialAction,commercial};
  }catch(e){
    const code=publicErrorCode(e);
    if(!provisioned){
      await env.DB.prepare('DELETE FROM onboarding_claims WHERE invitation_id=? AND nonce=?').bind(invitation.id,nonce).run().catch(()=>undefined);
    }else{
      await rollbackProvisionedOnboarding(env,{invitationId:invitation.id,tenantId:provisioned.tenantId,reason:code});
    }
    throw new Error(code);
  }
}
