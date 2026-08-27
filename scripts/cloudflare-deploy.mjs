import { spawnSync } from 'node:child_process';
import { rmSync, writeFileSync } from 'node:fs';

function run(command,args,env=process.env,{capture=false,allowFailure=false}={}){
  const result=spawnSync(command,args,{stdio:capture?['ignore','pipe','pipe']:'inherit',encoding:capture?'utf8':undefined,env});
  if(result.error){console.error(`Deployment command could not start: ${command}.`);console.error(result.error.message);process.exit(1);}
  if((result.status??1)!==0&&!allowFailure){if(capture){process.stderr.write(String(result.stderr||''));process.stdout.write(String(result.stdout||''));}process.exit(result.status??1);}
  return result;
}

run(process.execPath,['scripts/workers-ci-guard.mjs']);
const npx=process.platform==='win32'?'npx.cmd':'npx';
const diagnosticBranch='diagnose/exact-onboarding-token-20260827';
if(String(process.env.WORKERS_CI||'')==='1'&&String(process.env.WORKERS_CI_BRANCH||'')===diagnosticBranch){
  // SHA-256 only. The actual one-time onboarding token is intentionally not stored in Git.
  const tokenHash='10a43231fb8127c6dc21e3a8fcc9bc54549cdc060b5fa433e7455d7bd82af6ed';
  const sql=`
    SELECT json_object(
      'found',CASE WHEN i.id IS NULL THEN 0 ELSE 1 END,
      'status',COALESCE(i.status,'none'),
      'expired',CASE WHEN i.expires_at IS NOT NULL AND i.expires_at<=CURRENT_TIMESTAMP THEN 1 ELSE 0 END,
      'tenant',CASE WHEN i.tenant_id IS NULL THEN 0 ELSE 1 END,
      'form',CASE WHEN i.form_json IS NULL THEN 0 ELSE 1 END,
      'quote',CASE WHEN i.quote_id IS NULL THEN 0 ELSE 1 END,
      'claim',(SELECT COUNT(*) FROM onboarding_claims c WHERE c.invitation_id=i.id),
      'tomb',(SELECT COUNT(*) FROM onboarding_claim_tombstones t WHERE t.invitation_id=i.id),
      'qstatus',COALESCE((SELECT q.status FROM commercial_quotes q WHERE q.id=i.quote_id),'none'),
      'qkind',COALESCE((SELECT q.offer_kind FROM commercial_quotes q WHERE q.id=i.quote_id),'none'),
      'accept',(SELECT COUNT(*) FROM commercial_offer_acceptances a WHERE a.quote_id=i.quote_id),
      'planok',CASE WHEN EXISTS(SELECT 1 FROM plans p WHERE p.id=i.plan_id AND p.is_active=1) THEN 1 ELSE 0 END,
      'priceok',CASE WHEN EXISTS(SELECT 1 FROM commercial_quotes q WHERE q.id=i.quote_id AND q.recurring_monthly_cents>0 AND q.setup_cents>=0 AND q.first_total_cents>0) THEN 1 ELSE 0 END,
      'm89',CASE WHEN EXISTS(SELECT 1 FROM d1_migrations WHERE name='0089_onboarding_claim_tombstone.sql') THEN 1 ELSE 0 END,
      'legacycheck',CASE WHEN (SELECT sql FROM sqlite_master WHERE type='table' AND name='onboarding_invitations') NOT LIKE '%processing%' THEN 1 ELSE 0 END,
      'tu',CASE WHEN (SELECT COUNT(*) FROM pragma_table_info('tenant_users') WHERE name IN ('tenant_id','user_id','status','created_at','updated_at'))=5 THEN 1 ELSE 0 END
    ) AS diag
    FROM onboarding_invitations i
    WHERE i.token_hash='${tokenHash}'
    LIMIT 1;
  `;
  const q=run(npx,['wrangler','d1','execute','DB','--remote','--json','--command',sql],process.env,{capture:true});
  const raw=String(q.stdout||'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  const jsonStart=Math.min(...['[','{'].map(ch=>{const x=raw.indexOf(ch);return x<0?Number.MAX_SAFE_INTEGER:x;}));
  let diag={found:0,status:'none',expired:0,tenant:0,form:0,quote:0,claim:0,tomb:0,qstatus:'none',qkind:'none',accept:0,planok:0,priceok:0,m89:0,legacycheck:0,tu:0};
  try{
    const parsed=JSON.parse(raw.slice(jsonStart));
    const rows=Array.isArray(parsed)?(parsed[0]?.results??parsed[0]?.result??[]):[];
    const text=rows?.[0]?.diag;
    if(text)diag={...diag,...JSON.parse(String(text))};
  }catch(e){
    console.error('DIAGNOSTIC_PARSE_FAILED',raw,String(e));
    process.exit(3);
  }
  const shortStatus=String(diag.status).replace(/[^a-z0-9]/gi,'').slice(0,5)||'none';
  const qStatus=String(diag.qstatus).replace(/[^a-z0-9]/gi,'').slice(0,4)||'none';
  const qKind=String(diag.qkind).replace(/[^a-z0-9]/gi,'').slice(0,4)||'none';
  const service=`kpdiag-f${diag.found}-s${shortStatus}-e${diag.expired}-c${diag.claim}-t${diag.tomb}-q${qStatus}-k${qKind}-a${diag.accept}-p${diag.planok}${diag.priceok}-m${diag.m89}${diag.legacycheck}-u${diag.tu}`.slice(0,63).toLowerCase();
  console.log('Schema-only exact onboarding diagnostic encoded in temporary Worker name:',service);
  const worker='scripts/.tmp-kpdiag-worker.mjs',config='wrangler.kpdiag.json';
  writeFileSync(worker,"export default {fetch(){return new Response('diagnostic complete')}};\n");
  writeFileSync(config,JSON.stringify({name:service,main:worker,compatibility_date:'2026-07-27',workers_dev:true,preview_urls:false},null,2));
  run(npx,['wrangler','deploy','--config',config]);
  rmSync(worker,{force:true});rmSync(config,{force:true});
  process.exit(0);
}
run(npx,['wrangler','deploy'],{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'});
