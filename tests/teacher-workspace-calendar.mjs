import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0068_teacher_workspace_messages.sql','utf8');
const core=await readFile('src/core/teacher-workspace.ts','utf8');
const router=await readFile('src/core/communications-router.ts','utf8');
const ui=await readFile('public/teacher-workspace-ui.js','utf8');
const css=await readFile('public/integrated-workspace.css','utf8');
const teacherHtml=await readFile('public/dozentenportal.html','utf8');
const classHtml=await readFile('public/class-portal.html','utf8');
const adminUi=await readFile('public/teacher-message-admin-ui.js','utf8');
const seed=await readFile('scripts/seed-demo-nico-teacher.mjs','utf8');

assert.match(migration,/CREATE TABLE IF NOT EXISTS teacher_messages/,'teacher messages need persistence');
assert.match(migration,/CREATE TABLE IF NOT EXISTS teacher_message_reads/,'teacher messages need read state');
assert.ok(core.includes('now.getTime()-28*86400000'),'teacher calendar must retain four weeks');
assert.ok(core.includes('now.getTime()+30*86400000'),'teacher calendar must show thirty days ahead');
assert.match(core,/lesson_hub_details/,'teacher calendar must integrate lesson hub details');
assert.match(core,/attendance_session_id/,'timetable lessons must link to classbook sessions');
assert.ok(core.includes('source_ref:`lesson:${lessonId}`'),'opening classbook from timetable must use stable lesson linkage');
assert.match(core,/teacher_messages/,'teacher workspace must include internal messages');
assert.match(core,/requireRole\(auth,'tenant_admin'\)/,'internal teacher messages must be managed by tenant admins');

assert.ok(router.includes("path==='/api/communications/teacher/workspace'"),'teacher workspace API must be routed');
assert.match(router,/teacherAttendanceAuth/,'teacher workspace must use explicit teacher assignment auth');
assert.ok(router.includes('teacherLessonClassbook'),'calendar-to-classbook route must exist');
assert.ok(router.includes('ensureLessonClassbookSession'),'calendar-to-classbook route must create/reuse a linked classbook session');

assert.match(ui,/Mein Kalender · 4 Wochen zurück \/ 30 Tage voraus/,'teacher UI must expose the calendar');
assert.match(ui,/Heute & demnächst/,'teacher calendar needs forward filter');
assert.match(ui,/Letzte 4 Wochen/,'teacher calendar needs retrospective filter');
assert.match(ui,/Klassenbuch/,'calendar entries must open classbook');
assert.match(ui,/Infos & Dateien/,'calendar entries must open lesson information and files');
assert.match(ui,/Anwesenheit speichern/,'calendar classbook must include attendance');
assert.match(ui,/Behandelte Inhalte/,'calendar classbook must include treated content');
assert.match(ui,/Neue Datei direkt an diese Stunde hängen/,'teacher must attach files from calendar hub');
assert.match(ui,/Meldungen/,'teacher workspace must display management/office messages');

assert.match(css,/#tp-workspace/,'teacher dashboard needs its own integrated layout');
assert.match(css,/#kalender\{grid-column:span 2/,'student calendar must get more horizontal space');
assert.match(teacherHtml,/teacher-workspace-ui\.js\?v=20260819-1/,'teacher portal must load workspace UI');
assert.match(teacherHtml,/integrated-workspace\.css\?v=20260819-1/,'teacher portal must load workspace styles');
assert.match(classHtml,/integrated-workspace\.css\?v=20260819-1/,'student portal must load layout correction');
assert.match(adminUi,/Schulleitung, Sekretariat und Verwaltung → Dozentenportal/,'customer admin must manage internal teacher messages');
assert.match(seed,/lesson_hub_details/,'demo seed must make lesson hub visibly testable');
assert.match(seed,/teacher_messages/,'demo seed must provide teacher messages');

console.log('Integrated teacher calendar, classbook, lesson hub and notices checks: OK');
