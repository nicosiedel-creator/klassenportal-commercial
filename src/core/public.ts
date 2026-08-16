import type { Env, SessionUser } from './types.js';
import { verifyPassword } from './auth.js';

function viewerRole(session:SessionUser|null,tenantId:string,courseId:string):string|null{
  if(!session||session.mustChangePassword)return null;
  if(session.isPlatformAdmin)return 'platform_admin';
  const rank:Record<string,number>={tenant_admin:4,class_admin:3,participant:2,guest:1};
  const matches=session.tenantRoles.filter(x=>x.tenantId===tenantId&&(x.courseId===null||x.courseId===courseId));
  return [...matches].sort((a,b)=>(rank[b.role]||0)-(rank[a.role]||0))[0]?.role||null;
}

export async function publicOverview(env:Env,tenantSlug:string,courseCode:string,session:SessionUser|null,accessCode?:string){
  const row=await env.DB.prepare(`SELECT
      c.id,c.tenant_id,c.name,c.code,c.start_date,c.end_date,c.access_mode,c.access_code_hash,
      t.name AS tenant_name,t.slug,
      s.portal_name,s.welcome_text,s.logo_url,s.primary_color,s.secondary_color,s.background_color,
      s.white_label,s.locale,s.timezone
    FROM courses c
    JOIN tenants t ON t.id=c.tenant_id
    JOIN tenant_settings s ON s.tenant_id=t.id
    WHERE t.slug=? AND c.code=? AND t.status='active' AND c.is_active=1`)
    .bind(tenantSlug,courseCode).first<Record<string,unknown>>();
  if(!row)throw new Error('COURSE_NOT_FOUND');

  const mode=String(row.access_mode),tenantId=String(row.tenant_id),courseId=String(row.id);
  const role=viewerRole(session,tenantId,courseId),hasLogin=!!role;
  const codeOk=!!accessCode&&!!row.access_code_hash&&await verifyPassword(accessCode,String(row.access_code_hash));
  if(mode==='login'&&!hasLogin)throw new Error('LOGIN_REQUIRED');
  if(mode==='link_code'&&!codeOk)throw new Error('ACCESS_CODE_REQUIRED');
  if(mode==='hybrid'&&!hasLogin&&!codeOk)throw new Error('LOGIN_OR_CODE_REQUIRED');

  const past=new Date(Date.now()-14*86400000).toISOString();
  const [homework,appointments,announcements,links,exams,lessons,features]=await Promise.all([
    env.DB.prepare(`SELECT h.id,h.course_id,h.subject_id,s.name AS subject_name,s.short_name AS subject_short_name,
        h.title,h.description,h.due_at,h.submission_info,h.created_at,h.updated_at
      FROM homework h LEFT JOIN subjects s ON s.id=h.subject_id AND s.tenant_id=h.tenant_id
      WHERE h.tenant_id=? AND h.course_id=? AND (h.due_at IS NULL OR h.due_at>=?)
      ORDER BY CASE WHEN h.due_at IS NULL THEN 1 ELSE 0 END,h.due_at ASC LIMIT 200`).bind(tenantId,courseId,past).all(),
    env.DB.prepare(`SELECT id,course_id,title,starts_at,ends_at,location,description,created_at
      FROM appointments WHERE tenant_id=? AND (course_id=? OR course_id IS NULL) AND starts_at>=?
      ORDER BY starts_at ASC LIMIT 200`).bind(tenantId,courseId,past).all(),
    env.DB.prepare(`SELECT id,course_id,title,body,published_at,created_at
      FROM announcements WHERE tenant_id=? AND (course_id=? OR course_id IS NULL) AND visible=1
      ORDER BY published_at DESC LIMIT 50`).bind(tenantId,courseId).all(),
    env.DB.prepare(`SELECT id,course_id,title,url,category,created_at
      FROM links WHERE tenant_id=? AND (course_id=? OR course_id IS NULL)
      ORDER BY title ASC LIMIT 200`).bind(tenantId,courseId).all(),
    env.DB.prepare(`SELECT e.id,e.course_id,e.subject_id,s.name AS subject_name,s.short_name AS subject_short_name,
        e.title,e.starts_at,e.ends_at,e.room,e.notes,e.allowed_aids,e.created_at,e.updated_at
      FROM exams e LEFT JOIN subjects s ON s.id=e.subject_id AND s.tenant_id=e.tenant_id
      WHERE e.tenant_id=? AND e.course_id=? AND e.visible_to_students=1 AND e.starts_at>=?
      ORDER BY e.starts_at ASC LIMIT 200`).bind(tenantId,courseId,past).all(),
    env.DB.prepare(`SELECT l.id,l.course_id,l.subject_id,s.name AS subject_name,s.short_name AS subject_short_name,
        l.teacher_id,t.name AS teacher_name,l.starts_at,l.ends_at,l.room,l.notes,l.created_at
      FROM lessons l
      LEFT JOIN subjects s ON s.id=l.subject_id AND s.tenant_id=l.tenant_id
      LEFT JOIN teachers t ON t.id=l.teacher_id AND t.tenant_id=l.tenant_id
      WHERE l.tenant_id=? AND l.course_id=? AND l.ends_at>=?
      ORDER BY l.starts_at ASC LIMIT 500`).bind(tenantId,courseId,past).all(),
    env.DB.prepare('SELECT feature_key,enabled FROM feature_flags WHERE tenant_id=?').bind(tenantId).all<Record<string,unknown>>(),
  ]);

  const modules:Record<string,boolean>={};
  for(const f of features.results??[])modules[String(f.feature_key)]=Number(f.enabled)===1;
  const course={
    id:row.id,name:row.name,code:row.code,start_date:row.start_date,end_date:row.end_date,access_mode:row.access_mode,
    tenant_name:row.tenant_name,slug:row.slug,portal_name:row.portal_name,welcome_text:row.welcome_text,logo_url:row.logo_url,
    primary_color:row.primary_color,secondary_color:row.secondary_color,background_color:row.background_color,
    white_label:row.white_label,locale:row.locale,timezone:row.timezone,
  };
  const accessGrantedBy=hasLogin?'login':codeOk?'code':'public';
  return {
    course,modules,accessGrantedBy,
    viewer:{authenticated:hasLogin,role,displayName:hasLogin?session?.displayName??null:null},
    homework:homework.results??[],appointments:appointments.results??[],announcements:announcements.results??[],
    links:links.results??[],exams:exams.results??[],lessons:lessons.results??[],
  };
}
