import {strict as assert} from 'node:assert';
import {readFile,readdir} from 'node:fs/promises';
const text=p=>readFile(p,'utf8');
const [portalHtml,classHtml,customerHtml,refCss,refJs,privacy,index]=await Promise.all([
  text('public/class-portal.html'),text('public/class-admin.html'),text('public/customer-admin.html'),text('public/vfa13-refinement.css'),text('public/vfa13-refinement.js'),text('public/owner-route-privacy.js'),text('src/index.ts')
]);
for(const required of ['/vfa13-refinement.css','/vfa13-refinement.js','/owner-route-privacy.js'])assert.ok(portalHtml.includes(required),`participant portal missing ${required}`);
for(const required of ['/vfa13-refinement.css','/vfa13-refinement.js','/owner-route-privacy.js'])assert.ok(classHtml.includes(required),`class area missing ${required}`);
assert.ok(customerHtml.includes('/owner-route-privacy.js'),'customer admin must hide owner-route references');
assert.ok(refCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),'desktop portal must use a balanced three-column dashboard');
assert.ok(refCss.includes('.portal-layout-controls{display:none!important}'),'tile movement controls must be hidden outside edit mode');
assert.ok(refCss.includes('.portal-layout-editing .portal-layout-controls{display:flex!important}'),'tile movement controls must remain available in edit mode');
assert.ok(refJs.includes("button.textContent='Kacheln anpassen'")&&refJs.includes("button.textContent=editing?'Fertig':'Kacheln anpassen'"),'tile editing must use one explicit mode button');
assert.ok(refJs.includes("if(!user||user.isPlatformAdmin)return null"),'owner must not receive a portal management link');
assert.ok(refJs.includes("label:'Kundenbereich'")&&refJs.includes("label:'Klassenbereich'"),'non-owner admin links must be role-specific');
assert.ok(privacy.includes('a[href^="/plattform-admin"]'),'non-owner surfaces must actively remove owner-route anchors');
assert.ok(index.includes("if(clean==='/plattform-admin')")&&index.includes("if(!session?.isPlatformAdmin)return new Response('Nicht gefunden'"),'owner route must remain server-side gated');
const publicFiles=(await readdir('public')).filter(x=>/\.(?:html|js)$/.test(x)&&!['platform-admin.html','platform-admin-ui.js','platform-owner-ui.js','owner-security-ui.js','launch-readiness-ui.js','auth-mfa-ui.js','owner-route-privacy.js'].includes(x));
for(const file of publicFiles){const source=await text(`public/${file}`);assert.ok(!/href\s*=\s*["']\/plattform-admin(?:[?\/"'])/i.test(source),`visible owner-route link found in public/${file}`);}
console.log('Portal UX/privacy checks: OK');
