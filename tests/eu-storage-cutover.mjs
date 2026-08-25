import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from '../dist/core/auth.js';
import { copyEuStorageBatch } from '../dist/core/eu-storage-migration.js';
import {
  EU_D1_IMPORT_STATEMENT_BYTES,EU_D1_SCHEMA_ONLY_COUNTS,EU_D1_SCHEMA_ONLY_USERS,EU_D1_SOURCE,EU_D1_TARGET,EU_D1_TARGET_ID,assertMatchingExports,assertSchemaOnlyTarget,freezeSql,freezeTriggerNames,inspectD1Export,normalizeD1Export,prepareD1Import,resetSchemaSql,splitD1ExportStatements,sqlIdentifier,sqlText,thawSql,
} from '../scripts/eu-d1-cutover-lib.mjs';

assert.equal(EU_D1_SOURCE,'klassenportal-commercial');
assert.equal(EU_D1_TARGET,'klassenportal-commercial-eu');
assert.equal(EU_D1_TARGET_ID,'a060de73-a4f6-4410-b4f2-25f5bee87754');
assert.equal(sqlIdentifier('odd"table'),'"odd""table"');
assert.equal(freezeTriggerNames('users').length,3);
assert.match(freezeSql(['users']),/BEFORE INSERT ON "users"/);
assert.match(freezeSql(['users']),/EU_CUTOVER_SOURCE_FROZEN/);
assert.match(thawSql(['users']),/DROP TRIGGER IF EXISTS/);
const schemaOnlyMigrations=Array.from({length:69},(_,index)=>`${String(index).padStart(4,'0')}_migration.sql`),schemaOnlyCounts={...EU_D1_SCHEMA_ONLY_COUNTS};
const schemaOnlySql=['PRAGMA foreign_keys=OFF;','BEGIN TRANSACTION;'];
for(const [table,count] of Object.entries(schemaOnlyCounts)){
  if(table==='d1_migrations'){
    schemaOnlySql.push('CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY, name TEXT NOT NULL);');
    schemaOnlyMigrations.forEach((name,index)=>schemaOnlySql.push(`INSERT INTO d1_migrations(id,name) VALUES(${index+1},'${name}');`));
  }else if(table==='users'){
    schemaOnlySql.push('CREATE TABLE users (id TEXT PRIMARY KEY);');
    for(const id of EU_D1_SCHEMA_ONLY_USERS)schemaOnlySql.push(`INSERT INTO users(id) VALUES('${id}');`);
  }else{
    schemaOnlySql.push(`CREATE TABLE ${sqlIdentifier(table)} (id INTEGER PRIMARY KEY);`);
    for(let index=1;index<=count;index++)schemaOnlySql.push(`INSERT INTO ${sqlIdentifier(table)}(id) VALUES(${index});`);
  }
}
for(let index=0;index<239;index++)schemaOnlySql.push(`CREATE TABLE ${sqlIdentifier(`empty_${String(index).padStart(3,'0')}`)} (id INTEGER PRIMARY KEY);`);
schemaOnlySql.push('CREATE VIEW schema_only_users AS SELECT id FROM users;','COMMIT;');
const inspectedSchemaOnly=inspectD1Export(schemaOnlySql.join('\n'));
assert.equal(inspectedSchemaOnly.tables.length,251,'export inspection must handle the real 251-table shape without a compound query');
assert.equal(inspectedSchemaOnly.views.length,1);
assert.deepEqual(inspectedSchemaOnly.migrationNames,schemaOnlyMigrations);
assert.deepEqual(inspectedSchemaOnly.userIds,EU_D1_SCHEMA_ONLY_USERS);
assert.deepEqual(Object.fromEntries(Object.entries(inspectedSchemaOnly.counts).filter(([name])=>name in schemaOnlyCounts)),schemaOnlyCounts);
assert.throws(()=>inspectD1Export('CREATE TABLE broken('),/EU_D1_EXPORT_INSPECTION_FAILED/);
assert.equal(assertSchemaOnlyTarget({tables:Object.keys(schemaOnlyCounts),counts:schemaOnlyCounts,migrationNames:schemaOnlyMigrations,expectedMigrationNames:schemaOnlyMigrations,userIds:EU_D1_SCHEMA_ONLY_USERS}),true);
assert.throws(()=>assertSchemaOnlyTarget({tables:[...Object.keys(schemaOnlyCounts),'tenants'],counts:{...schemaOnlyCounts,tenants:1},migrationNames:schemaOnlyMigrations,expectedMigrationNames:schemaOnlyMigrations,userIds:EU_D1_SCHEMA_ONLY_USERS}),/EU_D1_TARGET_NOT_EMPTY:tenants:1/);
assert.throws(()=>assertSchemaOnlyTarget({tables:Object.keys(schemaOnlyCounts),counts:schemaOnlyCounts,migrationNames:schemaOnlyMigrations,expectedMigrationNames:schemaOnlyMigrations,userIds:['owner']}),/EU_D1_TARGET_SCHEMA_ONLY_USERS_MISMATCH/);
assert.match(resetSchemaSql(['users'],['active_users']),/DROP VIEW IF EXISTS "active_users";[\s\S]*DROP TABLE IF EXISTS "users";/);
assert.equal(normalizeD1Export('-- source\r\nCREATE TABLE x(a);  \r\n'),'CREATE TABLE x(a);');
assert.match(assertMatchingExports('-- old\nCREATE TABLE x(a);','-- new\nCREATE TABLE x(a);'),/^[a-f0-9]{64}$/);
assert.throws(()=>assertMatchingExports('CREATE TABLE x(a);','CREATE TABLE x(b);'),/EU_D1_EXPORT_MISMATCH/);

