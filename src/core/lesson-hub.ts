import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { id, nowIso, safeString } from './utils.js';
import { uploadLearningMaterial } from './materials.js';

type HubLink={title:string;url:string};
const MODES=new Set(['onsite','remote','hybrid','']);

function day(v:string|undefined,fallback:string):string{
  const s=String(v||fallback).trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Error('LESSON_HUB_DATE_INVALID');
  return s;
}
function validUrl(v:unknown):string{
  const s=safeString(v,1800);if(!s)throw new Error('LESSON_HUB_LINK_URL_REQUIRED');
  let u:URL;try{u=new URL(s);}catch{throw new Error('LESSON_HUB_LINK_URL_INVALID');}
  if(!['https:','http:'].includes(u.protocol))throw new Error('LESSON_HUB_LINK_URL_INVALID');
  return u.toString();
}
async function ensureLesson(env:Env,tenantId:string,courseId:string,lessonId:string){
  const row=await env.DB.prepare(`SELECT l.id,l.course_id,l.subject_id,l.starts_at,l.ends_at,l.room,l.notes,
    s.name subject_name,s.short_name subject_short_name,t.name teacher_name
    FROM lessons l LEFT JOIN subjects s ON s.id=l.subject_id AND s.tenant_id=l.tenant_id
    LEFT JOIN teachers t ON t.id=l.teacher_id AND t.tenant_id=l.tenant_id
    WHERE l.id=? AND l.tenant_id=? AND l.course_id=?`).bind(lessonId,tenantId,courseId).first<Record<string,unknown>>();
  if(!row)throw new Error('LESSON_NOT_FOUND');return row;
}
function manager(auth:CoreAuthContext,courseId:string){requireRole(auth,'class_admin');requireCourseAccess(auth,courseId);}

export async function listLessonHub(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,from?:string,to?:string){
  manager(auth,courseId);
  const now=new Date(),fromDefault=new Date(now.getTime()-28*86400000).toISOString().slice(0,10),toDefault=new Date(now.getTime()+70*86400000).toISOString().slice(0,10);
  const fromDay=day(from,fromDefault),toDay=day(to,toDefault);if(fromDay>toDay)throw new Error('LESSON_HUB_DATE_INVALID');
  const lessons=(await env.DB.prepare(`SELECT l.id,l.course_id,l.subject_id,l.starts_at,l.ends_at,l.room,l.notes,
      s.name subject_name,s.short_name subject_short_name,t.name teacher_name,
      d.planned_topic,d.info_text,d.delivery_mode,d.updated_at hub_updated_at
    FROM lessons l
    LEFT JOIN subjects s ON s.id=l.subject_id AND s.tenant_id=l.tenant_id
    LEFT JOIN teachers t ON t.id=l.teacher_id AND t.tenant_id=l.tenant_id
    LEFT JOIN lesson_hub_details d ON d.lesson_id=l.id AND d.tenant_id=l.tenant_id AND d.course_id=l.course_id
    WHERE l.tenant_id=? AND l.course_id=? AND substr(l.starts_at,1,10)>=? AND substr(l.starts_at,1,10)<=?
    ORDER BY l.starts_at ASC LIMIT 800`).bind(tenantId,courseId,fromDay,toDay).all<Record<string,unknown>>()).results??[];
  const links=(await env.DB.prepare(`SELECT id,lesson_id,title,url,sort_order FROM lesson_hub_links WHERE tenant_id=? AND course_id=? ORDER BY lesson_id,sort_order,title`).bind(tenantId,courseId).all<Record<string,unknown>>()).results??[];
  const attached=(await env.DB.prepare(`SELECT hm.lesson_id,p.id,p.title,p.description,p.original_name,p.content_type,p.size_bytes,p.visible,hm.sort_order
    FROM lesson_hub_materials hm JOIN portability_files p ON p.id=hm.material_id AND p.tenant_id=hm.tenant_id
    WHERE hm.tenant_id=? AND hm.course_id=? AND p.purpose='learning_material' ORDER BY hm.lesson_id,hm.sort_order,p.title`).bind(tenantId,courseId).all<Record<string,unknown>>()).results??[];
  const materials=(await env.DB.prepare(`SELECT id,course_id,title,description,original_name,content_type,size_bytes,visible,created_at
    FROM portability_files WHERE tenant_id=? AND purpose='learning_material' AND (course_id=? OR course_id IS NULL)
    ORDER BY visible DESC,title,created_at DESC LIMIT 500`).bind(tenantId,courseId).all<Record<string,unknown>>()).results??[];
  const byLinks=new Map<string,Record<string,unknown>[]>(),byMaterials=new Map<string,Record<string,unknown>[]>();
  for(const x of links){const k=String(x.lesson_id),a=byLinks.get(k)||[];a.push(x);byLinks.set(k,a);}
  for(const x of attached){const k=String(x.lesson_id),a=byMaterials.get(k)||[];a.push(x);byMaterials.set(k,a);}
  return{lessons:lessons.map(x=>({...x,links:byLinks.get(String(x.id))||[],materials:byMaterials.get(String(x.id))||[]})),available_materials:materials};
}

