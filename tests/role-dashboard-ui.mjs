import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const [css,student,teacher,classPortal,classAdmin,teacherHtml,customerAdmin,platformAdmin]=await Promise.all([
  readFile('public/role-dashboard.css','utf8'),
  readFile('public/student-dashboard-ui.js','utf8'),
  readFile('public/teacher-dashboard-ui.js','utf8'),
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
assert.match(teacher,/teacher-main-card/,'teacher dashboard must classify its main working area');
assert.match(teacher,/teacher-wide-card/,'teacher attendance overview must use the shared dashboard layout');
assert.match(classPortal,/role-dashboard\.css/);
assert.match(classPortal,/student-dashboard-ui\.js/);
assert.match(classAdmin,/role-dashboard\.css/);
assert.match(teacherHtml,/role-dashboard\.css/);
assert.match(teacherHtml,/teacher-dashboard-ui\.js/);
assert.match(customerAdmin,/role-dashboard\.css/);
assert.doesNotMatch(platformAdmin,/role-dashboard\.css/,'platform admin must remain visually untouched');
assert.doesNotMatch(platformAdmin,/student-dashboard-ui|teacher-dashboard-ui/,'platform admin must not load role-specific dashboard scripts');

console.log('Role dashboard UI scope tests: OK');
