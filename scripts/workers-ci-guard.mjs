import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);

const npm=process.platform==='win32'?'npm.cmd':'npm';
console.log(`Cloudflare full release validation for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const result=spawnSync(npm,['run','ci:cloudflare'],{
  stdio:'inherit',
  env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'},
});
if(result.error){
  console.error('Cloudflare full release validation could not start.');
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status??1);
