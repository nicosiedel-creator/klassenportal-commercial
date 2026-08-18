import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { productionReleaseAccess, requestLooksLikePreview, requestLooksLikeRemotePreview } from '../dist/core/production-release-state.js';

const wrangler=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const source=await readFile('src/core/production-release-state.ts','utf8');
assert.equal(wrangler.preview_urls,false,'public version/branch preview URLs must remain disabled');
assert.ok(source.includes(`WORKER_SERVICE_NAME='${wrangler.name}'`),'runtime preview detection must stay bound to the configured Worker name');
assert.match(source,/actualOrigin!==origin\.origin/,'production approval must be bound to the exact request origin');

const base='https://klassenportal-commercial.nicosiedel.workers.dev/';
const versionPreview='https://50c9593e-klassenportal-commercial.nicosiedel.workers.dev/';
const branchPreview='https://block3-onboarding-managed-setup-klassenportal-commercial.nicosiedel.workers.dev/';
const custom='https://portal.example.de/';
const other='https://other.example.de/';
const local='http://localhost:8787/';

assert.equal(requestLooksLikeRemotePreview(new Request(base)),false,'base workers.dev Worker must never be mistaken for a preview');
assert.equal(requestLooksLikePreview(new Request(base)),false,'base workers.dev Worker must go through the production release gate');
assert.equal(requestLooksLikeRemotePreview(new Request(versionPreview)),true,'version-prefixed workers.dev URL must be recognized as remote preview');
assert.equal(requestLooksLikeRemotePreview(new Request(branchPreview)),true,'branch-alias workers.dev URL must be recognized as remote preview');
assert.equal(requestLooksLikePreview(new Request(custom)),false,'custom production domain must not be treated as preview');
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

const approvalDb={prepare(){return{bind(){return{async first(){return{approved_at:'2026-08-18T18:00:00.000Z',approved_by:'owner'};}};}};}};
const productionEnv={DB:approvalDb,APP_ORIGIN:'https://portal.example.de',CF_VERSION_METADATA:{id:'version-live'}};
const approvedCustom=await productionReleaseAccess(productionEnv,new Request(custom));
assert.equal(approvedCustom.allowed,true,'approved version must be available on the exact configured production origin');
assert.equal(approvedCustom.approved,true,'exact production origin must receive the stored version approval');

for(const url of [base,other]){
  const alternate=await productionReleaseAccess(productionEnv,new Request(url));
  assert.equal(alternate.allowed,false,`approved version must not leak to alternate origin ${url}`);
  assert.equal(alternate.approved,false,'alternate origin must not inherit production approval');
  assert.match(String(alternate.reason),/Anfrageursprung stimmt nicht/,'alternate origin must fail with explicit origin mismatch');
}

console.log('Preview URLs disabled, base workers.dev locked, exact production origin enforced, localhost remains local: OK');
