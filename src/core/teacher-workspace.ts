import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { id, nowIso, safeString } from './utils.js';
import { upsertAttendanceSessionFromSource } from './attendance-classbook.js';

function manager(auth:CoreAuthContext,courseId:string){requireRole(auth,'class_admin');requireCourseAccess(auth,courseId);}
function isoOrNull(value:unknown):string|null{const s=safeString(value,60);if(!s)return null;const d=new Date(s);if(Number.isNaN(d.getTime()))throw new Error('TEACHER_MESSAGE_DATE_INVALID');return d.toISOString();}
function priority(value:unknown):string{const p=String(value||'normal');if(!['info','normal','important','urgent'].includes(p))throw new Error('TEACHER_MESSAGE_PRIORITY_INVALID');return p;}
async function ensureCourse(env:Env,tenantId:string,courseId:string){const row=await env.DB.prepare('SELECT id FROM courses WHERE tenant_id=? AND id=? AND is_active=1').bind(tenantId,courseId).first();if(!row)throw new Error('COURSE_NOT_FOUND');}

export async function teacherWorkspace(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  manager(auth,courseId);await ensureCourse(env,tenantId,courseId);
  const now=new Date(),from=new Date(now.getTime()-28*86400000),to=new Date(now.getTime()+30*86400000),fromIso=from.toISOString(),toIso=to.toISOString(),fromDay=fromIso.slice(0,10),toDay=toIso.slice(0,10),nowText=nowIso();
  const [lessons,sessions,appointments,exams,messages]=await Promise.all([
    env.DB.prepare(`SELECT l.id,l.subject_id,l.starts_at,l.ends_at,l.room,l.notes,s.name subject_name,s.short_name subject_short_name,t.name teacher_name,
      d.planned_topic,d.info_text,d.delivery_mode,
      ats.id attendance_session_id,cb.topic actual_topic,cb.content_summary actual_content_summary,cb.homework_summary actual_homework_summary,cb.completed classbook_completed,
      (SELECT COUNT(*) FROM lesson_hub_links hl WHERE hl.tenant_id=l.tenant_id AND hl.course_id=l.course_id AND hl.lesson_id=l.id) link_count,
      (SELECT COUNT(*) FROM lesson_hub_materials hm WHERE hm.tenant_id=l.tenant_id AND hm.course_id=l.course_id AND hm.lesson_id=l.id) material_count
      FROM lessons l
      LEFT JOIN subjects s ON s.id=l.subject_id AND s.tenant_id=l.tenant_id
      LEFT JOIN teachers t ON t.id=l.teacher_id AND t.tenant_id=l.tenant_id
      LEFT JOIN lesson_hub_details d ON d.lesson_id=l.id AND d.tenant_id=l.tenant_id AND d.course_id=l.course_id
      LEFT JOIN attendance_sessions ats ON ats.tenant_id=l.tenant_id AND ats.course_id=l.course_id AND ats.source='timetable' AND ats.source_ref=('lesson:' || l.id)
      LEFT JOIN classbook_entries cb ON cb.session_id=ats.id
      WHERE l.tenant_id=? AND l.course_id=? AND l.ends_at>=? AND l.starts_at<=?
      ORDER BY l.starts_at ASC LIMIT 800`).bind(tenantId,courseId,fromIso,toIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT s.id,s.session_date,s.starts_at,s.ends_at,s.subject,s.room,s.instructor_text,s.delivery_mode,s.status,s.source,s.source_ref,
      cb.topic actual_topic,cb.content_summary actual_content_summary,cb.homework_summary actual_homework_summary,cb.completed classbook_completed
      FROM attendance_sessions s LEFT JOIN classbook_entries cb ON cb.session_id=s.id
      WHERE s.tenant_id=? AND s.course_id=? AND s.session_date>=? AND s.session_date<=? AND s.status<>'cancelled'
      ORDER BY s.starts_at ASC LIMIT 800`).bind(tenantId,courseId,fromDay,toDay).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT id,title,starts_at,ends_at,location,description FROM appointments
      WHERE tenant_id=? AND (course_id=? OR course_id IS NULL) AND starts_at>=? AND starts_at<=? ORDER BY starts_at ASC LIMIT 200`).bind(tenantId,courseId,fromIso,toIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT e.id,e.title,e.starts_at,e.ends_at,e.room,e.notes,s.name subject_name FROM exams e LEFT JOIN subjects s ON s.id=e.subject_id AND s.tenant_id=e.tenant_id
      WHERE e.tenant_id=? AND e.course_id=? AND e.starts_at>=? AND e.starts_at<=? ORDER BY e.starts_at ASC LIMIT 200`).bind(tenantId,courseId,fromIso,toIso).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT m.id,m.title,m.body,m.source_label,m.priority,m.starts_at,m.ends_at,m.created_at,r.read_at
      FROM teacher_messages m LEFT JOIN teacher_message_reads r ON r.message_id=m.id AND r.user_id=?
      WHERE m.tenant_id=? AND (m.course_id=? OR m.course_id IS NULL) AND (m.starts_at IS NULL OR m.starts_at<=?) AND (m.ends_at IS NULL OR m.ends_at>=?)
      ORDER BY CASE m.priority WHEN 'urgent' THEN 1 WHEN 'important' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,m.created_at DESC LIMIT 50`).bind(auth.userId,tenantId,courseId,nowText,nowText).all<Record<string,unknown>>(),
  ]);
  return{range:{from:fromDay,to:toDay},lessons:lessons.results??[],sessions:sessions.results??[],appointments:appointments.results??[],exams:exams.results??[],messages:messages.results??[]};
}

