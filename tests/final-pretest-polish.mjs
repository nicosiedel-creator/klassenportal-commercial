import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';

const read=path=>readFile(path,'utf8');
const [boot,i18n,customerUi,customerLazy,moat,preparation,enterprise,enterpriseUx,serviceWorker,pwa,customer,student,teacher,department,departmentAdmin,router,index,intent,migration,planningUi]=await Promise.all([
  read('public/boot.js'),read('public/localization.js'),read('public/customer-admin-ui.js'),read('public/customer-admin-lazy-modules.js'),read('public/customer-moat-ui.js'),read('public/setup-preparation-ui.js'),read('public/customer-enterprise.css'),read('public/customer-enterprise-ux.js'),read('public/service-worker.js'),read('public/pwa-client.js'),read('public/customer-admin.html'),read('public/class-portal.html'),read('public/dozentenportal.html'),read('public/department-lead.html'),read('public/department-lead-admin-ui.js'),read('src/core/router.ts'),read('src/index.ts'),read('src/core/education-intent.ts'),read('migrations/0086_planning_resource_subtypes.sql'),read('public/planning-resource-ui.js')
]);
const missing=async path=>{try{await access(path);return false;}catch{return true;}};

// Stable boot and no duplicate authentication request after boot has already resolved it.
assert.doesNotMatch(boot,/app\.js\?v=\$\{Date\.now\(\)\}/,'app shell must not defeat browser caching with timestamp URLs');
assert.match(boot,/APP_ASSET_VERSION/,'app shell must use a stable deployment asset key');
assert.match(boot,/window\.__KP_BOOT_USER/,'boot must hand the resolved session to app.js instead of forcing a second auth roundtrip');

