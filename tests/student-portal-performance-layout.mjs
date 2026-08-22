import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const html=await readFile('public/class-portal.html','utf8');
const entry=await readFile('public/portal-entry.js','utf8');
const lazy=await readFile('public/portal-lazy-runtime.js','utf8');
const watchdog=await readFile('public/portal-load-watchdog.js','utf8');
const dash=await readFile('public/student-dashboard-v2.js','utf8');
const css=await readFile('public/student-dashboard-v2.css','utf8');
const advanced=await readFile('src/core/public-advanced.ts','utf8');

assert.ok(html.includes('/portal-load-watchdog.js?v=20260822-student-hotfix-3'),'student portal must have a visible long-load watchdog');
assert.ok(html.includes('/portal-entry.js?v=20260822-student-hotfix-3'),'student portal must start through its lean entrypoint');
assert.ok(html.includes('/portal-lazy-runtime.js?v=20260822-student-hotfix-3'),'student portal must defer secondary features to the lazy runtime');
assert.ok(!html.includes('/portal-performance.js'),'student portal must not monkey-patch fetch or prewarm overview requests during parsing');
assert.ok(!html.includes('src="/class-portal.js'),'base class portal must be launched asynchronously by the lean entrypoint');
for(const heavy of ['student-dashboard-v2.js','portal-assignments-ui.js','portal-teams-ui.js','portal-report-book-ui.js','participant-moat-ui.js','pwa-client.js'])assert.ok(!html.includes(`src="/${heavy}`),`heavy student module must stay out of first paint: ${heavy}`);

assert.match(entry,/import\(`\/class-portal\.js\?v=\$\{VERSION\}`\)/,'entrypoint must launch the existing privacy-safe base portal');
assert.match(entry,/__KP_PORTAL_BASE_PROMISE/,'entrypoint must expose base readiness without blocking the document runtime');
assert.match(entry,/kp:portal-base-ready/,'entrypoint must publish explicit base readiness');
assert.match(entry,/kp:portal-base-failed/,'entrypoint must publish explicit base failure');
assert.match(watchdog,/12000/,'stalled portal loads must become visible instead of spinning forever');

for(const name of ['student-dashboard-v2','portal-assignments-ui','portal-teams-ui','portal-report-book-ui'])assert.ok(lazy.includes(`'${name}'`),`lazy student runtime must retain ${name}`);
assert.match(lazy,/loadLocalization\(\)/,'generic localization must be installed through the observer-free portal adapter');
assert.match(lazy,/window\.MutationObserver=NoopObserver/,'student portal must suppress the generic localization subtree observer during installation');
assert.match(lazy,/finally\{window\.MutationObserver=Native;\}/,'native MutationObserver must be restored immediately after localization installation');
assert.match(lazy,/kp:portal-data/,'student portal translations must be refreshed from explicit portal events');
assert.ok(!lazy.includes("'owner-route-privacy'"),'student runtime must not reintroduce the global owner-route subtree observer');
assert.ok(!lazy.includes("'participant-moat-ui'"),'participant moat must not be imported twice with different cache-busting URLs');
assert.match(lazy,/loadList\(GATE_SUPPORT,2\)/,'login support must load independently of the dashboard');
assert.match(lazy,/if\(!window\.__KP_PORTAL_DATA\)return;/,'dashboard and heavy features must stay unloaded while only the login/access gate is visible');
assert.match(lazy,/loadList\(HIGH,2\)/,'high-priority portal enhancements must use bounded parallelism');
assert.match(lazy,/loadList\(FEATURES,3\)/,'secondary portal features must use bounded parallelism');
assert.match(lazy,/requestIdleCallback/,'secondary features must wait for idle time after the base portal is visible');
assert.match(lazy,/bootPromise/,'student lazy runtime must suppress duplicate boot attempts');
assert.doesNotMatch(lazy,/new MutationObserver/,'student lazy runtime must remain event-driven');
assert.doesNotMatch(lazy,/window\.fetch\s*=/,'student lazy runtime must never replace global fetch');

assert.doesNotMatch(advanced,/ensureAdvancedModuleSchema/,'public student overview must never run schema creation/repair on a read request');
assert.doesNotMatch(advanced,/ensureCalendarFeedsForTenant/,'public student overview must never create calendar feeds while loading');
assert.match(advanced,/feature_key IN \('substitution_updates','surveys','microsoft_365'\)/,'advanced feature flags must be read in one query');
assert.match(advanced,/Promise\.all\(\[substitutionsPromise,surveysPromise,feedPromise\]\)/,'advanced student data must load in parallel');
assert.match(advanced,/o\.survey_id IN \(\$\{marks\(ids\.length\)\}\)/,'survey options must be batched instead of queried once per survey');

assert.match(dash,/async function build\(data\)\{[^}]*render\(data\);void enrichAssignments\(data\)/,'weekly dashboard must render before personal assignment enrichment');
assert.match(dash,/kp:portal-data/,'dashboard must consume the base portal data event rather than refetching the overview');
assert.match(dash,/window\.__KP_PORTAL_DATA/,'dashboard must support already-resolved portal data on late module load');
assert.doesNotMatch(dash,/\/public\/.*\/overview/,'dashboard must not issue its own overview request');
assert.doesNotMatch(dash,/MutationObserver/,'student dashboard must remain fully event-driven and cannot re-enter through DOM mutations');
assert.match(dash,/assignmentBusy/,'personal assignment enrichment must be protected against concurrent duplicate requests');
assert.match(dash,/taskCounts/,'weekly plan must visually surface due-task counts');
assert.match(dash,/kp2-mosaic/,'week, tasks and agenda must form one cohesive dashboard block');
assert.match(css,/grid-template-columns:minmax\(0,2\.15fr\) minmax\(300px,.85fr\)/,'desktop dashboard must prioritize the weekly plan');
assert.match(css,/@media\(max-width:980px\)/,'dashboard must collapse cleanly for tablets');
assert.match(css,/@media\(max-width:680px\)/,'dashboard must be mobile responsive');

console.log('Student portal lean bootstrap, observer-free localization, read-only advanced overview, non-blocking load watchdog, event-driven request-storm guard and polished mosaic layout checks: OK');
