import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const migration=await readFile('migrations/0073_planning_resources_constraints.sql','utf8');
const conflicts=await readFile('migrations/0074_expand_planning_conflict_types.sql','utf8');
const planning=await readFile('src/core/planning-constraints.ts','utf8');
const auto=await readFile('src/core/planning-automation.ts','utf8');
const router=await readFile('src/core/planning-router.ts','utf8');
const bridge=await readFile('src/core/participant-360-router.ts','utf8');
const ui=await readFile('public/planning-resource-ui.js','utf8');
const suggestionFix=await readFile('public/planning-resource-suggestion-fix.js','utf8');
const customer=await readFile('public/customer-admin.html','utf8');
const platform=await readFile('public/platform-admin.html','utf8');

for(const table of ['planning_resources','planning_resource_unavailability','teacher_unavailability','planning_blackouts','course_scheduling_rules','teacher_workload_rules','timetable_plan_entry_resources','lesson_resource_reservations'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`),`${table} missing`);
for(const type of ['planning_blackout','teacher_unavailable','resource_capacity','resource_unavailable','resource_overlap','teacher_weekly_limit'])assert.ok(conflicts.includes(`'${type}'`),`advanced conflict type ${type} missing`);
assert.match(planning,/validateAdvancedTimetablePlan/,'advanced validation missing');
assert.match(planning,/planning_blackouts/,'holiday/closure validation missing');
assert.match(planning,/teacher_unavailability/,'teacher availability validation missing');
assert.match(planning,/planning_resource_unavailability/,'resource availability validation missing');
assert.match(planning,/participantCount>Number\(r\.capacity\)/,'room capacity validation missing');
assert.match(planning,/teacher_weekly_limit/,'teacher workload validation missing');
assert.match(planning,/publishAdvancedTimetablePlan/,'publish must be gated by advanced validation');
assert.match(planning,/lesson_resource_reservations/,'published resource reservation missing');
assert.match(planning,/planningSuggestions/,'automatic teacher/room suggestions missing');
assert.match(planning,/qualified DESC,familiarity DESC,day_minutes ASC/,'teacher suggestions should prefer qualification, course familiarity and lower workload');
assert.match(planning,/substituteSuggestions/,'automatic substitution suggestions missing');
assert.match(auto,/substitution_cases/,'teacher absence must create substitution cases');
assert.match(auto,/Automatisch aus Dozenten-Abwesenheit erzeugt/,'automatic substitution source marker missing');
assert.match(router,/handlePlanningApi/,'planning router missing');
assert.match(router,/validateAdvancedTimetablePlan/,'generic planner validation must be intercepted by advanced validation');
assert.match(router,/publishAdvancedTimetablePlan/,'generic publish must be intercepted by advanced validation');
assert.match(router,/saveTeacherUnavailabilityWithSubstitutions/,'teacher absence route must automate substitution cases');
assert.match(bridge,/handlePlanningApi/,'planning router must run before generic education routes');

for(const label of ['Räume & Ressourcen','Ferien & Sperrzeiten','Dozenten-Abwesenheit','Kursregeln','Vertretungsvorschlag'])assert.ok(ui.includes(label),`planning UI ${label} missing`);
assert.match(ui,/Ressourcen & Regeln/,'planner must expose constraints manager');
assert.match(ui,/Auto-Vorschläge/,'planner must expose automatic suggestions');
assert.match(ui,/Vertretungsfall\/\-fälle automatisch angelegt/,'absence UI must explain automated substitution cases');
assert.match(suggestionFix,/\/api\/education\/planning\/suggestions\?tenant_id=/,'automatic suggestion request must use a valid query URL');
assert.match(suggestionFix,/fachqualifiziert/,'automatic suggestion picker should surface qualification');
assert.match(customer,/planning-resource-ui\.js/,'customer admin must load planning constraints UI');
assert.match(customer,/planning-resource-suggestion-fix\.js/,'customer admin must load corrected suggestion picker');
assert.ok(!platform.includes('planning-resource-ui.js'),'platform admin must remain visually untouched');
assert.ok(!platform.includes('planning-resource-suggestion-fix.js'),'platform admin must not load customer planner extensions');

console.log('advanced planning constraints regression ok');
