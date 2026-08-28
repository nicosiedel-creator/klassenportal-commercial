import { strict as assert } from 'node:assert';
import { readFile, readdir } from 'node:fs/promises';

// Ein Router, der gebaut, aber nie aufgerufen wird, fällt nicht auf: Seine Pfade landen im
// Sammelzweig von handleCoreApi und beantworten jede Anfrage mit 404 - obwohl die Oberfläche
// sie aufruft. Genau so waren /api/certificates/* und /api/workflows* unerreichbar, samt der
// öffentlichen Zeugnisprüfung. Diese Prüfung verlangt, dass jeder Router-Einstiegspunkt vom
// Worker aus erreichbar ist, direkt oder über einen anderen Router.
const entry=await readFile('src/index.ts','utf8');
const files=(await readdir('src/core')).filter(name=>name.endsWith('-router.ts'));

const owner=new Map(),sources=new Map();
for(const name of files){
  const path=`src/core/${name}`,source=await readFile(path,'utf8');
  sources.set(path,source);
  for(const match of source.matchAll(/export async function (handle[A-Za-z0-9]*)\s*\(/g))owner.set(match[1],path);
}
assert.ok(owner.size>=25,`expected the worker's router modules to be discovered, found ${owner.size}`);

function referenced(source){
  return [...owner.keys()].filter(name=>new RegExp(`\\b${name}\\s*\\(`).test(source));
}
const reachable=new Set(referenced(entry));
assert.ok(reachable.size,'src/index.ts must dispatch router entry points');
for(let changed=true;changed;){
  changed=false;
  for(const name of [...reachable]){
    const path=owner.get(name);
    if(!path)continue;
    for(const next of referenced(sources.get(path)))if(!reachable.has(next)){reachable.add(next);changed=true;}
  }
}
const orphans=[...owner.keys()].filter(name=>!reachable.has(name));
assert.deepEqual(orphans,[],`router entry points the Worker never calls: ${orphans.join(', ')}`);

// Der Sammelzweig von handleCoreApi beantwortet jeden unbekannten /api-Pfad mit 404. Jeder
// eigenständige Router muss deshalb davor laufen, sonst kommt er nie zum Zug.
const core=entry.indexOf('handleCoreApi(request,env)');
assert.ok(core>0,'src/index.ts must dispatch the core API');
for(const name of referenced(entry)){
  if(name==='handleCoreApi'||name==='handlePublicApi')continue;
  assert.ok(entry.indexOf(`${name}(request,env)`)<core,`${name} must be dispatched before the core API catch-all`);
}

// Die Oberflächen rufen diese Pfade auf; sie müssen von einem Router bedient werden.
const uiPaths=[['/api/certificates','src/core/certificates-router.ts'],['/api/workflows','src/core/workflow-router.ts']];
for(const [prefix,path] of uiPaths){
  const source=sources.get(path);
  assert.ok(source?.includes(`path.startsWith('${prefix}`),`${path} must own ${prefix}`);
  const handler=[...owner].find(([,file])=>file===path)?.[0];
  assert.ok(reachable.has(handler),`${prefix} is called by the interface but ${handler} is unreachable`);
}
console.log(`Every router entry point is reachable from the Worker (${owner.size} checked): OK`);
