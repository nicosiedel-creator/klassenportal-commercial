import type { CoreAuthContext, Env } from './types.js';
import { hashPassword } from './auth.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, safeString } from './utils.js';

export async function listTenantUsers(env:Env,auth:CoreAuthContext,tenantId:string){
  requireRole(auth,'class_admin');
  if(auth.isPlatformAdmin||auth.role==='tenant_admin'){
    const r=await env.DB.prepare(`SELECT m.id AS membership_id,u.id,u.email,u.display_name,u.status,m.course_id,m.role,m.created_at
      FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? ORDER BY u.display_name,m.role`).bind(tenantId).all();
    return r.results??[];
  }
  if(!auth.courseIds.length)return[];
  const marks=auth.courseIds.map(()=>'?').join(',');
  const r=await env.DB.prepare(`SELECT m.id AS membership_id,u.id,u.email,u.display_name,u.status,m.course_id,m.role,m.created_at
    FROM memberships m JOIN users u ON u.id=m.user_id
    WHERE m.tenant_id=? AND m.course_id IN (${marks}) ORDER BY u.display_name,m.role`).bind(tenantId,...auth.courseIds).all();
  return r.results??[];
}

export async function createTenantUser(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireRole(auth,'class_admin');
  const email=normalizeEmail(input.email),name=safeString(input.display_name,200),role=String(input.role||'participant'),courseId=input.course_id?String(input.course_id):null;
  if(!email||!name)throw new Error('USER_FIELDS_REQUIRED');
  if(!['tenant_admin','class_admin','participant','guest'].includes(role))throw new Error('ROLE_INVALID');
  if(role!=='tenant_admin'&&!courseId)throw new Error('COURSE_ID_REQUIRED');
  if(auth.role==='class_admin'){
    if(role==='tenant_admin'||role==='class_admin')throw new Error('FORBIDDEN_ROLE_ASSIGNMENT');
    if(!courseId)throw new Error('COURSE_ID_REQUIRED');
    requireCourseAccess(auth,courseId);
  }
  if(courseId){const c=await env.DB.prepare('SELECT id FROM courses WHERE id=? AND tenant_id=?').bind(courseId,tenantId).first();if(!c)throw new Error('COURSE_NOT_FOUND');}
  let user=await env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').bind(email).first<{id:string}>(); let temporaryPassword:string|undefined;
  if(!user){temporaryPassword=b64(randomBytes(12)).replace(/[+/=]/g,'').slice(0,16)+'Aa1!'; const uid=id('usr_'),ts=nowIso(); await env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES(?,?,?,?,1,0,'active',?,?)").bind(uid,email,name,await hashPassword(temporaryPassword),ts,ts).run(); user={id:uid};}
  const membershipId=id('mem_'); await env.DB.prepare('INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES(?,?,?,?,?,?)').bind(membershipId,tenantId,role==='tenant_admin'?null:courseId,user.id,role,nowIso()).run();
  await audit(env.DB,auth.userId,'membership.created',tenantId,courseId??undefined,'membership',membershipId,{email,role});
  return {user_id:user.id,membership_id:membershipId,temporary_password:temporaryPassword};
}

async function membershipRow(env:Env,tenantId:string,membershipId:string){
  const row=await env.DB.prepare(`SELECT m.id,m.user_id,m.course_id,m.role,u.email,u.display_name
    FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.id=? AND m.tenant_id=?`).bind(membershipId,tenantId).first<Record<string,unknown>>();
  if(!row)throw new Error('MEMBERSHIP_NOT_FOUND');return row;
}
function assertManageable(auth:CoreAuthContext,row:Record<string,unknown>):void{
  if(auth.isPlatformAdmin||auth.role==='tenant_admin')return;
  requireRole(auth,'class_admin');
  if(!row.course_id||!auth.courseIds.includes(String(row.course_id)))throw new Error('FORBIDDEN_COURSE');
  if(!['participant','guest'].includes(String(row.role)))throw new Error('FORBIDDEN_ROLE_ASSIGNMENT');
}
export async function updateTenantMembership(env:Env,auth:CoreAuthContext,tenantId:string,membershipId:string,input:Record<string,unknown>){
  const current=await membershipRow(env,tenantId,membershipId);assertManageable(auth,current);
  const role=String(input.role??current.role),courseId=role==='tenant_admin'?null:String(input.course_id??current.course_id??'')||null;
  if(!['tenant_admin','class_admin','participant','guest'].includes(role))throw new Error('ROLE_INVALID');
  if(role!=='tenant_admin'&&!courseId)throw new Error('COURSE_ID_REQUIRED');
  if(!auth.isPlatformAdmin&&auth.userId===String(current.user_id)&&String(current.role)==='tenant_admin'&&(role!=='tenant_admin'||courseId))throw new Error('CANNOT_REMOVE_OWN_TENANT_ADMIN');
  if(auth.role==='class_admin'){
    if(!['participant','guest'].includes(role))throw new Error('FORBIDDEN_ROLE_ASSIGNMENT');
    if(!courseId)throw new Error('COURSE_ID_REQUIRED');requireCourseAccess(auth,courseId);
  }
  if(courseId){const c=await env.DB.prepare('SELECT id FROM courses WHERE id=? AND tenant_id=?').bind(courseId,tenantId).first();if(!c)throw new Error('COURSE_NOT_FOUND');}
  await env.DB.prepare('UPDATE memberships SET course_id=?,role=? WHERE id=? AND tenant_id=?').bind(courseId,role,membershipId,tenantId).run();
  await audit(env.DB,auth.userId,'membership.updated',tenantId,courseId??undefined,'membership',membershipId,{fromRole:current.role,toRole:role,fromCourse:current.course_id,toCourse:courseId});
  return membershipRow(env,tenantId,membershipId);
}
export async function deleteTenantMembership(env:Env,auth:CoreAuthContext,tenantId:string,membershipId:string):Promise<void>{
  const current=await membershipRow(env,tenantId,membershipId);assertManageable(auth,current);
  if(!auth.isPlatformAdmin&&auth.userId===String(current.user_id)&&String(current.role)==='tenant_admin')throw new Error('CANNOT_REMOVE_OWN_TENANT_ADMIN');
  await env.DB.prepare('DELETE FROM memberships WHERE id=? AND tenant_id=?').bind(membershipId,tenantId).run();
  await audit(env.DB,auth.userId,'membership.deleted',tenantId,current.course_id?String(current.course_id):undefined,'membership',membershipId,{role:current.role,email:current.email});
}
