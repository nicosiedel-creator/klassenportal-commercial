import { spawnSync } from 'node:child_process';
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
const shell=process.platform==='win32'?'cmd.exe':'sh';
const args=process.platform==='win32'?['/d','/s','/c',"for %f in (public\\*.js) do node --check \"%f\" && node scripts/release-check.mjs"]:['-lc',"find public -maxdepth 1 -name '*.js' -print0 | xargs -0 -n1 node --check && node scripts/release-check.mjs"];
console.log(`Cloudflare DIAGNOSTIC browser/release gate for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const result=spawnSync(shell,args,{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
if(result.error){console.error(result.error.message);process.exit(1);}process.exit(result.status??1);
