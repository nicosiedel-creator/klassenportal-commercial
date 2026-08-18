import type { Env, SessionUser } from './types.js';
import { publicAdvancedOverview } from './advanced-modules.js';

export async function publicAdvancedBySlug(env:Env,tenantSlug:string,courseCode:string,session:SessionUser|null,origin:string){
  const row=await env.DB.prepare(`SELECT c.id AS course_id,c.tenant_id FROM courses c JOIN tenants t ON t.id=c.tenant_id WHERE t.slug=? AND c.code=? AND t.status='active' AND c.is_active=1`).bind(tenantSlug,courseCode).first<{course_id:string;tenant_id:string}>();
  if(!row)return{surveys:[],substitutions:[],microsoft365FeedUrl:null};
  return publicAdvancedOverview(env,row.tenant_id,row.course_id,session,origin);
}
