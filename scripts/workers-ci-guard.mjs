import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { stampHomepageBuildCommit } from './build-metadata-lib.mjs';

if (process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);

const npm=process.platform==='win32'?'npm.cmd':'npm';
const npx=process.platform==='win32'?'npx.cmd':'npx';
const workersBuild=process.env.WORKERS_CI === '1';
const branch=String(process.env.WORKERS_CI_BRANCH||'').trim();
const productionBranch='main';
const exactDiagnosticBranch='diagnose/exact-onboarding-token-20260827';
console.log(`${workersBuild?'Cloudflare':'Local'} final release gate for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const result=spawnSync(npm,['run','ci:cloudflare'],{
  stdio:'inherit',
  env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'},
});
if(result.error){
  console.error('Cloudflare final release gate could not start.');
  console.error(result.error.message);
  process.exit(1);
}
if((result.status??1)!==0)process.exit(result.status??1);

if(workersBuild&&branch===productionBranch){
  console.log('Running the guarded one-time EU D1 cutover before production migrations...');
  const cutover=spawnSync(process.execPath,['scripts/eu-d1-cutover.mjs'],{
    stdio:'inherit',
    env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'},
  });
  if(cutover.error){
    console.error('EU D1 cutover could not start.');
    console.error(cutover.error.message);
    process.exit(1);
  }
  if((cutover.status??1)!==0)process.exit(cutover.status??1);
  console.log('Applying guarded remote D1 migrations before production Worker deployment...');
  const migration=spawnSync(npm,['run','db:migrate'],{
    stdio:'inherit',
    env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'},
  });
  if(migration.error){
    console.error('Production remote D1 migration could not start.');
    console.error(migration.error.message);
    process.exit(1);
  }
  if((migration.status??1)!==0)process.exit(migration.status??1);
}else if(workersBuild&&branch){
  console.log(`Skipping remote D1 migrations in Workers Build for non-production branch: ${branch}`);
}else{
  console.log('Applying guarded remote D1 migrations before the local production deployment...');
  const migration=spawnSync(npm,['run','db:migrate'],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  if(migration.error){console.error('Remote D1 migration could not start.');console.error(migration.error.message);process.exit(1);}
  if((migration.status??1)!==0)process.exit(migration.status??1);
}

function remoteRows(sql){
  const r=spawnSync(npx,['wrangler','d1','execute','DB','--remote','--json','--command',sql],{encoding:'utf8',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  if(r.error||(r.status??1)!==0)throw new Error('REMOTE_D1_DIAGNOSTIC_FAILED');
  const raw=String(r.stdout||'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  const starts=[raw.indexOf('['),raw.indexOf('{')].filter(x=>x>=0);if(!starts.length)throw new Error('REMOTE_D1_DIAGNOSTIC_PARSE_FAILED');
  const parsed=JSON.parse(raw.slice(Math.min(...starts)));
  if(Array.isArray(parsed))return parsed.flatMap(x=>x?.results??x?.result??[]);
  return parsed?.results??parsed?.result??[];
}
function hasTable(name){return Number(remoteRows(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='${name.replaceAll("'","''")}'`)[0]?.n||0)>0;}

