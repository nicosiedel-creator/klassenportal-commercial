import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);

const npm=process.platform==='win32'?'npm.cmd':'npm';
console.log(`Cloudflare final release gate for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
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

const commit=String(process.env.WORKERS_CI_COMMIT_SHA||'').trim();
if(commit){
  const metadata={
    commit,
    branch:String(process.env.WORKERS_CI_BRANCH||'').trim()||null,
    build_uuid:String(process.env.WORKERS_CI_BUILD_UUID||'').trim()||null,
    generated_at:new Date().toISOString(),
  };
  writeFileSync('public/build-meta.json',`${JSON.stringify(metadata)}\n`,'utf8');
  console.log(`Bound deployed preview metadata to commit ${commit}.`);
}
process.exit(0);
