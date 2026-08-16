import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const cancellation=await readFile('src/core/module-cancellation.ts','utf8');
const moduleCommerce=await readFile('src/core/module-commerce.ts','utf8');
const managed=await readFile('src/core/managed-setup.ts','utf8');
const index=await readFile('src/index.ts','utf8');

assert.match(cancellation,/proration_behavior:'none'/,'scheduled module removal must never create a mid-cycle proration');
assert.match(cancellation,/current_period_end/,'module cancellation must use the Stripe subscription-item period end');
assert.match(cancellation,/effective_at<=\?/,'scheduled worker must only remove modules when their paid period is due');
assert.match(cancellation,/UPDATE feature_flags SET enabled=0/,'completed cancellation must disable the feature');
assert.match(cancellation,/status='cancelled'/,'customer must be able to withdraw a scheduled cancellation before it is due');
assert.match(index,/processScheduledModuleCancellations/,'scheduled worker must process due module cancellations');

assert.match(moduleCommerce,/handleModuleInvoiceFailed/,'failed module invoices must have a dedicated failure handler');
assert.match(moduleCommerce,/status='failed'.*pending_payment/s,'failed payment must never leave a pending entitlement active');
assert.match(moduleCommerce,/activateModuleChange/,'paid module changes must use explicit activation');
assert.ok(moduleCommerce.indexOf('handleModuleInvoicePaid')<moduleCommerce.length,'paid invoice handler must exist');

assert.match(managed,/assertTransition/,'Managed Setup must validate status transitions');
assert.match(managed,/from==='ready'&&to==='in_progress'/,'Managed Setup must start from ready');
assert.match(managed,/from==='in_progress'&&to==='completed'/,'Managed Setup must complete only after in-progress');
assert.match(managed,/MANAGED_SETUP_TRANSITION_INVALID/,'backward/skipped Managed Setup transitions must fail closed');

console.log('Billing lifecycle regression tests: OK');
