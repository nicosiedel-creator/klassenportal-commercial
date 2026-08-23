import type { CoreAuthContext, Env } from './types.js';
import { requireCourseAccess, requireRole } from './permissions.js';

function teacherManager(auth:CoreAuthContext,courseId:string){requireRole(auth,'class_admin');requireCourseAccess(auth,courseId);}

export async function teacherCourseCalendar(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  teacherManager(auth,courseId);
  const now=Date.now(),fromIso=new Date(now-28*86400000).toISOString(),toIso=new Date(now+90*86400000).toISOString();
  const assignment=auth.role==='tenant_admin'||auth.isPlatformAdmin?null:await env.DB.prepare(`SELECT teacher_id FROM teacher_portal_assignments
    WHERE tenant_id=? AND course_id=? AND user_id=? AND status='active' LIMIT 1`).bind(tenantId,courseId,auth.userId).first<{teacher_id:string}>();
  if(auth.role!=='tenant_admin'&&!auth.isPlatformAdmin&&!assignment?.teacher_id)throw new Error('FORBIDDEN_TEACHER_COURSE');
  let sql=`SELECT l.id,l.tenant_id,l.course_id,c.name course_name,c.code course_code,tn.name tenant_name,
      l.subject_id,s.name subject_name,s.short_name subject_short_name,l.teacher_id,t.name teacher_name,
      l.starts_at,l.ends_at,l.room,l.notes,d.planned_topic,d.info_text,d.delivery_mode,
      ats.id attendance_session_id,cb.completed classbook_completed,cb.topic actual_topic,
      om.provider meeting_provider,om.join_url teams_join_url,om.status meeting_status,
      (SELECT COUNT(*) FROM lesson_hub_links hl WHERE hl.tenant_id=l.tenant_id AND hl.course_id=l.course_id AND hl.lesson_id=l.id) link_count,
      (SELECT COUNT(*) FROM lesson_hub_materials hm WHERE hm.tenant_id=l.tenant_id AND hm.course_id=l.course_id AND hm.lesson_id=l.id) material_count
    FROM lessons l
    JOIN courses c ON c.id=l.course_id AND c.tenant_id=l.tenant_id AND c.is_active=1
    JOIN tenants tn ON tn.id=l.tenant_id AND tn.status='active'
    LEFT JOIN subjects s ON s.id=l.subject_id AND s.tenant_id=l.tenant_id
    LEFT JOIN teachers t ON t.id=l.teacher_id AND t.tenant_id=l.tenant_id
    LEFT JOIN lesson_hub_details d ON d.lesson_id=l.id AND d.tenant_id=l.tenant_id AND d.course_id=l.course_id
    LEFT JOIN attendance_sessions ats ON ats.tenant_id=l.tenant_id AND ats.course_id=l.course_id AND ats.source='timetable' AND ats.source_ref=('lesson:' || l.id)
    LEFT JOIN classbook_entries cb ON cb.session_id=ats.id
    LEFT JOIN lesson_online_meetings om ON om.tenant_id=l.tenant_id AND om.course_id=l.course_id AND om.lesson_id=l.id AND om.status='active'
    WHERE l.tenant_id=? AND l.course_id=? AND l.ends_at>=? AND l.starts_at<=?`;
  const args:unknown[]=[tenantId,courseId,fromIso,toIso];
  if(assignment?.teacher_id){sql+=' AND l.teacher_id=?';args.push(assignment.teacher_id);}
  sql+=' ORDER BY l.starts_at ASC LIMIT 600';
  const rows=await env.DB.prepare(sql).bind(...args).all<Record<string,unknown>>();
  return{range:{from:fromIso.slice(0,10),to:toIso.slice(0,10)},lessons:rows.results??[]};
}
