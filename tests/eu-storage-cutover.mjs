import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { copyEuStorageBatch } from '../dist/core/eu-storage-migration.js';
import { EU_D1_TARGET,EU_D1_TARGET_ID } from '../scripts/eu-d1-cutover-lib.mjs';

class Statement{
  constructor(db,sql){this.db=db;this.sql=sql;this.values=[];}bind(...values){this.values=values;return this;}async first(){if(this.sql.includes('SELECT password_hash FROM users'))return{password_hash:this.db.passwordHash};return null;}async all(){return{success:true,results:[]};}async run(){if(this.sql.includes('INSERT INTO audit_log'))this.db.audit.push([...this.values]);return{success:true};}}
class Db{constructor(passwordHash){this.passwordHash=passwordHash;this.audit=[];}prepare(sql){return new Statement(this,sql);}async batch(){return[];}}
function stream(bytes){return new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}});}
class Bucket{
  constructor(entries=[]){this.objects=new Map(entries.map(([key,value])=>[key,this.make(key,value)]));}
  make(key,value){const bytes=new TextEncoder().encode(value);return{key,size:bytes.length,etag:`etag-${key}`,uploaded:new Date('2026-08-25T00:00:00Z'),httpMetadata:{contentType:'text/plain'},customMetadata:{source:'test'},value};}
  async list({cursor,limit=1000}={}){const keys=[...this.objects.keys()].sort(),start=cursor?Number(cursor):0,slice=keys.slice(start,start+limit);return{objects:slice.map(k=>{const o=this.objects.get(k);return{key:o.key,size:o.size,etag:o.etag,uploaded:o.uploaded};}),truncated:start+slice.length<keys.length,cursor:start+slice.length<keys.length?String(start+slice.length):undefined};}
  async get(key){const o=this.objects.get(key);if(!o)return null;const bytes=new TextEncoder().encode(o.value);return{...o,body:stream(bytes),async arrayBuffer(){return bytes.buffer;},async text(){return o.value;}};}
  async put(key,body,{httpMetadata,customMetadata}={}){const reader=body.getReader(),chunks=[];let n=0;for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);n+=value.length;}const bytes=new Uint8Array(n);let off=0;for(const chunk of chunks){bytes.set(chunk,off);off+=chunk.length;}const value=new TextDecoder().decode(bytes),o=this.make(key,value);o.httpMetadata=httpMetadata;o.customMetadata=customMetadata;this.objects.set(key,o);}
  async delete(key){if(Array.isArray(key))for(const x of key)this.objects.delete(x);else this.objects.delete(key);}
}

const password='Strong-Test-Password!2026',salt=crypto.getRandomValues(new Uint8Array(16));
const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
const bits=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt,iterations:210000},material,256));
const b64=x=>Buffer.from(x).toString('base64url');
const db=new Db(`pbkdf2_sha256$210000$${b64(salt)}$${b64(bits)}`),legacy=new Bucket([['tenant/a.txt','alpha'],['tenant/b.txt','beta']]),eu=new Bucket(),env={DB:db,FILES:eu,LEGACY_FILES:legacy,EU_STORAGE_MIGRATION_REQUIRED:'true'},auth={userId:'platform-owner',role:'platform_admin',isPlatformAdmin:true};

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
assert.match(guard,/eu-d1-cutover\.mjs/,'production build must keep guarded EU D1 cutover');
assert.match(runtime,/runEuStorageMigrationCycle/,'runtime must self-heal legacy R2 into EU storage before scheduled customer writes');
assert.match(runtime,/migration\.active&&!migration\.complete/,'scheduled customer writes must remain paused until real R2 parity');
assert.match(ui,/EU-Speicher/i,'launch-readiness UI must surface EU storage state');
console.log('EU storage cutover, idempotent R2 copy, evidence-based backup residency and production migration guards: OK');
