import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0068_teacher_workspace_messages.sql','utf8');
const core=await readFile('src/core/teacher-workspace.ts','utf8');
const calendarCore=await readFile('src/core/teacher-calendar.ts','utf8');
const router=await readFile('src/core/communications-router.ts','utf8');
const ui=await readFile('public/teacher-workspace-ui.js','utf8');
const calendarUi=await readFile('public/teacher-calendar-ui.js','utf8');
const css=await readFile('public/integrated-workspace.css','utf8');
const teacherHtml=await readFile('public/dozentenportal.html','utf8');
const teacherLazy=await readFile('public/teacher-lazy-modules.js','utf8');
const classHtml=await readFile('public/class-portal.html','utf8');
const portalLazy=await readFile('public/portal-lazy-runtime.js','utf8');
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

assert.match(calendarCore,/teacher_portal_assignments/,'global teacher calendar must derive the physical teacher identity from explicit portal assignments');
assert.match(calendarCore,/l\.teacher_id=\?/,'teacher calendar must show only lessons assigned to that teacher, not every lesson in the course');
assert.match(calendarCore,/lesson_online_meetings/,'teacher calendar must expose existing Teams meeting state without an extra meeting-list request');
assert.match(calendarCore,/attendance_session_id/,'global calendar must expose linked classbook state');
assert.match(calendarCore,/now\+90\*86400000/,'teacher global calendar must look far enough ahead for planning');

assert.ok(router.includes("path==='/api/communications/teacher/calendar'"),'teacher global calendar API must be routed');
assert.match(router,/teacherAttendanceAuth/,'teacher calendar and workspace must use explicit teacher assignment auth');
assert.ok(router.includes('teacherLessonClassbook'),'calendar-to-classbook route must exist');
assert.ok(router.includes('ensureLessonClassbookSession'),'calendar-to-classbook route must create/reuse a linked classbook session');

assert.match(calendarUi,/Mein Unterricht/,'teacher landing page must prominently expose the personal teaching calendar');
assert.match(calendarUi,/Nächster Unterricht/,'teacher calendar must surface the next lesson immediately');
assert.match(calendarUi,/Teams starten/,'an existing Teams meeting must be directly startable from the teacher calendar');
assert.match(calendarUi,/Teams planen/,'a missing Teams meeting must be directly plannable from the teacher calendar');
assert.match(calendarUi,/\/api\/integrations\/microsoft\/lessons\/\$\{encodeURIComponent\(lessonId\)\}\/meeting/,'teacher calendar must use the protected Microsoft meeting route');
assert.match(calendarUi,/MICROSOFT_ACCOUNT_NOT_CONNECTED/,'teacher calendar must handle Microsoft connection setup instead of failing with a raw error');
assert.match(calendarUi,/Klassenbuch offen/,'teacher calendar must surface overdue classbook work');
assert.match(calendarUi,/Thema fehlt/,'teacher calendar must surface missing preparation');
assert.match(calendarUi,/Teams fehlt/,'remote or hybrid lessons must flag a missing Teams meeting');
assert.match(calendarUi,/Promise\.all\(Array\.from\(\{length:Math\.min\(2,queue\.length\)\}/,'multi-course calendar loading must be bounded rather than burst every course at once');
assert.doesNotMatch(calendarUi,/MutationObserver/,'global teacher calendar must remain event-driven');
assert.match(calendarUi,/kp:teacher-state/,'global teacher calendar must reuse centralized teacher state');
assert.ok(teacherLazy.includes("'teacher-calendar-ui'"),'teacher calendar must load as a primary card on the teacher landing page');

assert.match(ui,/Mein Kalender · 4 Wochen zurück \/ 30 Tage voraus/,'course workspace must retain its detailed calendar');
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
assert.match(teacherHtml,/teacher-lazy-modules\.js\?v=20260822-1/,'teacher portal must load its bounded lazy controller');
assert.ok(teacherLazy.includes("'teacher-workspace-ui'"),'teacher dashboard must load workspace UI on demand');
assert.doesNotMatch(teacherHtml,/src="\/teacher-workspace-ui\.js/,'teacher workspace must not execute on first paint');
assert.match(teacherHtml,/integrated-workspace\.css(?:\?[^"']*)?/,'teacher portal must load workspace styles');
assert.doesNotMatch(classHtml,/integrated-workspace\.css(?:\?[^"']*)?/,'student first paint must not block on workspace styles');
assert.match(portalLazy,/'portal-learning-collaboration-ui':\['integrated-workspace'\]/,'student collaboration must request workspace styles with its lazy module');
assert.match(portalLazy,/'portal-curriculum-ui':\['integrated-workspace'\]/,'student curriculum must request workspace styles with its lazy module');
assert.match(portalLazy,/'portal-report-book-ui':\['integrated-workspace'\]/,'student report book must request workspace styles with its lazy module');
assert.match(adminUi,/Schulleitung, Sekretariat und Verwaltung → Dozentenportal/,'customer admin must manage internal teacher messages');
assert.match(seed,/lesson_hub_details/,'demo seed must make lesson hub visibly testable');
assert.match(seed,/teacher_messages/,'demo seed must provide teacher messages');

console.log('Integrated teacher calendar, global teaching plan, Teams actions, classbook, lesson hub and notices checks: OK');
