import type { Env, SessionUser } from './types.js';
import { verifyPassword } from './auth.js';
import { ensureBrandingSchema } from './branding-schema.js';
import { safeFilename } from '../portability/utils.js';

function viewerRole(session:SessionUser|null,tenantId:string,courseId:string):string|null{
  if(!session||session.mustChangePassword)return null;
  if(session.isPlatformAdmin)return 'platform_admin';
  const rank:Record<string,number>={tenant_admin:4,class_admin:3,participant:2,guest:1};
  const matches=session.tenantRoles.filter(x=>x.tenantId===tenantId&&(x.courseId===null||x.courseId===courseId));
  const best=[...matches].sort((a,b)=>(rank[b.role]||0)-(rank[a.role]||0))[0]?.role||null;
  return best==='class_admin'?'participant':best;
}

async function coursePortalRow(env:Env,tenantSlug:string,courseCode:string){
  await ensureBrandingSchema(env);
  const row=await env.DB.prepare(`SELECT
      c.id,c.tenant_id,c.name,c.code,c.start_date,c.end_date,c.access_mode,c.access_code_hash,
      t.name AS tenant_name,t.slug,
      s.portal_name,s.welcome_text,s.logo_url,s.primary_color,s.secondary_color,s.accent_color,s.background_color,s.surface_color,s.text_color,
      s.white_label,s.locale,s.timezone
    FROM courses c
    JOIN tenants t ON t.id=c.tenant_id
    JOIN tenant_settings s ON s.tenant_id=t.id
    WHERE t.slug=? AND c.code=? AND t.status='active' AND c.is_active=1`)
    .bind(tenantSlug,courseCode).first<Record<string,unknown>>();
  if(!row)throw new Error('COURSE_NOT_FOUND');
  return row;
}

function safeCourse(row:Record<string,unknown>){
  return {
    id:row.id,name:row.name,code:row.code,start_date:row.start_date,end_date:row.end_date,access_mode:row.access_mode,
    tenant_name:row.tenant_name,slug:row.slug,portal_name:row.portal_name,welcome_text:row.welcome_text,logo_url:row.logo_url,
    primary_color:row.primary_color,secondary_color:row.secondary_color,accent_color:row.accent_color,background_color:row.background_color,surface_color:row.surface_color,text_color:row.text_color,
    white_label:row.white_label,locale:row.locale,timezone:row.timezone,
  };
}

type PortalAccess={row:Record<string,unknown>;tenantId:string;courseId:string;role:string|null;hasLogin:boolean;codeOk:boolean;accessGrantedBy:string};
async function authorizePortal(env:Env,tenantSlug:string,courseCode:string,session:SessionUser|null,accessCode?:string):Promise<PortalAccess>{
  const row=await coursePortalRow(env,tenantSlug,courseCode),mode=String(row.access_mode),tenantId=String(row.tenant_id),courseId=String(row.id);
  const role=viewerRole(session,tenantId,courseId),hasLogin=!!role,adminPreview=['platform_admin','tenant_admin','class_admin'].includes(String(role||''));
  const codeOk=!!accessCode&&!!row.access_code_hash&&await verifyPassword(accessCode,String(row.access_code_hash));
  if(mode==='login'&&!hasLogin)throw new Error('LOGIN_REQUIRED');
  if(mode==='link_code'&&!codeOk&&!adminPreview)throw new Error('ACCESS_CODE_REQUIRED');
  if(mode==='hybrid'&&!hasLogin&&!codeOk)throw new Error('LOGIN_OR_CODE_REQUIRED');
  return {row,tenantId,courseId,role,hasLogin,codeOk,accessGrantedBy:hasLogin?'login':codeOk?'code':'public'};
}

export async function publicPortalMetadata(env:Env,tenantSlug:string,courseCode:string){
  const row=await coursePortalRow(env,tenantSlug,courseCode);
  return {course:safeCourse(row)};
}

async function optionalRows<T>(label:string,query:()=>Promise<{results?:T[]}>):Promise<T[]>{
  try{return (await query()).results??[];}
  catch(error){console.error('Participant portal optional query failed',{label,error:String((error as Error)?.message||error)});return [];}
}

