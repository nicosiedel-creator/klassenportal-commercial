import type { CoreAuthContext, Env } from './types.js';
import { requireCourseAccess } from './permissions.js';
import { teacherAttendanceAuth } from './teacher-portal.js';

export async function listMeetingReadyLessons(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  if(auth.isPlatformAdmin)throw new Error('FORBIDDEN_PLATFORM_ADMIN_TENANT_INTEGRATION');
  if(auth.role==='guest')await teacherAttendanceAuth(env,auth,tenantId,courseId);
  else if(auth.role!=='tenant_admin')throw new Error('FORBIDDEN_TEAMS_MEETING_MANAGEMENT');
  requireCourseAccess(auth,courseId);
  const rows=await env.DB.prepare(`SELECT l.id,l.starts_at,l.ends_at,l.room,l.notes,s.name subject_name,s.short_name subject_short_name,t.name teacher_name,
      m.provider meeting_provider,m.join_url,m.status meeting_status,m.organizer_user_id
    FROM lessons l
    LEFT JOIN subjects s ON s.id=l.subject_id AND s.tenant_id=l.tenant_id
    LEFT JOIN teachers t ON t.id=l.teacher_id AND t.tenant_id=l.tenant_id
    LEFT JOIN lesson_online_meetings m ON m.tenant_id=l.tenant_id AND m.lesson_id=l.id
    WHERE l.tenant_id=? AND l.course_id=? AND l.ends_at>=?
    ORDER BY l.starts_at LIMIT 500`).bind(tenantId,courseId,new Date(Date.now()-86400000).toISOString()).all<Record<string,unknown>>();
  return rows.results??[];
}
