import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { hashPassword } from './auth.js';
import { createActivationForUser } from './account-recovery.js';
import { canManageOrgUnit, ensureTenantUser } from './enterprise-access.js';
import { mailConfigured } from './mail.js';
import { RESPONSIBILITY_KINDS, responsibilityPermissions, type ResponsibilityKind } from './responsibility-policy.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, safeString } from './utils.js';

function effectiveSql(alias='r'){return `${alias}.status='active' AND (${alias}.valid_from IS NULL OR ${alias}.valid_from<=?) AND (${alias}.valid_until IS NULL OR ${alias}.valid_until>?)`;}
function kindOf(v:unknown):ResponsibilityKind{const k=String(v||'deputy') as ResponsibilityKind;if(!RESPONSIBILITY_KINDS.has(k))throw new Error('RESPONSIBILITY_KIND_INVALID');return k;}
function isoOrNull(v:unknown):string|null{const s=safeString(v,50);if(!s)return null;const d=new Date(s);if(Number.isNaN(d.getTime()))throw new Error('RESPONSIBILITY_DATE_INVALID');return d.toISOString();}
async function assertCourse(env:Env,tenantId:string,courseId:string){const c=await env.DB.prepare('SELECT id,name,code FROM courses WHERE tenant_id=? AND id=?').bind(tenantId,courseId).first<Record<string,unknown>>();if(!c)throw new Error('COURSE_NOT_FOUND');return c;}
async function assertUnit(env:Env,tenantId:string,unitId:string){const o=await env.DB.prepare('SELECT id,name,type_key FROM org_units WHERE tenant_id=? AND id=?').bind(tenantId,unitId).first<Record<string,unknown>>();if(!o)throw new Error('ORG_UNIT_NOT_FOUND');return o;}

async function canManageCourseResponsibilities(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string):Promise<boolean>{
  if(auth.isPlatformAdmin||auth.role==='tenant_admin')return true;
  const now=nowIso(),own=await env.DB.prepare(`SELECT 1 AS ok FROM responsibility_assignments r WHERE r.tenant_id=? AND r.course_id=? AND r.user_id=? AND r.responsibility_kind IN ('primary','co_responsible') AND ${effectiveSql('r')} LIMIT 1`).bind(tenantId,courseId,auth.userId,now,now).first<{ok:number}>().catch(()=>null);if(own)return true;
  const links=(await env.DB.prepare('SELECT org_unit_id FROM course_org_units WHERE tenant_id=? AND course_id=?').bind(tenantId,courseId).all<{org_unit_id:string}>()).results??[];for(const l of links)if(await canManageOrgUnit(env,auth,tenantId,l.org_unit_id,'access.manage'))return true;return false;
}
async function canManageTarget(env:Env,auth:CoreAuthContext,tenantId:string,orgUnitId:string|null,courseId:string|null){if(auth.isPlatformAdmin||auth.role==='tenant_admin')return true;if(orgUnitId)return canManageOrgUnit(env,auth,tenantId,orgUnitId,'access.manage');if(courseId)return canManageCourseResponsibilities(env,auth,tenantId,courseId);return false;}

