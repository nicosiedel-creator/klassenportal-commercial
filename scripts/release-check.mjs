import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Reuse the focused release/security contracts so this gate cannot drift behind
// the runtime requirements it is intended to enforce.
for(const suite of [
  '../tests/payment-freeze-release.mjs',
  '../tests/security-roles.mjs',
  '../tests/attendance-classbook.mjs',
  '../tests/owner-security.mjs',
  '../tests/eu-security-hardening.mjs',
  '../tests/launch-readiness.mjs',
  '../tests/production-release-gate.mjs',
  '../tests/eu-storage-cutover.mjs',
  '../tests/secure-communications.mjs',
  '../tests/zero-touch-intake.mjs',
  '../tests/migration-filename-integrity.mjs'
]) await import(suite);

const wrangler=await readFile('wrangler.jsonc','utf8');
const pkg=JSON.parse(await readFile('package.json','utf8'));
const runtime=await readFile('src/index.ts','utf8');

assert.match(wrangler,/"APP_ORIGIN"\s*:\s*"https:\/\/klassenportal\.app"/);
assert.match(wrangler,/"PAYMENTS_ENABLED"\s*:\s*"false"/);
assert.match(wrangler,/"send_email"\s*:/);
assert.match(runtime,/handleCloudflareInboundEmail/);
assert.ok(String(pkg.scripts?.test||'').includes('tests/payment-freeze-release.mjs'));

console.log('Release readiness checks: OK');
