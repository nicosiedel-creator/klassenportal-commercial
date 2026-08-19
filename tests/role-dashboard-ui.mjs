import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const [css,polish,student,teacher,dropdown,classPortal,classAdmin,teacherHtml,customerAdmin,platformAdmin]=await Promise.all([
  readFile('public/role-dashboard.css','utf8'),
  readFile('public/role-dashboard-polish.css','utf8'),
  readFile('public/student-dashboard-ui.js','utf8'),
  readFile('public/teacher-dashboard-ui.js','utf8'),
  readFile('public/customer-nav-dropdown.js','utf8'),
  readFile('public/class-portal.html','utf8'),
  readFile('public/class-admin.html','utf8'),
  readFile('public/dozentenportal.html','utf8'),
  readFile('public/customer-admin.html','utf8'),
  readFile('public/platform-admin.html','utf8'),
]);

assert.match(css,/\.kp-student-dashboard/,'student dashboard styling must exist');
assert.match(css,/#teacher-portal/,'teacher portal styling must exist');
assert.match(css,/\.customer-portal-admin/,'tenant-admin styling must exist');
assert.doesNotMatch(css,/\.platform-admin/,'role dashboard CSS must not target platform admin');
assert.match(student,/kp-now-card/,'student dashboard must include current/next lesson banner');
assert.match(student,/kp-week-grid/,'student dashboard must include compact weekly timetable');
assert.match(student,/safeHref/,'student dashboard links must be protocol-sanitized');
assert.match(student,/class-admin-student-tools/,'class admin tools must remain in the student portal');
assert.match(student,/data-kp-target/,'right dashboard cards must declare navigation targets');
assert.match(student,/portal-compact-open/,'dashboard navigation must directly expand compact target sections');
assert.match(student,/focusWeek/,'today navigation must focus the weekly timetable instead of a generic section');
assert.match(student,/data-kp-lesson-id/,'today lesson rows must support precise lesson highlighting');
assert.match(student,/data-kp-entry/,'individual exam, lesson and homework rows must be independently clickable');
assert.match(teacher,/teacher-main-card/,'teacher dashboard must classify its main working area');
assert.match(teacher,/teacher-wide-card/,'teacher attendance overview must use the shared dashboard layout');

assert.match(polish,/\.kp-now-count\{display:none!important\}/,'student countdown must stay hidden');
assert.match(polish,/\.kp-week-lesson strong\{font-size:\.82rem!important/,'weekly timetable text must stay readable at 100% zoom');
assert.match(polish,/\.kp-side-card\.is-clickable:hover/,'clickable side cards need visible hover feedback');
assert.match(polish,/\.kp-side-row>div small\{font-size:\.73rem!important;line-height:1\.42!important;white-space:normal!important\}/,'side-card metadata must remain readable and airy');
assert.match(polish,/:has\(#kp-push\) \.portal-footer/,'push actions must reserve footer space instead of covering content');
assert.match(polish,/\.customer-portal-admin \.kp-customer-nav-more-panel\{position:absolute!important/,'extra customer navigation must behave like an overlay dropdown');
assert.doesNotMatch(polish,/\.platform-admin/,'readability polish must never target platform admin');
assert.match(dropdown,/closest\('#kp-customer-more-toggle'\)/,'dropdown toggle click must not immediately close itself');
assert.match(dropdown,/Escape/,'customer dropdown must close with Escape');
assert.match(dropdown,/sessionStorage\.removeItem\('kp_customer_nav_more'\)/,'expanded extra navigation must not remain sticky across views');

assert.match(classPortal,/role-dashboard\.css/);
assert.match(classPortal,/role-dashboard-polish\.css\?v=20260819-2/,'class portal must bust the polished dashboard CSS cache');
assert.match(classPortal,/student-dashboard-ui\.js\?v=20260819-2/,'class portal must bust the interactive dashboard script cache');
assert.match(classAdmin,/role-dashboard\.css/);
assert.match(classAdmin,/role-dashboard-polish\.css/);
assert.match(teacherHtml,/role-dashboard\.css/);
assert.match(teacherHtml,/role-dashboard-polish\.css/);
assert.match(teacherHtml,/teacher-dashboard-ui\.js/);
assert.match(customerAdmin,/role-dashboard\.css/);
assert.match(customerAdmin,/role-dashboard-polish\.css/);
assert.match(customerAdmin,/customer-nav-dropdown\.js/);
assert.doesNotMatch(platformAdmin,/role-dashboard(?:-polish)?\.css/,'platform admin must remain visually untouched');
assert.doesNotMatch(platformAdmin,/student-dashboard-ui|teacher-dashboard-ui|customer-nav-dropdown/,'platform admin must not load role-specific dashboard scripts');

console.log('Role dashboard UI scope tests: OK');
