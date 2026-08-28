import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Die Oberfläche rief /api/users auf - einen Pfad, den der Worker nie hatte. Der Aufruf war in
// ein catch gewickelt, das die leere Liste als Ergebnis ausgab, also fiel es nie auf: das
// Auswahlfeld für den Notfall-Kundenadmin bei SSO-Pflicht blieb immer leer. Diese Prüfung geht
// den umgekehrten Weg zur Router-Erreichbarkeit: jeder Pfad, den eine Oberfläche aufruft, muss
// vom Worker auch bedient werden.
async function walk(dir,out=[]){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const p=join(dir,entry.name);
    if(entry.isDirectory())await walk(p,out);
    else if(entry.name.endsWith('.ts'))out.push(p);
  }
  return out;
}

// Familien, bei denen ein Pfadsegment selbst der Parameter ist und der Worker sie bewusst als
// Präfix bedient. Der blanke /api/-Präfix gehört nicht dazu: das ist der Zuständigkeitstest des
// Sammelrouters, kein Route - würde er zählen, wäre diese Prüfung wertlos.
const GENERIC=['/api/content/','/api/education/planning/','/api/learning-admin/','/api/moat/','/api/v1/'];
const exact=new Set(),patterns=[];
for(const file of await walk('src')){
  const src=await readFile(file,'utf8');
  for(const m of src.matchAll(/[!=]==\s*'(\/api\/[^']*)'/g))exact.add(m[1]);
  for(const m of src.matchAll(/\.match\((\/\^[^\n]*?\/)[gimsuy]*\)/g)){
    const body=m[1].slice(1,-1);
    if(!body.includes('api'))continue;
    try{patterns.push(new RegExp(body));}catch{/* kein gültiges Muster, dann zählt es nicht */}
  }
}
assert.ok(exact.size>150,`expected the worker's routes to be discovered, found ${exact.size}`);
assert.ok(patterns.length>50,`expected the worker's path patterns to be discovered, found ${patterns.length}`);

const calls=new Map();
for(const file of (await readdir('public')).filter(f=>f.endsWith('.js'))){
  const source=await readFile(`public/${file}`,'utf8');
  for(const m of source.matchAll(/["'`](\/api\/(?:[A-Za-z0-9/_.\-]|\$\{[^}]*\})*)/g)){
    const path=m[1].replace(/\$\{[^}]*\}/g,'§').replace(/\/+$/,'');
    if(path.length>5&&!calls.has(path))calls.set(path,file);
  }
}
assert.ok(calls.size>200,`expected the interfaces' API calls to be discovered, found ${calls.size}`);

// Ein Platzhalter, der die üblichen Kennungsformen erfüllt: 24 Hexzeichen sind zugleich
// alphanumerisch und passen damit auf [^/]+, [A-Za-z0-9]+ und [a-f0-9]{24}.
const ID='abcdef0123456789abcdef01';
// Manche Aufrufe setzen auch das letzte Segment erst zur Laufzeit zusammen - etwa
// /api/certificates/<id>/<approve|issue>. Ein Platzhalter trifft dort kein Muster, obwohl der
// Worker beide Endpunkte hat. Deshalb wird zusätzlich die Form verglichen: der aufgerufene Pfad
// als Muster gegen die Routen des Workers und gegen je ein Beispiel seiner eigenen Muster.
const shapeOf=path=>new RegExp('^'+path.split('§').map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[^/]+')+'$');
const samples=[];
for(const pattern of patterns){
  const sample=pattern.source.replace(/^\^/,'').replace(/\$$/,'').replace(/\\\//g,'/')
    .replace(/\((?:\?:)?[^()]*\)[?*+]?/g,ID);
  if(!/[\\()[\]{}*+?|^$]/.test(sample))samples.push(sample);
}
const served=path=>{
  const concrete=path.replace(/§/g,ID);
  if(exact.has(concrete)||exact.has(path))return true;
  if(GENERIC.some(prefix=>concrete.startsWith(prefix)))return true;
  if(patterns.some(pattern=>pattern.test(concrete)))return true;
  if(!path.includes('§'))return false;
  const shape=shapeOf(path);
  return [...exact].some(route=>shape.test(route))||samples.some(sample=>shape.test(sample));
};
const unserved=[...calls].filter(([path])=>!served(path)).map(([path,file])=>`${path}  (${file})`);
assert.deepEqual(unserved,[],`diese Oberflächen rufen Pfade auf, die der Worker nicht bedient:\n${unserved.join('\n')}`);

console.log(`Every API path the interfaces call is served by the Worker (${calls.size} paths against ${exact.size} routes and ${patterns.length} patterns): OK`);
