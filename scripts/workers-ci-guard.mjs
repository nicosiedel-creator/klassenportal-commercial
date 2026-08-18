import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
const env={...process.env,WORKERS_CI_GUARD_ACTIVE:'1'};
const npm=process.platform==='win32'?'npm.cmd':'npm';
function run(cmd,args){const r=spawnSync(cmd,args,{stdio:'inherit',env});if(r.error){console.error(r.error.message);process.exit(1);}if(r.status!==0)process.exit(r.status??1);}
console.log(`Cloudflare participant-360 diagnostic for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
run(npm,['run','build']);
run(process.execPath,['tests/participant-360.mjs']);
process.exit(0);
