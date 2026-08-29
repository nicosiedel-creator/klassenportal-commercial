import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Zwei echte Kundeneinrichtungen scheiterten in Produktion mit
//   D1_ERROR: FEATURE_NOT_ENTITLED: SQLITE_CONSTRAINT_TRIGGER
// Produktion enthaelt einen historischen Trigger, den die Migrationen nicht kennen (dokumentiert
// in migrations/0082): er weist Schreibzugriffe auf feature_flags fuer bezahlpflichtige
// Modulschluessel ab, auch planverwaltete. Welche Schluessel das sind, steht ausschliesslich in
// der Produktionsdatenbank.
//
// Ein erster Versuch hat diese Liste geraten und sieben Schluessel aus dem atomaren Einsatz
// genommen. Der Fehler blieb: die Regel weist mehr ab. Deshalb prueft dieser Test keine
// Schluesselliste mehr, sondern die einzige Eigenschaft, die ohne diese Liste auskommt:
//
//   Keine Modulzeile - welche auch immer - darf die Portalanlage zum Scheitern bringen.
//
// Ein Portal, dem eine Modulzeile fehlt, ist zu reparieren. Ein Portal, das gar nicht entsteht,
// nicht.

const provision=await readFile('src/core/provision.ts','utf8');
const data=await readFile('src/core/data.ts','utf8');

const setOf=name=>new Set([...((data.match(new RegExp(`const ${name}=new Set\\(\\[([^\\]]*)\\]`))||['',''])[1]).matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]));
const standard=setOf('STANDARD_MODULES'),billing=setOf('BILLING_MODULES'),pkg=setOf('PACKAGE_MODULES');
assert.ok(standard.size&&billing.size&&pkg.size,'die Modulklassen muessen auffindbar bleiben');

const listOf=name=>[...((provision.match(new RegExp(`const ${name}=\\[([^\\]]*)\\]`))||['',''])[1]).matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]);
const defaults=listOf('defaultFeatures'),optional=listOf('optionalFeatures');
assert.ok(defaults.length&&optional.length,'die Modullisten der Anlage muessen auffindbar bleiben');

