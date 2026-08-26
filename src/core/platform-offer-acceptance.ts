import type { Env } from './types.js';
import { publicLegal } from './legal.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, safeString, sha256Text } from './utils.js';

type OfferInput=Record<string,unknown>;
type QuoteRow={
  id:string;
  quote_number:string;
  status:string;
  valid_until:string;
  pricing_snapshot_json:string;
  customer_email:string|null;
  plan_id:string;
};

function email(v:unknown):string{
  const s=normalizeEmail(v);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new Error('CUSTOMER_EMAIL_INVALID');
  return s;
}

async function event(env:Env,quoteId:string,eventType:string,detail?:unknown){
  await env.DB.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)')
    .bind(id('ofe_'),quoteId,eventType,detail===undefined?null:JSON.stringify(detail),nowIso()).run();
}

async function expireOffers(env:Env){
  const ts=nowIso();
  const rows=await env.DB.prepare("SELECT id FROM commercial_quotes WHERE status='offered' AND valid_until<=?").bind(ts).all<{id:string}>();
  if((rows.results??[]).length){
    await env.DB.prepare("UPDATE commercial_quotes SET status='expired',updated_at=? WHERE status='offered' AND valid_until<=?").bind(ts,ts).run();
    for(const x of rows.results??[])await event(env,x.id,'expired');
  }
}

async function quoteByToken(env:Env,token:string):Promise<QuoteRow|null>{
  if(token.length<20||token.length>100)return null;
  const hash=await sha256Text(token);
  return env.DB.prepare('SELECT id,quote_number,status,valid_until,pricing_snapshot_json,customer_email,plan_id FROM commercial_quotes WHERE public_token_hash=?').bind(hash).first<QuoteRow>();
}

export async function acceptPublicOffer(env:Env,token:string,input:OfferInput,request:Request){
  await expireOffers(env);
  const q=await quoteByToken(env,token);
  if(!q)throw new Error('OFFER_NOT_FOUND');
  if(q.status!=='offered')throw new Error(q.status==='expired'?'OFFER_EXPIRED':q.status==='accepted'?'OFFER_ALREADY_ACCEPTED':'OFFER_UNAVAILABLE');

  const legal=await publicLegal(env);
  if(!legal.complete||!legal.documentVersion)throw new Error('LEGAL_CONFIGURATION_INCOMPLETE');
  if(input.confirm_offer!==true||input.confirm_terms!==true||input.confirm_dpa!==true)throw new Error('OFFER_CONFIRMATIONS_REQUIRED');

  const acceptedName=safeString(input.accepted_name,200),acceptedEmail=email(input.accepted_email);
  if(!acceptedName)throw new Error('ACCEPTED_NAME_REQUIRED');

  const ts=nowIso(),snapshot=q.pricing_snapshot_json,ip=request.headers.get('CF-Connecting-IP')||null,ua=safeString(request.headers.get('User-Agent'),500)||null;
  const raw=b64(randomBytes(32)).replace(/[+/=]/g,'').slice(0,43),hash=await sha256Text(raw),invitationId=id('obi_'),expires=new Date(Date.now()+14*86400000).toISOString();

  // FK order matters in D1/SQLite: commercial_quotes.onboarding_invitation_id references
  // onboarding_invitations(id), so the invitation must exist before the quote is updated.
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO commercial_offer_acceptances(quote_id,accepted_name,accepted_email,accepted_at,accepted_ip,accepted_user_agent,terms_accepted,dpa_accepted,snapshot_json,terms_version,dpa_version,privacy_version) VALUES(?,?,?,?,?,?,1,1,?,?,?,?)`)
      .bind(q.id,acceptedName,acceptedEmail,ts,ip,ua,snapshot,legal.documentVersion,legal.documentVersion,legal.documentVersion),
    env.DB.prepare("INSERT INTO onboarding_invitations(id,token_hash,customer_email,plan_id,status,expires_at,created_by,created_at,quote_id) VALUES(?,?,?,?, 'open',?,?,?,?)")
      .bind(invitationId,hash,q.customer_email,q.plan_id,expires,`offer:${q.id}`,ts,q.id),
    env.DB.prepare("UPDATE commercial_quotes SET status='accepted',accepted_at=?,accepted_name=?,accepted_email=?,accepted_terms=1,accepted_dpa=1,onboarding_invitation_id=?,updated_at=? WHERE id=? AND status='offered'")
      .bind(ts,acceptedName,acceptedEmail,invitationId,ts,q.id),
  ]);

  await event(env,q.id,'accepted',{acceptedName,acceptedEmail,documentVersion:legal.documentVersion});
  await event(env,q.id,'onboarding_created',{invitationId});
  const origin=env.APP_ORIGIN||new URL(request.url).origin;
  return{accepted:true,quoteNumber:q.quote_number,onboardingUrl:`${origin}/einrichtung/${encodeURIComponent(raw)}`,onboardingExpiresAt:expires};
}
