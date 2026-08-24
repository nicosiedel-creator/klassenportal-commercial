import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const pkg=JSON.parse(await readFile('package.json','utf8'));
const wrangler=await readFile('wrangler.jsonc','utf8');
const guard=await readFile('scripts/workers-ci-guard.mjs','utf8');
const workflows=await Promise.all(['build.yml','portal-ux-check.yml','restore-safety.yml','portal-live-smoke.yml'].map(async n=>[n,await readFile(`.github/workflows/${n}`,'utf8')]));

assert.equal(pkg.scripts['ci:cloudflare'].includes('npm test'),true,'Cloudflare CI must run full tests');
assert.equal(pkg.scripts['ci:cloudflare'].includes('release-check.mjs'),true,'Cloudflare CI must run release checks');
assert.equal(pkg.scripts['ci:cloudflare'].includes('d1 migrations apply DB --local'),true,'Cloudflare CI must validate every D1 migration');
assert.match(wrangler,/"build"\s*:\s*\{[\s\S]*workers-ci-guard\.mjs/,'Wrangler deploy/preview must invoke the Cloudflare CI guard');
assert.match(guard,/WORKERS_CI !== '1'/,'CI guard must distinguish Workers Builds from local/GitHub installs');
assert.match(guard,/WORKERS_CI_COMMIT_SHA/,'Cloudflare commit identity should be visible in CI output');
for(const [name,yml] of workflows){assert.doesNotMatch(yml,/\bpull_request\s*:/,`${name} must not consume GitHub minutes on every PR change`);if(name!=='portal-live-smoke.yml')assert.match(yml,/branches:\s*(?:\[main\]|\n\s*- main)/,`${name} should only auto-run as secondary verification on main`);}
assert.match(workflows.find(([n])=>n==='portal-live-smoke.yml')[1],/workflow_dispatch/,'live smoke must remain available as manual independent verification');

console.log('Cloudflare-primary and GitHub-secondary CI strategy checks: OK');
