import type { AuthContext, PortabilityEnv } from './types.js';
import { assertTenantAccess, json } from './utils.js';
import { previewImport, commitImport } from './import.js';
import { exportResource, exportTenantZip } from './export.js';
import { uploadPdf } from './files.js';
import { createBackup, restoreBackup } from './backup.js';
import { requestTenantDeletion, confirmTenantDeletion, executeDueTenantDeletion } from './delete.js';

function tenantFrom(url: URL): string { const x=url.searchParams.get('tenantId'); if(!x) throw new Error('TENANT_REQUIRED'); return x; }
function requirePlatformAdmin(auth: AuthContext): void { if(!auth.isPlatformAdmin) throw new Error('PLATFORM_ADMIN_REQUIRED'); }

export async function handlePortabilityRequest(request: Request, env: PortabilityEnv, auth: AuthContext): Promise<Response> {
  try {
    const url = new URL(request.url); const p=url.pathname;
    if (p.endsWith('/import/preview') && request.method==='POST') {
      const tenantId=tenantFrom(url); assertTenantAccess(auth,tenantId);
      const resource=url.searchParams.get('resource') ?? ''; const body=await request.arrayBuffer(); const sourceName=request.headers.get('x-file-name') ?? 'import'; const sourceType=(url.searchParams.get('type') ?? 'csv') as 'csv'|'xlsx';
      return json(await previewImport(env,tenantId,resource,sourceType,sourceName,body,auth.userId));
    }
    if (p.endsWith('/import/commit') && request.method==='POST') {
      const tenantId=tenantFrom(url); assertTenantAccess(auth,tenantId); const {jobId}=await request.json() as {jobId:string}; await commitImport(env,tenantId,jobId,auth.userId); return json({ok:true});
    }
    if (p.endsWith('/files/pdf') && request.method==='POST') {
      const tenantId=tenantFrom(url); assertTenantAccess(auth,tenantId); const name=request.headers.get('x-file-name') ?? 'document.pdf'; const resourceType=url.searchParams.get('resourceType') ?? undefined; const resourceId=url.searchParams.get('resourceId') ?? undefined;
      return json(await uploadPdf(env,tenantId,name,request.headers.get('content-type') ?? 'application/pdf',await request.arrayBuffer(),auth.userId,resourceType,resourceId));
    }
    if (p.endsWith('/export/resource') && request.method==='GET') {
      const tenantId=tenantFrom(url); assertTenantAccess(auth,tenantId); const resource=url.searchParams.get('resource') ?? ''; const format=(url.searchParams.get('format') ?? 'csv') as 'csv'|'xlsx'|'pdf'; return exportResource(env,tenantId,resource,format);
    }
    if (p.endsWith('/export/full') && request.method==='GET') {
      const tenantId=tenantFrom(url); assertTenantAccess(auth,tenantId); return exportTenantZip(env,tenantId);
    }
    if (p.endsWith('/backup') && request.method==='POST') {
      const tenantId=tenantFrom(url); assertTenantAccess(auth,tenantId); return json(await createBackup(env,tenantId,'manual',auth.userId));
    }
    if (p.endsWith('/restore') && request.method==='POST') {
      requirePlatformAdmin(auth); const {backupId}=await request.json() as {backupId:string}; await restoreBackup(env,backupId,auth.userId); return json({ok:true});
    }
    if (p.endsWith('/delete/request') && request.method==='POST') {
      const tenantId=tenantFrom(url); assertTenantAccess(auth,tenantId); return json(await requestTenantDeletion(env,tenantId,auth.userId));
    }
    if (p.endsWith('/delete/confirm') && request.method==='POST') {
      requirePlatformAdmin(auth); const {requestId}=await request.json() as {requestId:string}; await confirmTenantDeletion(env,requestId,auth.userId); return json({ok:true});
    }
    if (p.endsWith('/delete/execute') && request.method==='POST') {
      requirePlatformAdmin(auth); const {requestId}=await request.json() as {requestId:string}; await executeDueTenantDeletion(env,requestId,auth.userId); return json({ok:true});
    }
    return json({error:'NOT_FOUND'},404);
  } catch (e) {
    const msg=e instanceof Error?e.message:String(e); const status=msg.includes('FORBIDDEN')||msg.includes('ADMIN_REQUIRED')?403:msg.includes('NOT_FOUND')?404:400; return json({error:msg},status);
  }
}
