import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const eventDriven=[
  'public/customer-admin-ui.js',
  'public/customer-nav-dropdown.js',
  'public/customer-admin-i18n.js',
  'public/customer-admin-lazy-modules.js',
  'public/platform-admin-ui.js',
  'public/platform-admin-i18n.js',
  'public/platform-admin-lazy-modules.js',
  'public/platform-owner-ui.js',
  'public/platform-offers-ui.js',
  'public/legal-owner-ui.js',
  'public/launch-readiness-ui.js',
  'public/owner-security-ui.js',
  'public/platform-accounting-ui.js',
  'public/platform-accounting-autopilot-ui.js',
  'public/custom-domain-ui.js',
  'public/portal-report-book-ui.js'
];

for(const file of eventDriven){
  const src=await readFile(file,'utf8');
  assert.doesNotMatch(src,/\bMutationObserver\b/,`${file} must be driven by explicit application events, not DOM mutation observation`);
}

const scopedPortal=[
  'public/portal-compact.js',
  'public/vfa13-refinement.js',
  'public/portal-learning-mode-ui.js',
  'public/lesson-hub-ui.js'
];
for(const file of scopedPortal){
  const src=await readFile(file,'utf8');
  assert.doesNotMatch(src,/observe\(document\.(?:body|documentElement)/,`${file} must never observe the entire document`);
  assert.doesNotMatch(src,/observe\(document\.querySelector\('#app'\)/,`${file} must never observe the admin application root`);
}

console.log('Critical runtime observer audit: OK');
