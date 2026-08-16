import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';

const read=p=>readFileSync(new URL(`../${p}`,import.meta.url),'utf8');
const migration=read('migrations/0037_advanced_modules_commerce.sql');
for(const table of ['module_commerce_rules','tenant_module_entitlements','module_subscription_changes','stripe_module_prices','surveys','survey_options','survey_votes','substitution_updates','calendar_feeds'])assert.match(migration,new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
assert.match(migration,/PRIMARY KEY\(survey_id,user_id\)/);

const payment=read('src/core/payment-router.ts');
for(const route of ['/api/billing/modules','/api/billing/modules/quote','/api/billing/modules/subscribe','/api/platform/commerce/modules'])assert.ok(payment.includes(route),`missing module commerce route ${route}`);
const moduleCommerce=read('src/core/module-commerce.ts');
assert.match(moduleCommerce,/payment_behavior','pending_if_incomplete/);
assert.match(moduleCommerce,/proration_behavior','always_invoice/);
assert.match(moduleCommerce,/DOUBLE_COST_CONFIRMATION_REQUIRED/);
assert.match(moduleCommerce,/activateModuleChange/);
assert.match(moduleCommerce,/feature_flags/);

const advanced=read('src/core/advanced-modules.ts');
for(const fn of ['statisticsSummary','createSurvey','voteSurvey','createSubstitutionUpdate','saveTeamsIntegration','calendarFeedResponse'])assert.ok(advanced.includes(`function ${fn}`)||advanced.includes(`function ${fn}(`)||advanced.includes(`function ${fn}<`)||advanced.includes(`function ${fn} `)||advanced.includes(`export async function ${fn}`),`missing ${fn}`);
assert.match(advanced,/survey_votes/);
assert.match(advanced,/microsoft_teams/);
assert.match(advanced,/text\/calendar/);

const customer=read('public/module-catalog-ui.js');
assert.doesNotMatch(customer,/In Vorbereitung/);
assert.match(customer,/zubuchen/);
assert.match(customer,/Bestätigung 1/);
assert.match(customer,/Bestätigung 2 von 2/);

const participant=read('public/portal-advanced-ui.js');
for(const id of ['vertretungen','umfragen','microsoft365'])assert.ok(participant.includes(id));
const layout=read('src/core/portal-layout.ts');
for(const id of ['vertretungen','umfragen','microsoft365'])assert.ok(layout.includes(`'${id}'`));
const index=read('src/index.ts');
assert.match(index,/calendarFeedResponse/);
assert.match(index,/publicAdvancedBySlug/);
const classAdmin=read('public/class-admin-portal.js');
for(const key of ['statistics','surveys','substitution_updates','microsoft_365','microsoft_teams'])assert.ok(classAdmin.includes(`${key}:`)||classAdmin.includes(`'${key}'`),`class workspace missing ${key}`);
assert.match(classAdmin,/data-module/,'class workspace must expose active advanced modules');
assert.match(classAdmin,/openStatistics/);
assert.match(classAdmin,/openSurveys/);
assert.match(classAdmin,/openSubstitutions/);
assert.match(classAdmin,/openM365/);

console.log('Advanced modules + self-service add-on acceptance checks: OK');
