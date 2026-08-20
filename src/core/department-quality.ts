import type { CoreAuthContext, Env } from './types.js';
import { hasPermission } from './enterprise-access.js';
import { nowIso } from './utils.js';

type DepartmentSummary={courses:number;sessions:number;completed:number;missing_topic:number;revision_required:number};

export async function departmentQualityOverviewSafe(env:Env,auth:CoreAuthContext,tenantId:string){
  if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'&&!hasPermission(auth,'reports.view'))throw new Error('FORBIDDEN_DEPARTMENT_REPORT');
  const courseIds=auth.isPlatformAdmin||auth.role==='tenant_admin'?null:[...new Set(auth.courseIds)];
  if(courseIds&&!courseIds.length)return{courses:[],summary:{courses:0,sessions:0,completed:0,missing_topic:0,revision_required:0}};

  let sql=`SELECT c.id course_id,c.name,c.code,
    (SELECT COUNT(*) FROM attendance_sessions s WHERE s.tenant_id=c.tenant_id AND s.course_id=c.id AND s.status<>'cancelled') sessions,
    (SELECT COUNT(*) FROM attendance_sessions s JOIN classbook_entries cb ON cb.session_id=s.id WHERE s.tenant_id=c.tenant_id AND s.course_id=c.id AND s.status<>'cancelled' AND cb.completed=1) completed,
    (SELECT COUNT(*) FROM attendance_sessions s LEFT JOIN classbook_entries cb ON cb.session_id=s.id WHERE s.tenant_id=c.tenant_id AND s.course_id=c.id AND s.status<>'cancelled' AND (cb.topic IS NULL OR trim(cb.topic)='')) missing_topic,
    (SELECT COUNT(*) FROM classbook_entry_reviews r WHERE r.tenant_id=c.tenant_id AND r.course_id=c.id AND r.status='revision_required') revision_required,
    (SELECT MAX(s.starts_at) FROM attendance_sessions s WHERE s.tenant_id=c.tenant_id AND s.course_id=c.id AND s.status<>'cancelled') last_session,
    (SELECT MIN(e.starts_at) FROM exams e WHERE e.tenant_id=c.tenant_id AND e.course_id=c.id AND e.starts_at>=?) next_exam
    FROM courses c WHERE c.tenant_id=? AND c.is_active=1`;
  const args:unknown[]=[nowIso(),tenantId];
  if(courseIds){sql+=` AND c.id IN (${courseIds.map(()=>'?').join(',')})`;args.push(...courseIds);}
  sql+=' ORDER BY c.name';
  const rows=(await env.DB.prepare(sql).bind(...args).all<Record<string,unknown>>()).results??[];
  const summary=rows.reduce<DepartmentSummary>((a,x)=>({
    courses:a.courses+1,
    sessions:a.sessions+Number(x.sessions||0),
    completed:a.completed+Number(x.completed||0),
    missing_topic:a.missing_topic+Number(x.missing_topic||0),
    revision_required:a.revision_required+Number(x.revision_required||0),
  }),{courses:0,sessions:0,completed:0,missing_topic:0,revision_required:0});
  return{courses:rows,summary};
}
