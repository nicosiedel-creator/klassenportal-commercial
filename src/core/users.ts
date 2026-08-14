import type { CoreAuthContext, Env } from './types.js';
import { hashPassword } from './auth.js';
import { audit } from './audit.js';
import { requireRole } from './permissions.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, safeString } from './utils.js';

export async function listTenantUsers(env:Env,auth:CoreAuthContext,tenantId:string){
  requireRole(auth,'class_admin');
  const r=await env.DB.prepare(`SELECT u.id,u.email,u.display_name,u.status,m.course_id,m.role,m.created_at
    FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? ORDER BY u.display_name,m.role`).bind(tenantId).all();
  return r.results??[];
}

export async function createTenantUser(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireRole(auth,'tenant_admin'); const email=normalizeEmail(input.email),name=safeString(input.display_name,200),role=String(input.role||'participant'),courseId=input.course_id?String(input.course_id):null;
  if(!email||!name)throw new Error('USER_FIELDS_REQUIRED'); if(!['tenant_admin','class_admin','participant','guest'].includes(role))throw new Error('ROLE_INVALID');
  if(role!=='tenant_admin'&&!courseId)throw new Error('COURSE_ID_REQUIRED');
  if(courseId){const c=await env.DB.prepare('SELECT id FROM courses WHERE id=? AND tenant_id=?').bind(courseId,tenantId).first();if(!c)throw new Error('COURSE_NOT_FOUND');}
  let user=await env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').bind(email).first<{id:string}>(); let temporaryPassword:string|undefined;
  if(!user){temporaryPassword=b64(randomBytes(12)).replace(/[+/=]/g,'').slice(0,16)+'Aa1!'; const uid=id('usr_'),ts=nowIso(); await env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES(?,?,?,?,1,0,'active',?,?)").bind(uid,email,name,await hashPassword(temporaryPassword),ts,ts).run(); user={id:uid};}
  const membershipId=id('mem_'); await env.DB.prepare('INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES(?,?,?,?,?,?)').bind(membershipId,tenantId,role==='tenant_admin'?null:courseId,user.id,role,nowIso()).run(); await audit(env.DB,auth.userId,'membership.created',tenantId,courseId??undefined,'membership',membershipId,{email,role});
  return {user_id:user.id,membership_id:membershipId,temporary_password:temporaryPassword};
}
