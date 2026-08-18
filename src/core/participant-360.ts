import type { CoreAuthContext, Env } from './types.js';
import { requireRole } from './permissions.js';

function marks(n:number){return Array.from({length:n},()=>'?').join(',');}
function allowedCourses(auth:CoreAuthContext,participantCourses:string[]){if(auth.isPlatformAdmin||auth.role==='tenant_admin')return participantCourses;const allowed=new Set(auth.courseIds||[]);return participantCourses.filter(x=>allowed.has(x));}
async function count(env:Env,sql:string,args:unknown[]){return Number((await env.DB.prepare(sql).bind(...args).first<{n:number}>())?.n||0);}

export async function participant360(env:Env,auth:CoreAuthContext,tenantId:string,userId:string){
  requireRole(auth,'class_admin');
  const person=await env.DB.prepare(`SELECT u.id,u.display_name,u.email,u.status,tu.status tenant_status,tu.external_id,tu.source,tu.created_at tenant_since
    FROM users u JOIN tenant_users tu ON tu.user_id=u.id AND tu.tenant_id=? WHERE u.id=?`).bind(tenantId,userId).first<Record<string,unknown>>();
  if(!person)throw new Error('PARTICIPANT_NOT_FOUND');
  const memberships=(await env.DB.prepare(`SELECT DISTINCT c.id course_id,c.name,c.code,c.start_date,c.end_date,c.is_active
    FROM memberships m JOIN courses c ON c.id=m.course_id AND c.tenant_id=m.tenant_id
    WHERE m.tenant_id=? AND m.user_id=? AND m.role='participant' ORDER BY c.is_active DESC,c.start_date DESC,c.name`).bind(tenantId,userId).all<Record<string,unknown>>()).results??[];
  const allCourseIds=memberships.map(x=>String(x.course_id)),courseIds=allowedCourses(auth,allCourseIds);if(!courseIds.length)throw new Error('FORBIDDEN_PARTICIPANT_SCOPE');
  const courseSet=new Set(courseIds),courses=memberships.filter(x=>courseSet.has(String(x.course_id))),m=marks(courseIds.length),base=[tenantId,userId,...courseIds];
  const attendanceRows=(await env.DB.prepare(`SELECT status,COUNT(*) n,SUM(minutes_late) minutes_late FROM attendance_records WHERE tenant_id=? AND user_id=? AND course_id IN (${m}) GROUP BY status`).bind(...base).all<Record<string,unknown>>()).results??[];
  const attendance:Record<string,number>={present:0,remote_present:0,late:0,excused_absent:0,unexcused_absent:0,not_recorded:0,minutes_late:0};for(const r of attendanceRows){attendance[String(r.status)]=Number(r.n||0);attendance.minutes_late+=Number(r.minutes_late||0);}const recorded=attendance.present+attendance.remote_present+attendance.late+attendance.excused_absent+attendance.unexcused_absent,attended=attendance.present+attendance.remote_present+attendance.late;attendance.recorded=recorded;attendance.attended=attended;attendance.percent=recorded?Math.round(attended/recorded*1000)/10:0;
  const absence=(await env.DB.prepare(`SELECT status,COUNT(*) n FROM absence_notices WHERE tenant_id=? AND user_id=? AND course_id IN (${m}) GROUP BY status`).bind(...base).all<Record<string,unknown>>()).results??[];
  const grades=(await env.DB.prepare(`SELECT g.id,g.course_id,c.name course_name,g.title,g.grade_value,g.points_value,g.weight,g.note,g.recorded_at FROM personal_grades g JOIN courses c ON c.id=g.course_id WHERE g.tenant_id=? AND g.user_id=? AND g.course_id IN (${m}) ORDER BY g.recorded_at DESC LIMIT 100`).bind(...base).all<Record<string,unknown>>()).results??[];
  const progress=(await env.DB.prepare(`SELECT course_id,COUNT(*) total,SUM(done) done FROM learning_progress WHERE tenant_id=? AND user_id=? AND course_id IN (${m}) GROUP BY course_id`).bind(...base).all<Record<string,unknown>>()).results??[];
  const messages=await env.DB.prepare(`SELECT COUNT(*) total,SUM(CASE WHEN r.read_at IS NOT NULL THEN 1 ELSE 0 END) read_count,SUM(CASE WHEN r.acknowledged_at IS NOT NULL THEN 1 ELSE 0 END) ack_count FROM communication_recipients r JOIN communication_messages cm ON cm.id=r.message_id WHERE r.tenant_id=? AND r.user_id=? AND EXISTS(SELECT 1 FROM communication_targets ct WHERE ct.message_id=cm.id AND (ct.target_type<>'course' OR ct.target_id IN (${m})))`).bind(tenantId,userId,...courseIds).first<Record<string,unknown>>();
  const openTasks=await count(env,`SELECT COUNT(*) n FROM automation_tasks WHERE tenant_id=? AND status IN ('open','in_progress') AND detail_json LIKE ?`,[tenantId,`%${userId}%`]).catch(()=>0);
  const orgUnits=(await env.DB.prepare(`SELECT DISTINCT o.id,o.name,o.type_key,t.label type_label FROM course_org_units co JOIN org_units o ON o.id=co.org_unit_id JOIN org_unit_types t ON t.tenant_id=o.tenant_id AND t.type_key=o.type_key WHERE co.tenant_id=? AND co.course_id IN (${m}) ORDER BY t.sort_order,o.name`).bind(tenantId,...courseIds).all<Record<string,unknown>>()).results??[];
  return{person:{id:person.id,display_name:person.display_name,email:person.email,status:person.status,tenant_status:person.tenant_status,external_id:person.external_id,source:person.source,tenant_since:person.tenant_since},courses,orgUnits,attendance,absence:Object.fromEntries(absence.map(x=>[String(x.status),Number(x.n||0)])),grades,progress,messages:{total:Number(messages?.total||0),read:Number(messages?.read_count||0),acknowledged:Number(messages?.ack_count||0)},openAttentionTasks:openTasks,privacy:{contract_text_included:false,health_data_included:false,bank_data_included:false}};
}

export async function participant360Candidates(env:Env,auth:CoreAuthContext,tenantId:string){
  requireRole(auth,'class_admin');
  let sql=`SELECT DISTINCT u.id,u.display_name,u.email FROM memberships m JOIN users u ON u.id=m.user_id JOIN tenant_users tu ON tu.tenant_id=m.tenant_id AND tu.user_id=m.user_id WHERE m.tenant_id=? AND m.role='participant' AND u.status='active' AND tu.status='active'`,args:unknown[]=[tenantId];
  if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'){if(!auth.courseIds.length)return[];sql+=` AND m.course_id IN (${marks(auth.courseIds.length)})`;args.push(...auth.courseIds);}sql+=' ORDER BY u.display_name,u.email LIMIT 2000';return (await env.DB.prepare(sql).bind(...args).all<Record<string,unknown>>()).results??[];
}
