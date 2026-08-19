import type { CoreAuthContext, Env, SessionUser } from './types.js';
import { audit } from './audit.js';
import { requireRole } from './permissions.js';
import { id, nowIso, safeString } from './utils.js';

function activeClause(alias='a'){return `${alias}.status='active'`;}

export async function teacherPortalOptions(env:Env,auth:CoreAuthContext,tenantId:string){
  requireRole(auth,'tenant_admin');
  const [teachers,users,courses]=await Promise.all([
    env.DB.prepare('SELECT id,name,email FROM teachers WHERE tenant_id=? ORDER BY name,email').bind(tenantId).all<Record<string,unknown>>(),
    env.DB.prepare(`SELECT DISTINCT u.id,u.display_name,u.email FROM users u JOIN tenant_users tu ON tu.user_id=u.id AND tu.tenant_id=? WHERE u.status='active' AND tu.status='active' ORDER BY u.display_name,u.email`).bind(tenantId).all<Record<string,unknown>>(),
    env.DB.prepare("SELECT id,name,code FROM courses WHERE tenant_id=? AND is_active=1 ORDER BY name").bind(tenantId).all<Record<string,unknown>>(),
  ]);
  return{teachers:teachers.results??[],users:users.results??[],courses:courses.results??[]};
}

export async function listTeacherPortalAssignments(env:Env,auth:CoreAuthContext,tenantId:string){
  requireRole(auth,'tenant_admin');
  const rows=await env.DB.prepare(`SELECT a.id,a.teacher_id,a.user_id,a.course_id,a.status,a.created_at,a.updated_at,
    t.name teacher_name,t.email teacher_email,u.display_name user_name,u.email user_email,c.name course_name,c.code course_code
    FROM teacher_portal_assignments a
    JOIN teachers t ON t.id=a.teacher_id AND t.tenant_id=a.tenant_id
    JOIN users u ON u.id=a.user_id
    JOIN courses c ON c.id=a.course_id AND c.tenant_id=a.tenant_id
    WHERE a.tenant_id=? ORDER BY a.status,a.teacher_id,c.name`).bind(tenantId).all<Record<string,unknown>>();
  return rows.results??[];
}

export async function saveTeacherPortalAssignment(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireRole(auth,'tenant_admin');
  const teacherId=safeString(input.teacher_id,120),userId=safeString(input.user_id,120),courseId=safeString(input.course_id,120);
  if(!teacherId||!userId||!courseId)throw new Error('TEACHER_ASSIGNMENT_FIELDS_REQUIRED');
  const [teacher,user,course,studentRole]=await Promise.all([
    env.DB.prepare('SELECT id FROM teachers WHERE id=? AND tenant_id=?').bind(teacherId,tenantId).first(),
    env.DB.prepare("SELECT u.id FROM users u JOIN tenant_users tu ON tu.user_id=u.id AND tu.tenant_id=? WHERE u.id=? AND u.status='active' AND tu.status='active'").bind(tenantId,userId).first(),
    env.DB.prepare('SELECT id FROM courses WHERE id=? AND tenant_id=? AND is_active=1').bind(courseId,tenantId).first(),
    env.DB.prepare("SELECT role FROM memberships WHERE tenant_id=? AND course_id=? AND user_id=? AND role IN ('participant','class_admin') LIMIT 1").bind(tenantId,courseId,userId).first<{role:string}>(),
  ]);
  if(!teacher)throw new Error('TEACHER_NOT_FOUND');
  if(!user)throw new Error('TEACHER_USER_NOT_FOUND');
  if(!course)throw new Error('COURSE_NOT_FOUND');
  if(studentRole)throw new Error('TEACHER_STUDENT_ROLE_CONFLICT');
  const ts=nowIso(),existing=await env.DB.prepare('SELECT id,auth_membership_id FROM teacher_portal_assignments WHERE tenant_id=? AND teacher_id=? AND user_id=? AND course_id=?').bind(tenantId,teacherId,userId,courseId).first<{id:string;auth_membership_id:string|null}>(),membership=await env.DB.prepare('SELECT id FROM memberships WHERE tenant_id=? AND course_id=? AND user_id=? LIMIT 1').bind(tenantId,courseId,userId).first<{id:string}>();
  const assignmentId=existing?.id||id('tpa_');let authMembershipId=existing?.auth_membership_id||null;
  if(!membership){authMembershipId=id('mem_teacher_');await env.DB.prepare("INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES(?,?,?,?, 'guest',?)").bind(authMembershipId,tenantId,courseId,userId,ts).run();}
  if(existing)await env.DB.prepare("UPDATE teacher_portal_assignments SET status='active',auth_membership_id=?,granted_by=?,updated_at=? WHERE id=? AND tenant_id=?").bind(authMembershipId,auth.userId,ts,assignmentId,tenantId).run();
  else await env.DB.prepare("INSERT INTO teacher_portal_assignments(id,tenant_id,teacher_id,user_id,course_id,auth_membership_id,status,granted_by,created_at,updated_at) VALUES(?,?,?,?,?,?,'active',?,?,?)").bind(assignmentId,tenantId,teacherId,userId,courseId,authMembershipId,auth.userId,ts,ts).run();
  await audit(env.DB,auth.userId,'teacher_portal.assignment_saved',tenantId,courseId,'teacher_portal_assignment',assignmentId,{teacherId,userId});
  return env.DB.prepare('SELECT id,teacher_id,user_id,course_id,status,created_at,updated_at FROM teacher_portal_assignments WHERE id=? AND tenant_id=?').bind(assignmentId,tenantId).first();
}

