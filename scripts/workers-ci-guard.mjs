import { spawnSync } from 'node:child_process';
if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') process.exit(0);
console.log(`Cloudflare production-release diagnostic for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const r=spawnSync(process.execPath,['tests/production-release-gate.mjs'],{stdio:'inherit',env:{...process.env,WORKERS_CI_GUARD_ACTIVE:'1'}});
process.exit(r.status??1);
