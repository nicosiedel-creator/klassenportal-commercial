import assert from 'node:assert/strict';
import {readdir,readFile} from 'node:fs/promises';

const files=(await readdir('migrations')).filter(x=>/^\d{4}_.+\.sql$/.test(x)).sort();
const byNumber=new Map();
for(const file of files){const number=file.slice(0,4);if(!byNumber.has(number))byNumber.set(number,[]);byNumber.get(number).push(file);}
const duplicates=[...byNumber.entries()].filter(([,names])=>names.length>1);
assert.deepEqual(duplicates,[['0042',['0042_branding_palette.sql','0042_production_release_gate.sql']]],'no new duplicate migration sequence numbers are allowed');

// These two legacy filenames are already part of D1 migration history. Renaming one would
// create a new migration name and could replay already-applied schema changes remotely.
// Keep the historical names stable and enforce uniqueness for every future migration.
const migrate=await readFile('scripts/migrate-remote.mjs','utf8');
assert.match(migrate,/const brandingMigration='0042_branding_palette\.sql'/,'branding drift reconciliation must keep the already-recorded migration filename stable');

const numbers=files.map(x=>Number(x.slice(0,4))).filter(Number.isFinite);
assert.ok(Math.max(...numbers)>=86,'migration integrity audit must cover the current migration generation');
console.log('Migration filename integrity: legacy 0042 pair explicitly frozen; all future sequence numbers unique.');
