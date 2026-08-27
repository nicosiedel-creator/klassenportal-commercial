import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

function run(command,args,env=process.env){
  const result=spawnSync(command,args,{stdio:'inherit',env});
  if(result.error){console.error(`Deployment command could not start: ${command}.`);console.error(result.error.message);process.exit(1);}
  if((result.status??1)!==0)process.exit(result.status??1);
}

run(process.execPath,['scripts/workers-ci-guard.mjs']);
const npx=process.platform==='win32'?'npx.cmd':'npx';
const diagnosticBranch='diagnose/production-onboarding-custom-domain-20260827';
if(String(process.env.WORKERS_CI||'')==='1'&&String(process.env.WORKERS_CI_BRANCH||'')===diagnosticBranch){
  const workerPath='scripts/.tmp-onboarding-schema-diag-worker.mjs';
  const configPath='wrangler.onboarding-schema-diag.json';
  const probePath='/schema/1f5f2d72-646f-49f5-a671-30f8f4643658';
  writeFileSync(workerPath,`const tables=['onboarding_invitations','onboarding_claims','onboarding_claim_tombstones','tenant_profiles','tenant_users','commercial_quotes','commercial_offer_acceptances','commercial_offer_events','tenant_trials','tenant_entitlements','commercial_orders','commercial_invoices','subscriptions','tenants','tenant_settings','users','memberships','feature_flags','provisioning_log'];\nexport default {async fetch(request,env){const u=new URL(request.url);if(u.pathname!=='${probePath}')return new Response('Not found',{status:404});const schema={};for(const table of tables){try{const rows=(await env.DB.prepare('PRAGMA table_info('+table+')').all()).results||[];schema[table]=rows.map(r=>({name:String(r.name||''),type:String(r.type||''),notnull:Number(r.notnull||0),pk:Number(r.pk||0)}));}catch{schema[table]=null;}}let invitationSql=null;try{invitationSql=(await env.DB.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='onboarding_invitations'").first())?.sql||null;}catch{}let migrations=[];try{migrations=((await env.DB.prepare("SELECT name FROM d1_migrations WHERE name IN ('0024_customer_onboarding.sql','0025_onboarding_claims.sql','0026_commerce.sql','0027_pricing_trial.sql','0044_legal_documents_and_pilot.sql','0045_platform_offers.sql','0046_integrated_legal_documents.sql','0048_enterprise_hierarchy_sso_scim_api.sql','0089_onboarding_claim_tombstone.sql') ORDER BY name").all()).results||[]).map(r=>String(r.name||''));}catch{}return new Response(JSON.stringify({schema,invitationSql,migrations}),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});}};\n`);
  writeFileSync(configPath,JSON.stringify({name:'kp-onb-schema-diag-20260827',main:workerPath,compatibility_date:'2026-07-27',workers_dev:true,preview_urls:false,d1_databases:[{binding:'DB',database_name:'klassenportal-commercial-eu',database_id:'a060de73-a4f6-4410-b4f2-25f5bee87754'}]},null,2));
  run(npx,['wrangler','deploy','--config',configPath]);
  rmSync(workerPath,{force:true});rmSync(configPath,{force:true});
  console.log('Isolated read-only onboarding schema diagnostic Worker deployed.');
  process.exit(0);
}
run(npx,['wrangler','deploy'],{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'});
