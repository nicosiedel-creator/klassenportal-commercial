import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { assertCategoryWeightTotal, normalizeGradeScaleItems, roundGradePercent, weightedCategoryAverage } from '../dist/core/gradebook-correctness.js';

const validScale={items:[
  {label:'1',min_percent:92,max_percent:100},
  {label:'2',min_percent:81,max_percent:91.99},
  {label:'3',min_percent:67,max_percent:80.99},
  {label:'4',min_percent:50,max_percent:66.99},
  {label:'5',min_percent:30,max_percent:49.99},
  {label:'6',min_percent:0,max_percent:29.99},
]};
assert.equal(normalizeGradeScaleItems(validScale).length,6,'complete two-decimal grading scale must be accepted');
assert.equal(roundGradePercent(91.995),92,'official percent must be rounded before grade lookup');
assert.equal(roundGradePercent(91.994),91.99,'two-decimal grade boundaries must be deterministic');

assert.throws(()=>normalizeGradeScaleItems({items:[{label:'1',min_percent:90,max_percent:100},{label:'2',min_percent:80,max_percent:90},{label:'3',min_percent:0,max_percent:79.99}]}),/GRADING_SCALE_OVERLAP/,'overlapping official grade ranges must fail closed');
assert.throws(()=>normalizeGradeScaleItems({items:[{label:'1',min_percent:92,max_percent:100},{label:'2',min_percent:80,max_percent:91.98},{label:'3',min_percent:0,max_percent:79.99}]}),/GRADING_SCALE_GAP/,'gaps in official grade ranges must fail closed');
assert.throws(()=>normalizeGradeScaleItems({items:[{label:'1',min_percent:20,max_percent:100},{label:'2',min_percent:10,max_percent:19.99}]}),/GRADING_SCALE_COVERAGE_REQUIRED/,'official scale must cover 0 through 100 percent');
assert.throws(()=>normalizeGradeScaleItems({items:[{label:'Bestanden',min_percent:50,max_percent:100},{label:'bestanden',min_percent:0,max_percent:49.99}]}),/GRADING_SCALE_LABEL_DUPLICATE/,'grade labels must be unambiguous');

const weighted=weightedCategoryAverage([{pct:50,itemWeight:1},{pct:100,itemWeight:3}],0);
assert.equal(weighted?.average,87.5,'item weights must affect category average');
assert.equal(weighted?.itemWeightTotal,4);
const zeroIgnored=weightedCategoryAverage([{pct:0,itemWeight:0},{pct:80,itemWeight:1}],0);
assert.equal(zeroIgnored?.average,80,'zero-weight gradebook items must not affect the official result');
const dropped=weightedCategoryAverage([{pct:20,itemWeight:10},{pct:80,itemWeight:1},{pct:100,itemWeight:1}],1);
assert.equal(dropped?.average,90,'drop-lowest must remove the lowest percentage before applying remaining item weights');

assert.doesNotThrow(()=>assertCategoryWeightTotal(7000,3000),'category weights may total exactly 100 percent');
assert.throws(()=>assertCategoryWeightTotal(7000,3001),/CATEGORY_WEIGHT_TOTAL_EXCEEDED/,'category weights above 100 percent must be rejected');

const router=await readFile('src/core/learning-suite-router.ts','utf8');
for(const fn of ['safeAdvancedGradebook','safeOfficialGradeReport','safeOfficialGradeCsv','safeSaveGradebookCategory','safeSaveGradingScale'])assert.ok(router.includes(fn),`live learning-suite route must use ${fn}`);
const source=await readFile('src/core/gradebook-correctness.ts','utf8');
assert.match(source,/value\.pct\*value\.itemWeight/,'official category result must use stored item weights');
assert.match(source,/CATEGORY_WEIGHT_TOTAL_INVALID/,'legacy category totals above 100 percent must fail closed at report time');
assert.match(source,/GRADING_SCALE_STORED_INVALID/,'legacy ambiguous grading scales must fail closed at report time');

console.log('Official gradebook weighting, category totals and deterministic grading-scale checks: OK');
