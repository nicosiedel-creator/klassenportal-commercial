import { strict as assert } from 'node:assert';
import { runEuStorageMigrationCycle } from '../dist/core/eu-storage-migration.js';

function bodyFor(text){const bytes=new TextEncoder().encode(text);return new ReadableStream({start(controller){controller.enqueue(bytes);controller.close();}});}
function object(key,value){return{key,size:new TextEncoder().encode(value).length,etag:`etag-${key}`,uploaded:new Date('2026-08-25T00:00:00Z'),body:bodyFor(value),httpMetadata:{contentType:'text/plain'},customMetadata:{source:'test'},async arrayBuffer(){return new TextEncoder().encode(value).buffer;},async text(){return value;}};}
class Bucket{
  constructor(entries){this.values=new Map(entries.map(([key,value])=>[key,{value,etag:`etag-${key}`}]))}
  async list({cursor,limit=1000}={}){const keys=[...this.values.keys()].sort(),start=cursor?Number(cursor):0,slice=keys.slice(start,start+limit);return{objects:slice.map(key=>{const x=this.values.get(key);return{key,size:new TextEncoder().encode(x.value).length,etag:x.etag,uploaded:new Date('2026-08-25T00:00:00Z')}}),truncated:start+slice.length<keys.length,cursor:start+slice.length<keys.length?String(start+slice.length):undefined};}
  async get(key){const x=this.values.get(key);return x?object(key,x.value):null;}
  async put(key,stream){const reader=stream.getReader(),chunks=[];let size=0;for(;;){const {done,value}=await reader.read();if(done)break;chunks.push(value);size+=value.length;}const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}this.values.set(key,{value:new TextDecoder().decode(bytes),etag:`etag-${key}`});}
  async delete(){throw new Error('SOURCE_DELETE_MUST_NEVER_RUN');}
}

const sourceEntries=Array.from({length:80},(_,i)=>[`legacy/${String(i).padStart(3,'0')}.txt`,`payload-${i}`]);
const legacy=new Bucket(sourceEntries),eu=new Bucket([]);
const env={EU_STORAGE_MIGRATION_REQUIRED:'true',LEGACY_FILES:legacy,FILES:eu,DB:{prepare(){throw new Error('DB_MUST_NOT_BE_NEEDED_BEFORE_BOUNDED_BATCH_COMPLETES');}}};
const first=await runEuStorageMigrationCycle(env);
assert.equal(first.active,true);assert.equal(first.complete,false);assert.equal(first.copied,40);assert.equal(eu.values.size,40);assert.equal(legacy.values.size,80);
const second=await runEuStorageMigrationCycle(env);
assert.equal(second.active,true);assert.equal(second.complete,false);assert.equal(second.copied,40);assert.equal(eu.values.size,80);assert.equal(legacy.values.size,80);
for(const [key,{value}] of legacy.values)assert.equal(eu.values.get(key)?.value,value);
const disabled=await runEuStorageMigrationCycle({...env,EU_STORAGE_MIGRATION_REQUIRED:'false'});
assert.deepEqual(disabled,{active:false,complete:true,copied:0,skipped:0,scanned:0,pending:false});
console.log('EU R2 self-healing migration is bounded, idempotent-by-contract and non-destructive: OK');
