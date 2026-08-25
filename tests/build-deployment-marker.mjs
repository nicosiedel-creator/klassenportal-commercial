import { strict as assert } from 'node:assert';
import { stampHomepageBuildCommit } from '../scripts/build-metadata-lib.mjs';

const a='0123456789abcdef0123456789abcdef01234567';
const b='89abcdef0123456789abcdef0123456789abcdef';
const base='<!doctype html><html><head><meta charset="utf-8"><title>x</title></head><body></body></html>';

const stamped=stampHomepageBuildCommit(base,a);
assert.ok(stamped.includes(`<meta name="kp-build-commit" content="${a}">`));
assert.equal((stamped.match(/kp-build-commit/g)||[]).length,1);

const replaced=stampHomepageBuildCommit(stamped,b);
assert.ok(replaced.includes(`<meta name="kp-build-commit" content="${b}">`));
assert.ok(!replaced.includes(a));
assert.equal((replaced.match(/kp-build-commit/g)||[]).length,1);

assert.throws(()=>stampHomepageBuildCommit(base,'not-a-sha'),/BUILD_COMMIT_SHA_INVALID/);
assert.throws(()=>stampHomepageBuildCommit('<html><body></body></html>',a),/BUILD_COMMIT_MARKER_HEAD_MISSING/);
assert.throws(()=>stampHomepageBuildCommit(`${stamped}${stamped}`,b),/BUILD_COMMIT_MARKER_DUPLICATE/);

console.log('Exact homepage deployment marker stamping: OK');
