import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';

// Returning a promise from inside a try block does not route its rejection through the catch.
// A handler invoked that way loses its router's status mapping and is answered by the top-level
// error handler with 500, which is how LOGIN_RATE_LIMITED reached clients as a server error.
const files=[...(await readdir('src/core')).filter(name=>name.endsWith('-router.ts')),'router.ts','enterprise-api.ts'];
const offenders=[];
for(const file of files){
  const source=await readFile(`src/core/${file}`,'utf8');
  const lines=source.split('\n');
  let depth=0;
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    if(/\btry\s*\{/.test(line))depth++;
    if(depth>0&&/\}\s*catch\b/.test(line))depth=Math.max(0,depth-1);
    if(depth===0)continue;
    // Only flag a bare `return handler(env, ...)` - json(...) wrappers already await inside.
    for(const match of line.matchAll(/return\s+([a-z][A-Za-z0-9_]*)\(env\s*,/g)){
      const before=line.slice(0,match.index);
      if(/await\s+$/.test(before))continue;
      if(/=>\s*$/.test(before))continue;
      offenders.push(`src/core/${file}:${i+1} return ${match[1]}(env,…)`);
    }
  }
}
assert.deepEqual(offenders,[],`every handler invoked inside a router try block must be awaited so its error keeps its own status:\n${offenders.join('\n')}`);

// The authentication routes carry domain codes that clients act on. They must not be able to
// escape their router.
const router=await readFile('src/core/router.ts','utf8');
for(const handler of ['login','logout','changePassword','downloadLearningMaterial'])
  assert.match(router,new RegExp(`return await ${handler}\\(`),`${handler} must be awaited so its failure keeps its documented status`);
assert.match(router,/code==='LOGIN_RATE_LIMITED'\?429/,'brute-force protection must answer 429, not a server error');

console.log('API transport error contract: awaited handlers and status-preserving auth routes: OK');
