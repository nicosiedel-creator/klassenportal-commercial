import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { assertCategoryWeightTotal, csvSafeCell, normalizeGradeScaleItems, roundGradePercent, weightedCategoryAverage } from '../dist/core/gradebook-correctness.js';

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
assert.throws(()=>normalizeGradeScaleItems({items:[{label:'1',min_percent:90,max_percent:100},{label:'2',min_percent:80,max_percent:90},{label:'3',min_percent:0,max_percent:79.99}]}),/GRADING_SCALE_OVERLAP/);
assert.throws(()=>normalizeGradeScaleItems({items:[{label:'1',min_percent:92,max_percent:100},{label:'2',min_percent:80,max_percent:91.98},{label:'3',min_percent:0,max_percent:79.99}]}),/GRADING_SCALE_GAP/);
assert.throws(()=>normalizeGradeScaleItems({items:[{label:'1',min_percent:20,max_percent:100},{label:'2',min_percent:10,max_percent:19.99}]}),/GRADING_SCALE_COVERAGE_REQUIRED/);
assert.throws(()=>normalizeGradeScaleItems({items:[{label:'Bestanden',min_percent:50,max_percent:100},{label:'bestanden',min_percent:0,max_percent:49.99}]}),/GRADING_SCALE_LABEL_DUPLICATE/);
const weighted=weightedCategoryAverage([{pct:50,itemWeight:1},{pct:100,itemWeight:3}],0);assert.equal(weighted?.average,87.5);assert.equal(weighted?.itemWeightTotal,4);
assert.equal(weightedCategoryAverage([{pct:0,itemWeight:0},{pct:80,itemWeight:1}],0)?.average,80);
assert.equal(weightedCategoryAverage([{pct:20,itemWeight:10},{pct:80,itemWeight:1},{pct:100,itemWeight:1}],1)?.average,90);
assert.doesNotThrow(()=>assertCategoryWeightTotal(7000,3000));assert.throws(()=>assertCategoryWeightTotal(7000,3001),/CATEGORY_WEIGHT_TOTAL_EXCEEDED/);
assert.equal(csvSafeCell('Normaler Name'),'"Normaler Name"');
assert.equal(csvSafeCell('=HYPERLINK("https://example.test")'),'"\'=HYPERLINK(""https://example.test"")"');
assert.equal(csvSafeCell('  +1+1'),'"\'  +1+1"');assert.equal(csvSafeCell('@SUM(A1:A2)'),'"\'@SUM(A1:A2)"');
const router=await readFile('src/core/learning-suite-router.ts','utf8');for(const fn of ['safeAdvancedGradebook','safeOfficialGradeReport','safeOfficialGradeCsv','safeSaveGradebookCategory','safeSaveGradingScale'])assert.ok(router.includes(fn));
const source=await readFile('src/core/gradebook-correctness.ts','utf8');
assert.match(source,/value\.pct\*value\.itemWeight/);assert.match(source,/category_weight_valid:categoryWeightValid/);assert.match(source,/categoryWeightValid&&weightUsed>0/);assert.match(source,/CATEGORY_WEIGHT_TOTAL_INVALID/);assert.match(source,/GRADING_SCALE_STORED_INVALID/);assert.match(source,/CATEGORY_RENAME_NOT_ALLOWED/);assert.match(source,/items:scale\.items,valid:scale\.valid/);assert.match(source,/\^\[\\s\]\*\[=\+\\-@\]/);
const ui=await readFile('public/gradebook-policy-ui.js','utf8');for(const code of ['CATEGORY_WEIGHT_TOTAL_EXCEEDED','CATEGORY_WEIGHT_TOTAL_INVALID','CATEGORY_RENAME_NOT_ALLOWED','GRADING_SCALE_OVERLAP','GRADING_SCALE_GAP','GRADING_SCALE_STORED_INVALID'])assert.ok(ui.includes(code));
assert.ok(ui.includes('6;0;29.99'));assert.ok(ui.includes("replace(',','.')"));assert.match(ui,/form\.dataset\.categoryId/);assert.match(ui,/form\.elements\.name\.readOnly=true/);assert.match(ui,/hydrateCategories/);assert.match(ui,/form\.dataset\.scaleId/);assert.match(ui,/hydrateScale/);assert.match(ui,/event\.stopImmediatePropagation\(\)/);
const defaultScaleUi=await readFile('public/gradebook-default-scale-ui.js','utf8');assert.ok(defaultScaleUi.includes("const legacy='1;92;100\\n2;81;91.99\\n3;67;80.99'"));assert.ok(defaultScaleUi.includes('6;0;29.99'));assert.match(defaultScaleUi,/normalized\(textarea\.value\)===legacy/);
const customerHtml=await readFile('public/customer-admin.html','utf8'),classHtml=await readFile('public/class-admin.html','utf8');
for(const html of [customerHtml,classHtml]){
  assert.ok(html.includes('/gradebook-policy-ui.js?v=20260818-2'),'admin surface must load the final gradebook validation UI');
  assert.ok(html.includes('/gradebook-default-scale-ui.js?v=20260818-1'),'admin surface must upgrade the incomplete legacy scale example');
  assert.ok(html.includes('/admin-overlay-hardening.css?v=20260818-2'),'gradebook integration must preserve viewport-wide hardened admin dialog/overlay behavior');
  assert.ok(html.includes('/admin-overlay-hardening.js?v=20260818-2'),'gradebook integration must preserve the DOM overlay guard');
}
console.log('Official gradebook weighting, category totals, deterministic grading-scale, CSV safety, overlay integration and repairable UI checks: OK');