const largeText=`Anfang; 'Zitat'\n${'ä'.repeat(72_000)}\nEnde`,largeBlob='ab'.repeat(70_000);
const batchRows=Array.from({length:500},(_,index)=>`(${index},${sqlText(`${index}:${'x'.repeat(260)}`)})`).join(',');
const oversizedExport=`PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE payloads(id INTEGER PRIMARY KEY,body TEXT,content BLOB);
INSERT INTO payloads VALUES(1,${sqlText(largeText)},X'${largeBlob}');
CREATE TABLE batch_rows(id INTEGER PRIMARY KEY,value TEXT);
INSERT INTO batch_rows VALUES${batchRows};
CREATE TABLE payload_audit(id INTEGER,note TEXT);
CREATE TRIGGER payload_insert_audit AFTER INSERT ON payloads BEGIN
  INSERT INTO payload_audit VALUES(new.id,'semi;colon');
  UPDATE payload_audit SET note=CASE WHEN note='replace' THEN 'changed' ELSE note END WHERE id=new.id;
END;`;
assert.ok(splitD1ExportStatements(oversizedExport).some(statement=>Buffer.byteLength(statement,'utf8')>EU_D1_IMPORT_STATEMENT_BYTES),'fixture must reproduce D1 statement-too-long input');
const preparedImport=prepareD1Import(oversizedExport);
assert.ok(preparedImport.rewrittenStatements>=2,'large single-row and multi-row inserts must both be rewritten');
for(const statement of splitD1ExportStatements(preparedImport.sql))assert.ok(Buffer.byteLength(statement,'utf8')<=EU_D1_IMPORT_STATEMENT_BYTES,'every rewritten D1 statement must stay below the documented 100 KB limit with safety margin');
const originalDb=new DatabaseSync(':memory:'),rewrittenDb=new DatabaseSync(':memory:');
try{
  originalDb.exec(oversizedExport);rewrittenDb.exec(preparedImport.sql);
  const query="SELECT id,body,hex(content) content,typeof(body) body_type,typeof(content) content_type FROM payloads ORDER BY id";
  assert.deepEqual(rewrittenDb.prepare(query).all(),originalDb.prepare(query).all(),'chunked literals must preserve exact values and SQLite types');
  assert.equal(rewrittenDb.prepare('SELECT COUNT(*) n FROM batch_rows').get().n,500);
  assert.equal(rewrittenDb.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name LIKE 'kp_eu_import_chunks_%'").get().n,0,'chunk staging tables must not survive import');
  originalDb.exec("INSERT INTO payloads VALUES(2,'trigger',X'00');");rewrittenDb.exec("INSERT INTO payloads VALUES(2,'trigger',X'00');");
  assert.deepEqual(rewrittenDb.prepare('SELECT * FROM payload_audit ORDER BY id').all(),originalDb.prepare('SELECT * FROM payload_audit ORDER BY id').all(),'trigger bodies containing semicolons and CASE/END must remain intact');
}finally{originalDb.close();rewrittenDb.close();}
assert.throws(()=>prepareD1Import(`CREATE TABLE oversized_${'x'.repeat(EU_D1_IMPORT_STATEMENT_BYTES)}(id);`),/EU_D1_IMPORT_STATEMENT_TOO_LONG/);

class MemoryR2{
  constructor(){this.objects=new Map();}
  async put(key,value,options={}){
    let bytes;
    if(typeof value==='string')bytes=new TextEncoder().encode(value);
    else if(value instanceof ArrayBuffer)bytes=new Uint8Array(value);
    else if(ArrayBuffer.isView(value))bytes=new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    else if(value instanceof ReadableStream){const chunks=[];let length=0;for await(const chunk of value){const part=new Uint8Array(chunk);chunks.push(part);length+=part.length;}bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}}
    else throw new Error('UNSUPPORTED_TEST_BODY');
    const copy=new Uint8Array(bytes),etag=createHash('sha256').update(copy).digest('hex');this.objects.set(key,{bytes:copy,etag,httpMetadata:options.httpMetadata,customMetadata:options.customMetadata,uploaded:new Date('2026-08-24T00:00:00Z')});
  }
  async get(key){const object=this.objects.get(key);if(!object)return null;const bytes=new Uint8Array(object.bytes);return{body:new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}}),size:bytes.length,etag:object.etag,uploaded:object.uploaded,httpMetadata:object.httpMetadata,customMetadata:object.customMetadata,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>new TextDecoder().decode(bytes)};}
  async delete(key){for(const item of Array.isArray(key)?key:[key])this.objects.delete(item);}
  async list({cursor,limit=1000}={}){const keys=[...this.objects.keys()].sort(),offset=cursor?Number(cursor):0,slice=keys.slice(offset,offset+limit),next=offset+slice.length;return{objects:slice.map(key=>{const o=this.objects.get(key);return{key,size:o.bytes.length,etag:o.etag,uploaded:o.uploaded};}),truncated:next<keys.length,cursor:next<keys.length?String(next):undefined};}
}
class Statement{
  constructor(db,sql){this.db=db;this.sql=sql;this.values=[];}
  bind(...values){this.values=values;return this;}
  async first(){if(this.sql.includes('SELECT password_hash FROM users'))return{password_hash:this.db.passwordHash};return null;}
  async all(){return{success:true,results:[]};}
  async run(){if(this.sql.includes('INSERT INTO audit_log'))this.db.audit.push(this.values);return{success:true,meta:{changes:1}};}
}
class MemoryD1{constructor(passwordHash){this.passwordHash=passwordHash;this.audit=[];}prepare(sql){return new Statement(this,sql);}async batch(statements){return Promise.all(statements.map(statement=>statement.run()));}}

