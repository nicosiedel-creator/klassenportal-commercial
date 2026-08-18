import { spawnSync } from 'node:child_process';
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
console.log(`Cloudflare late-test diagnostic for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const tests=['ci-strategy.mjs','billing-lifecycle.mjs','platform-offers.mjs','owner-security.mjs'];
for(const name of tests){const r=spawnSync(process.execPath,[`tests/${name}`],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});if(r.status!==0)process.exit(r.status??1);}
process.exit(0);
