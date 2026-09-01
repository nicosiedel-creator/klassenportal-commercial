import type { Env } from './types.js';

let ensured=false;
async function cols(env:Env,table:string):Promise<Set<string>>{const r=await env.DB.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();return new Set((r.results??[]).map(x=>x.name));}
async function add(env:Env,table:string,name:string,definition:string,current:Set<string>){if(current.has(name))return;await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();current.add(name);}

export async function ensureOfferSchema(env:Env):Promise<void>{
  if(ensured)return;
  const q=await cols(env,'commercial_quotes');
  const quoteColumns:Record<string,string>={
    subject:'TEXT',offer_kind:"TEXT NOT NULL DEFAULT 'paid'",billing_cycle:"TEXT NOT NULL DEFAULT 'monthly'",customer_name:'TEXT',customer_contact_name:'TEXT',customer_email:'TEXT',customer_street:'TEXT',customer_postal_code:'TEXT',customer_city:'TEXT',customer_country:'TEXT',monthly_list_cents:'INTEGER',setup_list_cents:'INTEGER',monthly_override_cents:'INTEGER',setup_override_cents:'INTEGER',recurring_discount_type:'TEXT',recurring_discount_value:'INTEGER',recurring_discount_cents:'INTEGER NOT NULL DEFAULT 0',setup_discount_type:'TEXT',setup_discount_value:'INTEGER',setup_discount_cents:'INTEGER NOT NULL DEFAULT 0',manual_pricing:'INTEGER NOT NULL DEFAULT 0',notes:'TEXT',public_token_hash:'TEXT',offered_at:'TEXT',accepted_name:'TEXT',accepted_email:'TEXT',accepted_terms:'INTEGER NOT NULL DEFAULT 0',accepted_dpa:'INTEGER NOT NULL DEFAULT 0'
  };
  for(const [name,def] of Object.entries(quoteColumns))await add(env,'commercial_quotes',name,def,q);
  const inv=await cols(env,'onboarding_invitations');await add(env,'onboarding_invitations','quote_id','TEXT',inv);
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_quotes_public_token ON commercial_quotes(public_token_hash) WHERE public_token_hash IS NOT NULL').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_commercial_quotes_status_created ON commercial_quotes(status,created_at DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_onboarding_invitations_quote ON onboarding_invitations(quote_id)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS commercial_offer_acceptances (
    quote_id TEXT PRIMARY KEY,accepted_name TEXT NOT NULL,accepted_email TEXT NOT NULL,accepted_at TEXT NOT NULL,accepted_ip TEXT,accepted_user_agent TEXT,
    terms_accepted INTEGER NOT NULL CHECK(terms_accepted IN (0,1)),dpa_accepted INTEGER NOT NULL CHECK(dpa_accepted IN (0,1)),snapshot_json TEXT NOT NULL,
    FOREIGN KEY(quote_id) REFERENCES commercial_quotes(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS commercial_offer_events (
    id TEXT PRIMARY KEY,quote_id TEXT NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('created','published','viewed','accepted','cancelled','expired','onboarding_created','email_sent','email_failed')),
    detail_json TEXT,created_at TEXT NOT NULL,
    FOREIGN KEY(quote_id) REFERENCES commercial_quotes(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_offer_events_quote ON commercial_offer_events(quote_id,created_at DESC)').run();
  ensured=true;
}
