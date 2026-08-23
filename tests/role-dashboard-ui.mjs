import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const [css,polish,student,studentV2Css,teacher,dropdown,classPortal,classAdmin,teacherHtml,customerAdmin,platformAdmin,teacherLazy,lazy,portalLazy]=await Promise.all([
  readFile('public/role-dashboard.css','utf8'),readFile('public/role-dashboard-polish.css','utf8'),readFile('public/student-dashboard-v2.js','utf8'),readFile('public/student-dashboard-v2.css','utf8'),readFile('public/teacher-dashboard-ui.js','utf8'),readFile('public/customer-nav-dropdown.js','utf8'),readFile('public/class-portal.html','utf8'),readFile('public/class-admin.html','utf8'),readFile('public/dozentenportal.html','utf8'),readFile('public/customer-admin.html','utf8'),readFile('public/platform-admin.html','utf8'),readFile('public/teacher-lazy-modules.js','utf8'),readFile('public/customer-admin-lazy-modules.js','utf8'),readFile('public/portal-lazy-runtime.js','utf8')
]);

assert.match(css,/\.kp-student-dashboard/,'shared role dashboard styling must exist');
assert.match(css,/#teacher-portal/,'teacher portal styling must exist');
assert.doesNotMatch(css,/\.platform-admin/,'role dashboard CSS must not target platform admin');
assert.match(student,/kp2-now/,'student dashboard v2 must include current/next lesson banner');
assert.match(student,/kp2-week-grid/,'student dashboard v2 must include weekly timetable');
assert.match(student,/safeHref/,'student dashboard links must be protocol-sanitized');
assert.match(student,/kp2-mosaic/,'student week, tasks and agenda must form one visual block');
assert.match(student,/taskCounts/,'weekly timetable must surface due-task counts');
assert.match(student,/enrichAssignments/,'personal assignment enrichment must remain available');
assert.match(student,/data-open-section/,'dashboard cards must declare navigation targets');
assert.match(student,/portal-compact-open/,'dashboard navigation must directly expand compact target sections');
assert.match(studentV2Css,/\.kp2-mosaic\{display:grid;grid-template-columns:minmax\(0,2\.15fr\) minmax\(300px,.85fr\)/,'desktop student dashboard must prioritize the weekly plan');
assert.match(studentV2Css,/@media\(max-width:980px\)/,'student dashboard must collapse for tablets');
assert.match(studentV2Css,/@media\(max-width:680px\)/,'student dashboard must collapse for phones');
assert.match(teacher,/teacher-main-card/,'teacher dashboard must classify its main working area');
assert.match(teacher,/teacher-wide-card/,'teacher attendance overview must use the shared dashboard layout');

assert.match(polish,/\.kp-now-count\{display:none!important\}/,'legacy shared countdown styling must stay harmless while v2 owns the active dashboard');
assert.match(polish,/\.kp-side-card\.is-clickable:hover/,'shared clickable side cards need visible hover feedback');
assert.match(polish,/:has\(#kp-push\) \.portal-footer/,'push actions must reserve footer space instead of covering content');
assert.doesNotMatch(polish,/\.platform-admin/,'readability polish must never target platform admin');
assert.match(dropdown,/closest\('#kp-customer-more-toggle'\)/,'dropdown toggle click must not immediately close itself');
assert.match(dropdown,/Escape/,'customer dropdown must close with Escape');
assert.doesNotMatch(dropdown,/MutationObserver/,'customer dropdown must not poll DOM mutations');

for(const blockingCss of ['role-dashboard.css','role-dashboard-polish.css','student-dashboard-v2.css'])assert.doesNotMatch(classPortal,new RegExp(`rel=["']stylesheet["'][^>]+${blockingCss.replaceAll('.','\\.')}`),`student first paint must not block on ${blockingCss}`);
assert.match(portalLazy,/'student-dashboard-v2':\['role-dashboard','role-dashboard-polish','student-dashboard-v2'\]/,'student dashboard must load all dashboard styles together with the deferred v2 module');
assert.doesNotMatch(classPortal,/src="\/student-dashboard-v2\.js/,'class portal must not block first paint on the v2 dashboard script');
assert.match(portalLazy,/student-dashboard-v2/,'class portal must retain active v2 dashboard through the lazy runtime');
assert.doesNotMatch(classPortal,/student-dashboard-ui\.js/,'class portal must not load old delayed student dashboard');
assert.match(classAdmin,/role-dashboard\.css/);
assert.match(classAdmin,/role-dashboard-polish\.css/);
assert.match(teacherHtml,/role-dashboard\.css/);
assert.match(teacherHtml,/role-dashboard-polish\.css/);
assert.match(teacherHtml,/teacher-lazy-modules\.js/,'teacher portal must load the bounded lazy module controller');
assert.match(teacherLazy,/teacher-dashboard-ui/,'teacher dashboard must remain available through the lazy controller');
assert.doesNotMatch(teacherHtml,/src="\/teacher-dashboard-ui\.js/,'teacher dashboard must not regress to eager loading');

// Customer admin owns a separate enterprise shell. Loading the shared role stylesheet
// there would reintroduce the historical sticky/top-navigation customer rules.
assert.doesNotMatch(customerAdmin,/role-dashboard(?:-polish)?\.css/,'customer admin must not load student/teacher role dashboard CSS');
assert.doesNotMatch(lazy,/role-dashboard(?:-polish)?\.css/,'customer lazy modules must not load role dashboard CSS later');
assert.match(customerAdmin,/customer-enterprise\.css/,'customer admin must use its dedicated enterprise shell');
assert.match(customerAdmin,/customer-nav-dropdown\.js/,'customer admin must keep its own accessible dropdown behavior');

assert.doesNotMatch(platformAdmin,/role-dashboard(?:-polish)?\.css/,'platform admin must remain visually untouched');
assert.doesNotMatch(platformAdmin,/student-dashboard(?:-v2|-ui)?|teacher-dashboard-ui|customer-nav-dropdown/,'platform admin must not load role-specific dashboard scripts');

console.log('Role dashboard UI scope, deferred student CSS, lazy student/teacher runtime and customer-shell isolation tests: OK');
