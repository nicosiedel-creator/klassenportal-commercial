import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { paymentsEnabled, paymentPolicy } from '../dist/core/payment-policy.js';
import { augmentPaidOnboardingResponse, handlePaymentApi } from '../dist/core/payment-router.js';

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

// Paid onboarding may activate the commercial portal but must never emit a checkout while frozen.
const onboardingPayload={ok:true,tenant_id:'ten_1',commercial_action:'book',commercial:{orderId:'ord_1',invoiceId:'inv_1',offer:{offerKind:'paid'}}};
const augmented=await augmentPaidOnboardingResponse(throwingEnv,new Request('https://portal.example/api/onboarding/token',{method:'POST'}),Response.json(onboardingPayload));
assert.equal(augmented.status,200);
const augmentedJson=await augmented.json();
assert.equal(augmentedJson.commercial.checkoutUrl,null);
assert.equal(augmentedJson.commercial.paymentProvider,'manual');
assert.equal(augmentedJson.commercial.paymentProcessing,'disabled');

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
assert.match(lifecycleSource,/!paymentsEnabled\(env\).*PAYMENT_DISABLED/s);
assert.doesNotMatch(onboardingSource,/Zur sicheren Zahlung|anschließende Zahlungsabwicklung erfolgt jetzt über den eingerichteten Zahlungsdienst/);
assert.match(onboardingSource,/Zahlung erfolgt außerhalb des Portals/);

console.log('Payment freeze release contract + 1,000-case fail-closed fuzz: OK');
