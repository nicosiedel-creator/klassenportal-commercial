import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const migration=await readFile('migrations/0067_lesson_hub.sql','utf8');
const hub=await readFile('src/core/lesson-hub.ts','utf8');
const attendanceRouter=await readFile('src/core/attendance-router.ts','utf8');
const publicApi=await readFile('src/core/public.ts','utf8');
const student=await readFile('public/lesson-hub-ui.js','utf8');
const teacher=await readFile('public/teacher-lesson-hub-ui.js','utf8');
const classHtml=await readFile('public/class-portal.html','utf8');
const portalLazy=await readFile('public/portal-lazy-runtime.js','utf8');
const teacherHtml=await readFile('public/dozentenportal.html','utf8');
const teacherLazy=await readFile('public/teacher-lazy-modules.js','utf8');

assert.match(migration,/CREATE TABLE IF NOT EXISTS lesson_hub_details/,'lesson hub needs lesson-specific details');
assert.match(migration,/CREATE TABLE IF NOT EXISTS lesson_hub_links/,'lesson hub needs lesson-specific links');
assert.match(migration,/CREATE TABLE IF NOT EXISTS lesson_hub_materials/,'lesson hub needs reusable material attachments');
assert.match(migration,/PRIMARY KEY\(user_id,lesson_id\)/,'private lesson notes must be scoped to exactly one participant and lesson');

assert.match(hub,/requireRole\(auth,'class_admin'\)/,'lesson hub editing must require manager/teacher authority');
assert.match(hub,/requireRole\(auth,'participant'\)/,'private lesson notes must be participant-only');
assert.match(hub,/m\.role='participant'/,'private note access must verify real participant membership');
const noteAudit=hub.match(/audit\(env\.DB,auth\.userId,'lesson_note\.updated'[^;]+;/)?.[0]||'';
assert.match(noteAudit,/\{hasNote:!!note\}/,'private note audit must record only whether a note exists');
assert.doesNotMatch(noteAudit,/\{\s*note:/,'private note content must not leak into audit metadata');
assert.match(hub,/\['https:','http:'\]/,'lesson links must be restricted to web URLs');
assert.match(hub,/lesson_hub_materials/,'teacher must be able to attach existing learning materials to one lesson');
assert.match(hub,/uploadLearningMaterial/,'teacher must be able to upload a file directly from the lesson hub');

assert.match(attendanceRouter,/\/api\/attendance\/lesson-hub/,'lesson hub APIs must be routed');
assert.match(attendanceRouter,/getMyLessonNote\(env,studentAuth/,'class admin student view must use participant context for its own private note');
assert.match(attendanceRouter,/saveLessonHub\(env,await managerAuth\(\)/,'lesson hub editing must pass through teacher-specific manager auth');

assert.match(publicApi,/lesson_hub_details/,'participant overview must expose lesson topics/info');
assert.match(publicApi,/lesson_hub_links/,'participant overview must expose exact lesson links');
assert.match(publicApi,/lesson_hub_materials/,'participant overview must expose exact lesson materials');
assert.match(publicApi,/materialsEnabled\?\(materialsByLesson/,'lesson-specific files must respect the learning-material feature flag');

assert.match(student,/kp-hub-clickable/,'weekly lesson cards must visibly behave as clickable controls');
assert.match(student,/aria-expanded/,'weekly lesson cards must expose expanded state accessibly');
assert.match(student,/Unterrichtsthema/,'expanded lesson must show a topic section');
assert.match(student,/Hinweise & Informationen/,'expanded lesson must show richer lesson information');
assert.match(student,/Meine private Notiz/,'student lesson hub must include a private note');
assert.match(student,/data-kp-material/,'lesson files must be directly usable from the expanded timetable entry');
assert.match(student,/Zum Fach demnächst/,'lesson hub should integrate nearby assignments and exams without pretending they are exact attachments');
assert.doesNotMatch(classHtml,/src="\/lesson-hub-ui\.js/,'class portal must not execute lesson hub UI on first paint');
assert.match(portalLazy,/lesson-hub-ui/,'class portal must retain the lesson hub UI through the lazy runtime');
assert.match(classHtml,/lesson-hub\.css/,'class portal must load lesson hub styles');

assert.match(teacher,/Unterrichtsinfos & Materialien/,'teacher portal must offer lesson hub management');
assert.match(teacher,/planned_topic/,'teacher must be able to maintain the planned lesson topic');
assert.match(teacher,/data-upload/,'teacher must be able to upload lesson files directly');
assert.match(teacher,/material_ids/,'teacher must be able to select reusable existing materials');
assert.match(teacherHtml,/teacher-lazy-modules\.js\?v=20260822-1/,'teacher portal must load the bounded lazy controller');
assert.ok(teacherLazy.includes("'teacher-lesson-hub-ui'"),'teacher portal must lazy-load lesson hub management');
assert.doesNotMatch(teacherHtml,/src="\/teacher-lesson-hub-ui\.js/,'teacher lesson hub must not execute on first paint');

console.log('Lesson hub regression checks with lazy student and teacher runtimes: OK');