async function resolveUser(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>):Promise<{id:string;created:boolean;email:string;displayName:string}>{
  const direct=safeString(input.user_id,100);let user:Record<string,unknown>|null=null;
  if(direct)user=await env.DB.prepare('SELECT id,email,display_name,is_platform_admin FROM users WHERE id=?').bind(direct).first<Record<string,unknown>>();
  else{const email=normalizeEmail(input.email);if(!email)throw new Error('USER_EMAIL_REQUIRED');user=await env.DB.prepare('SELECT id,email,display_name,is_platform_admin FROM users WHERE email=? COLLATE NOCASE').bind(email).first<Record<string,unknown>>();}
  let created=false;
  if(!user){const email=normalizeEmail(input.email),displayName=safeString(input.display_name,200);if(!email||!displayName)throw new Error('USER_FIELDS_REQUIRED');if(!mailConfigured(env))throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');const uid=id('usr_'),ts=nowIso(),unreachable=b64(randomBytes(32)).replace(/[+/=]/g,'').slice(0,38)+'Aa1!';await env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES(?,?,?,?,1,0,'active',?,?)").bind(uid,email,displayName,await hashPassword(unreachable),ts,ts).run();user={id:uid,email,display_name:displayName,is_platform_admin:0};created=true;}
  if(Number(user.is_platform_admin)===1)throw new Error('PLATFORM_ADMIN_RESPONSIBILITY_FORBIDDEN');
  await ensureTenantUser(env,tenantId,String(user.id),'manual');
  if(created){try{await createActivationForUser(env,auth,String(user.id));}catch(e){await env.DB.batch([env.DB.prepare('DELETE FROM tenant_users WHERE tenant_id=? AND user_id=?').bind(tenantId,String(user.id)),env.DB.prepare('DELETE FROM users WHERE id=?').bind(String(user.id))]);throw e;}}
  return{id:String(user.id),created,email:String(user.email||''),displayName:String(user.display_name||'')};
}

export async function listResponsibilities(env:Env,auth:CoreAuthContext,tenantId:string){
  if(!auth.isPlatformAdmin&&!auth.tenantIds.includes(tenantId))throw new Error('FORBIDDEN');
  let sql=`SELECT r.id,r.user_id,u.display_name,u.email,r.org_unit_id,o.name AS org_unit_name,o.type_key AS org_unit_type,r.course_id,c.name AS course_name,c.code AS course_code,r.responsibility_kind,r.inherit_descendants,r.valid_from,r.valid_until,r.status,r.source,r.created_at,r.updated_at
    FROM responsibility_assignments r JOIN users u ON u.id=r.user_id LEFT JOIN org_units o ON o.id=r.org_unit_id LEFT JOIN courses c ON c.id=r.course_id WHERE r.tenant_id=?`;
  const binds:unknown[]=[tenantId];
  if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'){const units=[...new Set(auth.orgUnitIds??[])],courses=[...new Set(auth.courseIds??[])];const parts:string[]=[];if(units.length){parts.push(`r.org_unit_id IN (${units.map(()=>'?').join(',')})`);binds.push(...units);}if(courses.length){parts.push(`r.course_id IN (${courses.map(()=>'?').join(',')})`);binds.push(...courses);}if(!parts.length)return[];sql+=` AND (${parts.join(' OR ')})`;}
  sql+=' ORDER BY CASE r.responsibility_kind WHEN \'primary\' THEN 1 WHEN \'co_responsible\' THEN 2 ELSE 3 END,COALESCE(o.name,c.name),u.display_name';
  const r=await env.DB.prepare(sql).bind(...binds).all<Record<string,unknown>>();return r.results??[];
}

export async function createResponsibility(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  const orgUnitId=safeString(input.org_unit_id,100)||null,courseId=safeString(input.course_id,100)||null;if((orgUnitId?1:0)+(courseId?1:0)!==1)throw new Error('RESPONSIBILITY_TARGET_REQUIRED');if(orgUnitId)await assertUnit(env,tenantId,orgUnitId);if(courseId)await assertCourse(env,tenantId,courseId);if(!await canManageTarget(env,auth,tenantId,orgUnitId,courseId))throw new Error('FORBIDDEN_RESPONSIBILITY_SCOPE');
  const kind=kindOf(input.responsibility_kind);if(kind==='primary'&&!auth.isPlatformAdmin&&auth.role!=='tenant_admin')throw new Error('PRIMARY_RESPONSIBILITY_TENANT_ADMIN_REQUIRED');const validFrom=isoOrNull(input.valid_from),validUntil=isoOrNull(input.valid_until);if(validFrom&&validUntil&&validFrom>=validUntil)throw new Error('RESPONSIBILITY_VALIDITY_INVALID');if(kind==='primary'&&validFrom&&validFrom>nowIso())throw new Error('PRIMARY_RESPONSIBILITY_MUST_START_NOW');
  const target=await resolveUser(env,auth,tenantId,input),now=nowIso();if(!auth.isPlatformAdmin&&target.id===auth.userId&&kind!=='deputy')throw new Error('SELF_ELEVATION_FORBIDDEN');
  const targetClause=orgUnitId?'org_unit_id=?':'course_id=?',targetValue=orgUnitId||courseId,existing=await env.DB.prepare(`SELECT id FROM responsibility_assignments WHERE tenant_id=? AND ${targetClause} AND user_id=? AND responsibility_kind=? AND ${effectiveSql()} LIMIT 1`).bind(tenantId,targetValue,target.id,kind,now,now).first<{id:string}>();if(existing)throw new Error('RESPONSIBILITY_ALREADY_EXISTS');
  const rid=id('rsp_'),ts=nowIso(),inherit=orgUnitId&&input.inherit_descendants!==false?1:0,stmts=[] as any[];
  if(kind==='primary')stmts.push(env.DB.prepare(`UPDATE responsibility_assignments SET status='revoked',updated_at=? WHERE tenant_id=? AND ${targetClause} AND responsibility_kind='primary' AND status='active'`).bind(ts,tenantId,targetValue));
  stmts.push(env.DB.prepare("INSERT INTO responsibility_assignments(id,tenant_id,user_id,org_unit_id,course_id,responsibility_kind,inherit_descendants,valid_from,valid_until,status,source,granted_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,'active','manual',?,?,?)").bind(rid,tenantId,target.id,orgUnitId,courseId,kind,inherit,validFrom,validUntil,auth.userId,ts,ts));await env.DB.batch(stmts);
  await audit(env.DB,auth.userId,'organization.responsibility.assigned',tenantId,courseId??undefined,'responsibility_assignment',rid,{userId:target.id,orgUnitId,courseId,kind,inheritDescendants:!!inherit,validFrom,validUntil,createdUser:target.created,permissions:responsibilityPermissions(kind)});return env.DB.prepare('SELECT * FROM responsibility_assignments WHERE id=?').bind(rid).first();
}

export async function revokeResponsibility(env:Env,auth:CoreAuthContext,tenantId:string,responsibilityId:string){
  const r=await env.DB.prepare('SELECT id,user_id,org_unit_id,course_id,responsibility_kind,status FROM responsibility_assignments WHERE tenant_id=? AND id=?').bind(tenantId,responsibilityId).first<Record<string,unknown>>();if(!r)throw new Error('RESPONSIBILITY_NOT_FOUND');if(String(r.status)!=='active')return;if(!await canManageTarget(env,auth,tenantId,r.org_unit_id?String(r.org_unit_id):null,r.course_id?String(r.course_id):null))throw new Error('FORBIDDEN_RESPONSIBILITY_SCOPE');if(String(r.responsibility_kind)==='primary'&&!auth.isPlatformAdmin&&auth.role!=='tenant_admin')throw new Error('PRIMARY_RESPONSIBILITY_TENANT_ADMIN_REQUIRED');if(String(r.user_id)===auth.userId&&['primary','co_responsible'].includes(String(r.responsibility_kind)))throw new Error('CANNOT_REVOKE_OWN_RESPONSIBILITY');await env.DB.prepare("UPDATE responsibility_assignments SET status='revoked',updated_at=? WHERE id=? AND tenant_id=?").bind(nowIso(),responsibilityId,tenantId).run();await audit(env.DB,auth.userId,'organization.responsibility.revoked',tenantId,r.course_id?String(r.course_id):undefined,'responsibility_assignment',responsibilityId,{userId:r.user_id,orgUnitId:r.org_unit_id,courseId:r.course_id,kind:r.responsibility_kind});
}
