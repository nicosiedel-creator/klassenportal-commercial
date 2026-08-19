import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const seed=await readFile('scripts/seed-demo-nico-teacher.mjs','utf8');
const pkg=JSON.parse(await readFile('package.json','utf8'));

assert.ok(seed.includes("branch!=='main'"),'remote demo seed must run only on main Workers builds');
assert.ok(seed.includes("slug='bildungszentrum-spreeblick-demo'"),'demo seed must be scoped to the named demo tenant');
assert.ok(seed.includes("lower(display_name)=lower('Nico Pfeiffer-Siedel')"),'demo seed must target Nico explicitly');
assert.ok(seed.includes("role IN ('participant','class_admin')"),'student/class-admin privacy conflicts must remain blocked');
assert.ok(seed.includes("'Arbeit für Klassenportal'"),'demo sessions need the requested subject');
assert.ok(seed.includes("weekdays('2026-08-20','2026-08-31')"),'August fixtures must remain in the current month');
assert.ok(seed.includes("['13:00','14:45','16:30']"),'August fixtures must be afternoon slots');
assert.ok(seed.includes("weekdays('2026-09-01','2026-09-30')"),'September fixtures must remain in next month');
assert.ok(seed.includes("['08:15','10:00']"),'September fixtures must be morning slots');
assert.ok(seed.includes('durationMinutes=90'),'each demo work session must be 1.5 hours');
assert.ok(seed.includes("source_ref LIKE 'demo_nico_klassenportal_%'"),'seed must be idempotently identifiable');
assert.ok(String(pkg.scripts.deploy||'').includes('seed-demo-nico-teacher.mjs'),'production deploy must execute the demo fixture seed');

console.log('Nico demo teacher fixture safety checks: OK');
