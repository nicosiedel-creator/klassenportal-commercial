import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { stampHomepageBuildCommit } from './build-metadata-lib.mjs';

if (process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);

const npm=process.platform==='win32'?'npm.cmd':'npm';
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
}else if(process.env.KP_LOCAL_PRODUCTION_DEPLOY==='1'){
  console.log('Applying guarded remote D1 migrations before the local production deployment...');
  const migration=spawnSync(npm,['run','db:migrate'],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  if(migration.error){console.error('Remote D1 migration could not start.');console.error(migration.error.message);process.exit(1);}
  if((migration.status??1)!==0)process.exit(migration.status??1);
}else{
  // Wrangler runs this build command for `wrangler dev` too. Without an explicit deployment
  // marker a local development server would migrate the production database, so the remote
  // step stays closed unless `npm run deploy` asked for it.
  console.log('Skipping remote D1 migrations: this build is not a production deployment. Use npm run deploy to migrate production.');
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
