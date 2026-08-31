import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const html=await readFile('public/class-portal.html','utf8');
const entry=await readFile('public/portal-entry.js','utf8');
const lazy=await readFile('public/portal-lazy-runtime.js','utf8');
const watchdog=await readFile('public/portal-load-watchdog.js','utf8');
const dash=await readFile('public/student-dashboard-v2.js','utf8');
const css=await readFile('public/student-dashboard-v2.css','utf8');
const portalLayout=await readFile('public/portal-layout.js','utf8');
const advanced=await readFile('src/core/public-advanced.ts','utf8');
const brandingSchema=await readFile('src/core/branding-schema.ts','utf8');
const index=await readFile('src/index.ts','utf8');

assert.match(html,/\/portal-load-watchdog\.js\?v=20260822-student-hotfix-\d+/,'student portal must have a visible long-load watchdog');
assert.match(html,/\/portal-entry\.js\?v=20260822-student-hotfix-\d+/,'student portal must start through its lean entrypoint');
assert.match(html,/\/portal-lazy-runtime\.js\?v=20260822-student-hotfix-\d+/,'student portal must defer secondary features to the lazy runtime');
assert.match(html,/rel="modulepreload" href="\/class-portal\.js\?v=20260822-student-hotfix-\d+"/,'student portal must start downloading its critical core module during HTML parsing');
assert.ok(!html.includes('/portal-performance.js'),'student portal must not monkey-patch fetch or prewarm overview requests during parsing');
assert.ok(!html.includes('src="/class-portal.js'),'base class portal must be launched asynchronously by the lean entrypoint');
for(const heavy of ['student-dashboard-v2.js','portal-assignments-ui.js','portal-teams-ui.js','portal-report-book-ui.js','participant-moat-ui.js','pwa-client.js'])assert.ok(!html.includes(`src="/${heavy}`),`heavy student module must stay out of first paint: ${heavy}`);
for(const blockingCss of ['role-dashboard.css','role-dashboard-polish.css','student-dashboard-v2.css','lesson-hub.css','integrated-workspace.css','learning-mode-badges.css'])assert.ok(!html.includes(`rel="stylesheet" href="/${blockingCss}`),`feature stylesheet must not block student first paint: ${blockingCss}`);

assert.match(entry,/import\(`\/class-portal\.js\?v=\$\{VERSION\}`\)/,'entrypoint must launch the existing privacy-safe base portal');
assert.match(entry,/__KP_PORTAL_BASE_PROMISE/,'entrypoint must expose base readiness without blocking the document runtime');
assert.match(entry,/kp:portal-base-ready/,'entrypoint must publish explicit base readiness');
assert.match(entry,/kp:portal-base-failed/,'entrypoint must publish explicit base failure');
assert.match(watchdog,/12000/,'stalled portal loads must become visible instead of spinning forever');

