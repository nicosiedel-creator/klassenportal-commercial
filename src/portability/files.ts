import { portabilityConfig } from './config.js';
import type { PortabilityEnv } from './types.js';
import { audit } from './db.js';
import { randomId, safeFilename } from './utils.js';

export interface StoredFileRow { id:string; tenant_id:string; resource_type?:string; resource_id?:string; original_name:string; object_key:string; content_type?:string; size:number; uploaded_by?:string; created_at:string }

export async function uploadPdf(env: PortabilityEnv, tenantId: string, originalName: string, contentType: string, bytes: ArrayBuffer, actor: string, resourceType?:string, resourceId?:string): Promise<StoredFileRow> {
  if (contentType !== 'application/pdf' && !originalName.toLowerCase().endsWith('.pdf')) throw new Error('ONLY_PDF_ALLOWED');
  if (bytes.byteLength > portabilityConfig.maxPdfBytes) throw new Error('PDF_TOO_LARGE');
  const head=new Uint8Array(bytes.slice(0,5)); if(new TextDecoder().decode(head)!=='%PDF-') throw new Error('INVALID_PDF_SIGNATURE');
  const id=randomId('fil_'); const objectKey=`tenant-files/${tenantId}/${id}/${safeFilename(originalName)}`;
  await env.FILES.put(objectKey,bytes,{httpMetadata:{contentType:'application/pdf'},customMetadata:{tenantId,fileId:id}});
  await env.DB.prepare('INSERT INTO portability_files(id,tenant_id,resource_type,resource_id,original_name,object_key,content_type,size,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)').bind(id,tenantId,resourceType??null,resourceId??null,originalName,objectKey,'application/pdf',bytes.byteLength,actor).run();
  await audit(env.DB,tenantId,actor,'pdf_uploaded',{id,originalName,resourceType,resourceId});
  return {id,tenant_id:tenantId,resource_type:resourceType,resource_id:resourceId,original_name:originalName,object_key:objectKey,content_type:'application/pdf',size:bytes.byteLength,uploaded_by:actor,created_at:new Date().toISOString()};
}
export async function listTenantFiles(env: PortabilityEnv, tenantId:string):Promise<StoredFileRow[]> { const r=await env.DB.prepare('SELECT * FROM portability_files WHERE tenant_id=? ORDER BY created_at').bind(tenantId).all<StoredFileRow>(); return r.results??[]; }
