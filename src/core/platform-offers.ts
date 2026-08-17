import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requirePlatform } from './permissions.js';
import { calculateCommercialOffer, getCommercePolicy, listManagedSetupOptions } from './commerce-offers.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, safeString, sha256Text } from './utils.js';

type DiscountType='none'|'percent'|'fixed';
type OfferKind='paid'|'pilot';
type OfferStatus='draft'|'offered'|'accepted'|'expired'|'cancelled';

type QuoteRow={
  id:string;quote_number:string;tenant_id:string|null;plan_id:string;requested_courses:number;currency:string;
  recurring_monthly_cents:number;setup_cents:number;first_total_cents:number;status:OfferStatus;valid_until:string;
  pricing_snapshot_json:string;created_at:string;updated_at:string;subject:string|null;offer_kind:OfferKind;billing_cycle:'monthly'|'annual';
  customer_name:string|null;customer_contact_name:string|null;customer_email:string|null;customer_street:string|null;customer_postal_code:string|null;customer_city:string|null;customer_country:string|null;
  monthly_list_cents:number|null;setup_list_cents:number|null;monthly_override_cents:number|null;setup_override_cents:number|null;
  recurring_discount_type:DiscountType|null;recurring_discount_value:number|null;recurring_discount_cents:number;setup_discount_type:DiscountType|null;setup_discount_value:number|null;setup_discount_cents:number;
  manual_pricing:number;notes:string|null;public_token_hash:string|null;offered_at:string|null;accepted_at:string|null;accepted_name:string|null;accepted_email:string|null;accepted_terms:number;accepted_dpa:number;onboarding_invitation_id:string|null;
};

type SellerProfile={legal_name:string|null;street:string|null;postal_code:string|null;city:string|null;country:string|null;email:string|null;phone:string|null;website:string|null;vat_id:string|null};

type OfferInput=Record<string,unknown>;

function integer(v:unknown,min=0,max=100_000_000):number{const n=Number(v);if(!Number.isFinite(n))throw new Error('NUMBER_INVALID');return Math.max(min,Math.min(max,Math.round(n)));}
function optionalInteger(v:unknown,min=0,max=100_000_000):number|null{if(v===undefined||v===null||v==='')return null;return integer(v,min,max);}
function email(v:unknown):string{const s=normalizeEmail(v);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new Error('CUSTOMER_EMAIL_INVALID');return s;}
function discountType(v:unknown):DiscountType{const s=String(v||'none');return s==='percent'||s==='fixed'?s:'none';}
function discount(base:number,type:DiscountType,valueRaw:unknown):{storedValue:number;amount:number}{
  if(type==='none')return{storedValue:0,amount:0};
  if(type==='percent'){
    const percent=Number(valueRaw||0);if(!Number.isFinite(percent)||percent<0||percent>100)throw new Error('DISCOUNT_PERCENT_INVALID');
    const basisPoints=Math.round(percent*100);return{storedValue:basisPoints,amount:Math.min(base,Math.round(base*basisPoints/10_000))};
  }
  const cents=integer(valueRaw,0,base);return{storedValue:cents,amount:cents};
}
function docNumber():string{const d=new Date(),date=`${d.getUTCFullYear()}${String(d.getUTCMonth()+1).padStart(2,'0')}${String(d.getUTCDate()).padStart(2,'0')}`;return `ANG-${date}-${id('').replace(/[^a-zA-Z0-9]/g,'').slice(-8).toUpperCase()}`;}
function safeStatus(v:unknown):'draft'|'offered'{return String(v)==='offered'?'offered':'draft';}
function days(v:unknown,def=14,max=90):number{const n=Number(v??def);return Number.isFinite(n)?Math.max(1,Math.min(max,Math.round(n))):def;}

async function seller(env:Env):Promise<SellerProfile>{return await env.DB.prepare('SELECT legal_name,street,postal_code,city,country,email,phone,website,vat_id FROM seller_billing_profile WHERE id=1').first<SellerProfile>()??{legal_name:null,street:null,postal_code:null,city:null,country:null,email:null,phone:null,website:null,vat_id:null};}
async function legalReady(env:Env):Promise<boolean>{const x=await env.DB.prepare('SELECT provider_name,legal_notice_url,privacy_url,terms_url,dpa_url,support_email FROM legal_configuration WHERE id=1').first<Record<string,unknown>>().catch(()=>null);return !!(x?.provider_name&&x?.legal_notice_url&&x?.privacy_url&&x?.terms_url&&x?.dpa_url&&x?.support_email);}
function sellerReady(s:SellerProfile):boolean{return !!(s.legal_name&&s.street&&s.postal_code&&s.city&&s.country&&s.email);}
async function event(env:Env,quoteId:string,eventType:string,detail?:unknown){await env.DB.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)').bind(id('ofe_'),quoteId,eventType,detail===undefined?null:JSON.stringify(detail),nowIso()).run();}

