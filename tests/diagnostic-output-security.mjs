import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

const capture=await readFile('scripts/cloudflare-diagnostic-capture.mjs','utf8');
const worker=await readFile('scripts/diagnostic-worker.ts','utf8');

assert.match(capture,/function redact\(value\)/,'diagnostic output must pass through an explicit redaction function');
assert.match(capture,/Bearer \[REDACTED\]/,'bearer credentials must be redacted before publication');
assert.match(capture,/REDACTED_STRIPE_KEY/,'Stripe-style keys must be redacted before publication');
assert.match(capture,/function safeDiagnostic\(raw\)/,'only a reduced diagnostic view may be published');
assert.match(capture,/errorLine\.test\(line\)&&!sensitiveName\.test\(line\)/,'published diagnostic lines must be error-focused and exclude secret-labelled lines');
assert.doesNotMatch(capture,/parts\.push\(text\.slice/,'raw stdout/stderr must never be embedded into the public diagnostic payload');
assert.doesNotMatch(capture,/parts\.push\([^\n]*(?:r\.stdout|r\.stderr)/,'raw subprocess output must never be pushed directly into the report');
assert.match(worker,/cache-control':'no-store'/,'diagnostic endpoint must not be cached');
assert.match(worker,/x-robots-tag':'noindex, nofollow'/,'diagnostic endpoint must remain excluded from indexing');

console.log('Diagnostic preview publishes only reduced, redacted build failure data: OK');
