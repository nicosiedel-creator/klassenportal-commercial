import type { AuthContext, PortabilityConfig, PortabilityEnv } from './types.js';
import { json } from './utils.js';
import { previewImport, executeImport, importPdf } from './import.js';
import { exportResource, fullTenantExport } from './export.js';
import { createTenantBackup, listTenantBackups, restoreTenantBackup } from './backup.js';
import { requestTenantDeletion, cancelTenantDeletion, finalizeTenantDeletion } from './delete.js';

export type ResolveAuth = (request: Request) => Promise<AuthContext>;

function errorResponse(error: unknown): Response {
  const e = error as Error & { issues?: unknown };
  const code = e.message || 'INTERNAL_ERROR';
  const status = code.startsWith('FORBIDDEN') || code.includes('ADMIN_REQUIRED') ? 403
    : code.includes('NOT_FOUND') || code.includes('MISSING') ? 404
    : code.includes('TOO_LARGE') || code.includes('TOO_MANY') ? 413
    : code === 'INTERNAL_ERROR' ? 500 : 400;
  return json({ ok: false, error: code, issues: e.issues }, status);
}

export async function handlePortabilityRequest(
  request: Request,
  env: PortabilityEnv,
  config: PortabilityConfig,
  resolveAuth: ResolveAuth,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/portability/')) return null;
  try {
    const auth = await resolveAuth(request);
    const tenantId = url.searchParams.get('tenant_id') ?? '';
    if (!tenantId) throw new Error('TENANT_ID_REQUIRED');

    if (url.pathname === '/api/portability/import/preview' && request.method === 'POST') {
      const form = await request.formData();
      const file = form.get('file'); const resource = String(form.get('resource') ?? '');
      if (!(file instanceof File) || !resource) throw new Error('FILE_AND_RESOURCE_REQUIRED');
      return json({ ok: true, preview: await previewImport(env, config, auth, tenantId, resource, file) });
    }
    if (url.pathname === '/api/portability/import/execute' && request.method === 'POST') {
      const form = await request.formData();
      const file = form.get('file'); const resource = String(form.get('resource') ?? '');
      const mode = String(form.get('mode') ?? 'append') as 'append' | 'replace';
      if (!(file instanceof File) || !resource || !['append','replace'].includes(mode)) throw new Error('INVALID_IMPORT_REQUEST');
      return json({ ok: true, ...(await executeImport(env, config, auth, tenantId, resource, file, mode)) });
    }
    if (url.pathname === '/api/portability/import/pdf' && request.method === 'POST') {
      const form = await request.formData(); const file = form.get('file');
      if (!(file instanceof File)) throw new Error('PDF_REQUIRED');
      return json({ ok: true, file: await importPdf(env, config, auth, tenantId, file) });
    }
    if (url.pathname === '/api/portability/export' && request.method === 'GET') {
      const resource = url.searchParams.get('resource') ?? '';
      const format = (url.searchParams.get('format') ?? 'csv') as 'csv'|'xlsx'|'pdf';
      if (!resource || !['csv','xlsx','pdf'].includes(format)) throw new Error('INVALID_EXPORT_REQUEST');
      return exportResource(env, config, auth, tenantId, resource, format);
    }
    if (url.pathname === '/api/portability/export/full' && request.method === 'GET') return fullTenantExport(env, config, auth, tenantId);
    if (url.pathname === '/api/portability/backups' && request.method === 'GET') return json({ ok: true, backups: await listTenantBackups(env, auth, tenantId) });
    if (url.pathname === '/api/portability/backups' && request.method === 'POST') return json({ ok: true, backup: await createTenantBackup(env, config, auth, tenantId, 'manual') });
    if (url.pathname === '/api/portability/backups/restore' && request.method === 'POST') {
      const body = await request.json() as { backup_id?: string; confirmation?: string };
      return json({ ok: true, ...(await restoreTenantBackup(env, config, auth, tenantId, body.backup_id ?? '', body.confirmation ?? '')) });
    }
    if (url.pathname === '/api/portability/deletion' && request.method === 'POST') {
      const body = await request.json() as { reason?: 'contract_end'|'manual' };
      return json({ ok: true, ...(await requestTenantDeletion(env, config, auth, tenantId, body.reason ?? 'manual')) });
    }
    if (url.pathname === '/api/portability/deletion/cancel' && request.method === 'POST') {
      const body = await request.json() as { request_id?: string };
      await cancelTenantDeletion(env, auth, tenantId, body.request_id ?? ''); return json({ ok: true });
    }
    if (url.pathname === '/api/portability/deletion/finalize' && request.method === 'POST') {
      const body = await request.json() as { request_id?: string; confirmation?: string };
      return json({ ok: true, ...(await finalizeTenantDeletion(env, config, auth, tenantId, body.request_id ?? '', body.confirmation ?? '')) });
    }
    return json({ ok: false, error: 'NOT_FOUND' }, 404);
  } catch (e) { return errorResponse(e); }
}
