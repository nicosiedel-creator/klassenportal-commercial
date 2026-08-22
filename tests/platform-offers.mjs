import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const offers=await readFile('src/core/platform-offers.ts','utf8');
const offerLinks=await readFile('src/core/platform-offer-links.ts','utf8');
const offerRouter=await readFile('src/core/platform-offer-router.ts','utf8');
const offerAdminPreview=await readFile('src/core/platform-offer-admin-preview.ts','utf8');
const offerSchema=await readFile('src/core/offer-schema.ts','utf8');
const accepted=await readFile('src/core/accepted-offer-fulfillment.ts','utf8');
const onboarding=await readFile('src/core/onboarding.ts','utf8');
const onboardingUi=await readFile('public/onboarding.js','utf8');
const ownerUi=await readFile('public/platform-offers-ui.js','utf8');
const adminPreviewUi=await readFile('public/platform-offer-admin-preview-ui.js','utf8');
const platformLoginUi=await readFile('public/platform-direct-login.js','utf8');
const platformLazy=await readFile('public/platform-admin-lazy-modules.js','utf8');
const publicUi=await readFile('public/angebot.js','utf8');
const stripe=await readFile('src/core/stripe-tax-billing.ts','utf8');
const migration=await readFile('migrations/0045_platform_offers.sql','utf8');
const pilotMigration=await readFile('migrations/0044_legal_documents_and_pilot.sql','utf8');
const wrangler=await readFile('wrangler.jsonc','utf8');
const index=await readFile('src/index.ts','utf8');

assert.match(offers,/monthly_override_cents/,'platform offers must support a manual recurring price');
assert.match(offers,/setup_override_cents/,'platform offers must support a manual setup price');
assert.match(offers,/recurring_discount_type/,'platform offers must support recurring discounts');
assert.match(offers,/setup_discount_type/,'platform offers must support setup discounts');
assert.match(offers,/DISCOUNT_PERCENT_INVALID/,'percentage discounts must be bounded');
assert.match(offers,/PRICING_NOT_CONFIGURED/,'unapproved catalog pricing must fail closed unless the owner deliberately enters an individual price');
assert.match(offers,/const kind:OfferKind/,'offer kind must use the explicit paid/pilot type');
assert.match(offers,/kind==='pilot'.*monthlyBase=0/s,'pilot offers must force the recurring amount to zero');
assert.match(offers,/terms_version,dpa_version,privacy_version/,'offer acceptance must bind the exact legal document version');
assert.match(offers,/sha256Text\(raw\)/,'public offer tokens must be stored as hashes');
assert.match(offerLinks,/publicLegal\(env\)/,'publishing must require the integrated legal documents');
assert.match(offerLinks,/public_token_hash/,'rotating an offer link must replace the stored hash');
assert.match(offerRouter,/ensureOfferSchema\(env\)/,'offer API must self-heal a lagging D1 offer schema');
assert.match(offerRouter,/admin-preview/,'offer API must expose an authenticated admin preview route');
assert.match(offerAdminPreview,/getPlatformOffer\(env,auth,quoteId\)/,'admin preview must require the existing platform-admin authorization path');
assert.doesNotMatch(offerAdminPreview,/public_token_hash|publicUrl|sha256Text/,'admin preview must never expose or regenerate the public offer secret');
assert.match(offerSchema,/PRAGMA table_info\(\$\{table\}\)/,'offer schema guard must verify real columns before adding them');

assert.match(accepted,/createPaidBookingFromAcceptedOffer/,'accepted custom offers must have a dedicated fulfillment path');
assert.match(accepted,/pricing_snapshot_json/,'accepted offer pricing must be persisted as the entitlement/order snapshot');
assert.match(accepted,/recurring_monthly_cents,setup_cents/,'accepted price must feed the tenant entitlement');
assert.match(accepted,/startPilotFromAcceptedOffer/,'accepted pilots must use a dedicated zero-cost fulfillment path');
assert.match(accepted,/status='trial'/,'pilot fulfillment must stay in trial status rather than paid/active');
assert.match(pilotMigration,/PILOT_MUST_NOT_AUTO_CONVERT/,'database pilot model must reject automatic paid conversion');

assert.match(onboarding,/acceptedQuoteForOnboarding/,'onboarding must load the accepted offer rather than recalculate it');
assert.match(onboarding,/createPaidBookingFromAcceptedOffer/,'paid onboarding must preserve the accepted custom offer');
assert.match(onboarding,/startPilotFromAcceptedOffer/,'pilot onboarding must preserve the accepted pilot');
assert.match(onboardingUi,/Diese Konditionen werden im Einrichtungsprozess nicht neu berechnet/,'customer UI must explain that accepted terms are locked');
assert.match(onboardingUi,/readonly/,'accepted customer/offer data must be locked in onboarding');

assert.match(stripe,/manualPricing/,'Stripe checkout must distinguish individual offer prices');
assert.match(stripe,/price_data.*unit_amount/s,'individual offer prices must use isolated inline Stripe price data');
assert.match(stripe,/MANUAL_OFFER_PRICE_INVALID/,'invalid custom Stripe prices must fail closed');
assert.doesNotMatch(stripe,/payment_method_types/,'payment methods must not be hardcoded');

for(const marker of ['Individueller Monatspreis','Rabatt auf laufenden Preis','Kostenloser Pilot / Testbetrieb','Als Entwurf speichern','Angebot erstellen & freigeben'])assert.ok(ownerUi.includes(marker),`owner offer UI missing: ${marker}`);
assert.match(adminPreviewUi,/admin_offer/,'offer detail PDF action must open the authenticated admin preview');
assert.match(platformLoginUi,/platform-admin-lazy-modules\.js/,'platform admin bootstrap must install the lazy module controller');
assert.match(platformLazy,/offers:\['platform-offers-ui','platform-offer-admin-preview-ui','platform-offer-accepted-link-ui'/,'offer manager and secure preview helper must remain available on demand');
assert.doesNotMatch(platformLoginUi,/import\('\/platform-offer-admin-preview-ui\.js/,'secure offer preview helper must not regress to eager first-paint loading');
assert.match(publicUi,/adminOffer/,'offer view must recognize authenticated admin previews');
assert.match(publicUi,/adminPreview=!!data\.adminPreview/,'admin preview must render in explicit read-only mode');
assert.match(publicUi,/Interne schreibgeschützte Admin-Ansicht/,'admin preview must clearly identify itself as read-only');
assert.match(publicUi,/keine automatische Umwandlung in ein kostenpflichtiges Abonnement/,'public pilot offer must clearly exclude auto conversion');
assert.match(publicUi,/confirm_terms/,'public acceptance must affirmatively incorporate AGB');
assert.match(publicUi,/confirm_dpa/,'public acceptance must affirmatively incorporate AVV');
assert.ok(wrangler.includes('"/angebot/*"')&&index.includes("/^\\/angebot\\/[^/]+\\/?$/"),'clean public offer URLs must be routed through the Worker');
for(const col of ['monthly_override_cents','recurring_discount_cents','public_token_hash','accepted_terms','accepted_dpa'])assert.ok(migration.includes(col),`offer migration missing ${col}`);

console.log('Platform offer, custom pricing, discount, safe-pilot and lazy preview checks: OK');