const password='Sehr-Sicheres-Eigentümerpasswort-2026!',legacy=new MemoryR2(),eu=new MemoryR2(),db=new MemoryD1(await hashPassword(password));
await legacy.put('backups/tenant-a/manifest.json','{"ok":true}',{httpMetadata:{contentType:'application/json'},customMetadata:{tenantId:'tenant-a'}});
await legacy.put('tenants/tenant-a/file.pdf','EU migration payload',{httpMetadata:{contentType:'application/pdf'},customMetadata:{tenantId:'tenant-a'}});
const session={userId:'owner-1',email:'owner@klassenportal.app',displayName:'Owner',isPlatformAdmin:true,mustChangePassword:false,tenantRoles:[]},auth={userId:'owner-1',role:'platform_admin',tenantIds:[],courseIds:[],isPlatformAdmin:true,session};
const env={DB:db,FILES:eu,LEGACY_FILES:legacy,EU_STORAGE_MIGRATION_REQUIRED:'true'};
await assert.rejects(()=>copyEuStorageBatch(env,{...auth,isPlatformAdmin:false},{confirmation:'EU SPEICHER MIGRIEREN',current_password:password}),/PLATFORM_ADMIN_REQUIRED/);
await assert.rejects(()=>copyEuStorageBatch(env,auth,{confirmation:'falsch',current_password:password}),/EU_STORAGE_COPY_CONFIRMATION_REQUIRED/);
await assert.rejects(()=>copyEuStorageBatch(env,auth,{confirmation:'EU SPEICHER MIGRIEREN',current_password:'falsch'}),/CURRENT_PASSWORD_INVALID/);
const copied=await copyEuStorageBatch(env,auth,{confirmation:'EU SPEICHER MIGRIEREN',current_password:password});
assert.deepEqual({copied:copied.copied,skipped:copied.skipped,done:copied.done},{copied:2,skipped:0,done:true});
for(const key of legacy.objects.keys()){
  const source=await legacy.get(key),target=await eu.get(key);assert.ok(target,`missing readback ${key}`);assert.equal(target.size,source.size);assert.equal(target.etag,source.etag);assert.deepEqual(target.customMetadata,source.customMetadata);assert.equal(await target.text(),await source.text());
}
const repeated=await copyEuStorageBatch(env,auth,{confirmation:'EU SPEICHER MIGRIEREN',current_password:password});
assert.deepEqual({copied:repeated.copied,skipped:repeated.skipped,done:repeated.done},{copied:0,skipped:2,done:true},'R2 migration must be idempotent after persisted readback');
assert.equal(db.audit.length,2,'each successful copy batch must be audited');

