import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
const state=await readFile('PROJECT_STATE.md','utf8');
const acceptance=await readFile('PRODUCTION_ACCEPTANCE_2026-08-25.md','utf8');
assert.match(state,/VFA-13 ist eine getrennte Entwicklungs-\/Pilotlinie/);
assert.match(state,/kein Bestandteil der Commercial-Fertigstellung/);
assert.match(acceptance,/VFA-13 ist ausdrücklich nicht Bestandteil dieser Freigabe/);
console.log('Commercial release scope excludes VFA-13 unless explicitly requested: OK');
