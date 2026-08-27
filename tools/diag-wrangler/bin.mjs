#!/usr/bin/env node
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const argv=process.argv.slice(2);
const branch=String(process.env.WORKERS_CI_BRANCH||'');
const diagnostic=process.env.WORKERS_CI==='1'&&branch==='diagnose/exact-onboarding-token-20260827'&&argv[0]==='versions'&&argv[1]==='upload';

function realWrangler(){
  const candidates=[
    fileURLToPath(new URL('../wrangler-real/bin/wrangler.js',import.meta.url)),
    fileURLToPath(new URL('./node_modules/wrangler-real/bin/wrangler.js',import.meta.url)),
    fileURLToPath(new URL('../../wrangler-real/bin/wrangler.js',import.meta.url)),
  ];
  const found=candidates.find(existsSync);
  if(!found){console.error('WRANGLER_REAL_NOT_FOUND',candidates.join(','));process.exit(91);}
  return found;
}
const real=realWrangler();
function run(args,{capture=false,allowFailure=false}={}){
  const r=spawnSync(process.execPath,[real,...args],{cwd:process.cwd(),env:process.env,encoding:capture?'utf8':undefined,stdio:capture?['ignore','pipe','pipe']:'inherit'});
  if(r.error){console.error(r.error);process.exit(92);}
  if((r.status??1)!==0&&!allowFailure){if(capture){process.stderr.write(String(r.stderr||''));process.stdout.write(String(r.stdout||''));}process.exit(r.status??1);}
  return r;
}
function remoteRows(sql){
  const r=run(['d1','execute','DB','--remote','--json','--command',sql],{capture:true});
  const raw=String(r.stdout||'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  const starts=[raw.indexOf('['),raw.indexOf('{')].filter(x=>x>=0);if(!starts.length)throw new Error('D1_JSON_MISSING');
  const parsed=JSON.parse(raw.slice(Math.min(...starts)));
  return Array.isArray(parsed)?parsed.flatMap(x=>x?.results??x?.result??[]):parsed?.results??parsed?.result??[];
}
function table(name){return Number(remoteRows(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='${name.replaceAll("'","''")}'`)[0]?.n||0)>0;}
function cols(name){return table(name)?remoteRows(`PRAGMA table_info(${name})`).map(x=>String(x.name||'')):[];}
function safe(v){return String(v??'').replaceAll("'","''");}

if(diagnostic){
  const tokenHash='10a43231fb8127c6dc21e3a8fcc9bc54549cdc060b5fa433e7455d7bd82af6ed';
  let state={found:0,status:'none',expired:0,hasTenant:0,hasForm:0,hasQuote:0,claimCount:0,tombstoneCount:0,quoteStatus:'none',quoteKind:'none',acceptanceCount:0,planActive:0,pricingUsable:0,migration0089:0,processingColumn:0,processingAllowedByCheck:0,tenantUsersCompatible:0,tenantUsersCurrent:0};
  try{
    if(table('onboarding_invitations')){
      const ic=cols('onboarding_invitations'),hasQuote=ic.includes('quote_id');
      const row=remoteRows(`SELECT id,status,expires_at,tenant_id,form_json,plan_id,${hasQuote?'quote_id':'NULL AS quote_id'} FROM onboarding_invitations WHERE token_hash='${tokenHash}' LIMIT 1`)[0];
      const sql=String(remoteRows("SELECT COALESCE(sql,'') AS sql FROM sqlite_master WHERE type='table' AND name='onboarding_invitations'")[0]?.sql||'');
      const tuc=cols('tenant_users');
      state={...state,
        found:row?1:0,status:String(row?.status||'none'),expired:row?.expires_at&&Date.parse(String(row.expires_at))<=Date.now()?1:0,
        hasTenant:row?.tenant_id?1:0,hasForm:row?.form_json?1:0,hasQuote:row?.quote_id?1:0,
        migration0089:table('d1_migrations')&&remoteRows("SELECT COUNT(*) AS n FROM d1_migrations WHERE name='0089_onboarding_claim_tombstone.sql'")[0]?.n?1:0,
        processingColumn:ic.includes('processing_nonce')?1:0,processingAllowedByCheck:sql.includes("'processing'")?1:0,
        tenantUsersCompatible:['tenant_id','user_id','status'].every(x=>tuc.includes(x))?1:0,
        tenantUsersCurrent:['tenant_id','user_id','status','external_id','source','created_at','updated_at'].every(x=>tuc.includes(x))?1:0,
      };
      if(row){
        const iid=safe(row.id),qid=safe(row.quote_id),pid=safe(row.plan_id);
        state.claimCount=table('onboarding_claims')?Number(remoteRows(`SELECT COUNT(*) AS n FROM onboarding_claims WHERE invitation_id='${iid}'`)[0]?.n||0):0;
        state.tombstoneCount=table('onboarding_claim_tombstones')?Number(remoteRows(`SELECT COUNT(*) AS n FROM onboarding_claim_tombstones WHERE invitation_id='${iid}'`)[0]?.n||0):0;
        state.planActive=Number(remoteRows(`SELECT COUNT(*) AS n FROM plans WHERE id='${pid}' AND is_active=1`)[0]?.n||0)>0?1:0;
        if(qid&&table('commercial_quotes')){
          const qc=cols('commercial_quotes');
          const q=remoteRows(`SELECT status,${qc.includes('offer_kind')?'offer_kind':"'legacy'"} AS offer_kind,${qc.includes('recurring_monthly_cents')?'recurring_monthly_cents':'NULL AS recurring_monthly_cents'},${qc.includes('setup_cents')?'setup_cents':'NULL AS setup_cents'},${qc.includes('first_total_cents')?'first_total_cents':'NULL AS first_total_cents'} FROM commercial_quotes WHERE id='${qid}' LIMIT 1`)[0];
          state.quoteStatus=String(q?.status||'none');state.quoteKind=String(q?.offer_kind||'none');
          state.pricingUsable=q&&Number(q.recurring_monthly_cents||0)>0&&Number(q.setup_cents??-1)>=0&&Number(q.first_total_cents||0)>0?1:0;
          state.acceptanceCount=table('commercial_offer_acceptances')?Number(remoteRows(`SELECT COUNT(*) AS n FROM commercial_offer_acceptances WHERE quote_id='${qid}'`)[0]?.n||0):0;
        }
      }
    }
  }catch(error){state={...state,diagnosticError:String(error?.message||error).slice(0,120)};}
  const workerPath='.kp-onbdiag-worker.mjs',cfgPath='wrangler.kp-onbdiag.json';
  const probe='/state/6d5c8da4b5e64c83927d9cd6dbe74ec2';
  writeFileSync(workerPath,`const s=${JSON.stringify(state)};export default{fetch(r){return new URL(r.url).pathname==='${probe}'?new Response(JSON.stringify(s),{headers:{'content-type':'application/json','cache-control':'no-store'}}):new Response('Not found',{status:404})}};\n`);
  writeFileSync(cfgPath,JSON.stringify({name:'kp-onbdiag-20260827',main:workerPath,compatibility_date:'2026-08-27',workers_dev:true,preview_urls:false},null,2));
  const deployed=run(['deploy','--config',cfgPath],{allowFailure:true});
  rmSync(workerPath,{force:true});rmSync(cfgPath,{force:true});
  if((deployed.status??1)!==0){console.error('DIAGNOSTIC_WORKER_DEPLOY_FAILED');process.exit(deployed.status??1);}
  console.log('EXACT_ONBOARDING_DIAGNOSTIC_PUBLISHED');
}

const result=run(argv,{allowFailure:true});
process.exit(result.status??1);
