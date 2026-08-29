import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';

// Jede Datei unter public/ ist oeffentlich abrufbar. Ein Skript, das niemand laedt, wird trotzdem
// ausgeliefert: es veraltet unbemerkt, es wird bei Sicherheitsarbeiten uebersehen und es verleitet
// spaeter dazu, es wieder anzuschliessen. Neun solcher Skripte lagen im Portal, darunter eine
// vollstaendige Kasse mit Checkout-Aufrufen, obwohl die Zahlungsabwicklung stillgelegt ist.

const SKIP=new Set(['node_modules','.git','.wrangler','dist','coverage','.github-cache']);
// Nur Dateien, die ein Skript tatsaechlich laden koennen. Fliesstext in .md nennt Dateinamen,
// laedt sie aber nicht - und dieser Test selbst nennt sie zwangslaeufig auch.
const TEXT=new Set(['.js','.mjs','.cjs','.ts','.tsx','.html','.json','.yml','.yaml','.css','.toml']);
// Ein ausgeliefertes Skript wird von HTML oder einem anderen Skript geladen - niemals von einem
// Test oder einem Build-Werkzeug. Die duerfen einen toten Namen also nicht am Leben halten.
const NOT_A_LOADER=/^(?:tests|scripts|docs)\//;

const files=[];
async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    if(SKIP.has(entry.name))continue;
    const path=join(dir,entry.name);
    if(entry.isDirectory())await walk(path);
    else if(TEXT.has(extname(entry.name)))files.push(path);
  }
}
await walk('.');
const source=new Map();
for(const file of files){const key=file.replace(/^\.\//,'');if(!NOT_A_LOADER.test(key))source.set(key,await readFile(file,'utf8'));}

const scripts=(await readdir('public')).filter(name=>name.endsWith('.js'));
const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// Ein Modul wird ueberall als blosser Name gefuehrt ('portal-teams-ui'), nicht nur als Pfad.
// Die Grenze nach hinten verhindert, dass timetable-bulk-v3 den toten timetable-bulk deckt.
const mentions=(name,text)=>new RegExp(`${escape(name)}(?![a-z0-9-])`,'i').test(text);

// Fixpunkt: zwei tote Skripte, die einander nennen, halten sich sonst gegenseitig am Leben.
const dead=new Set();
for(;;){
  const found=[];
  for(const script of scripts){
    if(dead.has(script))continue;
    const name=basename(script,'.js');
    const alive=[...source].some(([file,text])=>
      file!==`public/${script}`&&!dead.has(file.startsWith('public/')?file.slice(7):'')&&mentions(name,text));
    if(!alive)found.push(script);
  }
  if(!found.length)break;
  for(const script of found)dead.add(script);
}

// Diese 14 Dateien werden heute ausgeliefert, ohne dass irgendetwas sie laedt. Mehrere sind von
// anderen Pruefungen ausdruecklich stillgelegt ("must not silently return to runtime"), wurden aber
// nie entfernt. Sie stehen hier namentlich, damit der Bestand eingefroren ist: die Liste darf
// schrumpfen, niemals wachsen. Ein neues verwaistes Skript laesst diese Pruefung sofort scheitern.
const KNOWN=[
  'attendance-classbook-ui.js',   // von scripts/portal-ux-check.mjs in jeder Oberflaeche verboten
  'class-admin-scope-guard.js',   // class-admin.html laedt allein class-admin-entry.js
  'class-admin-ui.js',
  'class-admin-workspace.js',
  'class-enterprise-scope-ui.js',
  'commerce-ui.js',               // Vorgaenger von commerce-safe-ui.js, mit Checkout-Aufrufen
  'customer-admin-nav-labels.js', // von tests/customer-admin-navigation.mjs stillgelegt
  'customer-pretest-polish.js',   // von tests/runtime-asset-contracts.mjs stillgelegt
  'platform-offer-email-ui.js',   // abgeloest: platform-offers-ui.js versendet ueber /publish mit
  'portal-learning-compass-ui.js',
  'portal-performance.js',        // von tests/student-portal-performance-layout.mjs stillgelegt
  'student-dashboard-ui.js',      // abgeloest durch student-dashboard-v2.js
  'timetable-bulk-v2.js',         // abgeloest durch timetable-bulk-v3.js
  'timetable-bulk.js'
];
const known=new Set(KNOWN);

const zombies=[...dead].filter(script=>!known.has(script));
assert.deepEqual(zombies,[],
  `diese Skripte werden ausgeliefert, aber von nichts geladen: ${zombies.join(', ')}`);

// Sobald eine der bekannten Dateien entfernt ist, muss sie auch hier verschwinden - sonst waechst
// die Ausnahmeliste weiter, waehrend niemand mehr weiss, wofuer sie steht.
const scriptSet=new Set(scripts);
const stale=KNOWN.filter(name=>!scriptSet.has(name));
assert.deepEqual(stale,[],`diese Ausnahmen betreffen Dateien, die es nicht mehr gibt: ${stale.join(', ')}`);
const revived=KNOWN.filter(name=>scriptSet.has(name)&&!dead.has(name));
assert.deepEqual(revived,[],`diese Dateien werden wieder geladen und gehoeren nicht mehr auf die Ausnahmeliste: ${revived.join(', ')}`);

console.log(`Erreichbarkeit ausgelieferter Skripte: ${scripts.length} Dateien, ${dead.size} bekannte Altlasten, keine neue: OK`);
