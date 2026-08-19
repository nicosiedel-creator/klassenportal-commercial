import type { CoreAuthContext, Env } from './types.js';
import { saveTeacherUnavailability } from './planning-constraints.js';
import { id, nowIso, safeString } from './utils.js';
import { audit } from './audit.js';

function optional(v:unknown,max=2000){return safeString(v,max)||null;}
export async function saveTeacherUnavailabilityWithSubstitutions(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  const result=await saveTeacherUnavailability(env,auth,tenantId,input),teacherId=String(input.teacher_id||''),starts=new Date(String(input.starts_at||'')).toISOString(),ends=new Date(String(input.ends_at||'')).toISOString(),reason=optional(input.reason,2000),source=String(input.source||'manual'),lessons=(await env.DB.prepare(`SELECT l.id,l.course_id,l.starts_at,l.ends_at FROM lessons l WHERE l.tenant_id=? AND l.teacher_id=? AND l.starts_at<? AND l.ends_at>? ORDER BY l.starts_at LIMIT 500`).bind(tenantId,teacherId,ends,starts).all<Record<string,unknown>>()).results??[];let created=0;for(const lesson of lessons){const exists=await env.DB.prepare("SELECT 1 ok FROM substitution_cases WHERE tenant_id=? AND lesson_id=? AND status IN ('open','assigned','rescheduled') LIMIT 1").bind(tenantId,String(lesson.id)).first();if(exists)continue;const ts=nowIso();await env.DB.prepare("INSERT INTO substitution_cases(id,tenant_id,course_id,lesson_id,absent_teacher_id,substitute_teacher_id,status,reason,replacement_starts_at,replacement_ends_at,note,created_by,created_at,updated_at) VALUES(?,?,?,?,?,NULL,'open',?,NULL,NULL,?,?,?,?)").bind(id('subc_'),tenantId,String(lesson.course_id),String(lesson.id),teacherId,reason||`Dozent nicht verfügbar (${source})`,'Automatisch aus Dozenten-Abwesenheit erzeugt.',auth.userId,ts,ts).run();created++;}
  await audit(env.DB,auth.userId,'planning.teacher_unavailability_applied',tenantId,undefined,'teacher',teacherId,{starts,ends,source,substitutionCases:created});return{...result,substitution_cases_created:created};
}