export async function revokeTeacherPortalAssignment(env:Env,auth:CoreAuthContext,tenantId:string,assignmentId:string){
  requireRole(auth,'tenant_admin');
  const row=await env.DB.prepare('SELECT id,course_id,teacher_id,user_id,auth_membership_id FROM teacher_portal_assignments WHERE id=? AND tenant_id=?').bind(assignmentId,tenantId).first<Record<string,unknown>>();
  if(!row)throw new Error('TEACHER_ASSIGNMENT_NOT_FOUND');
  const statements=[env.DB.prepare("UPDATE teacher_portal_assignments SET status='revoked',auth_membership_id=NULL,updated_at=? WHERE id=? AND tenant_id=?").bind(nowIso(),assignmentId,tenantId)];
  if(row.auth_membership_id)statements.push(env.DB.prepare("DELETE FROM memberships WHERE id=? AND tenant_id=? AND user_id=? AND course_id=? AND role='guest'").bind(String(row.auth_membership_id),tenantId,String(row.user_id),String(row.course_id)));
  await env.DB.batch(statements);
  await audit(env.DB,auth.userId,'teacher_portal.assignment_revoked',tenantId,String(row.course_id),'teacher_portal_assignment',assignmentId,{teacherId:row.teacher_id,userId:row.user_id});
}

export async function myTeacherPortalCourses(env:Env,session:SessionUser){
  const rows=await env.DB.prepare(`SELECT a.tenant_id,a.teacher_id,a.course_id,t.name teacher_name,t.email teacher_email,
    c.name course_name,c.code course_code,tn.name tenant_name,tn.slug tenant_slug
    FROM teacher_portal_assignments a
    JOIN teachers t ON t.id=a.teacher_id AND t.tenant_id=a.tenant_id
    JOIN courses c ON c.id=a.course_id AND c.tenant_id=a.tenant_id AND c.is_active=1
    JOIN tenants tn ON tn.id=a.tenant_id AND tn.status='active'
    JOIN tenant_users tu ON tu.tenant_id=a.tenant_id AND tu.user_id=a.user_id AND tu.status='active'
    WHERE a.user_id=? AND ${activeClause('a')} ORDER BY tn.name,c.name`).bind(session.userId).all<Record<string,unknown>>();
  return rows.results??[];
}

export async function teacherAttendanceAuth(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string):Promise<CoreAuthContext>{
  if(auth.isPlatformAdmin||auth.role==='tenant_admin')return auth;
  const assignment=await env.DB.prepare(`SELECT id FROM teacher_portal_assignments WHERE tenant_id=? AND course_id=? AND user_id=? AND ${activeClause('teacher_portal_assignments')} LIMIT 1`).bind(tenantId,courseId,auth.userId).first();
  if(!assignment)throw new Error('FORBIDDEN_TEACHER_COURSE');
  return{...auth,role:'class_admin',tenantIds:[...new Set([...auth.tenantIds,tenantId])],courseIds:[...new Set([...auth.courseIds,courseId])]};
}
