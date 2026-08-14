import type { D1DatabaseLike } from '../portability/types.js';
import { id, nowIso } from './utils.js';
export async function audit(db:D1DatabaseLike, actor:string|undefined, action:string, tenantId?:string, courseId?:string, entityType?:string, entityId?:string, details?:unknown):Promise<void>{
  await db.prepare('INSERT INTO audit_log(id,tenant_id,course_id,actor_user_id,action,entity_type,entity_id,details_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(id('aud_'),tenantId??null,courseId??null,actor??null,action,entityType??null,entityId??null,details?JSON.stringify(details):null,nowIso()).run();
}
