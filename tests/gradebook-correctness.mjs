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

assert.equal(csvSafeCell('Normaler Name'),'"Normaler Name"','normal CSV values must remain unchanged apart from quoting');
assert.equal(csvSafeCell('=HYPERLINK("https://example.test")'),'"\'=HYPERLINK(""https://example.test"")"','formula-like CSV values must be neutralised before spreadsheet import');
assert.equal(csvSafeCell('  +1+1'),'"\'  +1+1"','formula prefixes after leading whitespace must be neutralised');
assert.equal(csvSafeCell('@SUM(A1:A2)'),'"\'@SUM(A1:A2)"','at-sign formula syntax must be neutralised');

const router=await readFile('src/core/learning-suite-router.ts','utf8');
for(const fn of ['safeAdvancedGradebook','safeOfficialGradeReport','safeOfficialGradeCsv','safeSaveGradebookCategory','safeSaveGradingScale'])assert.ok(router.includes(fn),`live learning-suite route must use ${fn}`);
const source=await readFile('src/core/gradebook-correctness.ts','utf8');
assert.match(source,/value\.pct\*value\.itemWeight/,'official category result must use stored item weights');
assert.match(source,/category_weight_valid:categoryWeightValid/,'overweight legacy categories must remain visible for repair while final grades stay disabled');
assert.match(source,/categoryWeightValid&&weightUsed>0/,'invalid category totals must not produce an official percentage');
assert.match(source,/if\(!report\.category_weight_valid\)throw new Error\('CATEGORY_WEIGHT_TOTAL_INVALID'\)/,'official CSV export must fail closed when category totals are invalid');
assert.match(source,/report\.scale&&report\.scale\.valid===false/,'official CSV export must fail closed when a legacy scale is ambiguous');
assert.match(source,/CATEGORY_RENAME_NOT_ALLOWED/,'category rename must be blocked until item references can be migrated atomically');
assert.match(source,/items:scale\.items,valid:scale\.valid/,'interactive report must expose stored scale details so an invalid legacy scale remains repairable');
assert.match(source,/\^\[\\s\]\*\[=\+\\-@\]/,'CSV export must detect spreadsheet formula prefixes');

const ui=await readFile('public/gradebook-policy-ui.js','utf8');
for(const code of ['CATEGORY_WEIGHT_TOTAL_EXCEEDED','CATEGORY_WEIGHT_TOTAL_INVALID','CATEGORY_RENAME_NOT_ALLOWED','GRADING_SCALE_OVERLAP','GRADING_SCALE_GAP','GRADING_SCALE_STORED_INVALID'])assert.ok(ui.includes(code),`gradebook UI must explain ${code}`);
assert.ok(ui.includes('6;0;29.99'),'gradebook UI must show a complete 0-100 example scale');
assert.ok(ui.includes("replace(',','.')"),'German decimal comma must be accepted in gradebook percentage inputs');
assert.match(ui,/form\.dataset\.categoryId/,'existing category must be updateable in place');
assert.match(ui,/form\.elements\.name\.readOnly=true/,'category name must stay locked during safe weight repair');
assert.match(ui,/hydrateCategories/,'stored categories and invalid totals must be loaded into repair controls');
assert.match(ui,/form\.dataset\.scaleId/,'existing grading scale must be updated in place rather than duplicated on every correction');
assert.match(ui,/hydrateScale/,'stored grading scale must be loaded back into the editor');
assert.match(ui,/event\.stopImmediatePropagation\(\)/,'hardened gradebook forms must own submission before the legacy handler sends them');
const defaultScaleUi=await readFile('public/gradebook-default-scale-ui.js','utf8');
assert.ok(defaultScaleUi.includes("const legacy='1;92;100\\n2;81;91.99\\n3;67;80.99'"),'legacy incomplete 1-3 scale must be matched exactly before replacement');
assert.ok(defaultScaleUi.includes("6;0;29.99"),'legacy scale upgrade must provide a complete 1-6 example');
assert.match(defaultScaleUi,/normalized\(textarea\.value\)===legacy/,'only the untouched legacy example may be replaced automatically');
const customerHtml=await readFile('public/customer-admin.html','utf8'),classHtml=await readFile('public/class-admin.html','utf8');
assert.ok(customerHtml.includes('/gradebook-policy-ui.js?v=20260818-2'),'customer admin must load the final gradebook validation UI');
assert.ok(classHtml.includes('/gradebook-policy-ui.js?v=20260818-2'),'class admin must load the final gradebook validation UI');
assert.ok(customerHtml.includes('/gradebook-default-scale-ui.js?v=20260818-1'),'customer admin must upgrade the incomplete legacy example');
assert.ok(classHtml.includes('/gradebook-default-scale-ui.js?v=20260818-1'),'class admin must upgrade the incomplete legacy example');

console.log('Official gradebook weighting, category totals, deterministic grading-scale, CSV safety and repairable UI checks: OK');
