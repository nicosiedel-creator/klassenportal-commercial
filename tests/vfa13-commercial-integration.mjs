import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const html=await readFile('public/class-portal.html','utf8');
const runtime=await readFile('public/portal-lazy-runtime.js','utf8');
const entry=await readFile('public/portal-entry.js','utf8');
const base=await readFile('public/class-portal.js','utf8');
const dashboard=await readFile('public/student-dashboard-v2.js','utf8');

assert.match(html,/kp-vfa13-commercial-module-manifest/,'VFA13 must expose the commercial module contract');
assert.match(html,/data-public-safe="portal-calendar-lookback portal-advanced-ui lesson-hub-ui legal-footer-ui"/,'VFA13 must explicitly declare its public-safe commercial modules');
assert.match(html,/data-authenticated-only=/,'VFA13 must explicitly separate personal/authenticated commercial modules');
assert.doesNotMatch(html,/src="\/portal-attendance-ui\.js/,'personal attendance UI must never be eager on the public VFA13 portal');
assert.doesNotMatch(html,/src="\/portal-assignments-ui\.js/,'personal assignment/submission UI must never be eager on the public VFA13 portal');
assert.doesNotMatch(html,/src="\/portal-report-book-ui\.js/,'personal report book UI must never be eager on the public VFA13 portal');
assert.doesNotMatch(html,/src="\/portal-signature-inbox-ui\.js/,'signature inbox must never be eager on the public VFA13 portal');
assert.match(html,/student-dashboard-v2/,'commercial dashboard v2 must be available in VFA13');
assert.match(entry,/20260823-vfa13-commercial-1/,'VFA13 entrypoint must use its own cache namespace');
assert.match(base,/window\.__KP_PORTAL_DATA=d/,'VFA13 base portal must publish resolved portal data once for commercial enhancements');
assert.match(base,/kp:portal-data/,'VFA13 base portal must use explicit data events');
assert.match(runtime,/PUBLIC_FEATURES/,'VFA13 runtime must have a public-safe feature allowlist');
assert.match(runtime,/AUTH_FEATURES/,'VFA13 runtime must isolate authenticated features');
assert.match(runtime,/authenticated\(\)\?\[\.\.\.PUBLIC_FEATURES,\.\.\.AUTH_FEATURES\]:PUBLIC_FEATURES/,'public VFA13 sessions must never background-load personal modules');
assert.match(runtime,/student-dashboard-v2/,'commercial dashboard must lazy-load after the VFA13 base portal is visible');
assert.match(runtime,/await pause\(12000\)/,'secondary VFA13 features must stay off the critical path');
assert.doesNotMatch(runtime,/window\.fetch\s*=/,'VFA13 runtime must never monkey-patch global fetch');
assert.match(dashboard,/if\(assignmentBusy\|\|!\['participant','class_admin'\]\.includes\(data\.viewer\?\.role\)/,'commercial dashboard must not request personal assignment state for public VFA13 viewers');

console.log('VFA13 commercial dashboard, lazy loading and public/privacy isolation checks: OK');
