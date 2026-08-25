import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { paymentsEnabled, paymentPolicy } from '../dist/core/payment-policy.js';
import { augmentPaidOnboardingResponse, handlePaymentApi } from '../dist/core/payment-router.js';
import { createPaidBookingFromAcceptedOffer } from '../dist/core/accepted-offer-fulfillment.js';
import { assertPaymentWriteAccess } from '../dist/core/payment-access.js';
import { billingSummaryWithoutPayments } from '../dist/core/commerce.js';

// Fail-closed is the release invariant: missing/unknown configuration never enables money movement.
assert.equal(paymentsEnabled({}),false);
assert.deepEqual(paymentPolicy({}),{enabled:false,mode:'disabled'});
for(const value of ['1','true','TRUE',' yes ','ON','enabled',' Enabled '])assert.equal(paymentsEnabled({PAYMENTS_ENABLED:value}),true,value);
for(const value of ['','0','false','no','off','disabled','null','undefined','2','tru','enable','stripe','live'])assert.equal(paymentsEnabled({PAYMENTS_ENABLED:value}),false,value);

// 1,000 deterministic fuzz cases: only the documented allow-list may ever enable payments.
let state=0x51f15e;
const alphabet='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_- .';
for(let i=0;i<1000;i++){
  state=(state*1664525+1013904223)>>>0;
  const len=1+(state%28);let value='';
  for(let j=0;j<len;j++){state=(state*1664525+1013904223)>>>0;value+=alphabet[state%alphabet.length];}
  const normalized=value.trim().toLowerCase();
  const expected=['1','true','yes','on','enabled'].includes(normalized);
  assert.equal(paymentsEnabled({PAYMENTS_ENABLED:value}),expected,`fuzz ${i}: ${JSON.stringify(value)}`);
}

// Disabled webhook must acknowledge without touching DB/provider state, preventing retries and side effects.
const throwingEnv={PAYMENTS_ENABLED:'false',get DB(){throw new Error('DB_MUST_NOT_BE_TOUCHED');},get STRIPE_SECRET_KEY(){throw new Error('STRIPE_MUST_NOT_BE_TOUCHED');}};
const webhook=await handlePaymentApi(new Request('https://portal.example/api/payments/stripe/webhook',{method:'POST',body:'{}'}),throwingEnv);
assert.equal(webhook.status,200);
assert.deepEqual(await webhook.json(),{ok:true,ignored:true,paymentProcessing:'disabled'});

// All other provider-payment routes fail closed before database/provider access.
const checkout=await handlePaymentApi(new Request('https://portal.example/api/payments/checkout-status?session_id=cs_test_abc'),throwingEnv);
assert.equal(checkout.status,503);
assert.equal((await checkout.json()).error,'PAYMENT_DISABLED');
for(const path of ['/api/billing/modules/quote','/api/billing/modules/subscribe','/api/billing/change-quote','/api/billing/expand','/api/billing/convert-trial','/api/billing/retry-checkout','/api/billing/stripe-portal','/api/billing/trial-quote']){
  const response=await handlePaymentApi(new Request(`https://portal.example${path}`,{method:'POST'}),throwingEnv);
  assert.equal(response.status,503,path);
  assert.equal((await response.json()).error,'PAYMENT_DISABLED',path);
}

const billingReadSql=[];
const disabledBillingEnv={PAYMENTS_ENABLED:'false',get STRIPE_SECRET_KEY(){throw new Error('STRIPE_MUST_NOT_BE_TOUCHED');},DB:{prepare(sql){
  billingReadSql.push(sql);if(/stripe|billing_provider_state|tenant_payment_accounts/i.test(sql))throw new Error(`PAYMENT_DATA_MUST_NOT_BE_TOUCHED:${sql}`);
  return{bind(){return this;},async first(){return null;},async all(){return{success:true,results:[]};}};
}}};
const tenantAdminAuth={userId:'admin-1',role:'tenant_admin',tenantIds:['ten_1'],courseIds:[],isPlatformAdmin:false,session:{userId:'admin-1',email:'admin@example.test',displayName:'Admin',isPlatformAdmin:false,mustChangePassword:false,tenantRoles:[{tenantId:'ten_1',courseId:null,role:'tenant_admin'}]}};
const disabledBillingSummary=await billingSummaryWithoutPayments(disabledBillingEnv,tenantAdminAuth,'ten_1');
assert.deepEqual(disabledBillingSummary.billingProvider,{provider:'manual',status:'disabled',automatic_collection:0});
assert.ok(billingReadSql.length>=4,'disabled billing readback chain was not exercised');

// Paid onboarding may activate the commercial portal but must never emit a checkout while frozen.
const onboardingPayload={ok:true,tenant_id:'ten_1',commercial_action:'book',commercial:{orderId:'ord_1',invoiceId:'inv_1',offer:{offerKind:'paid'}}};
const augmented=await augmentPaidOnboardingResponse(throwingEnv,new Request('https://portal.example/api/onboarding/token',{method:'POST'}),Response.json(onboardingPayload));
assert.equal(augmented.status,200);
const augmentedJson=await augmented.json();
assert.equal(augmentedJson.commercial.checkoutUrl,null);
assert.equal(augmentedJson.commercial.paymentProvider,'manual');
assert.equal(augmentedJson.commercial.paymentProcessing,'disabled');

