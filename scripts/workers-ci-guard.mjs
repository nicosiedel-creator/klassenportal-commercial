import { spawnSync } from 'node:child_process';
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
console.log(`Cloudflare final-four diagnostic for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
for(const name of ['custom-domains.mjs','timetable-hierarchy-targeting.mjs','eu-security-hardening.mjs','production-release-gate.mjs']){const r=spawnSync(process.execPath,[`tests/${name}`],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});if(r.status!==0)process.exit(r.status??1);}
process.exit(0);
