import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { hasPermission } from './enterprise-access.js';
import { nowIso, safeString, slugify } from './utils.js';
import { hashPassword } from './auth.js';

const defs={
  homework:{table:'homework',required:['course_id','title'],fields:['course_id','subject_id','title','description','due_at','submission_info'],touch:true},
  appointments:{table:'appointments',required:['title','starts_at'],fields:['course_id','title','starts_at','ends_at','location','description'],touch:false},
  announcements:{table:'announcements',required:['title','body'],fields:['course_id','title','body','published_at','visible'],touch:false},
  links:{table:'links',required:['title','url'],fields:['course_id','title','url','category'],touch:false},
  lessons:{table:'lessons',required:['course_id','starts_at','ends_at'],fields:['course_id','subject_id','teacher_id','starts_at','ends_at','room','notes'],touch:false},
  exams:{table:'exams',required:['course_id','title','starts_at'],fields:['course_id','subject_id','title','starts_at','ends_at','room','notes','allowed_aids','visible_to_students'],touch:true},
} as const;
type Def=(typeof defs)[keyof typeof defs];
function def(type:string):Def{const d=(defs as Record<string,Def>)[type];if(!d)throw new Error('CONTENT_TYPE_INVALID');return d;}
async function ensureCourse(env:Env,tenantId:string,courseId:unknown){if(!courseId)return;const c=await env.DB.prepare('SELECT id FROM courses WHERE id=? AND tenant_id=?').bind(String(courseId),tenantId).first();if(!c)throw new Error('COURSE_NOT_FOUND');}
function scope(auth:CoreAuthContext,courseId:unknown){if(auth.isPlatformAdmin||auth.role==='tenant_admin')return;if(!courseId)throw new Error('FORBIDDEN_COURSE');requireCourseAccess(auth,String(courseId));}
function value(field:string,v:unknown):unknown{if(field==='course_id')return v===''||v===null?null:v;if(field==='visible'||field==='visible_to_students')return v===false||v===0||v==='0'?0:1;return v===''?null:v;}

export async function updateCourse(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){
  if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'){if(!hasPermission(auth,'courses.manage'))throw new Error('FORBIDDEN_PERMISSION');requireCourseAccess(auth,courseId);}const current=await env.DB.prepare('SELECT * FROM courses WHERE id=? AND tenant_id=?').bind(courseId,tenantId).first<Record<string,unknown>>();if(!current)throw new Error('COURSE_NOT_FOUND');
  const name=safeString(input.name??current.name,200);if(!name)throw new Error('COURSE_NAME_REQUIRED');const code=slugify(input.code??current.code??name).slice(0,40);if(!code)throw new Error('COURSE_CODE_REQUIRED');
  const mode=String(input.access_mode??current.access_mode??'login');if(!['public','link_code','login','hybrid'].includes(mode))throw new Error('ACCESS_MODE_INVALID');
  let accessHash=current.access_code_hash??null;if(mode==='public'||mode==='login')accessHash=null;else{const newCode=input.access_code===undefined?'':safeString(input.access_code,128);if(newCode){if(newCode.length<6)throw new Error('ACCESS_CODE_REQUIRED');accessHash=await hashPassword(newCode);}if(!accessHash)throw new Error('ACCESS_CODE_REQUIRED');}
  const active=input.is_active===undefined?Number(current.is_active)!==0:!!input.is_active,ts=nowIso();
  if(code!==String(current.code??'')&&await env.DB.prepare('SELECT id FROM courses WHERE tenant_id=? AND code=? AND id<>?').bind(tenantId,code,courseId).first())throw new Error('COURSE_CODE_EXISTS');
  await env.DB.prepare('UPDATE courses SET location_id=?,name=?,code=?,start_date=?,end_date=?,access_mode=?,access_code_hash=?,is_active=?,updated_at=? WHERE id=? AND tenant_id=?').bind(input.location_id===undefined?current.location_id:(input.location_id||null),name,code,input.start_date===undefined?current.start_date:(input.start_date||null),input.end_date===undefined?current.end_date:(input.end_date||null),mode,accessHash,active?1:0,ts,courseId,tenantId).run();
  await audit(env.DB,auth.userId,'course.updated',tenantId,courseId,'course',courseId,{name,code,mode,isActive:active});return env.DB.prepare('SELECT id,tenant_id,location_id,name,code,start_date,end_date,access_mode,is_active,created_at,updated_at FROM courses WHERE id=? AND tenant_id=?').bind(courseId,tenantId).first();
}