for(const name of ['student-dashboard-v2','portal-assignments-ui','portal-teams-ui','portal-report-book-ui'])assert.ok(lazy.includes(`'${name}'`),`lazy student runtime must retain ${name}`);
assert.match(lazy,/CSS_BY_MODULE/,'feature styles must be loaded together with their feature instead of blocking first paint');
assert.match(lazy,/ensureStyle/,'lazy runtime must deduplicate deferred feature styles');
assert.match(lazy,/loadLocalization\(\)/,'generic localization must be installed through the observer-free portal adapter');
assert.match(lazy,/window\.MutationObserver=NoopObserver/,'student portal must suppress the generic localization subtree observer during installation');
assert.match(lazy,/finally\{window\.MutationObserver=Native;\}/,'native MutationObserver must be restored immediately after localization installation');
assert.match(lazy,/kp:portal-data/,'student portal translations must be refreshed from explicit portal events');
assert.ok(!lazy.includes("'owner-route-privacy'"),'student runtime must not reintroduce the global owner-route subtree observer');
assert.ok(!lazy.includes("'participant-moat-ui'"),'participant moat must not be imported twice with different cache-busting URLs');
assert.match(lazy,/if\(!data\)\{await Promise\.all\(\[loadLocalization\(\),loadList\(GATE_SUPPORT,2\)\]\);return;\}/,'login support must load only when the access gate is actually visible');
assert.match(lazy,/await idle\(700\);await loadList\(CORE_ENHANCERS,2\)/,'core visual enhancements must wait for a base idle opportunity and use bounded parallelism');
assert.match(lazy,/idle\(1400\);void loadOne\('student-dashboard-v2'\)/,'dashboard must wait until the base portal has had a longer idle paint opportunity');
assert.match(lazy,/SECTION_MODULES/,'student features must support interaction-first loading');
assert.match(lazy,/capture:true/,'section intent must be observed before navigation handlers run');
assert.match(lazy,/await pause\(15000\);await idle\(5000\)/,'nonessential features must stay away from the first fifteen seconds');
assert.match(lazy,/for\(const name of FEATURES\)/,'secondary features must drip-load instead of starting as one burst');
assert.match(lazy,/await idle\(1800\)/,'each background feature must wait for its own idle opportunity');
assert.match(lazy,/await pause\(document\.hidden\?1000:350\);await nextFrame\(\)/,'background feature loading must yield substantially between modules');
assert.match(lazy,/requestIdleCallback/,'secondary features must wait for idle time after the base portal is visible');
assert.match(lazy,/deferredGermanLocalization/,'default German localization work must be delayed off the critical path');
assert.match(lazy,/localStorage\.getItem\('kp_locale'\)/,'a previously selected non-German locale must still be honored immediately');
assert.match(lazy,/bootPromise/,'student lazy runtime must suppress duplicate boot attempts');
assert.doesNotMatch(lazy,/new MutationObserver/,'student lazy runtime must remain event-driven');
assert.doesNotMatch(lazy,/window\.fetch\s*=/,'student lazy runtime must never replace global fetch');

assert.match(portalLayout,/window\.__KP_PORTAL_DATA/,'personal layout must consume the already-resolved portal payload');
assert.doesNotMatch(portalLayout,/\/api\/auth\/me/,'personal layout must not add a duplicate authentication request on startup');
assert.doesNotMatch(portalLayout,/\/public\/.*\/overview/,'personal layout must never refetch the heavy student overview');
assert.doesNotMatch(portalLayout,/MutationObserver/,'personal layout must be event-driven rather than DOM-observer driven');
assert.match(portalLayout,/kp:portal-module-loaded/,'personal layout must enhance lazily inserted sections through explicit module events');

assert.match(index,/if\(!releaseGateBypass\(url\.pathname\)\)\{const release=await productionReleaseAccess/,'static assets and explicit release-bypass routes must not pay the production-release lookup cost');
assert.match(index,/\[base,advanced\]=await Promise\.all\(\[publicOverview\([\s\S]*?publicAdvancedBySlug\(/,'base and advanced student overview work must execute in parallel instead of serially');

assert.doesNotMatch(advanced,/ensureAdvancedModuleSchema/,'public student overview must never run schema creation/repair on a read request');
assert.doesNotMatch(advanced,/ensureCalendarFeedsForTenant/,'public student overview must never create calendar feeds while loading');
assert.match(advanced,/feature_key IN \('substitution_updates','surveys','microsoft_365'\)/,'advanced feature flags must be read in one query');
assert.match(advanced,/Promise\.all\(\[substitutionsPromise,surveysPromise,feedPromise\]\)/,'advanced student data must load in parallel');
assert.match(advanced,/o\.survey_id IN \(\$\{marks\(ids\.length\)\}\)/,'survey options must be batched instead of queried once per survey');
assert.match(brandingSchema,/let ensured:Promise<void>\|null=null/,'branding schema readiness must be cached per worker isolate');
assert.match(brandingSchema,/if\(ensured\)return ensured/,'ready branding schema must not run PRAGMA checks on every portal request');
// Vorher stand hier: schreibe nur, wenn die Reparatur wirklich noetig war. Die Schreibung ist
// inzwischen ganz entfallen - sie lief als UPDATE ohne tenant_id ueber alle Mandanten, ausgeloest
// aus Lesepfaden, und dieselbe Normalisierung steht in Migration 0042_branding_palette.sql.
// Die Zusicherung wird dadurch strenger, nicht schwaecher: gar keine Schreibung statt einer
// bedingten. Laufzeitnachweis dazu in tests/schema-repair-boundary.mjs.
assert.doesNotMatch(brandingSchema,/UPDATE tenant_settings/,'branding schema repair must not write tenant data on a read request at all');

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

console.log('Student portal critical path, deferred CSS, interaction-first enhancements, parallel overview and request-storm guards: OK');