const wrangler=JSON.parse(await readFile('wrangler.jsonc','utf8'));
assert.equal(wrangler.vars.PAYMENTS_ENABLED,'false');
assert.equal(wrangler.vars.EU_D1_JURISDICTION_ATTESTED,'true');
assert.equal(wrangler.vars.EU_R2_JURISDICTION_ATTESTED,'true');
assert.equal(Object.hasOwn(wrangler.vars,'EU_BACKUP_STORAGE_ATTESTED'),false,'backup EU residency must derive from the verified EU FILES binding, not a stale manual flag');
assert.equal(wrangler.vars.EU_STORAGE_MIGRATION_REQUIRED,'true');
assert.deepEqual(wrangler.d1_databases[0],{binding:'DB',database_name:EU_D1_TARGET,database_id:EU_D1_TARGET_ID});
assert.deepEqual(wrangler.r2_buckets[0],{binding:'FILES',bucket_name:'klassenportal-commercial-files-eu',jurisdiction:'eu'});
assert.deepEqual(wrangler.r2_buckets[1],{binding:'LEGACY_FILES',bucket_name:'klassenportal-commercial-files'});

const cutover=await readFile('scripts/eu-d1-cutover.mjs','utf8'),guard=await readFile('scripts/workers-ci-guard.mjs','utf8'),runtime=await readFile('src/index.ts','utf8'),ui=await readFile('public/launch-readiness-ui.js','utf8');
for(const marker of ['assertSchemaOnlyTarget','inspectD1Export','EU_D1_TARGET_EXPORT_SCHEMA_MISMATCH','EU_D1_TARGET_SCHEMA_RESET_FAILED','EU_D1_SOURCE_FREEZE_PARTIAL','EU_D1_SOURCE_FREEZE_INCOMPLETE','EU_D1_INTERRUPTED_TARGET_FREEZE_MISMATCH','Recovered the previously imported exact EU D1 snapshot','assertMatchingExports','EU_D1_CUTOVER_MARKER_WRITE_FAILED','thawVerifiedTarget'])assert.ok(cutover.includes(marker),`D1 cutover missing ${marker}`);
assert.doesNotMatch(cutover,/UNION\s+ALL/i,'D1 target inspection must never depend on compound SELECT limits');
assert.match(cutover,/executeFile\(EU_D1_TARGET,markerFile\);[\s\S]*EU_D1_CUTOVER_MARKER_WRITE_FAILED[\s\S]*thawVerifiedTarget\(\);/,'verified marker must be durable before target freeze triggers are removed');
assert.match(guard,/scripts\/eu-d1-cutover\.mjs/);
assert.ok(guard.indexOf('scripts/eu-d1-cutover.mjs')<guard.indexOf("['run','db:migrate']"),'D1 copy must precede target migrations');
assert.match(runtime,/runEuStorageMigrationCycle/,'runtime must run the evidence-based R2 migration cycle');
assert.match(runtime,/Scheduled customer writes remain paused while the non-destructive EU R2 migration is verified/,'scheduled customer writes must remain paused until verified parity');
for(const phrase of ['EU SPEICHER MIGRIEREN','EU MIGRATION ABSCHLIESSEN'])assert.ok(ui.includes(phrase),`migration UI missing ${phrase}`);

console.log('EU D1 freeze/export verification and authenticated, idempotent R2 copy with persisted readback: OK');
