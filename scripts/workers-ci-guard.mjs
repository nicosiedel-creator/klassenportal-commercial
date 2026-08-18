import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
const env={...process.env,WORKERS_CI_GUARD_ACTIVE:'1'};
console.log(`Cloudflare timetable-bulk-v3 syntax gate for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const r=spawnSync(process.execPath,['--check','public/timetable-bulk-v3.js'],{stdio:'inherit',env});
if(r.error){console.error(r.error.message);process.exit(1);}
process.exit(r.status??1);
