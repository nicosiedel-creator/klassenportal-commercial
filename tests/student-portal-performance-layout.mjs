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

assert.match(dash,/const data=await overview\(\);if\(!data\?\.course\)return;render\(data\);enrichAssignments\(data\)/,'weekly dashboard must render before personal assignment enrichment');
assert.doesNotMatch(dash,/async function overview\(\)[\s\S]*Promise\.all\(\[fetch\(`\/api\/assignments/,'overview must not block the timetable on assignment APIs');
assert.match(dash,/taskCounts/,'weekly plan must visually surface due-task counts');
assert.match(dash,/kp2-mosaic/,'week, tasks and agenda must form one cohesive dashboard block');
assert.match(css,/grid-template-columns:minmax\(0,2\.15fr\) minmax\(300px,.85fr\)/,'desktop dashboard must prioritize the weekly plan');
assert.match(css,/@media\(max-width:980px\)/,'dashboard must collapse cleanly for tablets');
assert.match(css,/@media\(max-width:680px\)/,'dashboard must be mobile responsive');

console.log('Student portal immediate-week-plan and polished mosaic layout checks: OK');
