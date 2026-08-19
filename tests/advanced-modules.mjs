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
const portalHtml=read('public/class-portal.html'),classEntry=read('public/class-admin.html');
assert.match(portalHtml,/portal-advanced-ui\.js/,'advanced participant modules must be shared by students and class admins');
assert.match(portalHtml,/class-admin-student-tools\.js/,'class admin extras must be layered into that same portal');
assert.match(classEntry,/class-admin-entry\.js/,'class admin route must redirect into the shared student portal');
assert.doesNotMatch(classEntry,/class-admin-portal\.js/,'legacy class-admin workspace must no longer be active');

const data=read('src/core/data.ts');
assert.match(data,/MODULE_MANAGED_BY_BILLING/,'paid add-ons must not be toggled through the generic tenant module API');
assert.match(data,/MODULE_MANAGED_BY_PACKAGE/,'package-controlled features must not be toggled through the generic tenant module API');
assert.match(data,/STANDARD_MODULES/,'standard modules must preserve plan ownership');
const hardening=read('migrations/0043_module_access_hardening.sql');
assert.match(hardening,/trg_paid_module_feature_insert/);
assert.match(hardening,/trg_paid_module_feature_update/);
assert.match(hardening,/tenant_module_entitlements/);
const adminEntry=read('public/admin-entry-route-ui.js');
assert.match(adminEntry,/\/plattform-admin/);
assert.match(adminEntry,/\/kunden-admin/);
assert.match(adminEntry,/\/klassen-admin/);
const rootHtml=read('public/index.html');
assert.match(rootHtml,/admin-entry-route-ui\.js/,'generic root may use the class-admin entry route to resolve the concrete student portal');
const localization=read('public/localization.js');
for(const key of ['learning_materials','microsoft_365','substitution_updates','custom_domain','weekly_overview'])assert.ok(localization.includes(`'${key}'`),`missing German localization for ${key}`);

console.log('Advanced modules + shared class-admin/student portal + self-service add-on acceptance checks: OK');
