import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { contentDisposition } from '../dist/portability/utils.js';

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

// A download name is data the caller supplied, never a location, and a German product must not
// mangle umlauts out of it.
const dispositions=[
  ['../../etc/passwd.pdf','passwd.pdf'],
  ['..\\..\\windows\\cmd.exe','cmd.exe'],
  ['   ...hidden.pdf','hidden.pdf'],
  ['a"b.pdf','ab.pdf'],
  ['','export'],
];
for(const [input,expectedAscii] of dispositions){
  const header=contentDisposition(input);
  assert.match(header,new RegExp(`^attachment; filename="${expectedAscii.replace(/\./g,'\\.')}"`),`a download name must never carry a path segment: ${JSON.stringify(input)} -> ${header}`);
  assert.doesNotMatch(header,/%2F|%5C|\.\.|[\r\n]/i,`the RFC 5987 form must not carry a path segment either: ${header}`);
}
const german=contentDisposition('Lernmaterial Übung 1.pdf');
assert.match(german,/filename\*=UTF-8''Lernmaterial%20%C3%9Cbung%201\.pdf$/,'a German file name must survive the download unchanged');
assert.match(german,/filename="Lernmaterial_U_bung_1\.pdf"/,'the ASCII fallback must stay for clients that ignore filename*');
assert.match(contentDisposition('bericht.html','inline'),/^inline; /,'inline reports must keep their disposition type');

console.log('API transport contract: awaited handlers, status-preserving auth routes and safe download names: OK');
