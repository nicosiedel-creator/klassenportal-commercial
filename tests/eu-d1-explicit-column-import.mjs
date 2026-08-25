import { strict as assert } from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import {
  EU_D1_IMPORT_STATEMENT_BYTES,
  prepareD1Import,
  splitD1ExportStatements,
  sqlText,
} from '../scripts/eu-d1-cutover-lib.mjs';

const bytes=value=>Buffer.byteLength(String(value),'utf8');
const hugeText=`Cloudflare-D1-Export\n${'ä'.repeat(446_000)}\nEnde`;
const batchRows=Array.from({length:650},(_,index)=>`(${index},${sqlText(`${index}:${'x'.repeat(280)}`)})`).join(',');
const source=`-- Cloudflare export may prefix data statements with comments.
CREATE TABLE payloads(id INTEGER PRIMARY KEY,body TEXT NOT NULL);
/* Explicit column lists are valid D1/SQLite export/import syntax. */
INSERT INTO "payloads" ("id", "body") VALUES (1,${sqlText(hugeText)});
CREATE TABLE batch_rows(id INTEGER PRIMARY KEY,value TEXT NOT NULL);
-- Exercise conflict clauses, a schema-qualified target and a large multi-row statement too.
INSERT OR REPLACE INTO main."batch_rows"("id","value") VALUES ${batchRows};
`;

const oversized=splitD1ExportStatements(source).filter(statement=>bytes(statement)>EU_D1_IMPORT_STATEMENT_BYTES);
assert.ok(oversized.length>=2,'fixture must contain both oversized explicit-column inserts');
assert.ok(oversized.some(statement=>bytes(statement)>893_000),'fixture must reproduce the observed ~893755-byte production failure class');

const prepared=prepareD1Import(source);
assert.ok(prepared.rewrittenStatements>=2,'explicit-column single-row and multi-row inserts must both be rewritten');
for(const statement of splitD1ExportStatements(prepared.sql)){
  assert.ok(bytes(statement)<=EU_D1_IMPORT_STATEMENT_BYTES,`rewritten statement still exceeds D1 limit: ${bytes(statement)}`);
}

const original=new DatabaseSync(':memory:'),rewritten=new DatabaseSync(':memory:');
try{
  original.exec(source);
  rewritten.exec(prepared.sql);
  assert.equal(rewritten.prepare('SELECT body FROM payloads WHERE id=1').get().body,original.prepare('SELECT body FROM payloads WHERE id=1').get().body,'externalized explicit-column TEXT must round-trip byte-for-byte');
  assert.deepEqual(rewritten.prepare('SELECT id,value FROM batch_rows ORDER BY id').all(),original.prepare('SELECT id,value FROM batch_rows ORDER BY id').all(),'batched explicit-column rows must remain identical');
  assert.equal(rewritten.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'kp_eu_import_chunks_%'").get().n,0,'temporary chunk tables must be removed');
}finally{
  original.close();
  rewritten.close();
}

console.log('EU D1 explicit-column/comment/conflict import rewriting reproduces and fixes the 893755-byte production failure class: OK');
