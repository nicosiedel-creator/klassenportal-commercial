import { spawnSync } from 'node:child_process';

if (process.env.WORKERS_CI !== '1') {
  process.exit(0);
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
console.log(`Cloudflare Workers Builds CI guard: running full test suite for ${process.env.WORKERS_CI_COMMIT_SHA || 'current commit'}...`);
const result = spawnSync(npm, ['run', 'ci:cloudflare'], {
  stdio: 'inherit',
  env: process.env,
});
if (result.error) {
  console.error('Cloudflare Workers Builds CI guard could not start the test suite.');
  console.error(result.error.message);
  process.exit(1);
}
process.exit(result.status ?? 1);
