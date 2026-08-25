import {strict as assert} from 'node:assert';
import {readFile,readdir} from 'node:fs/promises';
const text=p=>readFile(p,'utf8');
const [portalHtml,classHtml,customerHtml,platformHtml,directLogin,refCss,refJs,index]=await Promise.all([
  text('public/class-portal.html'),text('public/class-admin.html'),text('public/customer-admin.html'),text('public/platform-admin.html'),text('public/platform-direct-login.js'),text('public/vfa13-refinement.css'),text('public/vfa13-refinement.js'),text('src/index.ts')
]);
for(const required of ['/vfa13-refinement.css','/vfa13-refinement.js'])assert.ok(portalHtml.includes(required),`participant portal missing ${required}`);
assert.ok(!portalHtml.includes('/owner-route-privacy.js'),'participant portal must not reintroduce the global owner-route observer');
assert.ok(!/href\s*=\s*["']\/plattform-admin(?:[?\/"'])/i.test(portalHtml),'participant portal must not expose an owner route');
assert.ok(portalHtml.includes('/class-admin-student-tools.js'),'class admin extras must be layered into the normal participant portal');
assert.ok(classHtml.includes('/class-admin-entry.js'),'class admin route must only provide an entry into the participant portal');
for(const forbidden of ['/class-admin-portal.js','/attendance-classbook-ui.js','/assignment-gradebook-ui.js','/participant-360-ui.js'])assert.ok(!classHtml.includes(forbidden),`class admin entry must not load legacy admin module ${forbidden}`);
assert.ok(customerHtml.includes('a[href^="/plattform-admin"]')&&customerHtml.includes('display:none!important'),'customer admin must hide owner-route references without a global DOM observer');
assert.ok(!/href\s*=\s*["']\/plattform-admin(?:[?\/"'])/i.test(customerHtml),'customer admin must not expose an owner route');
assert.ok(refCss.includes('grid-template-columns:repeat(3,minmax(0,1fr))'),'desktop portal must use a balanced three-column dashboard');
assert.ok(refCss.includes('.portal-layout-controls{display:none!important}'),'tile movement controls must be hidden outside edit mode');
assert.ok(refCss.includes('.portal-layout-editing .portal-layout-controls{display:flex!important}'),'tile movement controls must remain available in edit mode');
assert.ok(refCss.includes('.portal-header-actions>a.portal-btn.secondary{visibility:hidden!important}')&&refCss.includes('[data-role-link="1"]{visibility:visible!important}'),'management link must stay hidden until a non-owner role is resolved');
assert.ok(refJs.includes("button.textContent='Kacheln anpassen'")&&refJs.includes("button.textContent=editing?'Fertig':'Kacheln anpassen'"),'tile editing must use one explicit mode button');
assert.ok(refJs.includes("return role==='tenant_admin'?")&&!refJs.includes("['tenant_admin','platform_admin']"),'owner must not receive a portal management link');
assert.ok(refJs.includes("management.dataset.roleLink='1'")&&refJs.includes("label:'Kundenbereich'"),'only the tenant-admin management destination may be revealed');
assert.ok(!refJs.includes("label:'Klassenbereich'"),'class admins must remain in the same student portal instead of receiving a separate management destination');
assert.ok(index.includes("['/plattform-admin','/kunden-admin','/klassen-admin'].includes(clean)")&&index.includes("'/platform-admin.html'"),'platform admin route must serve only the dedicated login/admin shell');
assert.ok(platformHtml.includes('/platform-direct-login.js')&&!platformHtml.includes('/boot.js'),'platform admin HTML must start with the isolated direct-login controller instead of the generic app');
assert.ok(directLogin.includes("if(user?.isPlatformAdmin)await loadPlatform()")&&directLogin.includes("if(!d?.user?.isPlatformAdmin)")&&directLogin.includes("await logout()"),'direct platform login must verify the platform role before loading owner modules and log out non-owner accounts');
const publicFiles=(await readdir('public')).filter(x=>/\.(?:html|js)$/.test(x)&&!['platform-admin.html','platform-direct-login.js','platform-admin-ui.js','platform-owner-ui.js','owner-security-ui.js','launch-readiness-ui.js','owner-route-privacy.js'].includes(x));
for(const file of publicFiles){const source=await text(`public/${file}`);assert.ok(!/href\s*=\s*["']\/plattform-admin(?:[?\/"'])/i.test(source),`visible owner-route link found in public/${file}`);}
console.log('Portal UX/privacy checks for student class admins: OK');
