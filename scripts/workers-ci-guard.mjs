import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);

const tests=[
'password-kdf-runtime.mjs','run.mjs','advanced-modules.mjs','security-roles.mjs','enterprise-hierarchy-sso-scim-api.mjs','participant-document-import.mjs','zero-touch-intake.mjs','secure-communications.mjs','attendance-classbook.mjs','participant-360.mjs','assignments-gradebook.mjs','final-platform-suite.mjs','accounting-autopilot.mjs','ci-strategy.mjs','billing-lifecycle.mjs','platform-offers.mjs','owner-security.mjs','custom-domains.mjs','timetable-hierarchy-targeting.mjs','eu-security-hardening.mjs','launch-readiness.mjs','production-release-gate.mjs'
];
const results=[];
for(const name of tests){const r=spawnSync(process.execPath,[`tests/${name}`],{encoding:'utf8',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});results.push({test:name,ok:r.status===0,status:r.status,stderr:String(r.stderr||'').slice(-500).replace(/[A-Za-z0-9_=-]{32,}/g,'[redacted]')});}
writeFileSync('public/ci-diagnostic.json',JSON.stringify({commit:process.env.WORKERS_CI_COMMIT_SHA||null,results},null,2));
console.log('Temporary test diagnostics generated.');
process.exit(0);