export async function ensureLessonClassbookSession(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string){
  manager(auth,courseId);await ensureCourse(env,tenantId,courseId);
  const lesson=await env.DB.prepare(`SELECT l.id,l.starts_at,l.ends_at,l.room,s.name subject_name,t.name teacher_name,d.delivery_mode
    FROM lessons l LEFT JOIN subjects s ON s.id=l.subject_id AND s.tenant_id=l.tenant_id LEFT JOIN teachers t ON t.id=l.teacher_id AND t.tenant_id=l.tenant_id
    LEFT JOIN lesson_hub_details d ON d.lesson_id=l.id AND d.tenant_id=l.tenant_id AND d.course_id=l.course_id
    WHERE l.id=? AND l.tenant_id=? AND l.course_id=?`).bind(lessonId,tenantId,courseId).first<Record<string,unknown>>();
  if(!lesson)throw new Error('LESSON_NOT_FOUND');
  const starts=String(lesson.starts_at||''),ends=String(lesson.ends_at||''),sessionDate=starts.slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(sessionDate))throw new Error('ATTENDANCE_DAY_INVALID');
  const result=await upsertAttendanceSessionFromSource(env,auth,tenantId,courseId,{session_date:sessionDate,starts_at:starts,ends_at:ends,subject:lesson.subject_name||'Unterricht',room:lesson.room||null,instructor_text:lesson.teacher_name||null,delivery_mode:lesson.delivery_mode||'onsite',source:'timetable',source_ref:`lesson:${lessonId}`});
  const sessionId=String((result as Record<string,unknown>)?.id||'');if(!sessionId)throw new Error('ATTENDANCE_SESSION_NOT_FOUND');
  await audit(env.DB,auth.userId,'teacher.calendar.classbook_opened',tenantId,courseId,'lesson',lessonId,{sessionId});return{session_id:sessionId,lesson_id:lessonId};
}

export async function listTeacherMessagesAdmin(env:Env,auth:CoreAuthContext,tenantId:string){
  requireRole(auth,'tenant_admin');
  const rows=await env.DB.prepare(`SELECT m.*,c.name course_name,c.code course_code,(SELECT COUNT(*) FROM teacher_message_reads r WHERE r.message_id=m.id) read_count
    FROM teacher_messages m LEFT JOIN courses c ON c.id=m.course_id AND c.tenant_id=m.tenant_id WHERE m.tenant_id=? ORDER BY m.created_at DESC LIMIT 300`).bind(tenantId).all<Record<string,unknown>>();return rows.results??[];
}
export async function createTeacherMessage(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireRole(auth,'tenant_admin');const title=safeString(input.title,250),message=safeString(input.body,10000),source=safeString(input.source_label,100)||'Schulleitung',courseId=safeString(input.course_id,120)||null;if(!title||!message)throw new Error('TEACHER_MESSAGE_FIELDS_REQUIRED');if(courseId)await ensureCourse(env,tenantId,courseId);
  const starts=isoOrNull(input.starts_at),ends=isoOrNull(input.ends_at);if(starts&&ends&&starts>=ends)throw new Error('TEACHER_MESSAGE_WINDOW_INVALID');const msgId=id('tmsg_'),ts=nowIso();
  await env.DB.prepare('INSERT INTO teacher_messages(id,tenant_id,course_id,title,body,source_label,priority,starts_at,ends_at,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(msgId,tenantId,courseId,title,message,source,priority(input.priority),starts,ends,auth.userId,ts,ts).run();await audit(env.DB,auth.userId,'teacher_message.created',tenantId,courseId||undefined,'teacher_message',msgId,{source,priority:priority(input.priority)});return env.DB.prepare('SELECT * FROM teacher_messages WHERE id=? AND tenant_id=?').bind(msgId,tenantId).first();
}
export async function deleteTeacherMessage(env:Env,auth:CoreAuthContext,tenantId:string,messageId:string){requireRole(auth,'tenant_admin');const row=await env.DB.prepare('SELECT course_id FROM teacher_messages WHERE id=? AND tenant_id=?').bind(messageId,tenantId).first<Record<string,unknown>>();if(!row)throw new Error('TEACHER_MESSAGE_NOT_FOUND');await env.DB.prepare('DELETE FROM teacher_messages WHERE id=? AND tenant_id=?').bind(messageId,tenantId).run();await audit(env.DB,auth.userId,'teacher_message.deleted',tenantId,row.course_id?String(row.course_id):undefined,'teacher_message',messageId);}
export async function markTeacherMessageRead(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,messageId:string){manager(auth,courseId);const message=await env.DB.prepare('SELECT id FROM teacher_messages WHERE id=? AND tenant_id=? AND (course_id=? OR course_id IS NULL)').bind(messageId,tenantId,courseId).first();if(!message)throw new Error('TEACHER_MESSAGE_NOT_FOUND');const ts=nowIso();await env.DB.prepare('INSERT INTO teacher_message_reads(message_id,user_id,read_at) VALUES(?,?,?) ON CONFLICT(message_id,user_id) DO UPDATE SET read_at=excluded.read_at').bind(messageId,auth.userId,ts).run();return{message_id:messageId,read_at:ts};}
