import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';

const portalHtml=['customer-admin.html','class-portal.html','dozentenportal.html','department-lead.html','platform-admin.html'];
const strip=url=>String(url).split('?')[0].split('#')[0];
const localAsset=url=>url.startsWith('/')&&!url.startsWith('//');

for(const name of portalHtml){
  const html=await readFile(`public/${name}`,'utf8');
  const urls=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(localAsset).map(strip).filter(x=>/\.(?:js|css|webmanifest|svg)$/.test(x));
  const seen=new Set();
  for(const url of urls){assert.ok(!seen.has(url),`${name}: duplicate runtime asset ${url}`);seen.add(url);await access(`public${url}`).catch(()=>assert.fail(`${name}: referenced runtime asset does not exist: ${url}`));}
}

const customer=await readFile('public/customer-admin.html','utf8');
const lazy=await readFile('public/customer-admin-lazy-modules.js','utf8');
const manifest=(customer.match(/<template id="kp-lazy-module-manifest">([\s\S]*?)<\/template>/)||[])[1]||'';
const manifestModules=new Set([...manifest.matchAll(/\/([a-z0-9-]+)\.js\b/gi)].map(m=>m[1]));
const groupBlock=(lazy.match(/const GROUPS=\{([\s\S]*?)\n  \};/)||[])[1]||'';
const loaderModules=new Set([...groupBlock.matchAll(/'([a-z0-9-]+)'/gi)].map(m=>m[1]).filter(name=>!['learning','organization','automation','technology','commerce'].includes(name)));
assert.deepEqual(loaderModules,manifestModules,'customer lazy-module manifest and actual loader must describe the same modules');
for(const name of loaderModules)await access(`public/${name}.js`).catch(()=>assert.fail(`customer lazy module does not exist: /${name}.js`));

const explicitScripts=[...customer.matchAll(/<script[^>]+src="([^"]+\.js(?:\?[^"]*)?)"/g)].map(m=>strip(m[1]));
for(const name of loaderModules)assert.ok(!explicitScripts.includes(`/${name}.js`),`customer module is both eager and lazy: /${name}.js`);
assert.ok(loaderModules.has('customer-moat-ui'),'work assistant must remain present in audited lazy manifest');
assert.ok(!explicitScripts.includes('/customer-moat-ui.js'),'work assistant implementation must not be eager-loaded');
assert.ok(!explicitScripts.includes('/customer-pretest-polish.js'),'retired compatibility patch must not silently return to runtime');
assert.ok(!explicitScripts.includes('/customer-support-mode.js'),'retired fetch shim must not silently return to runtime');
assert.ok(explicitScripts.length<=12,`customer initial script count regressed to ${explicitScripts.length}`);

console.log('Runtime asset wiring, existence, duplication and on-demand manifest contracts: OK');
