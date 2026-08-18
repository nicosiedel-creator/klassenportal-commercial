import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const css=await readFile('public/admin-overlay-hardening.css','utf8');
const js=await readFile('public/admin-overlay-hardening.js','utf8');
for(const selector of ['.modal-back','.class-admin-modal-back','.kp-modal-back'])assert.ok(css.includes(selector),`overlay hardening missing ${selector}`);
assert.match(css,/position:fixed!important/,'backdrops must be viewport-fixed');
assert.match(css,/inset:0!important/,'backdrops must cover the entire viewport');
assert.match(css,/height:100dvh!important/,'backdrops must use the dynamic viewport height');
assert.match(css,/z-index:2147483000!important/,'backdrops must stack above all admin navigation');
assert.match(css,/body\.kp-admin-modal-open\{overflow:hidden!important\}/,'background page scrolling must stop while a dialog is open');
assert.match(css,/max-height:calc\(100dvh - 32px\)!important/,'desktop dialogs must remain inside the dynamic viewport');
assert.match(css,/overscroll-behavior:contain!important/,'dialog scrolling must not leak into the page');
assert.match(css,/@media\(max-width:680px\)/,'small-screen overlay behavior must be explicit');
assert.match(css,/grid-template-columns:1fr!important/,'modal form rows must collapse to one column on small screens');
assert.match(js,/MutationObserver/,'overlay guard must watch dynamically created dialogs');
assert.match(js,/el\.parentElement!==document\.body\)document\.body\.append\(el\)/,'nested backdrops must be reparented to document.body');
assert.match(js,/kp-admin-modal-open/,'overlay guard must maintain the body modal-open state');

for(const file of ['public/customer-admin.html','public/class-admin.html','public/platform-admin.html']){
  const html=await readFile(file,'utf8');
  const base=html.lastIndexOf('/styles.css'),hardening=html.indexOf('/admin-overlay-hardening.css?v=20260818-2'),guard=html.indexOf('/admin-overlay-hardening.js?v=20260818-2');
  assert.ok(hardening>=0,`${file} must load viewport overlay hardening`);
  assert.ok(hardening>base,`${file} must load overlay hardening after its normal stylesheet stack`);
  assert.ok(guard>=0,`${file} must load the DOM overlay guard`);
}
console.log('Admin overlays cover the full viewport, escape stacking contexts, lock background scroll and stay mobile-safe: OK');
