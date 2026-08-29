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
assert.match(provision,/await env\.DB\.batch\(statements\);[\s\S]{0,900}?for\(const f of optionalFeatures\)if\(guardedFeatures\.has\(f\)\)/,
  'bewachte Platzhalter muessen erst nach dem Anlegen geschrieben werden');
assert.match(provision,/INSERT OR IGNORE INTO feature_flags[\s\S]{0,200}?\.catch\(\(\)=>undefined\)/,
  'ein abgelehnter Platzhalter darf die Anlage nicht zum Scheitern bringen');

// Ausgefuehrt statt gelesen: derselbe Trigger wie in Produktion, einmal gegen die alte und einmal
// gegen die neue Reihenfolge.
const { DatabaseSync }=await import('node:sqlite');
const db=new DatabaseSync(':memory:');
db.exec(`CREATE TABLE tenants(id TEXT PRIMARY KEY);
  CREATE TABLE feature_flags(tenant_id TEXT NOT NULL,feature_key TEXT NOT NULL,enabled INTEGER NOT NULL,source TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(tenant_id,feature_key));
  INSERT INTO tenants(id) VALUES('ten_x');
  CREATE TRIGGER feature_entitlement_guard BEFORE INSERT ON feature_flags
    WHEN NEW.feature_key IN (${guarded.map(k=>`'${k}'`).join(',')})
    BEGIN SELECT RAISE(ABORT,'FEATURE_NOT_ENTITLED'); END;`);
const write=keys=>{
  db.exec('DELETE FROM feature_flags');
  try{
    db.exec('BEGIN');
    for(const key of keys)db.prepare("INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES(?,?,0,'plan',?)").run('ten_x',key,'t');
    db.exec('COMMIT');return true;
  }catch{db.exec('ROLLBACK');return false;}
};
assert.equal(write(optional),false,'der nachgebaute Trigger muss die alte Reihenfolge abweisen - sonst prueft dieser Test nichts');
assert.equal(write(optional.filter(k=>!guarded.includes(k))),true,'die neue Reihenfolge muss den Mandanten anlegen koennen');
const written=db.prepare('SELECT feature_key FROM feature_flags').all().map(r=>r.feature_key);
for(const key of optional.filter(k=>standard.has(k)))
  assert.ok(written.includes(key),`${key} muss trotz Trigger angelegt werden, sonst laesst es sich nie einschalten`);

console.log(`Berechtigungs-Trigger: ${guarded.length} bewachte Platzhalter koennen die Portalanlage nicht mehr mitreissen: OK`);