async function buildOffer(env:Env,input:OfferInput){
  const kind:StringConstructor extends never?never:OfferKind=String(input.offer_kind)==='pilot'?'pilot':'paid';
  const planId=safeString(input.plan_id||'provider',80),courseCount=integer(input.course_count??1,1,10_000),billingCycle=String(input.billing_cycle)==='annual'?'annual':'monthly';
  const setupOptionId=safeString(input.managed_setup_option_id||'self_service',80)||'self_service';
  const standard=await calculateCommercialOffer(env,{planId,courseCount,billingCycle,setupOptionId,purpose:kind==='pilot'?'trial':'paid'});
  const monthlyList=Number(standard.recurringMonthlyCents||0),setupList=kind==='pilot'?0:Number(standard.managedSetupCents||0);
  const monthlyOverride=optionalInteger(input.monthly_override_cents),setupOverride=optionalInteger(input.setup_override_cents);
  let monthlyBase=monthlyOverride??monthlyList,setupBase=setupOverride??setupList;
  const recurringType=discountType(input.recurring_discount_type),setupType=discountType(input.setup_discount_type);
  let recurringDiscount=discount(monthlyBase,recurringType,input.recurring_discount_value),setupDiscount=discount(setupBase,setupType,input.setup_discount_value);
  if(kind==='pilot'){
    monthlyBase=0;setupBase=0;recurringDiscount={storedValue:0,amount:0};setupDiscount={storedValue:0,amount:0};
  }
  const recurringMonthly=Math.max(0,monthlyBase-recurringDiscount.amount),setupFinal=Math.max(0,setupBase-setupDiscount.amount);
  if(kind==='paid'&&recurringMonthly<1)throw new Error('PAID_OFFER_RECURRING_PRICE_REQUIRED');
  const annualMonths=Math.max(1,Number(standard.annualMonthsCharged||10)),annualTotal=recurringMonthly*annualMonths,billedSubscription=kind==='pilot'?0:(billingCycle==='annual'?annualTotal:recurringMonthly),firstTotal=billedSubscription+setupFinal;
  const manual=kind==='pilot'||monthlyOverride!==null||setupOverride!==null||recurringType!=='none'||setupType!=='none';
  const pilotDays=kind==='pilot'?days(input.pilot_days,90,365):0;
  const pilotReadOnlyDays=kind==='pilot'?days(input.pilot_read_only_days,14,60):0;
  const snapshot={...standard,offerKind:kind,billingCycle,courseCount,recurringMonthlyCents:recurringMonthly,annualTotalCents:annualTotal,billedSubscriptionCents:billedSubscription,managedSetupCents:setupFinal,setupCents:setupFinal,firstTotalCents:firstTotal,manualPricing:manual,listRecurringMonthlyCents:monthlyList,listManagedSetupCents:setupList,monthlyOverrideCents:monthlyOverride,setupOverrideCents:setupOverride,recurringDiscountType:recurringType,recurringDiscountValue:recurringDiscount.storedValue,recurringDiscountCents:recurringDiscount.amount,setupDiscountType:setupType,setupDiscountValue:setupDiscount.storedValue,setupDiscountCents:setupDiscount.amount,pilotDays,pilotReadOnlyDays,pilotCourseLimit:courseCount,trialFree:kind==='pilot'};
  return{kind,planId,courseCount,billingCycle,setupOptionId,standard,monthlyList,setupList,monthlyOverride,setupOverride,recurringType,setupType,recurringDiscount,setupDiscount,recurringMonthly,setupFinal,firstTotal,manual,pilotDays,pilotReadOnlyDays,snapshot};
}

