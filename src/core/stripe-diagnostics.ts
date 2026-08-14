import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { nowIso } from './utils.js';

type ProviderEvent={event_type:string;status:string;received_at:string;processed_at:string|null;error_message:string|null};
type ProviderState={webhook_verified_mode:string|null;last_webhook_at:string|null;last_webhook_event:string|null;last_error:string|null;status:string;automatic_collection:number};

export function stripeKeyMode(key?:string):'test'|'live'|'unknown'|'missing'{
  if(!key)return'missing';
  if(key.startsWith('sk_test_')||key.startsWith('rk_test_'))return'test';
  if(key.startsWith('sk_live_')||key.startsWith('rk_live_'))return'live';
  return'unknown';
}

export async function assertStripePaymentReady(env:Env):Promise<void>{
  const mode=stripeKeyMode(env.STRIPE_SECRET_KEY);
  if(!env.STRIPE_SECRET_KEY||!env.STRIPE_WEBHOOK_SECRET||(mode!=='test'&&mode!=='live'))throw new Error('STRIPE_NOT_CONFIGURED');
  const state=await env.DB.prepare('SELECT webhook_verified_mode,last_webhook_at,status,automatic_collection FROM billing_provider_state WHERE id=1').first<ProviderState>();
  if(!state||state.webhook_verified_mode!==mode||!state.last_webhook_at||!state.automatic_collection)throw new Error('STRIPE_WEBHOOK_NOT_VERIFIED');
}

export async function getStripeDiagnostics(env:Env,auth:CoreAuthContext):Promise<Record<string,unknown>>{
  requirePlatform(auth);
  const mode=stripeKeyMode(env.STRIPE_SECRET_KEY),apiKeyPresent=!!env.STRIPE_SECRET_KEY,webhookSecretPresent=!!env.STRIPE_WEBHOOK_SECRET;
  let apiReachable=false,accountId:string|null=null,apiError:string|null=null;
  if(apiKeyPresent){
    try{
      const r=await fetch('https://api.stripe.com/v1/account',{headers:{Authorization:`Bearer ${env.STRIPE_SECRET_KEY}`}});
      let d:any={};try{d=await r.json();}catch{}
      if(r.ok){apiReachable=true;accountId=typeof d.id==='string'?d.id:null;}
      else apiError=String(d?.error?.code||d?.error?.type||`HTTP_${r.status}`);
    }catch(e){apiError=(e as Error)?.message||'STRIPE_UNREACHABLE';}
  }
  const state=await env.DB.prepare('SELECT webhook_verified_mode,last_webhook_at,last_webhook_event,last_error,status,automatic_collection FROM billing_provider_state WHERE id=1').first<ProviderState>();
  const lastEvent=await env.DB.prepare(`SELECT event_type,status,received_at,processed_at,error_message FROM payment_provider_events WHERE provider='stripe' ORDER BY received_at DESC LIMIT 1`).first<ProviderEvent>();
  const webhookVerified=!!state?.last_webhook_at&&state.webhook_verified_mode===mode;
  const ready=apiReachable&&webhookSecretPresent&&(mode==='test'||mode==='live')&&webhookVerified;
  const status=ready?(mode==='live'?'active':'test'):'not_connected';
  await env.DB.prepare("UPDATE billing_provider_state SET provider='stripe',status=?,automatic_collection=?,last_error=?,updated_at=? WHERE id=1")
    .bind(status,ready?1:0,apiError,nowIso()).run();
  return{
    provider:'stripe',mode,status,ready,
    apiKeyPresent,webhookSecretPresent,apiReachable,accountId,apiError,
    webhookVerified,webhookVerifiedMode:state?.webhook_verified_mode??null,
    lastWebhookAt:state?.last_webhook_at??null,lastWebhookEvent:state?.last_webhook_event??null,
    lastWebhook:lastEvent??null,
  };
}
