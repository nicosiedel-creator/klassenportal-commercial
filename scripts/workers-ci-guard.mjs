import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1' || process.env.WORKERS_CI_GUARD_ACTIVE === '1') {
  process.exit(0);
}

console.log(`Cloudflare diagnostic gate: running final platform test for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const result = spawnSync(process.execPath, ['tests/final-platform-suite.mjs'], {
  stdio: 'inherit',
  env: {...process.env, WORKERS_CI_GUARD_ACTIVE:'1'},
});
if (result.error) {
  console.error('Cloudflare diagnostic final platform test could not start.');
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
