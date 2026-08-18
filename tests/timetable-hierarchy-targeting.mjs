import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const target=await readFile('src/core/timetable-hierarchy-targeting.ts','utf8');
const migration=await readFile('migrations/0057_timetable_hierarchy_targeting.sql','utf8');
const ui=await readFile('public/timetable-bulk-v3.js','utf8');

assert.match(target,/SITE_ALIASES=\['standort'/,'Standort must be a dedicated organization targeting field');
assert.doesNotMatch(target,/room:\[[^\]]*standort/i,'Standort must never be interpreted as room');
assert.match(target,/ORG_ALIASES/);
assert.match(target,/PATH_ALIASES/);
assert.match(target,/COURSE_CODE_ALIASES/);
assert.match(target,/course_org_units/,'course targeting must use the organization hierarchy');
assert.match(target,/external_id/,'external organization identifiers must be usable');
assert.match(target,/Keine Berechtigung für diese Klasse\/Kurs/,'cross-site import must remain authorization scoped');
assert.match(target,/Klasse\/Kurs passt nicht zum angegebenen Standort\/Organisationsbereich/,'conflicting site/course context must fail closed');
assert.match(target,/Mehrere Klassen\/Kurse passen/,'ambiguous same-name courses must require review');
assert.match(target,/const unresolved=decisions\.filter\(x=>x\.status!=='automatic'\)/,'any unresolved row must block automatic conversion');
assert.match(target,/throw e/,'hierarchy review must stop import instead of partially applying rows');
assert.match(migration,/timetable_target_aliases/,'confirmed aliases must be stored tenant-scoped');
assert.match(migration,/tenant_id TEXT NOT NULL/);
assert.match(ui,/targeting/,'UI must expose hierarchy targeting results');
assert.match(ui,/automatisch zugeordnet/i,'UI must explain automatic targeting');

console.log('Multi-site timetable hierarchy, ambiguity and authorization regression checks: OK');
