import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
const env={...process.env,WORKERS_CI_GUARD_ACTIVE:'1'};
const files=['platform-accounting-ui.js','platform-accounting-autopilot-ui.js'];
console.log(`Cloudflare accounting browser syntax gate for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
for(const name of files){
  const r=spawnSync(process.execPath,['--check',`public/${name}`],{stdio:'inherit',env});
  if(r.error){console.error(`${name}: ${r.error.message}`);process.exit(1);}
  if(r.status!==0)process.exit(r.status??1);
}
process.exit(0);
