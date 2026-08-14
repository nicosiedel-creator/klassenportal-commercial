import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { id, nowIso } from './utils.js';

const MAX_BYTES = 20 * 1024 * 1024;
const ALLOWED = new Set([
  'application/pdf',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

function safeName(name:string):string {
  return name.normalize('NFKD').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,160) || 'stundenplan';
}

export async function storeTimetableSource(env:Env,auth:CoreAuthContext,tenantId:string,request:Request):Promise<{id:string;stored:boolean}> {
  requireRole(auth,'class_admin');
  const form=await request.formData();
  const file=form.get('file');
  const courseId=String(form.get('course_id')??'').trim() || undefined;
  if(!(file instanceof File))throw new Error('TIMETABLE_FILE_REQUIRED');
  if(file.size<=0||file.size>MAX_BYTES)throw new Error('TIMETABLE_FILE_TOO_LARGE');
  const name=file.name.toLowerCase();
  const allowed=ALLOWED.has(file.type)||name.endsWith('.pdf')||name.endsWith('.csv')||name.endsWith('.xlsx');
  if(!allowed)throw new Error('TIMETABLE_FILE_UNSUPPORTED');
  if(courseId)requireCourseAccess(auth,courseId);

  const fileId=id('ttsrc_');
  const objectKey=`tenants/${tenantId}/timetable-sources/${fileId}/${safeName(file.name)}`;
  const ts=nowIso();
  const contentType=file.type||'application/octet-stream';
  await env.FILES.put(objectKey,file,{
    httpMetadata:{contentType},
    customMetadata:{tenantId,courseId:courseId??'',kind:'timetable-source',originalName:safeName(file.name)},
  });
  await env.DB.prepare(`INSERT INTO portability_files(id,tenant_id,object_key,original_name,content_type,size_bytes,uploaded_by,created_at)
    VALUES(?,?,?,?,?,?,?,?)`).bind(fileId,tenantId,objectKey,safeName(file.name),contentType,file.size,auth.userId,ts).run();
  await audit(env.DB,auth.userId,'timetable.source.uploaded',tenantId,courseId,'timetable_source',fileId,{name:file.name,size:file.size,contentType});
  return {id:fileId,stored:true};
}
