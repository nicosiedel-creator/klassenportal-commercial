import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const publicApi=await readFile('src/core/public.ts','utf8');
const calendar=await readFile('public/portal-calendar-lookback.js','utf8');
const classPortal=await readFile('public/class-portal.html','utf8');
const classPortalJs=await readFile('public/class-portal.js','utf8');
const teacherGuidance=await readFile('public/teacher-assignment-guidance.js','utf8');
const teacherPortal=await readFile('public/dozentenportal.html','utf8');
const teacherCore=await readFile('src/core/teacher-portal.ts','utf8');

assert.ok(publicApi.includes('Date.now()-28*86400000'),'participant overview must retain four weeks of calendar history');
assert.ok(calendar.includes('28*86400000'),'calendar lookback must cover four weeks');
assert.ok(calendar.includes('30*86400000'),'calendar forward view must remain 30 days');
assert.ok(calendar.includes('Letzte 4 Wochen'),'calendar needs an explicit retrospective filter');
assert.ok(calendar.includes('Kommende 30 Tage'),'calendar needs a forward filter');
assert.match(classPortalJs,/sessionStorage\.getItem\(codeStoreKey\)/,'base portal must preserve access-code support');
assert.match(classPortalJs,/window\.__KP_PORTAL_DATA=d/,'base portal must publish its authenticated/access-code-resolved overview once');
assert.match(calendar,/window\.__KP_PORTAL_DATA/,'calendar must consume the shared access-code-resolved portal overview without refetching');
assert.match(calendar,/kp:portal-data/,'calendar must follow deterministic portal-data updates');
assert.doesNotMatch(calendar,/\/public\/.*\/overview/,'calendar must not issue its own duplicate overview request');
assert.ok(calendar.includes("isPast?'Vergangen':event.kind"),'past calendar entries must be visually distinguishable');
assert.ok(classPortal.includes('/portal-calendar-lookback.js?v=20260819-1'),'class portal must load the retrospective calendar module');

assert.ok(teacherGuidance.includes('Dozent/in + Portal-Benutzerkonto + Klasse/Kurs'),'empty teacher portal must explain the complete assignment triple');
assert.ok(teacherGuidance.includes('Schüler oder Klassenadmin'),'teacher portal must explain the same-course role conflict');
assert.ok(teacherGuidance.includes('separates Dozentenkonto'),'teacher portal must offer the privacy-safe testing path');
assert.ok(teacherPortal.includes('/teacher-assignment-guidance.js?v=20260819-1'),'teacher portal must load assignment guidance');
assert.ok(teacherCore.includes("throw new Error('TEACHER_STUDENT_ROLE_CONFLICT')"),'same-course student/teacher privacy barrier must remain server-side');

console.log('Four-week calendar retrospective, shared portal data and teacher assignment guidance checks: OK');