export async function saveLessonHub(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string,input:Record<string,unknown>){
  manager(auth,courseId);await ensureLesson(env,tenantId,courseId,lessonId);
  const topic=safeString(input.planned_topic,500)||null,info=safeString(input.info_text,6000)||null,mode=String(input.delivery_mode||'').trim();if(!MODES.has(mode))throw new Error('LESSON_HUB_MODE_INVALID');
  const rawLinks=Array.isArray(input.links)?input.links as Record<string,unknown>[]:[];if(rawLinks.length>30)throw new Error('LESSON_HUB_TOO_MANY_LINKS');
  const links:HubLink[]=rawLinks.map(x=>({title:safeString(x.title,250)||'Link',url:validUrl(x.url)}));
  const materialIds=[...new Set((Array.isArray(input.material_ids)?input.material_ids:[]).map(x=>safeString(x,160)).filter(Boolean))];if(materialIds.length>50)throw new Error('LESSON_HUB_TOO_MANY_MATERIALS');
  if(materialIds.length){
    const placeholders=materialIds.map(()=>'?').join(','),found=await env.DB.prepare(`SELECT id FROM portability_files WHERE tenant_id=? AND id IN (${placeholders}) AND purpose='learning_material' AND (course_id=? OR course_id IS NULL)`).bind(tenantId,...materialIds,courseId).all<{id:string}>();
    const ok=new Set((found.results??[]).map(x=>x.id));if(materialIds.some(x=>!ok.has(x)))throw new Error('LESSON_HUB_MATERIAL_INVALID');
  }
  const ts=nowIso(),stmts:any[]=[];
  stmts.push(env.DB.prepare(`INSERT INTO lesson_hub_details(lesson_id,tenant_id,course_id,planned_topic,info_text,delivery_mode,updated_by,updated_at)
    VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(lesson_id) DO UPDATE SET planned_topic=excluded.planned_topic,info_text=excluded.info_text,delivery_mode=excluded.delivery_mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(lessonId,tenantId,courseId,topic,info,mode||null,auth.userId,ts));
  stmts.push(env.DB.prepare('DELETE FROM lesson_hub_links WHERE tenant_id=? AND course_id=? AND lesson_id=?').bind(tenantId,courseId,lessonId));
  links.forEach((x,i)=>stmts.push(env.DB.prepare('INSERT INTO lesson_hub_links(id,tenant_id,course_id,lesson_id,title,url,sort_order,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id('lhl_'),tenantId,courseId,lessonId,x.title,x.url,(i+1)*10,auth.userId,ts,ts)));
  stmts.push(env.DB.prepare('DELETE FROM lesson_hub_materials WHERE tenant_id=? AND course_id=? AND lesson_id=?').bind(tenantId,courseId,lessonId));
  materialIds.forEach((materialId,i)=>stmts.push(env.DB.prepare('INSERT INTO lesson_hub_materials(tenant_id,course_id,lesson_id,material_id,sort_order,attached_by,created_at) VALUES(?,?,?,?,?,?,?)').bind(tenantId,courseId,lessonId,materialId,(i+1)*10,auth.userId,ts)));
  await env.DB.batch(stmts);
  await audit(env.DB,auth.userId,'lesson_hub.updated',tenantId,courseId,'lesson',lessonId,{hasTopic:!!topic,hasInfo:!!info,mode:mode||null,links:links.length,materials:materialIds.length});
  return{lesson_id:lessonId,planned_topic:topic,info_text:info,delivery_mode:mode||null,links,material_ids:materialIds,updated_at:ts};
}

export async function uploadLessonHubMaterial(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string,request:Request){
  manager(auth,courseId);await ensureLesson(env,tenantId,courseId,lessonId);
  const material=await uploadLearningMaterial(env,auth,tenantId,request,courseId) as Record<string,unknown>|null;if(!material?.id)throw new Error('MATERIAL_UPLOAD_FAILED');
  const ts=nowIso();await env.DB.prepare('INSERT OR IGNORE INTO lesson_hub_materials(tenant_id,course_id,lesson_id,material_id,sort_order,attached_by,created_at) VALUES(?,?,?,?,100,?,?)').bind(tenantId,courseId,lessonId,String(material.id),auth.userId,ts).run();
  await audit(env.DB,auth.userId,'lesson_hub.material_attached',tenantId,courseId,'lesson',lessonId,{materialId:material.id});return material;
}

async function participantOwnLesson(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string){
  requireRole(auth,'participant');requireCourseAccess(auth,courseId);await ensureLesson(env,tenantId,courseId,lessonId);
  const row=await env.DB.prepare("SELECT 1 ok FROM memberships m JOIN tenant_users tu ON tu.tenant_id=m.tenant_id AND tu.user_id=m.user_id WHERE m.tenant_id=? AND m.course_id=? AND m.user_id=? AND m.role='participant' AND tu.status='active' LIMIT 1").bind(tenantId,courseId,auth.userId).first();
  if(!row)throw new Error('PARTICIPANT_NOT_FOUND');
}
export async function getMyLessonNote(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string){
  await participantOwnLesson(env,auth,tenantId,courseId,lessonId);const row=await env.DB.prepare('SELECT note,updated_at FROM lesson_private_notes WHERE tenant_id=? AND course_id=? AND lesson_id=? AND user_id=?').bind(tenantId,courseId,lessonId,auth.userId).first<Record<string,unknown>>();return{lesson_id:lessonId,note:String(row?.note||''),updated_at:row?.updated_at||null};
}
export async function saveMyLessonNote(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string,input:Record<string,unknown>){
  await participantOwnLesson(env,auth,tenantId,courseId,lessonId);const note=safeString(input.note,6000),ts=nowIso();
  if(note)await env.DB.prepare(`INSERT INTO lesson_private_notes(tenant_id,course_id,lesson_id,user_id,note,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id,lesson_id) DO UPDATE SET note=excluded.note,updated_at=excluded.updated_at`).bind(tenantId,courseId,lessonId,auth.userId,note,ts).run();
  else await env.DB.prepare('DELETE FROM lesson_private_notes WHERE tenant_id=? AND course_id=? AND lesson_id=? AND user_id=?').bind(tenantId,courseId,lessonId,auth.userId).run();
  await audit(env.DB,auth.userId,'lesson_note.updated',tenantId,courseId,'lesson',lessonId,{hasNote:!!note});return{lesson_id:lessonId,note:note||'',updated_at:ts};
}
