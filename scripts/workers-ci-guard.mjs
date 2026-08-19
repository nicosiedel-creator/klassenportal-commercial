import { spawnSync } from 'node:child_process';
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
const cmd=process.platform==='win32'?'npx.cmd':'npx';
console.log(`Cloudflare DIAGNOSTIC D1 migration gate for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const result=spawnSync(cmd,['wrangler','d1','migrations','apply','DB','--local'],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
if(result.error){console.error(result.error.message);process.exit(1);}process.exit(result.status??1);
