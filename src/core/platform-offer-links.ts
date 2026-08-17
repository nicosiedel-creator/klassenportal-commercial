import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { audit } from './audit.js';
import { b64, id, nowIso, randomBytes, sha256Text } from './utils.js';
import { getPlatformOffer } from './platform-offers.js';

async function ready(env:Env){
  const seller=await env.DB.prepare('SELECT legal_name,street,postal_code,city,country,email FROM seller_billing_profile WHERE id=1').first<Record<string,unknown>>(),legal=await env.DB.prepare('SELECT provider_name,legal_notice_url,privacy_url,terms_url,dpa_url,support_email FROM legal_configuration WHERE id=1').first<Record<string,unknown>>().catch(()=>null);
  if(!(seller?.legal_name&&seller?.street&&seller?.postal_code&&seller?.city&&seller?.country&&seller?.email))throw new Error('SELLER_PROFILE_INCOMPLETE');
  if(!(legal?.provider_name&&legal?.legal_notice_url&&legal?.privacy_url&&legal?.terms_url&&legal?.dpa_url&&legal?.support_email))throw new Error('LEGAL_CONFIGURATION_INCOMPLETE');
}

export async function publishOrRotatePlatformOffer(env:Env,auth:CoreAuthContext,quoteId:string,request:Request){
  requirePlatform(auth);const q=await env.DB.prepare('SELECT id,status,valid_until FROM commercial_quotes WHERE id=?').bind(quoteId).first<{id:string;status:string;valid_until:string}>();if(!q)throw new Error('OFFER_NOT_FOUND');if(!['draft','offered'].includes(q.status))throw new Error('OFFER_LINK_NOT_AVAILABLE');if(q.valid_until<=nowIso())throw new Error('OFFER_EXPIRED');await ready(env);
  const raw=b64(randomBytes(32)).replace(/[+/=]/g,'').slice(0,43),hash=await sha256Text(raw),ts=nowIso(),rotated=q.status==='offered';
  await env.DB.batch([
    env.DB.prepare("UPDATE commercial_quotes SET status='offered',public_token_hash=?,offered_at=COALESCE(offered_at,?),updated_at=? WHERE id=? AND status IN ('draft','offered')").bind(hash,ts,ts,quoteId),
    env.DB.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)').bind(id('ofe_'),quoteId,'published',JSON.stringify({rotated}),ts),
  ]);
  await audit(env.DB,auth.userId,rotated?'commerce.offer.link_rotated':'commerce.offer.published',undefined,undefined,'commercial_quote',quoteId);
  const origin=env.APP_ORIGIN||new URL(request.url).origin;return{offer:await getPlatformOffer(env,auth,quoteId),publicUrl:`${origin}/angebot/${encodeURIComponent(raw)}`,rotated};
}
