import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { id, nowIso, safeString } from './utils.js';
import { safeFilename } from '../portability/utils.js';

const MAX_BYTES=25*1024*1024;
const allowedExtensions=new Set(['pdf','doc','docx','xls','xlsx','ppt','pptx','odt','ods','odp','txt','csv','rtf','zip','jpg','jpeg','png','webp']);
const blockedTypes=new Set(['text/html','image/svg+xml','application/javascript','text/javascript','application/x-msdownload','application/x-sh']);

function extension(name:string):string{return name.toLowerCase().split('.').pop()||'';}
function materialType(file:File):string{
  const ext=extension(file.name),type=String(file.type||'application/octet-stream').toLowerCase();
  if(!allowedExtensions.has(ext)||blockedTypes.has(type))throw new Error('MATERIAL_FILE_TYPE_INVALID');
  return type||'application/octet-stream';
}
async function ensureCourse(env:Env,tenantId:string,courseId:string):Promise<void>{
  const row=await env.DB.prepare('SELECT id FROM courses WHERE id=? AND tenant_id=? AND is_active=1').bind(courseId,tenantId).first();
  if(!row)throw new Error('COURSE_NOT_FOUND');
}
function rowScopeAllowed(auth:CoreAuthContext,courseId:string|null):void{
  if(auth.isPlatformAdmin||auth.role==='tenant_admin')return;
  if(!courseId)throw new Error('FORBIDDEN_COURSE');
  requireCourseAccess(auth,courseId);
}

export async function listLearningMaterials(env:Env,auth:CoreAuthContext,tenantId:string,courseId?:string){
  requireRole(auth,'guest');
  const binds:unknown[]=[tenantId];
  let sql=`SELECT id,course_id,title,description,original_name,content_type,size_bytes,visible,uploaded_by,created_at,updated_at
    FROM portability_files WHERE tenant_id=? AND purpose='learning_material'`;
  if(courseId){await ensureCourse(env,tenantId,courseId);requireCourseAccess(auth,courseId);sql+=' AND (course_id=? OR course_id IS NULL)';binds.push(courseId);}
  else if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'){
    if(!auth.courseIds.length)return[];
    sql+=` AND course_id IN (${auth.courseIds.map(()=>'?').join(',')})`;binds.push(...auth.courseIds);
  }
  if(auth.role==='participant'||auth.role==='guest')sql+=' AND visible=1';
  sql+=' ORDER BY created_at DESC LIMIT 500';
  const r=await env.DB.prepare(sql).bind(...binds).all<Record<string,unknown>>();return r.results??[];
}

export async function uploadLearningMaterial(env:Env,auth:CoreAuthContext,tenantId:string,request:Request,courseId?:string){
  requireRole(auth,'class_admin');
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('MATERIAL_FILE_REQUIRED');
  if(file.size<=0)throw new Error('MATERIAL_FILE_EMPTY');if(file.size>MAX_BYTES)throw new Error('MATERIAL_FILE_TOO_LARGE');
  const requestedCourse=safeString(courseId||form.get('course_id'),120)||null;
  if(auth.role==='class_admin'&&!requestedCourse)throw new Error('COURSE_ID_REQUIRED');
  if(requestedCourse){await ensureCourse(env,tenantId,requestedCourse);requireCourseAccess(auth,requestedCourse);}
  const contentType=materialType(file),materialId=id('mat_'),ts=nowIso();
  const title=safeString(form.get('title')||file.name.replace(/\.[^.]+$/,''),250);if(!title)throw new Error('MATERIAL_TITLE_REQUIRED');
  const description=safeString(form.get('description'),5000)||null,visible=String(form.get('visible')??'1')==='0'?0:1;
  const filename=safeFilename(file.name),key=`tenants/${tenantId}/materials/${materialId}-${filename}`;
  await env.FILES.put(key,file.stream(),{httpMetadata:{contentType,contentDisposition:`attachment; filename="${filename}"`},customMetadata:{tenantId,uploadedBy:auth.userId,originalName:file.name,purpose:'learning_material',courseId:requestedCourse||''}});
  try{
    await env.DB.prepare(`INSERT INTO portability_files
      (id,tenant_id,object_key,original_name,content_type,size_bytes,uploaded_by,created_at,purpose,course_id,title,description,visible,updated_at)
      VALUES(?,?,?,?,?,?,?,?,'learning_material',?,?,?,?,?)`)
      .bind(materialId,tenantId,key,file.name,contentType,file.size,auth.userId,ts,requestedCourse,title,description,visible,ts).run();
  }catch(e){await env.FILES.delete(key);throw e;}
  await audit(env.DB,auth.userId,'learning_material.created',tenantId,requestedCourse||undefined,'learning_material',materialId,{title,size:file.size,visible:!!visible});
  const row=await env.DB.prepare(`SELECT id,course_id,title,description,original_name,content_type,size_bytes,visible,uploaded_by,created_at,updated_at FROM portability_files WHERE id=? AND tenant_id=?`).bind(materialId,tenantId).first<Record<string,unknown>>();if(!row)throw new Error('MATERIAL_NOT_FOUND');return row;
}