export async function publicOverview(env:Env,tenantSlug:string,courseCode:string,session:SessionUser|null,accessCode?:string){
  const access=await authorizePortal(env,tenantSlug,courseCode,session,accessCode),{row,tenantId,courseId}=access;
  const past=new Date(Date.now()-28*86400000).toISOString();

  const [homework,appointments,announcements,links,exams,lessons,features,materials]=await Promise.all([
    optionalRows<Record<string,unknown>>('homework',()=>env.DB.prepare(`SELECT h.id,h.course_id,h.subject_id,s.name AS subject_name,s.short_name AS subject_short_name,
        h.title,h.description,h.due_at,h.submission_info,h.created_at,h.updated_at
      FROM homework h LEFT JOIN subjects s ON s.id=h.subject_id AND s.tenant_id=h.tenant_id
      WHERE h.tenant_id=? AND h.course_id=? AND (h.due_at IS NULL OR h.due_at>=?)
      ORDER BY CASE WHEN h.due_at IS NULL THEN 1 ELSE 0 END,h.due_at ASC LIMIT 200`).bind(tenantId,courseId,past).all<Record<string,unknown>>()),
    optionalRows<Record<string,unknown>>('appointments',()=>env.DB.prepare(`SELECT id,course_id,title,starts_at,ends_at,location,description,created_at
      FROM appointments WHERE tenant_id=? AND (course_id=? OR course_id IS NULL) AND starts_at>=?
      ORDER BY starts_at ASC LIMIT 200`).bind(tenantId,courseId,past).all<Record<string,unknown>>()),
    optionalRows<Record<string,unknown>>('announcements',()=>env.DB.prepare(`SELECT id,course_id,title,body,published_at,created_at
      FROM announcements WHERE tenant_id=? AND (course_id=? OR course_id IS NULL) AND visible=1
      ORDER BY published_at DESC LIMIT 50`).bind(tenantId,courseId).all<Record<string,unknown>>()),
    optionalRows<Record<string,unknown>>('links',()=>env.DB.prepare(`SELECT id,course_id,title,url,category,created_at
      FROM links WHERE tenant_id=? AND (course_id=? OR course_id IS NULL)
      ORDER BY title ASC LIMIT 200`).bind(tenantId,courseId).all<Record<string,unknown>>()),
    optionalRows<Record<string,unknown>>('exams',()=>env.DB.prepare(`SELECT e.id,e.course_id,e.subject_id,s.name AS subject_name,s.short_name AS subject_short_name,
        e.title,e.starts_at,e.ends_at,e.room,e.notes,e.allowed_aids,e.created_at,e.updated_at
      FROM exams e LEFT JOIN subjects s ON s.id=e.subject_id AND s.tenant_id=e.tenant_id
      WHERE e.tenant_id=? AND e.course_id=? AND e.visible_to_students=1 AND e.starts_at>=?
      ORDER BY e.starts_at ASC LIMIT 200`).bind(tenantId,courseId,past).all<Record<string,unknown>>()),
    optionalRows<Record<string,unknown>>('lessons',()=>env.DB.prepare(`SELECT l.id,l.course_id,l.subject_id,s.name AS subject_name,s.short_name AS subject_short_name,
        l.teacher_id,t.name AS teacher_name,l.starts_at,l.ends_at,l.room,l.notes,l.created_at
      FROM lessons l
      LEFT JOIN subjects s ON s.id=l.subject_id AND s.tenant_id=l.tenant_id
      LEFT JOIN teachers t ON t.id=l.teacher_id AND t.tenant_id=l.tenant_id
      WHERE l.tenant_id=? AND l.course_id=? AND l.ends_at>=?
      ORDER BY l.starts_at ASC LIMIT 500`).bind(tenantId,courseId,past).all<Record<string,unknown>>()),
    optionalRows<Record<string,unknown>>('feature_flags',()=>env.DB.prepare('SELECT feature_key,enabled FROM feature_flags WHERE tenant_id=?').bind(tenantId).all<Record<string,unknown>>()),
    optionalRows<Record<string,unknown>>('materials',()=>env.DB.prepare(`SELECT id,course_id,title,description,original_name,content_type,size_bytes,created_at,updated_at
      FROM portability_files WHERE tenant_id=? AND purpose='learning_material' AND visible=1 AND (course_id=? OR course_id IS NULL)
      ORDER BY created_at DESC LIMIT 200`).bind(tenantId,courseId).all<Record<string,unknown>>()),
  ]);

  let notifications:Record<string,unknown>[]=[];
  if(access.hasLogin&&session?.userId){
    notifications=await optionalRows<Record<string,unknown>>('notifications',()=>env.DB.prepare(`SELECT id,course_id,type,title,body,read_at,created_at FROM notifications
      WHERE tenant_id=? AND user_id=? AND (course_id=? OR course_id IS NULL)
      ORDER BY created_at DESC LIMIT 60`).bind(tenantId,session.userId,courseId).all<Record<string,unknown>>());
  }

  const modules:Record<string,boolean>={};for(const f of features)modules[String(f.feature_key)]=Number(f.enabled)===1;
  const materialsEnabled=modules.files!==false||modules.learning_materials===true;
  return {
    course:safeCourse(row),modules,accessGrantedBy:access.accessGrantedBy,
    viewer:{authenticated:access.hasLogin,role:access.role,displayName:access.hasLogin?session?.displayName??null:null,tenantId:access.hasLogin?tenantId:null},
    homework,appointments,announcements,links,exams,lessons,materials:materialsEnabled?materials:[],notifications,
  };
}

export async function publicMaterialDownload(env:Env,tenantSlug:string,courseCode:string,materialId:string,session:SessionUser|null,accessCode?:string):Promise<Response>{
  const access=await authorizePortal(env,tenantSlug,courseCode,session,accessCode);
  const flags=await env.DB.prepare(`SELECT feature_key,enabled FROM feature_flags WHERE tenant_id=? AND feature_key IN ('files','learning_materials')`).bind(access.tenantId).all<Record<string,unknown>>();
  const enabled=(flags.results??[]).some(x=>Number(x.enabled)===1);if(!enabled)throw new Error('MATERIAL_NOT_FOUND');
  const row=await env.DB.prepare(`SELECT object_key,original_name,content_type,size_bytes FROM portability_files
    WHERE id=? AND tenant_id=? AND purpose='learning_material' AND visible=1 AND (course_id=? OR course_id IS NULL)`).bind(materialId,access.tenantId,access.courseId).first<Record<string,unknown>>();
  if(!row)throw new Error('MATERIAL_NOT_FOUND');const obj=await env.FILES.get(String(row.object_key));if(!obj)throw new Error('MATERIAL_FILE_NOT_FOUND');
  const filename=safeFilename(String(row.original_name||'material'));
  return new Response(obj.body,{status:200,headers:{'content-type':String(row.content_type||obj.httpMetadata?.contentType||'application/octet-stream'),'content-length':String(obj.size),'content-disposition':`attachment; filename="${filename}"`,'cache-control':'private, max-age=0, no-store','x-content-type-options':'nosniff'}});
}
