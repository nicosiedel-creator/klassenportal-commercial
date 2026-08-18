import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
const tests=['ci-strategy.mjs','billing-lifecycle.mjs','platform-offers.mjs','owner-security.mjs','custom-domains.mjs','timetable-hierarchy-targeting.mjs','eu-security-hardening.mjs','launch-readiness.mjs','production-release-gate.mjs'];
for(const name of tests){const r=spawnSync(process.execPath,[`tests/${name}`],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});if(r.status!==0)process.exit(r.status??1);}
process.exit(0);
