import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';

// Eine echte Kundeneinrichtung scheiterte in Produktion mit
//   D1_ERROR: FEATURE_NOT_ENTITLED: SQLITE_CONSTRAINT_TRIGGER
// Produktion enthaelt einen historischen Trigger, den die Migrationen nicht kennen (dokumentiert
// in migrations/0082): er weist Schreibzugriffe auf bezahlpflichtige Modulschluessel ab, auch
// plan-verwaltete. Die Portalanlage schrieb genau diese Schluessel als Platzhalter mit enabled=0
// mit - im selben atomaren Einsatz wie den Mandanten selbst. Ein abgelehnter Platzhalter riss
// deshalb die gesamte Anlage mit, und es war ueberhaupt kein neuer Kunde einzurichten.
//
// Die Platzhalter tragen keine Aussage: jeder Lesepfad wertet eine fehlende Zeile genauso
// (row?.enabled||0), und setModule lehnt diese Schluessel ohnehin immer ab. Sie duerfen die
// Anlage also unter keinen Umstaenden zum Scheitern bringen.

const provision=await readFile('src/core/provision.ts','utf8');
const data=await readFile('src/core/data.ts','utf8');

const setOf=name=>new Set([...((data.match(new RegExp(`const ${name}=new Set\\(\\[([^\\]]*)\\]`))||['',''])[1]).matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]));
const billing=setOf('BILLING_MODULES'),pkg=setOf('PACKAGE_MODULES'),standard=setOf('STANDARD_MODULES');
assert.ok(billing.size&&pkg.size&&standard.size,'die Modulklassen muessen auffindbar bleiben');

const optional=[...((provision.match(/const optionalFeatures=\[([^\]]*)\]/)||['',''])[1]).matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]);
const guarded=[...((provision.match(/const guardedFeatures=new Set\(\[([^\]]*)\]/)||['',''])[1]).matchAll(/'([a-z0-9_]+)'/g)].map(m=>m[1]);
assert.ok(optional.length,'die optionalen Module muessen auffindbar bleiben');
assert.ok(guarded.length,'die bewachten Schluessel muessen benannt sein');

// Bewacht werden darf nur, was ohnehin nie ueber setModule geschaltet wird. Ein Modul, das der
// Kunde selbst umlegen kann, braucht seine Zeile - es darf nicht in dieser Liste landen.
for(const key of guarded){
  assert.ok(billing.has(key)||pkg.has(key),
    `${key} wird nachsichtig geschrieben, ist aber kein abrechnungs- oder paketverwaltetes Modul`);
  assert.ok(!standard.has(key),`${key} ist ein Standardmodul und braucht seine Zeile fuer setModule`);
}
// Und umgekehrt: jedes abrechnungs-/paketverwaltete optionale Modul muss nachsichtig geschrieben
// werden, sonst kann genau dieser Schluessel die Anlage wieder mitreissen.
for(const key of optional){
  if(billing.has(key)||pkg.has(key))
    assert.ok(guarded.includes(key),`${key} kann die Portalanlage zum Scheitern bringen und muss nachsichtig geschrieben werden`);
  else
    assert.ok(!guarded.includes(key),`${key} wird gebraucht und darf nicht weggelassen werden`);
}

// Die bewachten Schluessel duerfen nicht mehr im atomaren Einsatz stehen, die uebrigen schon.
assert.match(provision,/for\(const f of optionalFeatures\)if\(!guardedFeatures\.has\(f\)\)statements\.push/,
  'unbewachte optionale Module gehoeren weiterhin in den atomaren Einsatz');

