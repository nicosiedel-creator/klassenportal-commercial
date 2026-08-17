import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { id, nowIso, safeString, slugify } from './utils.js';
import { hashPassword } from './auth.js';
import { sendTeamsWorkflowNotification } from './advanced-modules.js';
import { ensureBrandingSchema } from './branding-schema.js';

export async function listTenants(env:Env,auth:CoreAuthContext){
  if(auth.isPlatformAdmin){ const r=await env.DB.prepare(`SELECT t.*,s.portal_name,s.custom_domain,sub.plan_id,sub.status AS subscription_status
    FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id=t.id LEFT JOIN subscriptions sub ON sub.tenant_id=t.id ORDER BY t.name`).all(); return r.results??[]; }
  const ids=[...new Set(auth.session.tenantRoles.map(x=>x.tenantId))]; if(!ids.length)return[];
  const qs=ids.map(()=>'?').join(','); const r=await env.DB.prepare(`SELECT t.*,s.portal_name,s.custom_domain FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id=t.id WHERE t.id IN (${qs}) ORDER BY t.name`).bind(...ids).all(); return r.results??[];
}

export async function getSettings(env:Env,auth:CoreAuthContext,tenantId:string){ requireRole(auth,'guest'); await ensureBrandingSchema(env); return env.DB.prepare('SELECT * FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first(); }
function brandRgb(v:string){return [Number.parseInt(v.slice(1,3),16),Number.parseInt(v.slice(3,5),16),Number.parseInt(v.slice(5,7),16)];}
function brandNearWhite(v:string){const [r,g,b]=brandRgb(v);return r>=248&&g>=248&&b>=248;}
function brandLum(v:string){const c=brandRgb(v).map(x=>{const s=x/255;return s<=0.03928?s/12.92:((s+0.055)/1.055)**2.4;});return 0.2126*c[0]+0.7152*c[1]+0.0722*c[2];}
function brandContrast(a:string,b:string){const x=brandLum(a),y=brandLum(b),hi=Math.max(x,y),lo=Math.min(x,y);return(hi+0.05)/(lo+0.05);}
export async function updateSettings(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireRole(auth,'tenant_admin'); const current=await getSettings(env,auth,tenantId) as Record<string,unknown>|null; if(!current) throw new Error('SETTINGS_NOT_FOUND');
  const currentDomain=safeString(current.custom_domain,255);if(input.custom_domain!==undefined&&safeString(input.custom_domain,255)!==currentDomain)throw new Error('CUSTOM_DOMAIN_MANAGED_SEPARATELY');
  const portal=safeString(input.portal_name??current.portal_name,200),welcome=safeString(input.welcome_text??current.welcome_text,5000),logo=safeString(input.logo_url??current.logo_url,2048),primary=safeString(input.primary_color??current.primary_color,20),secondary=safeString(input.secondary_color??current.secondary_color,20),accent=safeString(input.accent_color??current.accent_color??'#7c3aed',20),background=safeString(input.background_color??current.background_color,20),surface=safeString(input.surface_color??current.surface_color??'#f3f0ea',20),textColor=safeString(input.text_color??current.text_color??'#172033',20),favicon=safeString(input.favicon_url??current.favicon_url,2048),white=Number(input.white_label??current.white_label)?1:0;
  const color=/^#[0-9a-fA-F]{6}$/; if(![primary,secondary,accent,background,surface,textColor].every(x=>color.test(x))) throw new Error('COLOR_INVALID');
  if(brandNearWhite(background)||brandNearWhite(surface))throw new Error('WHITE_BACKGROUND_NOT_ALLOWED');
  if(brandContrast(textColor,background)<4.5||brandContrast(textColor,surface)<4.5)throw new Error('BRANDING_CONTRAST_TOO_LOW');
  await env.DB.prepare('UPDATE tenant_settings SET portal_name=?,welcome_text=?,logo_url=?,primary_color=?,secondary_color=?,accent_color=?,background_color=?,surface_color=?,text_color=?,favicon_url=?,custom_domain=?,white_label=?,updated_at=? WHERE tenant_id=?').bind(portal,welcome||null,logo||null,primary,secondary,accent,background,surface,textColor,favicon||null,currentDomain||null,white,nowIso(),tenantId).run();
  await audit(env.DB,auth.userId,'settings.updated',tenantId,undefined,'tenant_settings',tenantId); return getSettings(env,auth,tenantId);
}

export async function getModules(env:Env,auth:CoreAuthContext,tenantId:string){ requireRole(auth,'guest'); const r=await env.DB.prepare('SELECT feature_key,enabled,source,updated_at FROM feature_flags WHERE tenant_id=? ORDER BY feature_key').bind(tenantId).all(); return r.results??[]; }
export async function setModule(env:Env,auth:CoreAuthContext,tenantId:string,key:string,enabled:boolean){ requireRole(auth,'tenant_admin'); if(!/^[a-z0-9_]{2,80}$/.test(key)) throw new Error('FEATURE_KEY_INVALID'); await env.DB.prepare(`INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES(?,?,?,'manual',?) ON CONFLICT(tenant_id,feature_key) DO UPDATE SET enabled=excluded.enabled,source='manual',updated_at=excluded.updated_at`).bind(tenantId,key,enabled?1:0,nowIso()).run(); await audit(env.DB,auth.userId,'feature.updated',tenantId,undefined,'feature',key,{enabled}); }

export async function listCourses(env:Env,auth:CoreAuthContext,tenantId:string){ requireRole(auth,'guest'); let sql='SELECT id,tenant_id,location_id,name,code,start_date,end_date,access_mode,is_active,created_at,updated_at FROM courses WHERE tenant_id=?'; const binds:unknown[]=[tenantId]; if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'){ const ids=auth.session.tenantRoles.filter(x=>x.tenantId===tenantId&&x.courseId).map(x=>x.courseId!); if(!ids.length)return[]; sql+=` AND id IN (${ids.map(()=>'?').join(',')})`; binds.push(...ids); } sql+=' ORDER BY name'; const r=await env.DB.prepare(sql).bind(...binds).all(); return r.results??[]; }
export async function createCourse(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){ requireRole(auth,'tenant_admin'); const name=safeString(input.name,200); if(!name)throw new Error('COURSE_NAME_REQUIRED'); const code=slugify(input.code||name).slice(0,40); const mode=String(input.access_mode||'login'); if(!['public','link_code','login','hybrid'].includes(mode))throw new Error('ACCESS_MODE_INVALID'); const accessCode=safeString(input.access_code,128); if((mode==='link_code'||mode==='hybrid')&&accessCode.length<6)throw new Error('ACCESS_CODE_REQUIRED'); const accessHash=accessCode?await hashPassword(accessCode):null; const courseId=id('crs_'),ts=nowIso(); await env.DB.prepare('INSERT INTO courses(id,tenant_id,location_id,name,code,start_date,end_date,access_mode,access_code_hash,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)').bind(courseId,tenantId,input.location_id||null,name,code,input.start_date||null,input.end_date||null,mode,accessHash,ts,ts).run(); await audit(env.DB,auth.userId,'course.created',tenantId,courseId,'course',courseId,{name,code,mode}); return env.DB.prepare('SELECT id,tenant_id,location_id,name,code,start_date,end_date,access_mode,is_active,created_at,updated_at FROM courses WHERE id=? AND tenant_id=?').bind(courseId,tenantId).first(); }

const contentDefs={
  homework:{table:'homework',required:['course_id','title'],fields:['course_id','subject_id','title','description','due_at','submission_info'],order:'due_at ASC'},
  appointments:{table:'appointments',required:['title','starts_at'],fields:['course_id','title','starts_at','ends_at','location','description'],order:'starts_at ASC'},
  announcements:{table:'announcements',required:['title','body'],fields:['course_id','title','body','published_at','visible'],order:'published_at DESC'},
  links:{table:'links',required:['title','url'],fields:['course_id','title','url','category'],order:'title ASC'},
  lessons:{table:'lessons',required:['course_id','starts_at','ends_at'],fields:['course_id','subject_id','teacher_id','starts_at','ends_at','room','notes'],order:'starts_at ASC'},
  exams:{table:'exams',required:['course_id','title','starts_at'],fields:['course_id','subject_id','title','starts_at','ends_at','room','notes','allowed_aids','visible_to_students'],order:'starts_at ASC'},
} as const;
export type ContentType=keyof typeof contentDefs;
function def(type:string){ const x=(contentDefs as Record<string,typeof contentDefs[ContentType]>)[type]; if(!x)throw new Error('CONTENT_TYPE_INVALID'); return x; }

async function ensureCourse(env:Env,tenantId:string,courseId:unknown){ if(!courseId)return; const c=await env.DB.prepare('SELECT id FROM courses WHERE id=? AND tenant_id=?').bind(String(courseId),tenantId).first(); if(!c)throw new Error('COURSE_NOT_FOUND'); }
export async function listContent(env:Env,auth:CoreAuthContext,tenantId:string,type:string,courseId?:string){
  requireRole(auth,'guest'); const d=def(type); let sql=`SELECT * FROM ${d.table} WHERE tenant_id=?`; const binds:unknown[]=[tenantId];
  if(courseId){ await ensureCourse(env,tenantId,courseId); requireCourseAccess(auth,courseId); sql+=' AND (course_id=? OR course_id IS NULL)'; binds.push(courseId); }
  else if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'){
    if(!auth.courseIds.length)return[]; sql+=` AND (course_id IN (${auth.courseIds.map(()=>'?').join(',')}) OR course_id IS NULL)`; binds.push(...auth.courseIds);
  }
  if(type==='exams'&&(auth.role==='participant'||auth.role==='guest'))sql+=' AND visible_to_students=1';
  if(type==='announcements'&&(auth.role==='participant'||auth.role==='guest'))sql+=' AND visible=1';
  sql+=` ORDER BY ${d.order}`; const r=await env.DB.prepare(sql).bind(...binds).all(); return r.results??[];
}
function teamsContent(type:string,input:Record<string,unknown>):{title:string;body:string}|null{
  if(type==='announcements')return{title:`Neue Meldung: ${safeString(input.title,200)}`,body:safeString(input.body,2000)};
  if(type==='homework')return{title:`Neue Aufgabe: ${safeString(input.title,200)}`,body:[input.due_at?`Fällig: ${String(input.due_at)}`:'',safeString(input.description,1200),safeString(input.submission_info,700)].filter(Boolean).join('\n')};
  if(type==='appointments')return{title:`Neuer Termin: ${safeString(input.title,200)}`,body:[input.starts_at?`Beginn: ${String(input.starts_at)}`:'',input.location?`Ort: ${safeString(input.location,200)}`:'',safeString(input.description,1200)].filter(Boolean).join('\n')};
  if(type==='exams')return{title:`Neue Prüfung: ${safeString(input.title,200)}`,body:[input.starts_at?`Termin: ${String(input.starts_at)}`:'',input.room?`Raum: ${safeString(input.room,200)}`:'',safeString(input.notes,1200)].filter(Boolean).join('\n')};
  return null;
}
export async function createContent(env:Env,auth:CoreAuthContext,tenantId:string,type:string,input:Record<string,unknown>){
  requireRole(auth,'class_admin'); const d=def(type);
  for(const f of d.required)if(input[f]===undefined||String(input[f]).trim()==='')throw new Error(`FIELD_REQUIRED:${f}`);
  if(auth.role==='class_admin'&&!input.course_id)throw new Error('COURSE_ID_REQUIRED');
  if(input.course_id){await ensureCourse(env,tenantId,input.course_id);requireCourseAccess(auth,String(input.course_id));}
  const obj:Record<string,unknown>={}; for(const f of d.fields){ if(input[f]!==undefined)obj[f]=(f==='course_id'&&input[f]==='')?null:input[f]; }
  if(type==='announcements'&&!obj.published_at)obj.published_at=nowIso(); if(type==='announcements'&&obj.visible===undefined)obj.visible=1; if(type==='exams'&&obj.visible_to_students===undefined)obj.visible_to_students=1;
  const rowId=id('ent_'),ts=nowIso(); const fields=['id','tenant_id',...Object.keys(obj),'created_at']; const vals:unknown[]=[rowId,tenantId,...Object.values(obj),ts]; if(type==='homework'||type==='exams'){fields.push('updated_at');vals.push(ts);} const sql=`INSERT INTO ${d.table}(${fields.join(',')}) VALUES(${fields.map(()=>'?').join(',')})`; await env.DB.prepare(sql).bind(...vals).run(); await audit(env.DB,auth.userId,`${type}.created`,tenantId,String(input.course_id||'')||undefined,type,rowId);
  const teams=teamsContent(type,input);if(teams)void sendTeamsWorkflowNotification(env,tenantId,teams.title,teams.body);
  return env.DB.prepare(`SELECT * FROM ${d.table} WHERE id=? AND tenant_id=?`).bind(rowId,tenantId).first();
}

export async function setExamVisibility(env:Env,auth:CoreAuthContext,tenantId:string,examId:string,visible:boolean){ requireRole(auth,'class_admin'); const x=await env.DB.prepare('SELECT course_id FROM exams WHERE id=? AND tenant_id=?').bind(examId,tenantId).first<{course_id:string}>(); if(!x)throw new Error('EXAM_NOT_FOUND'); requireCourseAccess(auth,x.course_id); await env.DB.prepare('UPDATE exams SET visible_to_students=?,updated_at=? WHERE id=? AND tenant_id=?').bind(visible?1:0,nowIso(),examId,tenantId).run(); await audit(env.DB,auth.userId,'exam.visibility',tenantId,x.course_id,'exam',examId,{visible}); }

export async function listPersonalGrades(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){ requireRole(auth,'participant'); requireCourseAccess(auth,courseId); const r=await env.DB.prepare('SELECT * FROM personal_grades WHERE tenant_id=? AND course_id=? AND user_id=? ORDER BY recorded_at DESC').bind(tenantId,courseId,auth.userId).all(); return r.results??[]; }
export async function savePersonalGrade(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){ requireRole(auth,'participant'); await ensureCourse(env,tenantId,courseId); requireCourseAccess(auth,courseId); const title=safeString(input.title,250); if(!title)throw new Error('GRADE_TITLE_REQUIRED'); const gradeId=id('grd_'),ts=nowIso(); const grade=input.grade_value===undefined||input.grade_value===null?null:Number(input.grade_value); const points=input.points_value===undefined||input.points_value===null?null:Number(input.points_value); const weight=input.weight===undefined?1:Number(input.weight); if(grade!==null&&!Number.isFinite(grade))throw new Error('GRADE_INVALID'); await env.DB.prepare('INSERT INTO personal_grades(id,tenant_id,course_id,user_id,exam_id,subject_id,title,grade_value,points_value,weight,note,recorded_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(gradeId,tenantId,courseId,auth.userId,input.exam_id||null,input.subject_id||null,title,grade,points,Number.isFinite(weight)?weight:1,safeString(input.note,5000)||null,String(input.recorded_at||ts),ts,ts).run(); await audit(env.DB,auth.userId,'personal_grade.created',tenantId,courseId,'personal_grade',gradeId); return env.DB.prepare('SELECT * FROM personal_grades WHERE id=? AND user_id=?').bind(gradeId,auth.userId).first(); }

export { updateCourse, updateContent, deleteContent, updatePersonalGrade, deletePersonalGrade } from './operational-data.js';
