import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const target=await readFile('src/core/timetable-hierarchy-targeting.ts','utf8');
const migration=await readFile('migrations/0057_timetable_hierarchy_targeting.sql','utf8');
const ui=await readFile('public/timetable-bulk-v3.js','utf8');
const router=await readFile('src/core/router.ts','utf8');

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
assert.match(router,/prepareHierarchyAwareTimetableRequest/,'live timetable API must invoke hierarchy preprocessing');
assert.match(router,/request\.clone\(\)/,'hierarchy detection must use a clone so non-hierarchy request bodies remain readable');
assert.match(router,/targeting:ex\?\.targeting/,'hierarchy review details must survive API error serialization');
assert.match(router,/\/api\/timetable\/preview[\s\S]*prepareHierarchyAwareTimetableRequest/,'preview route must use hierarchy targeting');
assert.match(router,/\/api\/timetable\/apply[\s\S]*prepareHierarchyAwareTimetableRequest/,'apply route must use hierarchy targeting');
assert.match(ui,/targeting/,'UI must expose hierarchy targeting results');
assert.match(ui,/automatisch zugeordnet/i,'UI must explain automatic targeting');
assert.match(ui,/TIMETABLE_TARGET_REVIEW_REQUIRED/,'UI must explain hierarchy review failures');

console.log('Multi-site timetable hierarchy, ambiguity, authorization and live wiring regression checks: OK');
