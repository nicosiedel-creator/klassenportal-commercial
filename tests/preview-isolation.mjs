import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { productionReleaseAccess, requestLooksLikePreview, requestLooksLikeRemotePreview, requestMatchesConfiguredProductionOrigin } from '../dist/core/production-release-state.js';

const wrangler=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const source=await readFile('src/core/production-release-state.ts','utf8');
const auth=await readFile('src/core/auth.ts','utf8');
const ownerSecurity=await readFile('src/core/owner-security-router.ts','utf8');
assert.equal(wrangler.preview_urls,false,'public version/branch preview URLs must remain disabled');
assert.ok(source.includes(`WORKER_SERVICE_NAME='${wrangler.name}'`),'runtime preview detection must stay bound to the configured Worker name');
assert.match(source,/custom_domain_requests/,'release gate must verify customer custom domains');
assert.match(source,/tenant_settings/,'verified custom domain must also be bound in tenant settings');
assert.match(source,/hostname_status='active'/,'custom domain hostname must be provider-active');
assert.match(source,/ssl_status='active'/,'custom domain TLS must be provider-active');
assert.match(auth,/if\(platform&&!platformOriginAllowed\(env,request\)\)throw new Error\('PLATFORM_ORIGIN_MISMATCH'\)/,'platform session issuance must fail closed on the wrong origin');
assert.match(auth,/u\.is_platform_admin&&!platformOriginAllowed\(env,request\)/,'password login must reject platform admin on non-APP_ORIGIN hosts');
assert.match(auth,/me\.isPlatformAdmin&&!platformOriginAllowed\(env,request\)/,'existing platform sessions must be revoked on non-APP_ORIGIN hosts');
assert.doesNotMatch(ownerSecurity,/\bmfa\b|MFA_|TOTP|Authenticator/i,'owner security router must remain password-only with no MFA endpoint dependency');

const base='https://klassenportal-commercial.nicosiedel.workers.dev/';
const versionPreview='https://50c9593e-klassenportal-commercial.nicosiedel.workers.dev/';
const branchPreview='https://block3-onboarding-managed-setup-klassenportal-commercial.nicosiedel.workers.dev/';
const platform='https://app.example.de/';
const customer='https://kunde.example.de/';
const other='https://other.example.de/';
const local='http://localhost:8787/';

assert.equal(requestLooksLikeRemotePreview(new Request(base)),false,'base workers.dev Worker must never be mistaken for a preview');
assert.equal(requestLooksLikePreview(new Request(base)),false,'base workers.dev Worker must go through the production release gate');
assert.equal(requestLooksLikeRemotePreview(new Request(versionPreview)),true,'version-prefixed workers.dev URL must be recognized as remote preview');
assert.equal(requestLooksLikeRemotePreview(new Request(branchPreview)),true,'branch-alias workers.dev URL must be recognized as remote preview');
assert.equal(requestLooksLikePreview(new Request(platform)),false,'custom production domain must not be treated as preview');
assert.equal(requestLooksLikePreview(new Request(local)),true,'localhost must remain available as local development preview');

const inertDb={prepare(){throw new Error('DB_MUST_NOT_BE_TOUCHED');}};
const env={DB:inertDb,CF_VERSION_METADATA:{id:'version-test'}};
const baseAccess=await productionReleaseAccess(env,new Request(base));
assert.equal(baseAccess.production,true,'base workers.dev URL must be treated as production traffic');
assert.equal(baseAccess.allowed,false,'base workers.dev traffic must stay locked while APP_ORIGIN is not production-ready');
assert.match(String(baseAccess.reason),/APP_ORIGIN|Produktionsursprung/,'base workers.dev lock must explain missing production origin');

const remoteAccess=await productionReleaseAccess(env,new Request(versionPreview));
assert.equal(remoteAccess.production,true,'remote preview must fail closed as production-protected traffic');
assert.equal(remoteAccess.allowed,false,'remote preview must never receive data access');
assert.match(String(remoteAccess.reason),/Remote-Preview ist deaktiviert/,'remote preview lock must be explicit');

const localAccess=await productionReleaseAccess(env,new Request(local));
assert.equal(localAccess.production,false,'localhost may remain a local development environment');
assert.equal(localAccess.allowed,true,'localhost development must remain usable without production approval');

const productionDb={prepare(sql){return{bind(...values){return{async first(){
  if(sql.includes('custom_domain_requests'))return String(values[0]).toLowerCase()==='kunde.example.de'?{tenant_id:'tenant-1'}:null;
  if(sql.includes('production_release_approvals'))return{approved_at:'2026-08-18T18:00:00.000Z',approved_by:'owner'};
  throw new Error('UNEXPECTED_QUERY');
}};}};}};
const productionEnv={DB:productionDb,APP_ORIGIN:'https://app.example.de',CF_VERSION_METADATA:{id:'version-live'}};
assert.equal(requestMatchesConfiguredProductionOrigin(productionEnv,new Request(platform)),true,'platform origin must match APP_ORIGIN exactly');
assert.equal(requestMatchesConfiguredProductionOrigin(productionEnv,new Request(customer)),false,'customer custom domain must not be mistaken for platform APP_ORIGIN');

const approvedPlatform=await productionReleaseAccess(productionEnv,new Request(platform));
assert.equal(approvedPlatform.allowed,true,'approved version must be available on the configured platform origin');
assert.equal(approvedPlatform.approved,true,'platform origin must receive the stored version approval');

const approvedCustomer=await productionReleaseAccess(productionEnv,new Request(customer));
assert.equal(approvedCustomer.allowed,true,'approved version must be available on an active verified customer custom domain');
assert.equal(approvedCustomer.approved,true,'verified customer custom domain must reuse the exact Worker-version approval');

for(const url of [base,other]){
  const alternate=await productionReleaseAccess(productionEnv,new Request(url));
  assert.equal(alternate.allowed,false,`approved version must not leak to untrusted origin ${url}`);
  assert.equal(alternate.approved,false,'untrusted origin must not inherit production approval');
  assert.match(String(alternate.reason),/weder Produktionsdomain noch aktiv verifizierte Kundendomain|Remote-Preview/,'untrusted origin must fail explicitly');
}

const brokenDomainDb={prepare(sql){if(sql.includes('custom_domain_requests'))throw new Error('D1_UNAVAILABLE');return productionDb.prepare(sql);}};
const brokenDomainEnv={...productionEnv,DB:brokenDomainDb};
const failClosed=await productionReleaseAccess(brokenDomainEnv,new Request(customer));
assert.equal(failClosed.allowed,false,'custom-domain verification failure must fail closed');

console.log('Preview isolation, verified customer domains and password-only platform-admin origin binding: OK');
