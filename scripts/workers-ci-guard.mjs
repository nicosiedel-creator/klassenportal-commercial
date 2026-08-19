import { spawnSync } from 'node:child_process';
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
const tests=[
  'tests/exam-documentation-department-lead.mjs',
  'tests/full-education-operations.mjs',
  'tests/planning-constraints.mjs',
  'tests/education-operating-system.mjs',
  'tests/education-os-readiness-guardrails.mjs',
  'tests/education-os-operational-depth.mjs',
  'tests/education-os-privacy-storage.mjs',
  'tests/education-os-circuit-breaker.mjs'
];
for(const test of tests){
  console.log(`Cloudflare DIAGNOSTIC delta test: ${test}`);
  const result=spawnSync(process.execPath,[test],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
  if(result.error){console.error(result.error.message);process.exit(1);}
  if((result.status??1)!==0)process.exit(result.status??1);
}
process.exit(0);
