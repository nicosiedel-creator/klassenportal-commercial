import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const css=await readFile('public/admin-overlay-hardening.css','utf8');
for(const selector of ['.modal-back','.class-admin-modal-back','.kp-modal-back'])assert.ok(css.includes(selector),`overlay hardening missing ${selector}`);
assert.match(css,/z-index:1000!important/,'admin dialogs must stack above navigation and page chrome');
assert.match(css,/max-height:calc\(100dvh - 32px\)/,'desktop dialogs must remain inside the dynamic viewport');
assert.match(css,/overflow:auto/,'large dialogs must remain scrollable');
assert.match(css,/overscroll-behavior:contain/,'dialog scrolling must not leak into the page');
assert.match(css,/@media\(max-width:680px\)/,'small-screen overlay behavior must be explicit');
assert.match(css,/grid-template-columns:1fr!important/,'modal form rows must collapse to one column on small screens');

for(const file of ['public/customer-admin.html','public/class-admin.html','public/platform-admin.html']){
  const html=await readFile(file,'utf8');
  assert.ok(html.includes('/admin-overlay-hardening.css?v=20260818-1'),`${file} must load overlay hardening after its main styles`);
}
console.log('Admin overlay stacking, scrolling and mobile viewport checks: OK');