export async function updateLearningMaterial(env:Env,auth:CoreAuthContext,tenantId:string,materialId:string,input:Record<string,unknown>){
  requireRole(auth,'class_admin');
  const current=await env.DB.prepare(`SELECT id,course_id,title,description,visible FROM portability_files WHERE id=? AND tenant_id=? AND purpose='learning_material'`).bind(materialId,tenantId).first<Record<string,unknown>>();
  if(!current)throw new Error('MATERIAL_NOT_FOUND');rowScopeAllowed(auth,current.course_id?String(current.course_id):null);
  const title=safeString(input.title??current.title,250);if(!title)throw new Error('MATERIAL_TITLE_REQUIRED');
  const description=safeString(input.description??current.description,5000)||null,visible=input.visible===undefined?Number(current.visible||0):(input.visible?1:0),ts=nowIso();
  await env.DB.prepare(`UPDATE portability_files SET title=?,description=?,visible=?,updated_at=? WHERE id=? AND tenant_id=? AND purpose='learning_material'`).bind(title,description,visible,ts,materialId,tenantId).run();
  await audit(env.DB,auth.userId,'learning_material.updated',tenantId,current.course_id?String(current.course_id):undefined,'learning_material',materialId,{visible:!!visible});
  const row=await env.DB.prepare(`SELECT id,course_id,title,description,original_name,content_type,size_bytes,visible,uploaded_by,created_at,updated_at FROM portability_files WHERE id=? AND tenant_id=?`).bind(materialId,tenantId).first<Record<string,unknown>>();if(!row)throw new Error('MATERIAL_NOT_FOUND');return row;
}

export async function deleteLearningMaterial(env:Env,auth:CoreAuthContext,tenantId:string,materialId:string):Promise<void>{
  requireRole(auth,'class_admin');
  const row=await env.DB.prepare(`SELECT id,course_id,object_key FROM portability_files WHERE id=? AND tenant_id=? AND purpose='learning_material'`).bind(materialId,tenantId).first<Record<string,unknown>>();
  if(!row)throw new Error('MATERIAL_NOT_FOUND');rowScopeAllowed(auth,row.course_id?String(row.course_id):null);
  await env.FILES.delete(String(row.object_key));
  await env.DB.prepare(`DELETE FROM portability_files WHERE id=? AND tenant_id=? AND purpose='learning_material'`).bind(materialId,tenantId).run();
  await audit(env.DB,auth.userId,'learning_material.deleted',tenantId,row.course_id?String(row.course_id):undefined,'learning_material',materialId);
}

export async function downloadLearningMaterial(env:Env,auth:CoreAuthContext,tenantId:string,materialId:string):Promise<Response>{
  requireRole(auth,'guest');
  const row=await env.DB.prepare(`SELECT course_id,object_key,original_name,content_type,visible FROM portability_files WHERE id=? AND tenant_id=? AND purpose='learning_material'`).bind(materialId,tenantId).first<Record<string,unknown>>();
  if(!row)throw new Error('MATERIAL_NOT_FOUND');rowScopeAllowed(auth,row.course_id?String(row.course_id):null);
  if((auth.role==='participant'||auth.role==='guest')&&Number(row.visible)!==1)throw new Error('MATERIAL_NOT_FOUND');
  const obj=await env.FILES.get(String(row.object_key));if(!obj)throw new Error('MATERIAL_FILE_NOT_FOUND');
  const filename=safeFilename(String(row.original_name||'material'));
  return new Response(obj.body,{status:200,headers:{'content-type':String(row.content_type||obj.httpMetadata?.contentType||'application/octet-stream'),'content-length':String(obj.size),'content-disposition':`attachment; filename="${filename}"`,'cache-control':'private, max-age=0, no-store','x-content-type-options':'nosniff'}});
}