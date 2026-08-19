import type { CoreAuthContext, Env } from './types.js';
import { teacherAttendanceAuth } from './teacher-portal.js';
import { computeCourseReadiness } from './education-readiness.js';

function reportAuth(auth:CoreAuthContext,tenantId:string,courseId:string):CoreAuthContext{return{...auth,tenantIds:[...new Set([...auth.tenantIds,tenantId])],courseIds:[...new Set([...auth.courseIds,courseId])],permissions:[...new Set([...(auth.permissions||[]),'reports.view','courses.view'])]};}
function parse(v:unknown){try{return JSON.parse(String(v||'{}'));}catch{return{};}}

export async function teacherOperationalInsights(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  const teacher=await teacherAttendanceAuth(env,auth,tenantId,courseId),scoped=reportAuth(teacher,tenantId,courseId),readiness=await computeCourseReadiness(env,scoped,tenantId,courseId);
  const risks=((await env.DB.prepare("SELECT id,category,severity,horizon_date,title,detail_json,suggested_scenario_type,last_seen_at FROM education_risks WHERE tenant_id=? AND course_id=? AND status IN ('open','acknowledged') AND category IN ('curriculum','classbook','staffing','qualification','resource','exam','practice','signature','report_book') ORDER BY CASE severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC,COALESCE(horizon_date,'9999') LIMIT 30").bind(tenantId,courseId).all<Record<string,unknown>>()).results??[]).map(x=>({...x,detail:parse(x.detail_json)}));
  const findings=((await env.DB.prepare("SELECT id,category,severity,title,expected_json,actual_json,confidence,updated_at FROM education_consistency_findings WHERE tenant_id=? AND course_id=? AND status='open' AND category IN ('staffing','learning_mode','proof_chain','curriculum','schedule','resource') ORDER BY CASE severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC,updated_at DESC LIMIT 30").bind(tenantId,courseId).all<Record<string,unknown>>()).results??[]).map(x=>({...x,expected:parse(x.expected_json),actual:parse(x.actual_json)}));
  return{course_id:courseId,readiness,risks,findings,privacy:{participant_names:false,individual_attendance:false,grades:false,private_notes:false},permissions:{read_only:true,can_execute_autopilot:false,can_approve_autopilot:false}};
}
