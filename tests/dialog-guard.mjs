import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';

const css=await readFile('public/admin-overlay-hardening.css','utf8');
const js=await readFile('public/kp-dialog-guard.js','utf8');
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

// Jedes Verwaltungsmodul baut seine Dialoge selbst. Der gemeinsame Wächter ist der einzige Ort,
// an dem Dialogsemantik, Tastaturbedienung und Fokus für alle gleichzeitig gelten - er darf nicht
// stillschweigend auf das Umhängen von Overlays zurückfallen.
assert.match(js,/setAttribute\('role','dialog'\)/,'overlay guard must expose every admin overlay as a dialog');
assert.match(js,/setAttribute\('aria-modal','true'\)/,'overlay guard must expose every admin overlay as modal');
assert.match(js,/aria-labelledby.*aria-label|aria-label.*aria-labelledby/s,'overlay guard must give every dialog an accessible name');
assert.match(js,/setAttribute\('aria-label','Schließen'\)/,'a close control that reads only as a symbol must get a spoken name');
assert.match(js,/key!=='Escape'/,'overlay guard must handle Escape');
assert.match(js,/hasUnsavedInput/,'Escape must not discard typed input without asking');
assert.match(js,/event\.isTrusted/,'only real keystrokes may count as unsaved input, never values a module seeded');
assert.match(js,/\bel\.inert=true\b/,'content behind the dialog must leave the tab order and the accessibility tree');
assert.match(js,/\bel\.inert=false\b/,'the page behind the dialog must become reachable again after closing');
assert.match(js,/role="status"|role=\\"status\\"/,'status and error messages must stay reachable while a dialog is open');
assert.match(js,/focus\(\{preventScroll:true\}\)/,'focus must move into the dialog and back to its opener');
assert.match(js,/event\.key==='Tab'/,'the tab order must be closed inside the dialog; inert alone lets Tab leave the document');
assert.match(js,/event\.shiftKey/,'the focus trap must wrap in both directions');
assert.doesNotMatch(js,/\bnavigator\b|\bfetch\(/,'the overlay guard must stay a pure DOM guard');

// Meldungen dürfen nicht hinter der Abdunklung des Dialogs verschwinden.
const backdropZ=Number(css.match(/z-index:(\d+)!important/)?.[1]||0);
const noticeZ=Number(css.match(/\.eo-os-note\{z-index:(\d+)!important\}/)?.[1]||0);
assert.ok(backdropZ>0&&noticeZ>backdropZ,`status messages must render above the dialog backdrop (${noticeZ} vs ${backdropZ})`);
for(const selector of ['body > [role="status"]','body > [role="alert"]','body > [aria-live]'])
  assert.ok(css.includes(selector),`overlay hardening must lift ${selector} above the backdrop`);

// Ein Navigationseintrag, der nichts öffnet, ist eine Sackgasse.
const platformLazy=await readFile('public/platform-admin-lazy-modules.js','utf8');
const configBlock=platformLazy.slice(platformLazy.indexOf('const CONFIG={'),platformLazy.indexOf('const loaded='));
assert.doesNotMatch(configBlock,/target:null/,'every platform launcher must lead to a surface the user can actually reach');
for(const target of configBlock.matchAll(/target:'#([\w-]+)'/g))
  assert.ok(platformLazy.includes(`#${target[1]}`),`platform launcher target #${target[1]} must be addressable`);
assert.match(platformLazy,/const keyboard=document\.activeElement===b/,'a launcher that replaces itself must not drop keyboard focus');

// Das Layout-Stylesheet gehört den Verwaltungsoberflächen; der Wächter gilt überall dort, wo
// Module eigene Dialoge bauen. Das Dozentenportal bekommt deshalb den Wächter ohne das Layout,
// damit sein Erscheinungsbild unverändert bleibt.
for(const file of ['public/customer-admin.html','public/platform-admin.html']){
  const html=await readFile(file,'utf8');
  const base=html.lastIndexOf('/styles.css'),hardening=html.indexOf('/admin-overlay-hardening.css?v=');
  assert.ok(hardening>=0,`${file} must load viewport overlay hardening`);
  assert.ok(hardening>base,`${file} must load overlay hardening after its normal stylesheet stack`);
}
for(const file of ['public/customer-admin.html','public/platform-admin.html','public/dozentenportal.html',
                   'public/department-lead.html','public/index.html']){
  const html=await readFile(file,'utf8');
  assert.match(html,/\/kp-dialog-guard\.js\?v=[\w.-]+/,`${file} must load the shared dialog guard behind a cache-busting version`);
}

// Und die Regel gilt allgemein: Wer Dialoge baut, braucht den Wächter. Zwei Ausnahmen, beide
// begründet - VFA13 ist eine getrennte Linie und bleibt unberührt, und class-portal.html lädt
// vfa13-refinement.js, gehört also zu dieser Linie. Wächst diese Liste, fällt es hier auf.
const guardExempt=new Set(['class-portal.html','vfa-study-entry.html','vfa-study-presenter.html','vfa-study-quiz.html']);
const unguarded=[];
for(const shell of (await readdir('public')).filter(f=>f.endsWith('.html'))){
  if(guardExempt.has(shell))continue;
  const html=await readFile(`public/${shell}`,'utf8');
  if(/kp-dialog-guard\.js/.test(html))continue;
  const scripts=[...new Set((html.match(/\/[a-z0-9-]+\.js/g)||[]).map(x=>x.slice(1)))];
  for(const file of scripts){
    let source='';try{source=await readFile(`public/${file}`,'utf8');}catch{continue;}
    if(/['"`](?:modal-back|class-admin-modal-back|kp-modal-back)/.test(source)){unguarded.push(`${shell} baut Dialoge in ${file}`);break;}
  }
}
assert.deepEqual(unguarded,[],`diese Oberflächen bauen Dialoge ohne den gemeinsamen Wächter:\n${unguarded.join('\n')}`);
const classPortal=await readFile('public/class-portal.html','utf8');
assert.match(classPortal,/vfa13-refinement\.js/,'the class portal exemption only holds while it is part of the VFA13 line');
const teacher=await readFile('public/dozentenportal.html','utf8');
assert.doesNotMatch(teacher,/admin-overlay-hardening\.css/,'the teacher portal must not inherit the administration dialog layout');
// Der Wächter darf kein Aussehen mitbringen, sonst wäre er in keiner fremden Shell sicher.
assert.doesNotMatch(js,/\.style\.|cssText|document\.createElement\('style'\)/,'the dialog guard must not carry styling of its own');
const classAdmin=await readFile('public/class-admin.html','utf8');
assert.match(classAdmin,/class-admin-entry\.js/,'class admin must be a student-portal entry, not an admin workspace');
assert.doesNotMatch(classAdmin,/kp-dialog-guard\.js|admin-overlay-hardening\.(?:js|css)|class-admin-portal\.js/,'class admin entry must not load the old admin workspace stack');
console.log('Dialog guard is shared, style-free and loaded by every surface that builds dialogs; class admin remains a student-portal entry: OK');
