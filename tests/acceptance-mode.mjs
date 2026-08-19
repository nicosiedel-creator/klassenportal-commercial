import { strict as assert } from 'node:assert';
import { acceptanceModeAllowsLockedRequest, isLockedAcceptanceEnvironment } from '../dist/core/acceptance-mode.js';

const base='https://klassenportal-commercial.nicosiedel.workers.dev';
const testEnv={APP_ORIGIN:'',STRIPE_SECRET_KEY:'sk_test_example'};
const liveStripeEnv={APP_ORIGIN:'',STRIPE_SECRET_KEY:'sk_live_example'};
const productionEnv={APP_ORIGIN:'https://portal.example.de',STRIPE_SECRET_KEY:'sk_test_example'};

const req=(path,method='GET')=>new Request(`${base}${path}`,{method});
assert.equal(isLockedAcceptanceEnvironment(testEnv,req('/kunden-admin')),true,'base workers.dev must be recognized as pre-live acceptance host');
assert.equal(isLockedAcceptanceEnvironment(testEnv,new Request('https://abc-klassenportal-commercial.nicosiedel.workers.dev/kunden-admin')),false,'branch/version preview must never become acceptance host');
assert.equal(isLockedAcceptanceEnvironment(testEnv,new Request('https://other-service.nicosiedel.workers.dev/kunden-admin')),false,'other workers must not inherit acceptance access');
assert.equal(isLockedAcceptanceEnvironment(productionEnv,req('/kunden-admin')),false,'configured production origin must disable workers.dev acceptance mode');

assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/produkt')),true,'public product page must remain testable');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/api/public/product')),true,'public product pricing endpoint must remain testable');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/angebot/offer_token')),true,'tokenized offer page must load during acceptance');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/api/offers/offer_token')),true,'tokenized offer API must be readable during acceptance');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/api/offers/offer_token','POST')),true,'tokenized offer acceptance must remain testable');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/kunden-admin')),true,'customer admin shell must load during controlled acceptance');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/klassen-admin')),true,'class admin student entry must load during controlled acceptance');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/dozentenportal.html')),true,'teacher portal shell must load during controlled acceptance');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/einrichtung/invite_token')),true,'tokenized onboarding page must load during acceptance');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/api/onboarding/invite_token')),true,'tokenized onboarding API must be reachable during acceptance');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/api/onboarding/invite_token','POST')),true,'test-mode onboarding submission must be allowed');
assert.equal(await acceptanceModeAllowsLockedRequest(liveStripeEnv,req('/api/onboarding/invite_token','POST')),false,'acceptance mode must never permit a live Stripe onboarding mutation');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/public/test/course/overview')),true,'class portal public endpoint keeps its own login/code checks');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/eingang/upload_token')),true,'secure intake token page must remain testable');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/api/intake/upload/upload_token','POST')),true,'secure intake upload token must remain testable');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/api/courses?tenant_id=ten_test')),false,'tenant APIs must not be opened without an authenticated session');
assert.equal(await acceptanceModeAllowsLockedRequest(testEnv,req('/unrelated-private-page')),false,'unlisted pages must remain locked');

console.log('Controlled pre-live acceptance mode including teacher portal checks: OK');
