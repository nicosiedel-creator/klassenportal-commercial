import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const runtime=await readFile(new URL('../src/vfa13-pages.ts',import.meta.url),'utf8');
const pagesConfig=JSON.parse((await readFile(new URL('../wrangler.vfa13-pages.jsonc',import.meta.url),'utf8')).replace(/^\s*\/\/.*$/gm,''));
const bundleConfig=JSON.parse((await readFile(new URL('../wrangler.vfa13-bundle.jsonc',import.meta.url),'utf8')).replace(/^\s*\/\/.*$/gm,''));
const buildScript=await readFile(new URL('../scripts/build-vfa13-pages.mjs',import.meta.url),'utf8');

assert.match(runtime,/VFA13_HOST='vfa13-klassenportal\.pages\.dev'/,'VFA13 host must be pinned');
assert.match(runtime,/access_mode='public'/,'VFA13 participant course must stay public/no-login');
assert.match(runtime,/\/portal\/\$\{VFA13_TENANT_SLUG\}\/\$\{VFA13_COURSE_CODE\}/,'root must route to the VFA13 participant portal');
assert.match(runtime,/new URL\('\/kunden-admin',url\)/,'legacy /admin must route to protected customer admin');
assert.match(runtime,/url\.pathname==='\/api\/platform'/,'platform API must be blocked on the VFA13 host');
assert.match(runtime,/url\.pathname==='\/plattform-admin'/,'platform admin UI must be blocked on the VFA13 host');
assert.match(runtime,/APP_ORIGIN:undefined/,'VFA13 wrapper must explicitly use isolated preview gating semantics');
assert.match(runtime,/payment_required,auto_convert/,'pilot metadata must preserve no-paid-auto-convert fields');
assert.match(runtime,/VALUES\(\?,\?,\?,\?,\?,3,'active',0,0/,'VFA13 pilot must not auto-convert to paid');
for(const feature of ['schedule','homework','appointments','exams','files','learning_materials','assignments','gradebook','attendance','classbook','teacher_portal','communications','teams','participant_360','planning','curriculum','education_os']){
  assert.ok(runtime.includes(`'${feature}'`),`VFA13 runtime must enable ${feature}`);
}
for(const subject of ['WiSo','PersW','POR','VBW','Soz','AVR','StR/ÖR','PR/BGB'])assert.ok(runtime.includes(`'${subject}'`),`VFA13 subject seed missing ${subject}`);
assert.equal(pagesConfig.name,'vfa13-klassenportal');
assert.equal(pagesConfig.pages_build_output_dir,'./dist-vfa13-pages');
assert.equal(pagesConfig.d1_databases?.[0]?.binding,'DB');
assert.equal(pagesConfig.d1_databases?.[0]?.database_name,'klassenportal-commercial');
assert.equal(pagesConfig.r2_buckets?.[0]?.binding,'FILES');
assert.equal(pagesConfig.r2_buckets?.[0]?.bucket_name,'klassenportal-commercial-files');
assert.equal(bundleConfig.main,'src/vfa13-pages.ts');
assert.match(buildScript,/dist-vfa13-pages/);
assert.match(buildScript,/_worker\.js/);
assert.match(buildScript,/wrangler','deploy','--dry-run'/);

const combined=`${runtime}\n${JSON.stringify(pagesConfig)}\n${buildScript}`;
for(const forbidden of ['CLOUDFLARE_API_TOKEN=','CLOUDFLARE_ACCOUNT_ID=','STRIPE_SECRET_KEY=','OWNER_MFA_ENCRYPTION_KEY='])assert.ok(!combined.includes(forbidden),`secret literal forbidden: ${forbidden}`);

console.log('VFA13 Pages runtime contract OK');