if(workersBuild&&branch===exactDiagnosticBranch){
  // Only this SHA-256 digest is persisted; the one-time onboarding token itself never enters Git.
  const tokenHash='10a43231fb8127c6dc21e3a8fcc9bc54549cdc060b5fa433e7455d7bd82af6ed';
  const rows=remoteRows(`SELECT id,status,CASE WHEN expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END AS expired,CASE WHEN tenant_id IS NULL THEN 0 ELSE 1 END AS tenant,CASE WHEN form_json IS NULL THEN 0 ELSE 1 END AS form,CASE WHEN quote_id IS NULL THEN 0 ELSE 1 END AS quote,quote_id,plan_id FROM onboarding_invitations WHERE token_hash='${tokenHash}' LIMIT 1`);
  const row=rows[0]||null;
  const found=row?1:0;
  const claimTable=hasTable('onboarding_claims'),tombTable=hasTable('onboarding_claim_tombstones');
  const claim=row&&claimTable?Number(remoteRows(`SELECT COUNT(*) AS n FROM onboarding_claims WHERE invitation_id='${String(row.id).replaceAll("'","''")}'`)[0]?.n||0):0;
  const tomb=row&&tombTable?Number(remoteRows(`SELECT COUNT(*) AS n FROM onboarding_claim_tombstones WHERE invitation_id='${String(row.id).replaceAll("'","''")}'`)[0]?.n||0):0;
  const m89=Number(remoteRows("SELECT COUNT(*) AS n FROM d1_migrations WHERE name='0089_onboarding_claim_tombstone.sql'")[0]?.n||0)>0?1:0;
  const inviteSql=String(remoteRows("SELECT COALESCE(sql,'') AS sql FROM sqlite_master WHERE type='table' AND name='onboarding_invitations'")[0]?.sql||'');
  const legacycheck=inviteSql.includes("'processing'")?0:1;
  const tuCols=remoteRows("PRAGMA table_info(tenant_users)").map(x=>String(x.name||''));
  const tu=['tenant_id','user_id','status','created_at','updated_at'].every(x=>tuCols.includes(x))?1:0;
  let qstatus='none',qkind='none',accept=0,priceok=0;
  if(row?.quote_id&&hasTable('commercial_quotes')){
    const quoteCols=remoteRows("PRAGMA table_info(commercial_quotes)").map(x=>String(x.name||''));
    const kindExpr=quoteCols.includes('offer_kind')?'offer_kind':"'legacy'";
    const q=remoteRows(`SELECT status,${kindExpr} AS kind,CASE WHEN recurring_monthly_cents>0 AND setup_cents>=0 AND first_total_cents>0 THEN 1 ELSE 0 END AS priceok FROM commercial_quotes WHERE id='${String(row.quote_id).replaceAll("'","''")}' LIMIT 1`)[0];
    if(q){qstatus=String(q.status||'none');qkind=String(q.kind||'none');priceok=Number(q.priceok||0)?1:0;}
    if(hasTable('commercial_offer_acceptances'))accept=Number(remoteRows(`SELECT COUNT(*) AS n FROM commercial_offer_acceptances WHERE quote_id='${String(row.quote_id).replaceAll("'","''")}'`)[0]?.n||0);
  }
  const planok=row?Number(remoteRows(`SELECT COUNT(*) AS n FROM plans WHERE id='${String(row.plan_id).replaceAll("'","''")}' AND is_active=1`)[0]?.n||0)>0?1:0:0;
  const s=String(row?.status||'none').replace(/[^a-z0-9]/gi,'').slice(0,5).toLowerCase()||'none';
  const qs=qstatus.replace(/[^a-z0-9]/gi,'').slice(0,4).toLowerCase()||'none';
  const qk=qkind.replace(/[^a-z0-9]/gi,'').slice(0,4).toLowerCase()||'none';
  const diagName=`kpdiag-f${found}-s${s}-e${Number(row?.expired||0)}-x${Number(row?.tenant||0)}${Number(row?.form||0)}${Number(row?.quote||0)}-c${claim}-t${tomb}-q${qs}-k${qk}-a${accept}-p${planok}${priceok}-m${m89}${legacycheck}-u${tu}`.slice(0,63);
  const cfg=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
  cfg.name=diagName;cfg.routes=[];cfg.preview_urls=false;cfg.workers_dev=true;
  writeFileSync('wrangler.jsonc',JSON.stringify(cfg,null,2));
  console.log(`Exact production onboarding state encoded into isolated preview worker name: ${diagName}`);
}

const commit=String(process.env.WORKERS_CI_COMMIT_SHA||'').trim();
if(commit){
  const metadata={
    commit,
    branch:branch||null,
    build_uuid:String(process.env.WORKERS_CI_BUILD_UUID||'').trim()||null,
    generated_at:new Date().toISOString(),
  };
  writeFileSync('public/build-meta.json',`${JSON.stringify(metadata)}\n`,'utf8');

  const indexPath='public/index.html';
  const stamped=stampHomepageBuildCommit(readFileSync(indexPath,'utf8'),commit);
  writeFileSync(indexPath,stamped,'utf8');

  console.log(`Bound deployed metadata and homepage marker to commit ${commit}.`);
}
process.exit(0);
