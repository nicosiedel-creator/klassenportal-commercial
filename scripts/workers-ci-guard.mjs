import { spawnSync } from 'node:child_process';
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
const npm=process.platform==='win32'?'npm.cmd':'npm';
console.log(`Cloudflare DIAGNOSTIC regression gate for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const result=spawnSync(npm,['test'],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
if(result.error){console.error(result.error.message);process.exit(1);}process.exit(result.status??1);
