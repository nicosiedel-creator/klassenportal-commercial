import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { nowIso } from './utils.js';

type ProviderEvent={event_type:string;status:string;received_at:string;processed_at:string|null;error_message:string|null};

function keyMode(key?:string):'test'|'live'|'unknown'|'missing'{
  if(!key)return'missing';
  if(key.startsWith('sk_test_')||key.startsWith('rk_test_'))return'test';
  if(key.startsWith('sk_live_')||key.startsWith('rk_live_'))return'live';
  return'unknown';
}

export async function getStripeDiagnostics(env:Env,auth:CoreAuthContext):Promise<Record<string,unknown>>{
  requirePlatform(auth);
  const mode=keyMode(env.STRIPE_SECRET_KEY),apiKeyPresent=!!env.STRIPE_SECRET_KEY,webhookSecretPresent=!!env.STRIPE_WEBHOOK_SECRET;
  let apiReachable=false,accountId:string|null=null,apiError:string|null=null;
  if(apiKeyPresent){
    try{
      const r=await fetch('https://api.stripe.com/v1/account',{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`}});
      let d:any={};try{d=await r.json();}catch{}
      if(r.ok){apiReachable=true;accountId=typeof d.id==='string'?d.id:null;}
      else apiError=String(d?.error?.code||d?.error?.type||`HTTP_${r.status}`);
    }catch(e){apiError=(e as Error)?.message||'STRIPE_UNREACHABLE';}
  }
  const lastEvent=await env.DB.prepare(`SELECT event_type,status,received_at,processed_at,error_message FROM payment_provider_events WHERE provider='stripe' ORDER BY received_at DESC LIMIT 1`).first<ProviderEvent>();
  const ready=apiReachable&&webhookSecretPresent&&(mode==='test'||mode==='live');
  const status=ready?(mode==='live'?'active':'test'):'not_connected';
  await env.DB.prepare("UPDATE billing_provider_state SET provider='stripe',status=?,automatic_collection=?,updated_at=? WHERE id=1")
    .bind(status,ready?1:0,nowIso()).run();
  return{
    provider:'stripe',mode,status,ready,
    apiKeyPresent,webhookSecretPresent,apiReachable,accountId,apiError,
    webhookVerified:!!lastEvent&&lastEvent.status!=='failed',
    lastWebhook:lastEvent??null,
  };
}
