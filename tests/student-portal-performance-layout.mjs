import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const html=await readFile('public/class-portal.html','utf8');
const perf=await readFile('public/portal-performance.js','utf8');
const dash=await readFile('public/student-dashboard-v2.js','utf8');
const css=await readFile('public/student-dashboard-v2.css','utf8');

const perfPos=html.indexOf('/portal-performance.js');
const portalPos=html.indexOf('/class-portal.js');
assert.ok(perfPos>=0&&portalPos>perfPos,'portal fetch warmup must load before the base class portal');
assert.ok(html.includes('/student-dashboard-v2.css?v=20260821-1'),'student dashboard v2 CSS must be loaded');
assert.ok(html.includes('/student-dashboard-v2.js?v=20260821-1'),'student dashboard v2 JS must be loaded');
assert.ok(!html.includes('/student-dashboard-ui.js'),'old delayed dashboard must not remain active');

assert.match(perf,/warm\(metaPath/,'metadata should start warming during parsing');
assert.match(perf,/warm\(overviewPath/,'overview should start warming during parsing instead of waiting for metadata');
assert.match(perf,/window\.fetch=async function/,'same portal requests must be deduplicated through a short-lived response cache');
assert.match(perf,/X-Klassenportal-Access-Code/,'prefetch must preserve access-code isolation');

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

console.log('Student portal immediate-week-plan, event-driven request-storm guard and polished mosaic layout checks: OK');
