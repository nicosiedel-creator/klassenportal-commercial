import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function run(command,args,env=process.env,{capture=false}={}){
  const result=spawnSync(command,args,{stdio:capture?['ignore','pipe','pipe']:'inherit',encoding:capture?'utf8':undefined,env});
  if(result.error){console.error(`Deployment command could not start: ${command}.`);console.error(result.error.message);process.exit(1);}
  if((result.status??1)!==0){if(capture){process.stderr.write(String(result.stderr||''));process.stdout.write(String(result.stdout||''));}process.exit(result.status??1);}
  return capture?String(result.stdout||''):'';
}

run(process.execPath,['scripts/workers-ci-guard.mjs']);
const npx=process.platform==='win32'?'npx.cmd':'npx';
const diagnosticBranch='diagnose/production-onboarding-custom-domain-20260827';
if(String(process.env.WORKERS_CI||'')==='1'&&String(process.env.WORKERS_CI_BRANCH||'')===diagnosticBranch){
  const tables=['onboarding_invitations','onboarding_claims','onboarding_claim_tombstones','tenant_profiles','tenant_users','commercial_quotes','commercial_offer_acceptances','commercial_offer_events','tenant_trials','tenant_entitlements','commercial_orders','commercial_invoices','subscriptions'];
  const parts=tables.map(table=>`SELECT '${table}' AS object, COALESCE(group_concat(name || ':' || type || ':' || "notnull" || ':' || pk, ','),'MISSING') AS detail FROM pragma_table_info('${table}')`);
  parts.push("SELECT 'onboarding_invitations_sql' AS object, COALESCE((SELECT sql FROM sqlite_master WHERE type='table' AND name='onboarding_invitations'),'MISSING') AS detail");
  parts.push("SELECT 'relevant_migrations' AS object, COALESCE((SELECT group_concat(name, ',') FROM d1_migrations WHERE name IN ('0024_customer_onboarding.sql','0025_onboarding_claims.sql','0026_commerce.sql','0027_pricing_trial.sql','0044_legal_documents_and_pilot.sql','0045_platform_offers.sql','0046_integrated_legal_documents.sql','0048_enterprise_hierarchy_sso_scim_api.sql','0089_onboarding_claim_tombstone.sql')),'NONE') AS detail");
  const sql=parts.join(' UNION ALL ');
  const output=run(npx,['wrangler','d1','execute','DB','--remote','--json','--command',sql],process.env,{capture:true});
  let parsed;try{parsed=JSON.parse(output.replace(/\u001b\[[0-9;]*m/g,'').trim().replace(/^[\s\S]*?(?=[\[{])/,'')||'[]');}catch{parsed={raw:output};}
  writeFileSync('public/kp-onboarding-schema-diag-20260827.js',`globalThis.__KP_ONBOARDING_SCHEMA_DIAG__=${JSON.stringify(parsed)};\n`);
  console.log('Prepared read-only onboarding schema diagnostic asset for this preview build.');
}
run(npx,['wrangler','deploy'],{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'});