// Shared localization remains complete, but the customer admin is event-driven instead of globally observing every mutation.
for(const locale of ['de','en','fr','es','it','nl','pl','tr','uk','ro','cs','pt','ar']) assert.ok(i18n.includes(`${locale}:`)||i18n.includes(`${locale}:'`)||i18n.includes(`${locale}:"`),`missing locale ${locale}`);
assert.match(i18n,/localStorage\.setItem\(STORAGE_KEY/,'selected locale must persist');
assert.match(i18n,/document\.documentElement\.dir=RTL\.has\(locale\)/,'RTL locale support must set document direction');
assert.match(i18n,/if\(CUSTOMER_PATH\)[\s\S]*kp:customer-view-changed/,'customer localization must be driven by customer render events');
assert.match(i18n,/else\{[\s\S]*new MutationObserver/,'non-customer portals may retain their bounded added-node localization observer');
assert.match(i18n,/window\.KP_I18N/,'localization API must remain shared');

for(const html of [customer,student,teacher,department])assert.match(html,/localization\.js/,'all role portals must load the shared locale layer');

// Customer-admin initial payload: only shell-critical assets. Heavy features are on-demand.
assert.match(customer,/customer-admin-lazy-modules\.js/,'customer admin must load the tiny lazy-module controller');
assert.doesNotMatch(customer,/src="\/customer-moat-ui\.js/,'work assistant implementation must not be eager-loaded');
assert.doesNotMatch(customer,/src="\/(?:education-os|planning-resource-ui|enterprise-admin-ui|teams-management-ui|materials-admin-ui)\.js/,'heavy customer modules must stay out of the initial critical path');
assert.doesNotMatch(customer,/role-dashboard(?:-polish)?\.css/,'role/student CSS must never be part of the customer-admin shell');
assert.doesNotMatch(customer,/customer-support-mode\.js/,'the removed fetch-monkey-patch support shim must never return to the shell');
const initialScripts=[...customer.matchAll(/<script\b[^>]*\bsrc=/g)].length;
assert.ok(initialScripts<=12,`customer-admin critical path regressed to ${initialScripts} script files`);

// Lazy loading is bounded, deduplicated and cannot reintroduce the old sticky customer navigation CSS.
assert.match(customerLazy,/groupPromises=new Map/,'parallel clicks must share one group load promise');
assert.match(customerLazy,/Array\.from\(\{length:2\}/,'customer lazy imports must use bounded concurrency');
assert.match(customerLazy,/customer-moat-ui/,'work assistant must remain available through on-demand loading');
assert.doesNotMatch(customerLazy,/role-dashboard(?:-polish)?\.css/,'lazy learning features must not load CSS that overrides the customer shell');
assert.doesNotMatch(customerLazy,/for\(const group of .*\)await loadGroup/,'all feature groups must never be serially preloaded');

// The customer DOM hooks are bounded to shell replacement/events. No full-subtree feedback observer is allowed on the initial runtime.
assert.match(customerUi,/const appRoot=document\.querySelector\('#app'\)/,'customer UI must scope itself to the app shell');
assert.doesNotMatch(customerUi,/observe\([^)]*,\{[^}]*subtree\s*:\s*true/,'customer shell observer must never watch the complete subtree');
assert.match(customerUi,/kp:customer-view-changed/,'customer shell must publish deterministic render events');
assert.match(preparation,/if\(ONBOARDING_PATH\)[\s\S]*new MutationObserver/,'standalone onboarding may retain its narrow direct-child observer');
const customerSetupBranch=preparation.slice(preparation.lastIndexOf('if(CUSTOMER_PATH){'));
assert.match(customerSetupBranch,/kp:customer-view-changed/,'customer setup checklist must be event-driven');
assert.doesNotMatch(customerSetupBranch,/MutationObserver/,'customer setup branch must not install a mutation observer');
assert.ok(await missing('public/customer-support-mode.js'),'obsolete customer support fetch shim must stay deleted');
assert.ok(await missing('public/planning-resource-suggestion-fix.js'),'obsolete planning DOM patch must stay deleted');

// Completed setup is terminal and becomes the compact operations hub.
assert.match(customerUi,/Planung & Daten/,'completed setup must become the operational planning/data area');
assert.match(customerUi,/showOperationsHub/,'active customer UI must own the completed-setup transition');
assert.match(customerUi,/requiredReady/,'active customer UI must recognize a ready self-service setup');
assert.match(preparation,/customerSetupReady/,'setup preparation must understand completed customer state');
assert.match(preparation,/content\.querySelector\('#kp-setup-preparation'\)\?\.remove\(\)/,'completed setup must remove stale preparation cards');

// Final enterprise navigation stays a real desktop left rail and contains no expensive sticky blur.
assert.match(enterprise,/grid-template-columns:260px minmax\(0,1fr\)!important/,'desktop customer admin must keep a stable left operations rail');
assert.match(enterprise,/\.customer-portal-admin \.side\{position:static!important/,'customer side rail must remain in normal grid flow');
assert.match(enterprise,/backdrop-filter:none!important/,'customer navigation must not run a sticky blur layer');

// PWA upkeep is deferred and must not smuggle the assistant back into initial startup.
assert.match(pwa,/requestIdleCallback/,'non-critical PWA/user work must be deferred');
assert.match(pwa,/updateViaCache:'none'/,'service-worker update checks must bypass stale HTTP cache state');
assert.doesNotMatch(pwa,/customer-moat-ui/,'PWA client must not eager-load the customer assistant');
assert.match(serviceWorker,/destination==='script'\|\|destination==='style'/,'scripts and styles must use deployment-safe network revalidation');
assert.match(serviceWorker,/cache:'no-cache'/,'deployment-critical scripts/styles must revalidate');

// Scoped Education-OS humanization only; never a document-wide customer mutation loop.
assert.doesNotMatch(enterpriseUx,/observe\(document\.(?:body|documentElement)/,'enterprise UX must not observe the whole customer document');
assert.match(enterpriseUx,/requestAnimationFrame/,'intent rendering must be frame-coalesced');
assert.doesNotMatch(enterpriseUx,/n\.textContent=n\.textContent\.replace/,'unconditional intent text rewrites must not return');

// Work assistant is human-readable, localizable and support-safe.
assert.match(moat,/Education & Training OS/,'assistant must retain the Education OS product identity');
assert.match(moat,/t\('assistant','Arbeitsassistent'\)/,'assistant title must use the shared localization layer with the final German fallback');
assert.match(moat,/supportPlatformAdmin/,'assistant must recognize platform support projection');
assert.match(moat,/Plattform-Supportansicht · nur lesend/,'support assistant must be read-only');
assert.doesNotMatch(moat,/JSON\.stringify\(s\.integrations,null,2\)/,'integrations must not be dumped as raw JSON');
assert.doesNotMatch(moat,/JSON\.stringify\(d\.preview,null,2\)/,'intent result must not be dumped as raw JSON');
assert.match(index,/SUPPORT_READ_ONLY/,'server must independently block platform-support writes');
assert.match(index,/blockPlatformSupportWrite/,'support write block must run before API routing');
assert.match(router,/supportPlatformAdmin:true/,'auth projection must explicitly mark platform support mode');

// Stable API contracts restored after the performance refactor.
assert.match(router,/\/api\\\/materials\\\/\(\[\^\/\]\+\)\\\/download/,'material download compatibility route must remain');
assert.match(router,/material:await uploadLearningMaterial/,'material create response must keep its material envelope');
assert.match(router,/material:await updateLearningMaterial/,'material update response must keep its material envelope');
assert.match(router,/membership:await updateTenantMembership/,'membership update response must keep its membership envelope');
assert.match(router,/u\.pathname==='\/api\/personal\/grades'/,'personal grade API compatibility path must remain');
assert.doesNotMatch(router,/\/api\\\/exams\\\/\(\[\^\/\]\+\)\\\/grades/,'exam id must never be misused as a course id for personal-grade persistence');
assert.match(router,/return json\(\{ok:false,error:'NOT_FOUND'\},404\)/,'unknown core API routes must not fall through to static assets');

// Resource CRUD and natural-language planning contract.
for(const subtype of ['teaching_room','computer_room','exam_room','meeting_room','workshop','lab','event_space','office','storage','outdoor','other'])assert.ok(migration.includes(`'${subtype}'`),`missing planning resource subtype ${subtype}`);
for(const label of ['Unterrichtsraum','EDV-/PC-Raum','Prüfungsraum','Besprechungsraum','Labor','Veranstaltungsraum','Büro','Lager','Außenfläche','Sonstiges'])assert.ok(planningUi.includes(label),`missing controlled resource label ${label}`);
assert.match(planningUi,/Praxisraum\s*\/\s*Werkstatt/,'controlled workshop resource label must remain human-readable');
assert.match(intent,/function datePeriod/,'education intent must retain a dedicated date-period parser');
assert.match(intent,/until=n\.match\(new RegExp/,'date-period parser must resolve an explicit range end');
assert.match(intent,/datePeriod\(intent,tz\)/,'intent preview must actually consume the parsed date period');
assert.match(intent,/resource_label|teacher_label|course_label/,'resolved intent entities must expose human-readable labels');

assert.match(departmentAdmin,/\/department-lead\.html\?tenant_id=/,'department lead assignment must generate the real portal URL');
assert.doesNotMatch(departmentAdmin,/\/fachbereichsleitung\.html\?tenant_id=/,'stale department portal path must not be emitted');

console.log('Final pre-test zero-defect customer runtime, API compatibility, performance and routing checks: OK');