// End-to-end persistence contract of a paid accepted offer with payment processing disabled.
const quote={
  id:'quo_1',quote_number:'ANG-TEST',plan_id:'provider',requested_courses:7,currency:'EUR',
  recurring_monthly_cents:12900,setup_cents:4900,first_total_cents:17800,status:'accepted',
  pricing_snapshot_json:JSON.stringify({offerKind:'paid',recurringMonthlyCents:12900,managedSetupCents:4900,firstTotalCents:17800,manualPricing:false})
};
const batched=[];
const db={
  prepare(sql){return{bind(...args){return{sql,args,async first(){if(sql.includes("FROM commercial_quotes")&&sql.includes("status='accepted'"))return quote;return null;},async run(){return{success:true};}};}};},
  async batch(statements){batched.push(...statements);return statements.map(()=>({success:true}));}
};
const fulfilled=await createPaidBookingFromAcceptedOffer({DB:db,PAYMENTS_ENABLED:'false'},{tenantId:'ten_1',quoteId:'quo_1',invitationId:'oni_1',actorId:'usr_1'});
assert.equal(fulfilled.status,'active');
assert.equal(fulfilled.paymentProcessing,'disabled');
assert.equal(fulfilled.paymentProvider,'manual');
const orderStatement=batched.find(x=>x.sql.includes('INSERT INTO commercial_orders'));
const invoiceStatement=batched.find(x=>x.sql.includes('INSERT INTO commercial_invoices'));
const subscriptionStatement=batched.find(x=>x.sql.includes('UPDATE subscriptions'));
assert.ok(orderStatement&&invoiceStatement&&subscriptionStatement,'commercial persistence chain incomplete');
assert.equal(orderStatement.args[6],'active');
assert.equal(invoiceStatement.args[4],'draft');
assert.equal(subscriptionStatement.args[1],'active');
assert.ok(orderStatement.args.at(-1),'manual activation timestamp missing');

// The active manual commercial subscription must unlock normal tenant writes, avoiding a payment-chain lockout.
const activeAccessEnv={DB:{prepare(sql){return{bind(){return{async first(){if(sql.includes('FROM subscriptions'))return{status:'active'};throw new Error(`UNEXPECTED_QUERY:${sql}`);}};}};}}};
await assertPaymentWriteAccess(activeAccessEnv,'ten_1');

// Static release contracts guard against accidental reintroduction of checkout/payment wording or missing gates.
const [wrangler,indexSource,fulfillmentSource,paymentRouterSource,lifecycleSource,onboardingSource]=await Promise.all([
  readFile(new URL('../wrangler.jsonc',import.meta.url),'utf8'),
  readFile(new URL('../src/index.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/core/accepted-offer-fulfillment.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/core/payment-router.ts',import.meta.url),'utf8'),
  readFile(new URL('../src/core/billing-lifecycle-router.ts',import.meta.url),'utf8'),
  readFile(new URL('../public/onboarding.js',import.meta.url),'utf8'),
]);
assert.match(wrangler,/"PAYMENTS_ENABLED"\s*:\s*"false"/);
assert.match(indexSource,/paymentsEnabled\(env\).*STRIPE_SECRET_KEY/s);
assert.match(fulfillmentSource,/subscriptionStatus=providerPayments\?'past_due':'active'/);
assert.match(fulfillmentSource,/invoiceStatus=providerPayments\?'pending_provider':'draft'/);
assert.match(paymentRouterSource,/pathname\.startsWith\('\/api\/payments\/'\).*disabled\(\)/s);
assert.match(paymentRouterSource,/!enabled&&request\.method!=='GET'\)return disabled\(\)/);
assert.match(paymentRouterSource,/enabled\?await billingSummaryWithStripe[\s\S]*billingSummaryWithoutPayments/);
assert.match(lifecycleSource,/!paymentsEnabled\(env\).*PAYMENT_DISABLED/s);
assert.doesNotMatch(onboardingSource,/Zur sicheren Zahlung|anschließende Zahlungsabwicklung erfolgt jetzt über den eingerichteten Zahlungsdienst/);
assert.match(onboardingSource,/Zahlung erfolgt außerhalb des Portals/);
assert.doesNotMatch(indexSource,/api\.stripe\.com|checkout\.stripe\.com/,'browser CSP must not permit frozen payment-provider traffic');

for(const path of [
  'src/core/stripe.ts','src/core/stripe-mode-safe.ts','src/core/payment-orchestration.ts',
  'src/core/module-commerce.ts','src/core/module-cancellation.ts','src/core/stripe-tax-billing.ts',
  'src/core/platform-accounting.ts'
]){
  const source=await readFile(new URL(`../${path}`,import.meta.url),'utf8');
  assert.match(source,/assertPaymentsEnabled\(env\)/,`${path} must fail before any provider call`);
}

console.log('Payment freeze release contract + paid-onboarding chain + 1,000-case fail-closed fuzz: OK');
