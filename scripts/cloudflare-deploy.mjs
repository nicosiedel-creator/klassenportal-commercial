import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

function run(command,args,env=process.env){
  const result=spawnSync(command,args,{stdio:'inherit',env});
  if(result.error){console.error(`Deployment command could not start: ${command}.`);console.error(result.error.message);process.exit(1);}
  if((result.status??1)!==0)process.exit(result.status??1);
}

run(process.execPath,['scripts/workers-ci-guard.mjs']);
const npx=process.platform==='win32'?'npx.cmd':'npx';
const diagnosticBranch='diagnose/production-onboarding-custom-domain-20260827';
if(String(process.env.WORKERS_CI||'')==='1'&&String(process.env.WORKERS_CI_BRANCH||'')===diagnosticBranch){
  const legalPath='src/core/legal.ts';
  let source=readFileSync(legalPath,'utf8');
  const start=source.indexOf('export async function publicLegal(env:Env){');
  const end=source.indexOf('\nexport async function ownerLegal',start);
  if(start<0||end<0)throw new Error('DIAGNOSTIC_PATCH_TARGET_NOT_FOUND');
  const replacement=`async function onboardingSchemaDiagnostic(env:Env){\n  const tables=['onboarding_invitations','onboarding_claims','onboarding_claim_tombstones','tenant_profiles','tenant_users','commercial_quotes','commercial_offer_acceptances','commercial_offer_events','tenant_trials','tenant_entitlements','commercial_orders','commercial_invoices','subscriptions','tenants','tenant_settings','users','memberships','feature_flags','provisioning_log'];\n  const schema:Record<string,string[]|null>={};\n  for(const table of tables){try{const r=await env.DB.prepare('PRAGMA table_info('+table+')').all<{name:string}>();schema[table]=(r.results??[]).map(x=>String(x.name)).sort();}catch{schema[table]=null;}}\n  let invitationSql:string|null=null;try{invitationSql=String((await env.DB.prepare(\"SELECT sql FROM sqlite_master WHERE type='table' AND name='onboarding_invitations'\").first<{sql:string}>())?.sql||'')||null;}catch{}\n  let migrations:string[]=[];try{const r=await env.DB.prepare(\"SELECT name FROM d1_migrations WHERE name IN ('0024_customer_onboarding.sql','0025_onboarding_claims.sql','0026_commerce.sql','0027_pricing_trial.sql','0044_legal_documents_and_pilot.sql','0045_platform_offers.sql','0046_integrated_legal_documents.sql','0048_enterprise_hierarchy_sso_scim_api.sql','0089_onboarding_claim_tombstone.sql') ORDER BY name\").all<{name:string}>();migrations=(r.results??[]).map(x=>String(x.name));}catch{}\n  return{schema,invitationSql,migrations};\n}\n\nexport async function publicLegal(env:Env){const [x,s]=await Promise.all([row(env),seller(env)]),complete=legalComplete(x,s);return{providerName:x.provider_name||s.legal_name,legalForm:x.legal_form,representative:x.representative,supportEmail:x.support_email||s.email,dpoName:x.dpo_name,dpoEmail:x.dpo_email,dsaContactEmail:x.dsa_contact_email||x.support_email||s.email,effectiveDate:x.effective_date,documentVersion:x.document_version,documentsEnabled:!!x.documents_enabled,legalNoticeUrl:complete?'/impressum':null,privacyUrl:complete?'/datenschutz':null,termsUrl:complete?'/agb':null,dpaUrl:complete?'/avv':null,subprocessorsUrl:complete?'/unterauftragsverarbeiter':null,portabilityUrl:complete?'/datenportabilitaet':null,contentReportUrl:complete?'/rechtsverstoss-melden':null,complete,__onboardingSchemaDiagnostic:await onboardingSchemaDiagnostic(env)};}`;
  source=source.slice(0,start)+replacement+source.slice(end);
  writeFileSync(legalPath,source);
  console.log('Injected schema-only diagnostic into public legal response for this non-main build.');
}
run(npx,['wrangler','deploy'],{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'});
