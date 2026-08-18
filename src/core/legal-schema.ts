import type { Env } from './types.js';

let ensured=false;
async function columns(env:Env,table:string){const r=await env.DB.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();return new Set((r.results??[]).map(x=>x.name));}
async function add(env:Env,table:string,name:string,definition:string,current:Set<string>){if(current.has(name))return;await env.DB.prepare(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`).run();current.add(name);}

export async function ensureLegalDocumentSchema(env:Env){
  if(ensured)return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS legal_configuration (
    id INTEGER PRIMARY KEY CHECK(id=1),provider_name TEXT,legal_notice_url TEXT,privacy_url TEXT,terms_url TEXT,dpa_url TEXT,support_email TEXT,updated_by TEXT,updated_at TEXT NOT NULL)`).run();
  await env.DB.prepare('INSERT OR IGNORE INTO legal_configuration(id,updated_at) VALUES(1,CURRENT_TIMESTAMP)').run();
  const legal=await columns(env,'legal_configuration');
  const defs:Record<string,string>={representative:'TEXT',register_name:'TEXT',register_number:'TEXT',dpo_name:'TEXT',dpo_email:'TEXT',dsa_contact_email:'TEXT',effective_date:'TEXT',legal_form:'TEXT',content_responsible:'TEXT',supervisory_authority_name:'TEXT',supervisory_authority_url:'TEXT',documents_enabled:'INTEGER NOT NULL DEFAULT 0',document_version:'TEXT'};
  for(const [name,def] of Object.entries(defs))await add(env,'legal_configuration',name,def,legal);
  const seller=await columns(env,'seller_billing_profile');await add(env,'seller_billing_profile','business_id','TEXT',seller);
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS legal_document_events (
    id TEXT PRIMARY KEY,document_version TEXT NOT NULL,event_type TEXT NOT NULL,actor_user_id TEXT,snapshot_json TEXT NOT NULL,created_at TEXT NOT NULL)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS legal_content_reports (
    id TEXT PRIMARY KEY,reporter_name TEXT NOT NULL,reporter_email TEXT NOT NULL,affected_url TEXT NOT NULL,description TEXT NOT NULL,legal_reason TEXT,good_faith INTEGER NOT NULL,status TEXT NOT NULL DEFAULT 'received',created_at TEXT NOT NULL,updated_at TEXT NOT NULL)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_legal_content_reports_status ON legal_content_reports(status,created_at DESC)').run();
  const acc=await columns(env,'commercial_offer_acceptances').catch(()=>new Set<string>());
  if(acc.size){for(const [name,def] of Object.entries({terms_version:'TEXT',dpa_version:'TEXT',privacy_version:'TEXT'}))await add(env,'commercial_offer_acceptances',name,def,acc);}
  ensured=true;
}
