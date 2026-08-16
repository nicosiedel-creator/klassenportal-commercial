import type { CoreAuthContext, Env } from './types.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { nowIso } from './utils.js';

function safeJson(v:string):unknown{try{return JSON.parse(v);}catch{return null;}}

export async function listTenantAudit(env:Env,auth:CoreAuthContext,tenantId:string,limit=100){
  requireRole(auth,'class_admin');
  const n=Math.max(1,Math.min(250,Math.floor(limit)||100));
  const binds:unknown[]=[tenantId];
  let sql=`SELECT a.id,a.course_id,a.actor_user_id,u.display_name AS actor_name,a.action,a.entity_type,a.entity_id,a.details_json,a.created_at
    FROM audit_log a LEFT JOIN users u ON u.id=a.actor_user_id WHERE a.tenant_id=?`;
  if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'){
    if(!auth.courseIds.length)return[];
    sql+=` AND a.course_id IN (${auth.courseIds.map(()=>'?').join(',')})`;
    binds.push(...auth.courseIds);
  }
  sql+=' ORDER BY a.created_at DESC LIMIT ?';
  binds.push(n);
  const r=await env.DB.prepare(sql).bind(...binds).all<Record<string,unknown>>();
  return (r.results??[]).map(row=>({...row,details:row.details_json?safeJson(String(row.details_json)):null,details_json:undefined}));
}

export async function listUserNotifications(env:Env,auth:CoreAuthContext,tenantId:string,courseId?:string,limit=80){
  requireRole(auth,'guest');
  const n=Math.max(1,Math.min(200,Math.floor(limit)||80));
  const binds:unknown[]=[tenantId,auth.userId];
  let sql=`SELECT id,course_id,type,title,body,read_at,created_at FROM notifications WHERE tenant_id=? AND user_id=?`;
  if(courseId){requireCourseAccess(auth,courseId);sql+=' AND (course_id=? OR course_id IS NULL)';binds.push(courseId);}
  sql+=' ORDER BY created_at DESC LIMIT ?';
  binds.push(n);
  const r=await env.DB.prepare(sql).bind(...binds).all<Record<string,unknown>>();
  return r.results??[];
}

export async function markNotificationRead(env:Env,auth:CoreAuthContext,tenantId:string,notificationId:string){
  requireRole(auth,'guest');
  const row=await env.DB.prepare('SELECT id,course_id,read_at FROM notifications WHERE id=? AND tenant_id=? AND user_id=?').bind(notificationId,tenantId,auth.userId).first<Record<string,unknown>>();
  if(!row)throw new Error('NOTIFICATION_NOT_FOUND');
  if(row.course_id)requireCourseAccess(auth,String(row.course_id));
  const ts=row.read_at?String(row.read_at):nowIso();
  if(!row.read_at)await env.DB.prepare('UPDATE notifications SET read_at=? WHERE id=? AND tenant_id=? AND user_id=?').bind(ts,notificationId,tenantId,auth.userId).run();
  return {id:notificationId,read_at:ts};
}

export async function markAllNotificationsRead(env:Env,auth:CoreAuthContext,tenantId:string,courseId?:string){
  requireRole(auth,'guest');
  const ts=nowIso();
  if(courseId){
    requireCourseAccess(auth,courseId);
    await env.DB.prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE tenant_id=? AND user_id=? AND (course_id=? OR course_id IS NULL)').bind(ts,tenantId,auth.userId,courseId).run();
  }else{
    await env.DB.prepare('UPDATE notifications SET read_at=COALESCE(read_at,?) WHERE tenant_id=? AND user_id=?').bind(ts,tenantId,auth.userId).run();
  }
  return {read_at:ts};
}
