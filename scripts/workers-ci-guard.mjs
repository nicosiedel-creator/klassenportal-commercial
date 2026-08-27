import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { stampHomepageBuildCommit } from './build-metadata-lib.mjs';

if (process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);

const npm=process.platform==='win32'?'npm.cmd':'npm';
const npx=process.platform==='win32'?'npx.cmd':'npx';
const workersBuild=process.env.WORKERS_CI === '1';
const branch=String(process.env.WORKERS_CI_BRANCH||'').trim();
const productionBranch='main';
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

function remoteRows(sql){
  const r=spawnSync(npx,['wrangler','d1','execute','DB','--remote','--json','--command',sql],{encoding:'utf8',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  if(r.error||(r.status??1)!==0){process.stderr.write(String(r.stderr||''));throw new Error('REMOTE_D1_DIAGNOSTIC_FAILED');}
  const raw=String(r.stdout||'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  const starts=[raw.indexOf('['),raw.indexOf('{')].filter(x=>x>=0);if(!starts.length)throw new Error('REMOTE_D1_DIAGNOSTIC_PARSE_FAILED');
  const parsed=JSON.parse(raw.slice(Math.min(...starts)));
  if(Array.isArray(parsed))return parsed.flatMap(x=>x?.results??x?.result??[]);
  return parsed?.results??parsed?.result??[];
}
function hasTable(name){return Number(remoteRows(`SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='${name.replaceAll("'","''")}'`)[0]?.n||0)>0;}

// This branch-only file is never merged. In Workers Builds it performs one read-only production
// state check and publishes only non-sensitive boolean/status flags to an isolated no-route Worker.
if(workersBuild){
  const tokenHash='10a43231fb8127c6dc21e3a8fcc9bc54549cdc060b5fa433e7455d7bd82af6ed';
  const rows=remoteRows(`SELECT id,status,CASE WHEN expires_at<=strftime('%Y-%m-%dT%H:%M:%fZ','now') THEN 1 ELSE 0 END AS expired,CASE WHEN tenant_id IS NULL THEN 0 ELSE 1 END AS tenant,CASE WHEN form_json IS NULL THEN 0 ELSE 1 END AS form,CASE WHEN quote_id IS NULL THEN 0 ELSE 1 END AS quote,quote_id,plan_id FROM onboarding_invitations WHERE token_hash='${tokenHash}' LIMIT 1`);
  const row=rows[0]||null,found=row?1:0;
  const claimTable=hasTable('onboarding_claims'),tombTable=hasTable('onboarding_claim_tombstones');
  const esc=v=>String(v??'').replaceAll("'","''");
  const claim=row&&claimTable?Number(remoteRows(`SELECT COUNT(*) AS n FROM onboarding_claims WHERE invitation_id='${esc(row.id)}'`)[0]?.n||0):0;
  const tomb=row&&tombTable?Number(remoteRows(`SELECT COUNT(*) AS n FROM onboarding_claim_tombstones WHERE invitation_id='${esc(row.id)}'`)[0]?.n||0):0;
  const m89=Number(remoteRows("SELECT COUNT(*) AS n FROM d1_migrations WHERE name='0089_onboarding_claim_tombstone.sql'")[0]?.n||0)>0?1:0;
  const inviteSql=String(remoteRows("SELECT COALESCE(sql,'') AS sql FROM sqlite_master WHERE type='table' AND name='onboarding_invitations'")[0]?.sql||'');
  const legacycheck=inviteSql.includes("'processing'")?0:1;
  const tuCols=remoteRows('PRAGMA table_info(tenant_users)').map(x=>String(x.name||''));
  const tu=['tenant_id','user_id','status','created_at','updated_at'].every(x=>tuCols.includes(x))?1:0;
  let qstatus='none',qkind='none',accept=0,priceok=0;
  if(row?.quote_id&&hasTable('commercial_quotes')){
    const quoteCols=remoteRows('PRAGMA table_info(commercial_quotes)').map(x=>String(x.name||''));
    const kindExpr=quoteCols.includes('offer_kind')?'offer_kind':"'legacy'";
    const q=remoteRows(`SELECT status,${kindExpr} AS kind,CASE WHEN recurring_monthly_cents>0 AND setup_cents>=0 AND first_total_cents>0 THEN 1 ELSE 0 END AS priceok FROM commercial_quotes WHERE id='${esc(row.quote_id)}' LIMIT 1`)[0];
    if(q){qstatus=String(q.status||'none');qkind=String(q.kind||'none');priceok=Number(q.priceok||0)?1:0;}
    if(hasTable('commercial_offer_acceptances'))accept=Number(remoteRows(`SELECT COUNT(*) AS n FROM commercial_offer_acceptances WHERE quote_id='${esc(row.quote_id)}'`)[0]?.n||0);
  }
  const planok=row?Number(remoteRows(`SELECT COUNT(*) AS n FROM plans WHERE id='${esc(row.plan_id)}' AND is_active=1`)[0]?.n||0)>0?1:0:0;
  const diag={found,status:String(row?.status||'none'),expired:Number(row?.expired||0),tenant:Number(row?.tenant||0),form:Number(row?.form||0),quote:Number(row?.quote||0),claim,tomb,qstatus,qkind,accept,planok,priceok,m89,legacycheck,tu};
  const workerPath='scripts/.tmp-exact-onboarding-diag-worker.mjs',configPath='wrangler.exact-onboarding-diag.json';
  const probePath='/state/6d5c8da4b5e64c83927d9cd6dbe74ec2';
  writeFileSync(workerPath,`const state=${JSON.stringify(diag)};export default{fetch(request){const u=new URL(request.url);return u.pathname==='${probePath}'?new Response(JSON.stringify(state),{headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}}):new Response('Not found',{status:404});}};\n`);
  writeFileSync(configPath,JSON.stringify({name:'kp-onbdiag-20260827',main:workerPath,compatibility_date:'2026-08-27',workers_dev:true,preview_urls:false},null,2));
  const deployed=spawnSync(npx,['wrangler','deploy','--config',configPath],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  rmSync(workerPath,{force:true});rmSync(configPath,{force:true});
  if(deployed.error||(deployed.status??1)!==0)process.exit(deployed.status??1);
  console.log('Exact onboarding production state published to isolated diagnostic Worker.');
  process.exit(0);
}

if(workersBuild&&branch===productionBranch){
  console.log('Running the guarded one-time EU D1 cutover before production migrations...');
  const cutover=spawnSync(process.execPath,['scripts/eu-d1-cutover.mjs'],{
    stdio:'inherit',
    env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'},
  });
  if(cutover.error){console.error('EU D1 cutover could not start.');console.error(cutover.error.message);process.exit(1);}
  if((cutover.status??1)!==0)process.exit(cutover.status??1);
  console.log('Applying guarded remote D1 migrations before production Worker deployment...');
  const migration=spawnSync(npm,['run','db:migrate'],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  if(migration.error){console.error('Production remote D1 migration could not start.');console.error(migration.error.message);process.exit(1);}
  if((migration.status??1)!==0)process.exit(migration.status??1);
}else if(workersBuild&&branch){
  console.log(`Skipping remote D1 migrations in Workers Build for non-production branch: ${branch}`);
}else{
  console.log('Applying guarded remote D1 migrations before the local production deployment...');
  const migration=spawnSync(npm,['run','db:migrate'],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  if(migration.error){console.error('Remote D1 migration could not start.');console.error(migration.error.message);process.exit(1);}
  if((migration.status??1)!==0)process.exit(migration.status??1);
}

const commit=String(process.env.WORKERS_CI_COMMIT_SHA||'').trim();
if(commit){
  const metadata={commit,branch:branch||null,build_uuid:String(process.env.WORKERS_CI_BUILD_UUID||'').trim()||null,generated_at:new Date().toISOString()};
  writeFileSync('public/build-meta.json',`${JSON.stringify(metadata)}\n`,'utf8');
  const indexPath='public/index.html';
  writeFileSync(indexPath,stampHomepageBuildCommit(readFileSync(indexPath,'utf8'),commit),'utf8');
  console.log(`Bound deployed metadata and homepage marker to commit ${commit}.`);
}
process.exit(0);
