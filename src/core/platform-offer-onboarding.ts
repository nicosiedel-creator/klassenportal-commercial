import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { audit } from './audit.js';
import { b64, id, nowIso, randomBytes, sha256Text } from './utils.js';

export async function reissueAcceptedOfferOnboarding(env:Env,auth:CoreAuthContext,quoteId:string,request:Request){
  requirePlatform(auth);
  const q=await env.DB.prepare("SELECT id,quote_number,status,customer_email,plan_id,onboarding_invitation_id,tenant_id FROM commercial_quotes WHERE id=?").bind(quoteId).first<{id:string;quote_number:string;status:string;customer_email:string;plan_id:string;onboarding_invitation_id:string|null;tenant_id:string|null}>();
  if(!q)throw new Error('OFFER_NOT_FOUND');if(q.status!=='accepted')throw new Error('OFFER_NOT_ACCEPTED');if(q.tenant_id)throw new Error('OFFER_ONBOARDING_ALREADY_COMPLETED');
  const ts=nowIso();
  if(q.onboarding_invitation_id)await env.DB.prepare("UPDATE onboarding_invitations SET status='revoked' WHERE id=? AND status='open'").bind(q.onboarding_invitation_id).run();
  const raw=b64(randomBytes(32)).replace(/[+/=]/g,'').slice(0,43),hash=await sha256Text(raw),invitationId=id('obi_'),expires=new Date(Date.now()+14*86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO onboarding_invitations(id,token_hash,customer_email,plan_id,status,expires_at,created_by,created_at,quote_id) VALUES(?,?,?,?, 'open',?,?,?,?)").bind(invitationId,hash,q.customer_email,q.plan_id,expires,auth.userId,ts,q.id),
    env.DB.prepare('UPDATE commercial_quotes SET onboarding_invitation_id=?,updated_at=? WHERE id=?').bind(invitationId,ts,q.id),
    env.DB.prepare("INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,'onboarding_created',?,?)").bind(id('ofe_'),q.id,JSON.stringify({invitationId,reissued:true}),ts),
  ]);
  await audit(env.DB,auth.userId,'commerce.offer.onboarding_link_reissued',undefined,undefined,'commercial_quote',q.id,{quoteNumber:q.quote_number,invitationId});
  const origin=env.APP_ORIGIN||new URL(request.url).origin;return{onboardingUrl:`${origin}/einrichtung/${encodeURIComponent(raw)}`,onboardingExpiresAt:expires,quoteNumber:q.quote_number};
}
