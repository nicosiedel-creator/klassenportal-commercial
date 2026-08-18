import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { productionReleaseAccess, requestLooksLikePreview, requestLooksLikeRemotePreview } from '../dist/core/production-release-state.js';

const wrangler=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const source=await readFile('src/core/production-release-state.ts','utf8');
assert.equal(wrangler.preview_urls,false,'public version/branch preview URLs must remain disabled');
assert.ok(source.includes(`WORKER_SERVICE_NAME='${wrangler.name}'`),'runtime preview detection must stay bound to the configured Worker name');

const base='https://klassenportal-commercial.nicosiedel.workers.dev/';
const versionPreview='https://50c9593e-klassenportal-commercial.nicosiedel.workers.dev/';
const branchPreview='https://block3-onboarding-managed-setup-klassenportal-commercial.nicosiedel.workers.dev/';
const custom='https://portal.example.de/';
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

console.log('Preview URLs disabled, base workers.dev locked, remote previews fail closed, localhost remains local: OK');
