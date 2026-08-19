import type { CoreAuthContext, Env, SessionUser } from './types.js';
import { ensureReportBookPeriod, generateReportBookFromSchedule } from './learning-operations.js';

function mondayAndSunday(){
  const now=new Date(),day=(now.getUTCDay()+6)%7,monday=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate(),12));
  monday.setUTCDate(monday.getUTCDate()-day);const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6);
  return{start:monday.toISOString().slice(0,10),end:sunday.toISOString().slice(0,10)};
}
function participantAuth(userId:string,email:string,name:string,tenantId:string,courseId:string):CoreAuthContext{
  const session:SessionUser={userId,email,displayName:name,isPlatformAdmin:false,mustChangePassword:false,tenantRoles:[],authMethod:'api'};
  return{userId,role:'participant',tenantIds:[tenantId],courseIds:[courseId],permissions:[],isPlatformAdmin:false,session};
}

/**
 * Opt-in automation: only courses where somebody has already created at least
 * one report-book period are considered. This avoids silently enabling the
 * workflow for tenants that do not use report books. Missing periods for the
 * current week are created idempotently and prefilled from schedule/classbook.
 */
export async function runReportBookAutomation(env:Env,limit=250){
  const {start,end}=mondayAndSunday();
  const rows=(await env.DB.prepare(`
    SELECT DISTINCT c.tenant_id,c.id course_id,m.user_id,u.email,u.display_name
      FROM courses c
      JOIN memberships m ON m.tenant_id=c.tenant_id AND m.course_id=c.id AND m.role IN ('participant','class_admin')
      JOIN users u ON u.id=m.user_id AND u.status='active'
     WHERE c.is_active=1
       AND EXISTS(SELECT 1 FROM report_book_periods previous WHERE previous.tenant_id=c.tenant_id AND previous.course_id=c.id)
       AND NOT EXISTS(SELECT 1 FROM report_book_periods current WHERE current.tenant_id=c.tenant_id AND current.course_id=c.id AND current.participant_user_id=m.user_id AND current.period_start=? AND current.period_end=?)
     ORDER BY c.tenant_id,c.id,u.display_name
     LIMIT ?`).bind(start,end,Math.max(1,Math.min(1000,limit))).all<Record<string,unknown>>()).results??[];
  let created=0,prefilled=0,failed=0;
  for(const row of rows){
    const tenantId=String(row.tenant_id),courseId=String(row.course_id),userId=String(row.user_id),auth=participantAuth(userId,String(row.email||''),String(row.display_name||'Teilnehmer'),tenantId,courseId);
    try{
      const period=await ensureReportBookPeriod(env,auth,tenantId,courseId,{period_start:start,period_end:end,title:`Woche ${start} – ${end}`});
      created++;
      const generated=await generateReportBookFromSchedule(env,auth,tenantId,courseId,String(period.period_id));
      prefilled+=Number(generated.generated||0);
    }catch(error){failed++;console.error('Report-book weekly automation failed',{tenantId,courseId,userId,error:String((error as Error)?.message||error)});}
  }
  return{created,prefilled,failed,period_start:start,period_end:end};
}
