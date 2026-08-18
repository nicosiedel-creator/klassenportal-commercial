import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { normalizeCustomHostname } from '../dist/core/custom-domains.js';

const domains=await readFile('src/core/custom-domains.ts','utf8');
const data=await readFile('src/core/data.ts','utf8');
const migration=await readFile('migrations/0040_custom_domains.sql','utf8');
const index=await readFile('src/index.ts','utf8');
const ui=await readFile('public/custom-domain-ui.js','utf8');

assert.equal(normalizeCustomHostname('portal.schule.de','https://app.klassenportal.de'),'portal.schule.de');
for(const bad of ['localhost','127.0.0.1','foo.local','demo.invalid','x.workers.dev','x.pages.dev','*.schule.de','https://schule.de','app.klassenportal.de'])assert.throws(()=>normalizeCustomHostname(bad,'https://app.klassenportal.de'),/CUSTOM_DOMAIN_/);

assert.match(domains,/method:'txt'/,'custom hostname must use TXT DCV');
assert.match(domains,/type:'dv'/,'custom hostname must use domain validation certificates');
assert.match(domains,/min_tls_version:'1\.2'/,'custom hostname must require TLS 1.2 minimum');
assert.match(domains,/tls_1_3:'on'/,'TLS 1.3 must be enabled');
assert.match(domains,/hostnameStatus==='active'&&sslStatus==='active'/,'custom domain must activate only when hostname and certificate are both active');
assert.match(domains,/CUSTOM_DOMAIN_MODULE_NOT_ACTIVE/,'custom domain provisioning must require the paid/active entitlement');
assert.match(data,/CUSTOM_DOMAIN_MANAGED_SEPARATELY/,'generic branding update must not bypass custom domain verification');
assert.match(migration,/trg_verified_custom_domain_update/,'database must reject direct unverified custom domain updates');
assert.match(migration,/d\.status='active'/,'database guard must only accept active verified domain request');
assert.match(index,/reconcilePendingCustomDomains/,'scheduler must reconcile pending custom domains');
assert.ok(!domains.includes('CLOUDFLARE_API_TOKEN:'),'provider token must never be serialized into customer response');
assert.match(ui,/Domain-Inhaberschaft/,'customer UI must expose ownership validation DNS record');
assert.match(ui,/Zertifikatsprüfung/,'customer UI must expose certificate validation DNS records');

console.log('Custom domain provisioning/security tests: OK');
