import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const ui=await readFile('public/preview-environment-ui.js','utf8');
assert.match(ui,/host\.endsWith\('\.workers\.dev'\)/,'workers.dev must always be recognized as preview');
assert.match(ui,/host\.endsWith\('\.pages\.dev'\)/,'pages.dev must always be recognized as preview');
assert.match(ui,/VORSCHAU · /,'preview must be unmistakable in the document title');
assert.match(ui,/Vorschau · nicht Produktion/,'preview banner must explicitly say it is not production');
assert.match(ui,/fetch\('\/build-meta\.json',\{cache:'no-store'/,'preview metadata must never use stale cache');
assert.match(ui,/meta\?\.branch/,'preview banner must surface the deployed branch');
assert.match(ui,/meta\?\.commit/,'preview banner must surface the deployed commit');
assert.match(ui,/textContent/,'build metadata must be rendered as text, not trusted HTML');
assert.doesNotMatch(ui,/innerHTML\s*=/,'preview metadata must never be interpolated into innerHTML');
assert.doesNotMatch(ui,/position\s*:\s*(?:fixed|sticky)/,'preview banner must stay in normal flow and never cover app controls');

for(const file of ['public/platform-admin.html','public/customer-admin.html','public/class-admin.html','public/class-portal.html']){
  const html=await readFile(file,'utf8');
  assert.ok(html.includes('/preview-environment-ui.js?v=20260818-1'),`${file} must load the preview environment warning`);
}

const guard=await readFile('scripts/workers-ci-guard.mjs','utf8');
assert.match(guard,/WORKERS_CI_COMMIT_SHA/,'Cloudflare build metadata must bind preview to an exact commit');
assert.match(guard,/WORKERS_CI_BRANCH/,'Cloudflare build metadata must expose branch identity');
assert.match(guard,/public\/build-meta\.json/,'Cloudflare build must emit the metadata consumed by the banner');

console.log('Preview branch/commit identity and non-overlapping warning banner checks: OK');
