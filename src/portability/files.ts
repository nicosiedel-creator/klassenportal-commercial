import type { PortabilityEnv } from './types.js';
import { randomId, safeFilename } from './utils.js';

export async function storePdf(env:PortabilityEnv,tenantId:string,file:File,userId:string):Promise<{id:string;key:string}>{
  if(file.type!=='application/pdf'&&!file.name.toLowerCase().endsWith('.pdf'))throw new Error('PDF_REQUIRED');
  const id=randomId('pf_'),key=`tenants/${tenantId}/documents/${id}-${safeFilename(file.name)}`;
  await env.FILES.put(key,file.stream(),{httpMetadata:{contentType:'application/pdf',contentDisposition:`attachment; filename="${safeFilename(file.name)}"`},customMetadata:{tenantId,uploadedBy:userId,originalName:file.name}});
  await env.DB.prepare('INSERT INTO portability_files (id, tenant_id, object_key, original_name, content_type, size_bytes, uploaded_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(id,tenantId,key,file.name,'application/pdf',file.size,userId,new Date().toISOString()).run();
  return {id,key};
}
export async function listTenantFiles(env:PortabilityEnv,tenantId:string):Promise<Array<Record<string,unknown>>>{const res=await env.DB.prepare('SELECT id, object_key, original_name, content_type, size_bytes, uploaded_by, created_at FROM portability_files WHERE tenant_id = ? ORDER BY created_at ASC').bind(tenantId).all<Record<string,unknown>>();return res.results??[];}
export async function deleteTenantObjects(env:PortabilityEnv,tenantId:string):Promise<number>{let cursor:string|undefined,count=0;const prefix=`tenants/${tenantId}/`;do{const page=await env.FILES.list({prefix,cursor,limit:1000}),keys=page.objects.map(o=>o.key);if(keys.length){await env.FILES.delete(keys);count+=keys.length;}cursor=page.truncated?page.cursor:undefined;}while(cursor);return count;}