const atomicBatch='await env.DB.batch(statements);';
const batchAt=provision.indexOf(atomicBatch);
assert.ok(batchAt>0,'die Portalanlage muss weiterhin in einem atomaren Einsatz erfolgen');
// Nicht verneint: '!guardedFeatures.has' waehlt die unbewachten Module aus und gehoert vor den
// Einsatz. Gesucht ist die Stelle, die die bewachten selbst schreibt.
const positiveGuard=/(?<![!\w])guardedFeatures\.has\(/;
assert.ok(!positiveGuard.test(provision.slice(0,batchAt)),
  'kein bewachter Platzhalter darf vor dem Anlegen geschrieben werden');
const afterBatch=provision.slice(batchAt+atomicBatch.length);
const guardedAt=afterBatch.search(positiveGuard);
assert.ok(guardedAt>=0,'die bewachten Platzhalter muessen erst nach dem Anlegen geschrieben werden');
// Genau die eine Anweisung, die sie schreibt - vom Ende des atomaren Einsatzes bis zu ihrem
// Semikolon. Was hier nicht steht, gilt fuer diese Zusicherungen auch nicht als vorhanden.
const guardedWrite=afterBatch.slice(0,afterBatch.indexOf(';',guardedAt)+1);
assert.match(guardedWrite,/INSERT OR IGNORE INTO feature_flags/,
  'ein bereits vorhandener Platzhalter darf den Nachtrag nicht stoeren');
assert.match(guardedWrite,/\.catch\(\(\)=>undefined\)/,
  'ein abgelehnter Platzhalter darf die Portalanlage nicht zum Scheitern bringen');
// Sieben einzelne Schreibrunden waeren sieben zusaetzliche Fahrten zur Datenbank je Kunde.
assert.match(guardedWrite,/env\.DB\.batch\(/,
  'die bewachten Platzhalter gehoeren in einen einzigen Nachtrag, nicht in sieben Einzelrunden');

// Ausgefuehrt statt gelesen: derselbe Trigger wie in Produktion, einmal gegen die alte und einmal
// gegen die neue Reihenfolge - und zusaetzlich gegen eine Datenbank ohne diesen Trigger, damit
// belegt ist, dass die Platzhalter dort weiterhin vollstaendig entstehen.
const { DatabaseSync }=await import('node:sqlite');
const schema=`CREATE TABLE tenants(id TEXT PRIMARY KEY);
  CREATE TABLE feature_flags(tenant_id TEXT NOT NULL,feature_key TEXT NOT NULL,enabled INTEGER NOT NULL,source TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,feature_key));`;
const trigger=`CREATE TRIGGER feature_entitlement_guard BEFORE INSERT ON feature_flags
    WHEN NEW.feature_key IN (${guarded.map(k=>`'${k}'`).join(',')})
    BEGIN SELECT RAISE(ABORT,'FEATURE_NOT_ENTITLED'); END;`;

// Bildet die Anlage nach: ein atomarer Einsatz mit dem Mandanten, danach ein eigener Nachtrag,
// dessen Scheitern verworfen wird.
function provisionInto(db,atomic,lenient){
  db.exec('DELETE FROM feature_flags;DELETE FROM tenants;');
  const insert=key=>db.prepare("INSERT OR IGNORE INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES(?,?,0,'plan',?)").run('ten_x',key,'t');
  try{
    db.exec('BEGIN');
    db.prepare('INSERT INTO tenants(id) VALUES(?)').run('ten_x');
    for(const key of atomic)insert(key);
    db.exec('COMMIT');
  }catch{
    db.exec('ROLLBACK');
    return{created:false,flags:[]};
  }
  if(lenient.length)try{
    db.exec('BEGIN');
    for(const key of lenient)insert(key);
    db.exec('COMMIT');
  }catch{db.exec('ROLLBACK');}
  return{
    created:!!db.prepare('SELECT id FROM tenants WHERE id=?').get('ten_x'),
    flags:db.prepare('SELECT feature_key FROM feature_flags ORDER BY feature_key').all().map(r=>r.feature_key),
  };
}

const strict=new DatabaseSync(':memory:');strict.exec(schema+trigger);
const unguardedKeys=optional.filter(k=>!guarded.includes(k)),guardedKeys=optional.filter(k=>guarded.includes(k));

const vorher=provisionInto(strict,optional,[]);
assert.equal(vorher.created,false,'der nachgebaute Trigger muss die alte Reihenfolge abweisen - sonst prueft dieser Test nichts');

const nachher=provisionInto(strict,unguardedKeys,guardedKeys);
assert.equal(nachher.created,true,'die neue Reihenfolge muss den Mandanten trotz Trigger anlegen');
for(const key of optional.filter(k=>standard.has(k)))
  assert.ok(nachher.flags.includes(key),`${key} muss trotz Trigger angelegt werden, sonst laesst es sich nie einschalten`);
for(const key of guardedKeys)
  assert.ok(!nachher.flags.includes(key),`${key} weist der Trigger ab - und genau das muss folgenlos bleiben`);

// Ohne den Trigger darf sich nichts aendern: dieselbe Reihenfolge muss weiterhin alle Platzhalter
// anlegen. Sonst waere aus der Behebung ein stiller Funktionsverlust geworden.
const lenient=new DatabaseSync(':memory:');lenient.exec(schema);
const ohneTrigger=provisionInto(lenient,unguardedKeys,guardedKeys);
assert.equal(ohneTrigger.created,true,'ohne Trigger muss die Anlage erst recht gelingen');
assert.deepEqual(ohneTrigger.flags,[...optional].sort(),'ohne Trigger muessen weiterhin alle optionalen Platzhalter entstehen');

console.log(`Berechtigungs-Trigger: ${guarded.length} bewachte Platzhalter koennen die Portalanlage nicht mehr mitreissen, ohne Trigger entstehen weiterhin alle ${optional.length}: OK`);
