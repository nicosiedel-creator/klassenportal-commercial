import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { ensureBrandingSchema } from '../dist/core/branding-schema.js';

// Laufzeit-Schemareparatur darf Schema reparieren und sonst nichts.
//
// 1. ensureBrandingSchema fuehrte nach einer Spaltenreparatur zusaetzlich eine
//    Palettennormalisierung aus: UPDATE tenant_settings ... ohne tenant_id, also ueber alle
//    Mandanten, ausgeloest aus Lesepfaden (getSettings, oeffentliche Kursportalseite) und ohne
//    Auditeintrag. Dieselbe Normalisierung steht bereits in Migration 0042_branding_palette.sql.
//
// 2. repairRecoverySchema fuehrte DROP TRIGGER und CREATE TRIGGER als Einzelstatements in einer
//    Schleife aus. Zwei gleichzeitige Requests auf einem historischen Schema koennen sich
//    zwischen DROP und CREATE verschraenken; das zweite CREATE scheitert dann mit "already
//    exists" - und zwar auf dem Onboarding-Pfad, also genau dort, wo ein Kunde entsteht.

// --- 1. Laufzeitnachweis: kein Datenschreiben in der Schemareparatur ------------------------

const executed=[];
function recordingEnv(existingColumns){
  const columns=new Set(existingColumns);
  const statement=sql=>({
    sql,
    bind(){return statement(sql);},
    async all(){executed.push(sql);return{results:sql.includes('PRAGMA table_info')?[...columns].map(name=>({name})):[]};},
    async run(){executed.push(sql);const add=sql.match(/ADD COLUMN (\w+)/);if(add)columns.add(add[1]);return{success:true};},
    async first(){executed.push(sql);return null;},
  });
  return{DB:{prepare:sql=>statement(sql)}};
}

// Kein Branding-Spalte vorhanden erzwingt genau den Reparaturzweig, in dem der Fehler lag.
await ensureBrandingSchema(recordingEnv([]));

const added=executed.filter(sql=>sql.includes('ADD COLUMN'));
assert.ok(added.length>=3,`der Reparaturzweig muss gelaufen sein, ausgefuehrt: ${executed.length} Statements`);

const writes=executed.filter(sql=>/^\s*(UPDATE|INSERT|DELETE)\b/i.test(sql));
assert.deepEqual(writes,[],
  `Schemareparatur darf keine Kundendaten schreiben, gefunden: ${JSON.stringify(writes)}`);

// --- 2. Vertragspruefung: Trigger-Reparatur laeuft als Batch --------------------------------
// repairRecoverySchema ist nicht exportiert und haengt an einem vollstaendigen Onboarding-
// Schema; deshalb hier als Quelltextvertrag statt als Laufzeitlauf.

const onboarding=await readFile('src/core/onboarding-schema.ts','utf8');
assert.match(onboarding,/await env\.DB\.batch\(statements\.map\(/,
  'repairRecoverySchema muss die Trigger-Reparatur als Batch ausfuehren');
assert.doesNotMatch(onboarding,/for\(const statement of statements\)await env\.DB\.prepare\(statement\)\.run\(\)/,
  'die einzeln ausgefuehrte Schleife darf nicht zurueckkehren');

// Gegenprobe: die Palettennormalisierung bleibt dort, wo sie hingehoert.
const migration=await readFile('migrations/0042_branding_palette.sql','utf8');
assert.match(migration,/UPDATE tenant_settings/,'Migration 0042 traegt die Palettennormalisierung');
const brandingSchema=await readFile('src/core/branding-schema.ts','utf8');
assert.doesNotMatch(brandingSchema,/UPDATE tenant_settings/,
  'branding-schema.ts darf die Normalisierung nicht erneut als Laufzeitschreibung fuehren');

console.log('Schemareparatur: keine Kundendatenschreibung, Trigger-Reparatur atomar: OK');