export async function updateContent(env:Env,auth:CoreAuthContext,tenantId:string,type:string,rowId:string,input:Record<string,unknown>){
  requireRole(auth,'class_admin');const d=def(type),current=await env.DB.prepare(`SELECT * FROM ${d.table} WHERE id=? AND tenant_id=?`).bind(rowId,tenantId).first<Record<string,unknown>>();if(!current)throw new Error('CONTENT_NOT_FOUND');scope(auth,current.course_id);
  const merged:Record<string,unknown>={...current};for(const f of d.fields)if(input[f]!==undefined)merged[f]=value(f,input[f]);for(const f of d.required)if(merged[f]===undefined||merged[f]===null||String(merged[f]).trim()==='')throw new Error(`FIELD_REQUIRED:${f}`);
  if(auth.role==='class_admin'&&!merged.course_id)throw new Error('COURSE_ID_REQUIRED');if(merged.course_id){await ensureCourse(env,tenantId,merged.course_id);requireCourseAccess(auth,String(merged.course_id));}
  const fields=[...d.fields],values:unknown[]=fields.map(f=>merged[f]??null);let sql=`UPDATE ${d.table} SET ${fields.map(f=>`${f}=?`).join(',')}`;if(d.touch){sql+=',updated_at=?';values.push(nowIso());}sql+=' WHERE id=? AND tenant_id=?';values.push(rowId,tenantId);await env.DB.prepare(sql).bind(...values).run();
  await audit(env.DB,auth.userId,`${type}.updated`,tenantId,merged.course_id?String(merged.course_id):undefined,type,rowId);return env.DB.prepare(`SELECT * FROM ${d.table} WHERE id=? AND tenant_id=?`).bind(rowId,tenantId).first();
}
export async function deleteContent(env:Env,auth:CoreAuthContext,tenantId:string,type:string,rowId:string):Promise<void>{requireRole(auth,'class_admin');const d=def(type),current=await env.DB.prepare(`SELECT id,course_id FROM ${d.table} WHERE id=? AND tenant_id=?`).bind(rowId,tenantId).first<Record<string,unknown>>();if(!current)throw new Error('CONTENT_NOT_FOUND');scope(auth,current.course_id);await env.DB.prepare(`DELETE FROM ${d.table} WHERE id=? AND tenant_id=?`).bind(rowId,tenantId).run();await audit(env.DB,auth.userId,`${type}.deleted`,tenantId,current.course_id?String(current.course_id):undefined,type,rowId);}

export async function updatePersonalGrade(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,gradeId:string,input:Record<string,unknown>){
  requireRole(auth,'participant');requireCourseAccess(auth,courseId);const current=await env.DB.prepare('SELECT * FROM personal_grades WHERE id=? AND tenant_id=? AND course_id=? AND user_id=?').bind(gradeId,tenantId,courseId,auth.userId).first<Record<string,unknown>>();if(!current)throw new Error('GRADE_NOT_FOUND');
  const title=safeString(input.title??current.title,250);if(!title)throw new Error('GRADE_TITLE_REQUIRED');const grade=input.grade_value===undefined?current.grade_value:(input.grade_value===null||input.grade_value===''?null:Number(input.grade_value));const points=input.points_value===undefined?current.points_value:(input.points_value===null||input.points_value===''?null:Number(input.points_value));const weight=input.weight===undefined?Number(current.weight??1):Number(input.weight);if(grade!==null&&!Number.isFinite(Number(grade)))throw new Error('GRADE_INVALID');if(points!==null&&!Number.isFinite(Number(points)))throw new Error('POINTS_INVALID');if(!Number.isFinite(weight)||weight<=0)throw new Error('WEIGHT_INVALID');
  await env.DB.prepare('UPDATE personal_grades SET title=?,grade_value=?,points_value=?,weight=?,note=?,recorded_at=?,updated_at=? WHERE id=? AND tenant_id=? AND course_id=? AND user_id=?').bind(title,grade,points,weight,safeString(input.note??current.note,5000)||null,String(input.recorded_at??current.recorded_at),nowIso(),gradeId,tenantId,courseId,auth.userId).run();await audit(env.DB,auth.userId,'personal_grade.updated',tenantId,courseId,'personal_grade',gradeId);return env.DB.prepare('SELECT * FROM personal_grades WHERE id=? AND user_id=?').bind(gradeId,auth.userId).first();
}
export async function deletePersonalGrade(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,gradeId:string):Promise<void>{requireRole(auth,'participant');requireCourseAccess(auth,courseId);const row=await env.DB.prepare('SELECT id FROM personal_grades WHERE id=? AND tenant_id=? AND course_id=? AND user_id=?').bind(gradeId,tenantId,courseId,auth.userId).first();if(!row)throw new Error('GRADE_NOT_FOUND');await env.DB.prepare('DELETE FROM personal_grades WHERE id=? AND tenant_id=? AND course_id=? AND user_id=?').bind(gradeId,tenantId,courseId,auth.userId).run();await audit(env.DB,auth.userId,'personal_grade.deleted',tenantId,courseId,'personal_grade',gradeId);}
