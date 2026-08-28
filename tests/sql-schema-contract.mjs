import { strict as assert } from 'node:assert';
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Der Ausfallplaner las eine Spalte curriculum_items.subject_id, die es nie gab. SQLite löst
// Spalten beim Vorbereiten der Anweisung auf - der Fehler war also von der ersten Zeile an da und
// fiel trotzdem erst auf, als eine Route in der Produktion mit 500 antwortete. Diese Prüfung
// bereitet jede statische SQL-Anweisung des Workers gegen das echte Migrationsschema vor.
async function walk(dir,out=[]){
  for(const entry of await readdir(dir,{withFileTypes:true})){
    const p=join(dir,entry.name);
    if(entry.isDirectory())await walk(p,out);
    else if(entry.name.endsWith('.ts'))out.push(p);
  }
  return out;
}

const db=new DatabaseSync(':memory:');
db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,applied_at TEXT DEFAULT CURRENT_TIMESTAMP);');
for(const name of (await readdir('migrations')).filter(f=>f.endsWith('.sql')).sort()){
  const sql=await readFile(`migrations/${name}`,'utf8');
  try{db.exec(sql);}catch(error){throw new Error(`migration ${name} does not apply: ${error.message}`);}
}

const files=await walk('src');
// Einige Tabellen legen Laufzeit-Wächter an, nicht eine Migration. Sie gehören zum echten
// Schema, also erst anlegen und dann prüfen - sonst meldete die Prüfung sie als fehlend.
for(const file of files){
  const src=await readFile(file,'utf8');
  for(const m of src.matchAll(/[`'"]\s*(CREATE TABLE IF NOT EXISTS[\s\S]*?)[`'"]/gi)){
    const sql=m[1];
    if(sql.includes('${'))continue;
    try{db.exec(sql);}catch{/* kein eigenständiges DDL, dann trägt es auch nichts zum Schema bei */}
  }
}

let checked=0;
const unknown=[];
for(const file of files){
  const src=await readFile(file,'utf8');
  for(const m of src.matchAll(/[`'"]\s*(SELECT|INSERT|UPDATE|DELETE)\s[\s\S]*?[`'"]/gi)){
    const raw=m[0];
    // Nur vollständig statische Anweisungen: alles Zusammengesetzte lässt sich hier nicht
    // vorbereiten, ohne zu raten, was zur Laufzeit eingesetzt wird.
    if(raw.includes('${')||raw.includes('" +')||raw.includes("' +"))continue;
    const sql=raw.slice(1,-1).trim();
    if(sql.length<15)continue;
    checked++;
    try{db.prepare(sql);}
    catch(error){
      const message=String(error.message);
      // Ein Syntaxfehler bedeutet, dass hier ein Bruchstück extrahiert wurde, kein Defekt.
      // Eine unbekannte Spalte oder Tabelle bedeutet, dass die Anweisung geparst wurde und die
      // Datenbank sie trotzdem nicht bedienen kann - genau der Fall, der gesucht wird.
      if(/no such column|no such table/.test(message))unknown.push(`${file}: ${message}\n      ${sql.replace(/\s+/g,' ').slice(0,150)}`);
    }
  }
}
assert.ok(checked>1000,`expected the Worker's static SQL to be discovered, prepared ${checked} statements`);
assert.deepEqual(unknown,[],`diese Anweisungen sprechen Spalten oder Tabellen an, die das Schema nicht hat:\n${unknown.join('\n')}`);

console.log(`Every static SQL statement prepares against the migrated schema (${checked} statements): OK`);
