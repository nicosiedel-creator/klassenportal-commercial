import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';

const portalHtml=['customer-admin.html','class-portal.html','dozentenportal.html','department-lead.html','platform-admin.html'];
const strip=url=>String(url).split('?')[0].split('#')[0];
const localAsset=url=>url.startsWith('/')&&!url.startsWith('//');

for(const name of portalHtml){
  const html=await readFile(`public/${name}`,'utf8');
  const urls=[...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(m=>m[1]).filter(localAsset).map(strip).filter(x=>/\.(?:js|css|webmanifest|svg)$/.test(x));
  const seen=new Set();
  for(const url of urls){
    assert.ok(!seen.has(url),`${name}: duplicate runtime asset ${url}`);seen.add(url);
    await access(`public${url}`).catch(()=>assert.fail(`${name}: referenced runtime asset does not exist: ${url}`));
  }
}

const customer=await readFile('public/customer-admin.html','utf8');
const lazy=await readFile('public/customer-admin-lazy-modules.js','utf8');
const manifest=(customer.match(/<template id="kp-lazy-module-manifest">([\s\S]*?)<\/template>/)||[])[1]||'';
const manifestModules=[...manifest.matchAll(/\/(?:[a-z0-9-]+)\.js\?v=[^\s<]+/gi)].map(m=>strip(m[0]));
const loaderModules=[...lazy.matchAll(/'\/(?:[a-z0-9-]+)\.js\?v=[^']+'/gi)].map(m=>strip(m[0].slice(1,-1)));
assert.deepEqual(new Set(loaderModules),new Set(manifestModules),'customer lazy-module manifest and actual loader must describe the same modules');
assert.equal(loaderModules.length,new Set(loaderModules).size,'customer lazy loader must not import a module twice');
for(const url of loaderModules)await access(`public${url}`).catch(()=>assert.fail(`customer lazy module does not exist: ${url}`));

const explicitScripts=[...customer.matchAll(/<script[^>]+src="([^"]+\.js(?:\?[^"]*)?)"/g)].map(m=>strip(m[1]));
for(const url of loaderModules)assert.ok(!explicitScripts.includes(url),`customer module is both eager and lazy: ${url}`);
assert.ok(explicitScripts.includes('/customer-moat-ui.js'),'work assistant must be an explicit audited runtime asset');
assert.ok(!explicitScripts.includes('/customer-pretest-polish.js'),'unwired pretest patch must not silently return to production runtime');

console.log('Runtime asset wiring, existence, duplication and lazy-manifest contracts: OK');
