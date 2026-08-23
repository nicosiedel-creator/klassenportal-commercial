import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const root=process.cwd();
const out=path.join(root,'dist-vfa13-pages');
const npx=process.platform==='win32'?'npx.cmd':'npx';

await rm(out,{recursive:true,force:true});
await mkdir(out,{recursive:true});
await cp(path.join(root,'public'),out,{recursive:true});

execFileSync(npx,[
  'wrangler','deploy','--dry-run',
  '--config','wrangler.vfa13-bundle.jsonc',
  '--outfile',path.join(out,'_worker.js'),
],{stdio:'inherit'});

const worker=await stat(path.join(out,'_worker.js'));
if(!worker.isFile()||worker.size<1000)throw new Error('VFA13_PAGES_WORKER_BUNDLE_INVALID');

console.log(`VFA13 Pages bundle ready: ${out} (${worker.size} byte _worker.js)`);