export async function platformOfferMeta(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);
  const [plans,setups,s,policy]=await Promise.all([
    env.DB.prepare(`SELECT p.id,p.name,p.monthly_price_cents,p.setup_price_cents,p.is_active,r.included_courses,r.extra_course_monthly_cents,r.currency,r.pricing_enabled FROM plans p LEFT JOIN plan_commerce_rules r ON r.plan_id=p.id WHERE p.is_active=1 ORDER BY COALESCE(p.monthly_price_cents,0)`).all<Record<string,unknown>>(),
    listManagedSetupOptions(env),seller(env),getCommercePolicy(env)
  ]);
  return{plans:plans.results??[],setupOptions:setups,seller:s,sellerReady:sellerReady(s),legalReady:await legalReady(env),policy};
}

export async function previewPlatformOffer(env:Env,auth:CoreAuthContext,input:OfferInput){requirePlatform(auth);const o=await buildOffer(env,input);return o.snapshot;}

export async function createPlatformOffer(env:Env,auth:CoreAuthContext,input:OfferInput,request:Request){
  requirePlatform(auth);
  const customerName=safeString(input.customer_name,250),contact=safeString(input.customer_contact_name,200),customerEmail=email(input.customer_email),street=safeString(input.customer_street,250),postal=safeString(input.customer_postal_code,30),city=safeString(input.customer_city,120),country=safeString(input.customer_country||'Deutschland',120);
  if(!customerName||!contact||!street||!postal||!city||!country)throw new Error('OFFER_CUSTOMER_FIELDS_REQUIRED');
  const o=await buildOffer(env,input),status=safeStatus(input.status),validDays=days(input.valid_days,o.standard.offerValidDays||14,90),ts=nowIso(),validUntil=new Date(Date.now()+validDays*86400000).toISOString(),quoteId=id('quo_'),number=docNumber(),subject=safeString(input.subject||`${o.kind==='pilot'?'Pilotangebot':'Angebot'} Klassenportal – ${o.standard.planName}`,250),notes=safeString(input.notes,5000)||null;
  let raw:string|null=null,tokenHash:string|null=null,offeredAt:string|null=null;
  if(status==='offered'){
    const s=await seller(env);if(!sellerReady(s))throw new Error('SELLER_PROFILE_INCOMPLETE');if(!(await legalReady(env)))throw new Error('LEGAL_CONFIGURATION_INCOMPLETE');
    raw=b64(randomBytes(32)).replace(/[+/=]/g,'').slice(0,43);tokenHash=await sha256Text(raw);offeredAt=ts;
  }
  const snapshot=JSON.stringify({...o.snapshot,quoteNumber:number,subject,validUntil,customer:{name:customerName,contactName:contact,email:customerEmail,street,postalCode:postal,city,country}});
  await env.DB.prepare(`INSERT INTO commercial_quotes(id,quote_number,onboarding_invitation_id,tenant_id,plan_id,requested_courses,currency,recurring_monthly_cents,setup_cents,first_total_cents,status,valid_until,pricing_snapshot_json,created_at,updated_at,subject,offer_kind,billing_cycle,customer_name,customer_contact_name,customer_email,customer_street,customer_postal_code,customer_city,customer_country,monthly_list_cents,setup_list_cents,monthly_override_cents,setup_override_cents,recurring_discount_type,recurring_discount_value,recurring_discount_cents,setup_discount_type,setup_discount_value,setup_discount_cents,manual_pricing,notes,public_token_hash,offered_at)
    VALUES(?,?,NULL,NULL,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .bind(quoteId,number,o.planId,o.courseCount,o.standard.currency,o.recurringMonthly,o.setupFinal,o.firstTotal,status,validUntil,snapshot,ts,ts,subject,o.kind,o.billingCycle,customerName,contact,customerEmail,street,postal,city,country,o.monthlyList,o.setupList,o.monthlyOverride,o.setupOverride,o.recurringType,o.recurringDiscount.storedValue,o.recurringDiscount.amount,o.setupType,o.setupDiscount.storedValue,o.setupDiscount.amount,o.manual?1:0,notes,tokenHash,offeredAt).run();
  await event(env,quoteId,'created',{status,manualPricing:o.manual,offerKind:o.kind});if(status==='offered')await event(env,quoteId,'published');
  await audit(env.DB,auth.userId,'commerce.offer.created',undefined,undefined,'commercial_quote',quoteId,{quoteNumber:number,status,customerEmail,planId:o.planId,courseCount:o.courseCount,manualPricing:o.manual,offerKind:o.kind});
  const origin=env.APP_ORIGIN||new URL(request.url).origin;
  return{offer:await getPlatformOffer(env,auth,quoteId),publicUrl:raw?`${origin}/angebot/${encodeURIComponent(raw)}`:null};
}

export async function listPlatformOffers(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);await expireOffers(env);
  const r=await env.DB.prepare(`SELECT id,quote_number,subject,offer_kind,customer_name,customer_contact_name,customer_email,plan_id,requested_courses,currency,recurring_monthly_cents,setup_cents,first_total_cents,status,valid_until,manual_pricing,offered_at,accepted_at,created_at,updated_at FROM commercial_quotes ORDER BY created_at DESC LIMIT 300`).all<Record<string,unknown>>();return r.results??[];
}
export async function getPlatformOffer(env:Env,auth:CoreAuthContext,quoteId:string){requirePlatform(auth);const q=await env.DB.prepare('SELECT * FROM commercial_quotes WHERE id=?').bind(quoteId).first<QuoteRow>();if(!q)throw new Error('OFFER_NOT_FOUND');return{...q,pricing_snapshot:JSON.parse(q.pricing_snapshot_json||'{}')};}

export async function publishPlatformOffer(env:Env,auth:CoreAuthContext,quoteId:string,request:Request){
  requirePlatform(auth);const q=await env.DB.prepare('SELECT id,status,valid_until FROM commercial_quotes WHERE id=?').bind(quoteId).first<{id:string;status:string;valid_until:string}>();if(!q)throw new Error('OFFER_NOT_FOUND');if(q.status!=='draft')throw new Error('OFFER_NOT_DRAFT');
  const s=await seller(env);if(!sellerReady(s))throw new Error('SELLER_PROFILE_INCOMPLETE');if(!(await legalReady(env)))throw new Error('LEGAL_CONFIGURATION_INCOMPLETE');
  if(q.valid_until<=nowIso())throw new Error('OFFER_EXPIRED');const raw=b64(randomBytes(32)).replace(/[+/=]/g,'').slice(0,43),hash=await sha256Text(raw),ts=nowIso();
  await env.DB.prepare("UPDATE commercial_quotes SET status='offered',public_token_hash=?,offered_at=?,updated_at=? WHERE id=? AND status='draft'").bind(hash,ts,ts,quoteId).run();await event(env,quoteId,'published');await audit(env.DB,auth.userId,'commerce.offer.published',undefined,undefined,'commercial_quote',quoteId);
  const origin=env.APP_ORIGIN||new URL(request.url).origin;return{offer:await getPlatformOffer(env,auth,quoteId),publicUrl:`${origin}/angebot/${encodeURIComponent(raw)}`};
}
export async function cancelPlatformOffer(env:Env,auth:CoreAuthContext,quoteId:string){requirePlatform(auth);const q=await env.DB.prepare('SELECT status FROM commercial_quotes WHERE id=?').bind(quoteId).first<{status:string}>();if(!q)throw new Error('OFFER_NOT_FOUND');if(!['draft','offered'].includes(q.status))throw new Error('OFFER_NOT_CANCELLABLE');const ts=nowIso();await env.DB.prepare("UPDATE commercial_quotes SET status='cancelled',updated_at=? WHERE id=?").bind(ts,quoteId).run();await event(env,quoteId,'cancelled');await audit(env.DB,auth.userId,'commerce.offer.cancelled',undefined,undefined,'commercial_quote',quoteId);}

async function expireOffers(env:Env){const ts=nowIso(),rows=await env.DB.prepare("SELECT id FROM commercial_quotes WHERE status='offered' AND valid_until<=?").bind(ts).all<{id:string}>();if((rows.results??[]).length){await env.DB.prepare("UPDATE commercial_quotes SET status='expired',updated_at=? WHERE status='offered' AND valid_until<=?").bind(ts,ts).run();for(const x of rows.results??[])await event(env,x.id,'expired');}}
async function quoteByToken(env:Env,token:string):Promise<QuoteRow|null>{if(token.length<20||token.length>100)return null;const hash=await sha256Text(token);return env.DB.prepare('SELECT * FROM commercial_quotes WHERE public_token_hash=?').bind(hash).first<QuoteRow>();}

export async function publicOffer(env:Env,token:string){
  await expireOffers(env);const q=await quoteByToken(env,token);if(!q)throw new Error('OFFER_NOT_FOUND');if(q.status==='cancelled')throw new Error('OFFER_UNAVAILABLE');
  await event(env,q.id,'viewed').catch(()=>undefined);const s=await seller(env),snapshot=JSON.parse(q.pricing_snapshot_json||'{}');
  return{offer:{id:q.id,number:q.quote_number,subject:q.subject,kind:q.offer_kind,status:q.status,validUntil:q.valid_until,createdAt:q.created_at,customer:{name:q.customer_name,contactName:q.customer_contact_name,email:q.customer_email,street:q.customer_street,postalCode:q.customer_postal_code,city:q.customer_city,country:q.customer_country},planId:q.plan_id,courseCount:q.requested_courses,currency:q.currency,recurringMonthlyCents:q.recurring_monthly_cents,setupCents:q.setup_cents,firstTotalCents:q.first_total_cents,monthlyListCents:q.monthly_list_cents,setupListCents:q.setup_list_cents,recurringDiscountCents:q.recurring_discount_cents,setupDiscountCents:q.setup_discount_cents,manualPricing:!!q.manual_pricing,notes:q.notes,acceptedAt:q.accepted_at,pricing:snapshot},seller:s,legal:{impressum:'/impressum',datenschutz:'/datenschutz',agb:'/agb',avv:'/avv'}};
}

export async function acceptPublicOffer(env:Env,token:string,input:OfferInput,request:Request){
  await expireOffers(env);const q=await quoteByToken(env,token);if(!q)throw new Error('OFFER_NOT_FOUND');if(q.status!=='offered')throw new Error(q.status==='expired'?'OFFER_EXPIRED':q.status==='accepted'?'OFFER_ALREADY_ACCEPTED':'OFFER_UNAVAILABLE');
  if(input.confirm_offer!==true||input.confirm_terms!==true||input.confirm_dpa!==true)throw new Error('OFFER_CONFIRMATIONS_REQUIRED');
  const acceptedName=safeString(input.accepted_name,200),acceptedEmail=email(input.accepted_email);if(!acceptedName)throw new Error('ACCEPTED_NAME_REQUIRED');
  const ts=nowIso(),snapshot=q.pricing_snapshot_json,ip=request.headers.get('CF-Connecting-IP')||null,ua=safeString(request.headers.get('User-Agent'),500)||null;
  const raw=b64(randomBytes(32)).replace(/[+/=]/g,'').slice(0,43),hash=await sha256Text(raw),invitationId=id('obi_'),expires=new Date(Date.now()+14*86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO commercial_offer_acceptances(quote_id,accepted_name,accepted_email,accepted_at,accepted_ip,accepted_user_agent,terms_accepted,dpa_accepted,snapshot_json) VALUES(?,?,?,?,?,?,1,1,?)`).bind(q.id,acceptedName,acceptedEmail,ts,ip,ua,snapshot),
    env.DB.prepare("UPDATE commercial_quotes SET status='accepted',accepted_at=?,accepted_name=?,accepted_email=?,accepted_terms=1,accepted_dpa=1,onboarding_invitation_id=?,updated_at=? WHERE id=? AND status='offered'").bind(ts,acceptedName,acceptedEmail,invitationId,ts,q.id),
    env.DB.prepare("INSERT INTO onboarding_invitations(id,token_hash,customer_email,plan_id,status,expires_at,created_by,created_at,quote_id) VALUES(?,?,?,?, 'open',?,?,?,?)").bind(invitationId,hash,q.customer_email,q.plan_id,expires,`offer:${q.id}`,ts,q.id),
  ]);
  await event(env,q.id,'accepted',{acceptedName,acceptedEmail});await event(env,q.id,'onboarding_created',{invitationId});
  const origin=env.APP_ORIGIN||new URL(request.url).origin;return{accepted:true,quoteNumber:q.quote_number,onboardingUrl:`${origin}/einrichtung/${encodeURIComponent(raw)}`,onboardingExpiresAt:expires};
}

export async function acceptedQuoteForOnboarding(env:Env,quoteId:string){
  const q=await env.DB.prepare("SELECT * FROM commercial_quotes WHERE id=? AND status='accepted'").bind(quoteId).first<QuoteRow>();if(!q)throw new Error('OFFER_NOT_ACCEPTED');return{row:q,offer:JSON.parse(q.pricing_snapshot_json||'{}') as Record<string,any>};
}
