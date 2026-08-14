import type { Env, SessionUser } from './types.js';
import { verifyPassword } from './auth.js';

export async function publicOverview(env:Env,tenantSlug:string,courseCode:string,session:SessionUser|null,accessCode?:string){
  const c=await env.DB.prepare(`SELECT c.*,t.name AS tenant_name,t.slug,s.portal_name,s.welcome_text,s.logo_url,s.primary_color,s.secondary_color,s.background_color,s.white_label
    FROM courses c JOIN tenants t ON t.id=c.tenant_id JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.slug=? AND c.code=? AND t.status='active' AND c.is_active=1`).bind(tenantSlug,courseCode).first<Record<string,unknown>>();
  if(!c)throw new Error('COURSE_NOT_FOUND'); const mode=String(c.access_mode); const tenantId=String(c.tenant_id),courseId=String(c.id);
  const hasLogin=!!session&&(session.isPlatformAdmin||session.tenantRoles.some(x=>x.tenantId===tenantId&&(x.courseId===null||x.courseId===courseId)));
  const codeOk=!!accessCode&&!!c.access_code_hash&&await verifyPassword(accessCode,String(c.access_code_hash));
  if(mode==='login'&&!hasLogin)throw new Error('LOGIN_REQUIRED');
  if(mode==='link_code'&&!codeOk)throw new Error('ACCESS_CODE_REQUIRED');
  if(mode==='hybrid'&&!hasLogin&&!codeOk)throw new Error('LOGIN_OR_CODE_REQUIRED');
  const [homework,appointments,announcements,links,exams,lessons]=await Promise.all([
    env.DB.prepare('SELECT * FROM homework WHERE tenant_id=? AND course_id=? ORDER BY due_at ASC').bind(tenantId,courseId).all(),
    env.DB.prepare('SELECT * FROM appointments WHERE tenant_id=? AND (course_id=? OR course_id IS NULL) ORDER BY starts_at ASC').bind(tenantId,courseId).all(),
    env.DB.prepare('SELECT * FROM announcements WHERE tenant_id=? AND (course_id=? OR course_id IS NULL) AND visible=1 ORDER BY published_at DESC').bind(tenantId,courseId).all(),
    env.DB.prepare('SELECT * FROM links WHERE tenant_id=? AND (course_id=? OR course_id IS NULL) ORDER BY title ASC').bind(tenantId,courseId).all(),
    env.DB.prepare('SELECT * FROM exams WHERE tenant_id=? AND course_id=? AND visible_to_students=1 ORDER BY starts_at ASC').bind(tenantId,courseId).all(),
    env.DB.prepare('SELECT * FROM lessons WHERE tenant_id=? AND course_id=? ORDER BY starts_at ASC').bind(tenantId,courseId).all(),
  ]);
  return {course:c,authenticated:hasLogin,homework:homework.results??[],appointments:appointments.results??[],announcements:announcements.results??[],links:links.results??[],exams:exams.results??[],lessons:lessons.results??[]};
}
