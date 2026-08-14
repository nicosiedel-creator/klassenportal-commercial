import type { D1DatabaseLike, ResourceDefinition } from './types.js';
import { randomId } from './utils.js';
export async function audit(db:D1DatabaseLike,tenantId:string,actor:string|undefined,action:string,details:unknown={}):Promise<void>{await db.prepare('INSERT INTO portability_audit(id,tenant_id,actor_user_id,action,details_json) VALUES(?,?,?,?,?)').bind(randomId('aud_'),tenantId,actor??null,action,JSON.stringify(details)).run();}
export async function selectAllByTenant(db:D1DatabaseLike,r:ResourceDefinition,tenantId:string):Promise<Record<string,unknown>[]>{const order=r.exportOrderBy?` ORDER BY ${r.exportOrderBy}`:'';const x=await db.prepare(`SELECT * FROM ${r.table} WHERE ${r.tenantColumn}=?${order}`).bind(tenantId).all<Record<string,unknown>>();return x.results??[];}
export async function insertRows(db:D1DatabaseLike,r:ResourceDefinition,tenantId:string,rows:Record<string,unknown>[],preserveIds:boolean):Promise<void>{
 if(!rows.length)return;const allowed=new Set([r.idColumn,...Object.keys(r.columns)]);const statements=[];
 for(const source of rows){const row:Record<string,unknown>={};for(const[k,v]of Object.entries(source))if(allowed.has(k))row[k]=v;if(!preserveIds||!row[r.idColumn])row[r.idColumn]=randomId(`${r.key.slice(0,3)}_`);row[r.tenantColumn]=tenantId;const cols=[r.idColumn,r.tenantColumn,...Object.keys(r.columns).filter(k=>k in row)];const vals=cols.map(c=>row[c]??null);statements.push(db.prepare(`INSERT INTO ${r.table} (${cols.join(',')}) VALUES (${cols.map(()=>'?').join(',')})`).bind(...vals));}
 await db.batch(statements);
}
export async function deleteAllByTenant(db:D1DatabaseLike,r:ResourceDefinition,tenantId:string):Promise<void>{await db.prepare(`DELETE FROM ${r.table} WHERE ${r.tenantColumn}=?`).bind(tenantId).run();}
