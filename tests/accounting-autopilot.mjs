import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
const [mig,core,router,cycle,ui,direct]=await Promise.all([
  readFile('migrations/0062_accounting_autopilot.sql','utf8'),
  readFile('src/core/platform-accounting-autopilot.ts','utf8'),
  readFile('src/core/platform-accounting-autopilot-router.ts','utf8'),
  readFile('src/core/automation-cycle.ts','utf8'),
  readFile('public/platform-accounting-autopilot-ui.js','utf8'),
  readFile('public/platform-direct-login.js','utf8')
]);
for(const t of ['accounting_bank_transactions','accounting_dunning_cases','accounting_close_checks','accounting_autopilot_events'])assert.ok(mig.includes(`CREATE TABLE IF NOT EXISTS ${t}`),`missing ${t}`);
assert.match(mig,/auto_post_bank_matches INTEGER NOT NULL DEFAULT 0/,'bank auto-post must be off by default');
assert.match(mig,/auto_send_dunning INTEGER NOT NULL DEFAULT 0/,'dunning auto-send must be off by default');
assert.match(core,/invoice_number\+exact_amount/,'bank auto matching must require invoice number and exact amount');
assert.doesNotMatch(core,/status='paid'.*amount_cents=\?/s,'bank matching must not use amount-only settlement');
assert.match(core,/status='conflict'/,'ambiguous bank matches need conflict state');
assert.match(core,/accountingCloseCheck/,'month-end close check required');
assert.match(core,/expenses_review/,'unreviewed expenses must block close readiness');
assert.match(core,/bank_unmatched/,'unmatched bank items must block close readiness');
assert.match(router,/accounting-autopilot\/bank\/import/,'bank import API missing');
assert.match(router,/accounting-autopilot\/close-check/,'close check API missing');
assert.match(cycle,/autoMatchBankTransactions/,'bank matching must run in scheduled automation');
assert.match(cycle,/refreshDunningCases/,'dunning preparation must run in scheduled automation');
assert.match(ui,/Automatischer Versand bleibt standardmäßig aus/,'UI must disclose safe dunning default');
assert.match(direct,/platform-accounting-autopilot-ui\.js/,'platform admin must load finance autopilot');
console.log('Accounting autopilot safety checks: OK');