// ---------------------------------------------------------------------------------------------
// 1. Der atomare Einsatz darf keine einzige Modulzeile mehr enthalten.
// ---------------------------------------------------------------------------------------------
const atomicBatch='await env.DB.batch(statements);';
const batchAt=provision.indexOf(atomicBatch);
assert.ok(batchAt>0,'die Portalanlage muss weiterhin in einem atomaren Einsatz erfolgen');
const beforeBatch=provision.slice(0,batchAt);
assert.ok(!/statements\.push\([^\n]*feature_flags/.test(beforeBatch),
  'keine Modulzeile darf im atomaren Einsatz stehen - eine abgewiesene Zeile riss sonst die ganze Anlage mit');
assert.ok(beforeBatch.includes('INSERT INTO tenants'),'der Mandant selbst gehoert weiterhin in den atomaren Einsatz');

// ---------------------------------------------------------------------------------------------
// 2. Danach: nachsichtig, mit Einzelnachfassen und einem Protokolleintrag ueber das Abgewiesene.
// ---------------------------------------------------------------------------------------------
const afterBatch=provision.slice(batchAt+atomicBatch.length);
assert.match(afterBatch,/INSERT OR IGNORE INTO feature_flags/,
  'die Modulzeilen muessen nach dem Anlegen geschrieben werden');
assert.match(afterBatch,/env\.DB\.batch\([^;]*featureStatement\)[\s\S]{0,120}?\.catch\(/,
  'ein Einsatz fuer alle Modulzeilen, dessen Scheitern die Anlage nicht mitreisst');
assert.match(afterBatch,/featureStatement\(row\)\.run\(\)\.catch\(/,
  'wird der Einsatz abgewiesen, muss einzeln nachgefasst werden - sonst fehlen alle Zeilen statt nur der verbotenen');
assert.match(afterBatch,/'feature_flags_rejected'/,
  'was die Datenbank nicht zugelassen hat, darf nicht stillschweigend verschwinden');

// ---------------------------------------------------------------------------------------------
// 3. Ein fehlendes Standardmodul muss nachtraeglich anlegbar sein, sonst ist der Kunde
//    dauerhaft ausgesperrt. Bezahlmodule bleiben unberuehrt.
// ---------------------------------------------------------------------------------------------
const setModule=data.slice(data.indexOf('export async function setModule('));
const setModuleBody=setModule.slice(0,setModule.indexOf('\nexport '));
assert.match(setModuleBody,/if\(!current&&STANDARD_MODULES\.has\(key\)\)\{[\s\S]*?INSERT OR IGNORE INTO feature_flags/,
  'setModule muss eine fehlende Standardmodulzeile nachholen koennen');
assert.match(setModuleBody,/if\(!current\)throw new Error\('FEATURE_NOT_AVAILABLE'\)/,
  'fuer alles andere bleibt eine fehlende Zeile ein Fehler');
assert.match(setModuleBody,/BILLING_MODULES\.has\(key\)\)throw new Error\('MODULE_MANAGED_BY_BILLING'\)/,
  'Abrechnungsmodule bleiben gesperrt');
assert.match(setModuleBody,/PACKAGE_MODULES\.has\(key\)\)throw new Error\('MODULE_MANAGED_BY_PACKAGE'\)/,
  'Paketmodule bleiben gesperrt');
const restoreBlock=setModuleBody.slice(setModuleBody.indexOf('if(!current&&STANDARD_MODULES'));
assert.ok(restoreBlock.indexOf('return;')<restoreBlock.indexOf('BILLING_MODULES')||!restoreBlock.includes('BILLING_MODULES'),
  'die Nachholung gilt nur fuer Standardmodule');

// ---------------------------------------------------------------------------------------------
// 4. Ausgefuehrt statt gelesen. Der Trigger wird nachgebaut - und zwar gegen den schlimmsten
//    Fall, in dem er JEDEN Modulschluessel abweist. Ohne die echte Schluesselliste ist das die
//    einzige Annahme, die nicht wieder falsch sein kann.
// ---------------------------------------------------------------------------------------------
const { DatabaseSync }=await import('node:sqlite');
const allKeys=[...defaults,...optional];
const schema=`CREATE TABLE tenants(id TEXT PRIMARY KEY);
  CREATE TABLE feature_flags(tenant_id TEXT NOT NULL,feature_key TEXT NOT NULL,enabled INTEGER NOT NULL,source TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,feature_key));
  CREATE TABLE provisioning_log(id TEXT PRIMARY KEY,tenant_id TEXT,action TEXT NOT NULL,status TEXT NOT NULL,detail_json TEXT,created_at TEXT NOT NULL);`;
const triggerFor=keys=>keys.length?`CREATE TRIGGER feature_entitlement_guard BEFORE INSERT ON feature_flags
    WHEN NEW.feature_key IN (${keys.map(k=>`'${k}'`).join(',')})
    BEGIN SELECT RAISE(ABORT,'FEATURE_NOT_ENTITLED'); END;`:'';

// Bildet nach, was provisionInternal tut: der atomare Einsatz legt den Mandanten an, danach die
// Modulzeilen in einem Einsatz, bei dessen Scheitern einzeln nachgefasst wird.
function provisionInto(db,{featuresInsideBatch=false}={}){
  db.exec('DELETE FROM provisioning_log;DELETE FROM feature_flags;DELETE FROM tenants;');
  const insert=key=>db.prepare("INSERT OR IGNORE INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES(?,?,?,'plan',?)")
    .run('ten_x',key,defaults.includes(key)?1:0,'t');
  try{
    db.exec('BEGIN');
    db.prepare('INSERT INTO tenants(id) VALUES(?)').run('ten_x');
    if(featuresInsideBatch)for(const key of allKeys)insert(key);
    db.exec('COMMIT');
  }catch{db.exec('ROLLBACK');return{created:false,flags:[],rejected:null};}
  let rejected=null;
  if(!featuresInsideBatch){
    let written=true;
    try{db.exec('BEGIN');for(const key of allKeys)insert(key);db.exec('COMMIT');}
    catch{db.exec('ROLLBACK');written=false;}
    if(!written){
      rejected=[];
      for(const key of allKeys)try{insert(key);}catch{rejected.push(key);}
      db.prepare("INSERT INTO provisioning_log(id,tenant_id,action,status,detail_json,created_at) VALUES(?,?,'feature_flags_rejected','completed',?,?)")
        .run('prv_x','ten_x',JSON.stringify({rejected:[...rejected].sort()}),'t');
    }
  }
  return{
    created:!!db.prepare('SELECT id FROM tenants WHERE id=?').get('ten_x'),
    flags:db.prepare('SELECT feature_key FROM feature_flags ORDER BY feature_key').all().map(r=>r.feature_key),
    rejected,
    logged:db.prepare("SELECT detail_json FROM provisioning_log WHERE action='feature_flags_rejected'").all().map(r=>r.detail_json),
  };
}

const open=keys=>{const db=new DatabaseSync(':memory:');db.exec(schema+triggerFor(keys));return db;};

// 4a. Schlimmster Fall: die Regel weist jeden einzelnen Schluessel ab.
const strictest=open(allKeys);
assert.equal(provisionInto(strictest,{featuresInsideBatch:true}).created,false,
  'der nachgebaute Trigger muss die alte Reihenfolge abweisen - sonst prueft dieser Test nichts');
const worst=provisionInto(strictest);
assert.equal(worst.created,true,'auch wenn jede Modulzeile abgewiesen wird, muss das Portal entstehen');
assert.deepEqual(worst.rejected.sort(),[...allKeys].sort(),'alle abgewiesenen Schluessel muessen benannt werden');
assert.equal(worst.logged.length,1,'die Abweisung muss genau einmal protokolliert werden');
for(const key of allKeys)assert.ok(worst.logged[0].includes(key),`${key} fehlt im Protokoll der abgewiesenen Schluessel`);

// 4b. Der wirklich beobachtete Fall: die Regel weist einen Teil ab. Der Rest muss trotzdem
//     entstehen - sonst waere aus einer verbotenen Zeile ein Portal ohne jedes Modul geworden.
const someKeys=[...billing,...pkg].filter(k=>allKeys.includes(k));
assert.ok(someKeys.length,'die Abrechnungs- und Paketmodule muessen in der Anlage vorkommen');
const partial=provisionInto(open(someKeys));
assert.equal(partial.created,true,'auch bei teilweiser Abweisung muss das Portal entstehen');
assert.deepEqual(partial.rejected.sort(),[...someKeys].sort(),'genau die verbotenen Schluessel duerfen fehlen');
for(const key of allKeys.filter(k=>!someKeys.includes(k)))
  assert.ok(partial.flags.includes(key),`${key} ist erlaubt und muss trotz der Abweisung anderer entstehen`);

// 4c. Ohne Trigger darf sich nichts aendern - sonst waere die Behebung ein stiller
//     Funktionsverlust.
const healthy=provisionInto(open([]));
assert.equal(healthy.created,true,'ohne Trigger muss die Anlage erst recht gelingen');
assert.equal(healthy.rejected,null,'ohne Trigger darf gar nicht erst einzeln nachgefasst werden');
assert.deepEqual(healthy.flags,[...allKeys].sort(),'ohne Trigger muessen weiterhin alle Modulzeilen entstehen');
assert.deepEqual(healthy.logged,[],'ohne Abweisung darf nichts protokolliert werden');

console.log(`Berechtigungs-Trigger: das Portal entsteht auch dann, wenn die Datenbank alle ${allKeys.length} Modulzeilen abweist; erlaubte Zeilen entstehen weiterhin, abgewiesene werden protokolliert: OK`);
