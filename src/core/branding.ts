import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireRole } from './permissions.js';
import { nowIso } from './utils.js';

const MAX_LOGO_BYTES = 5 * 1024 * 1024;
// Kein image/svg+xml: eine SVG ist ein Dokument, das Skript ausfuehren darf, und das Logo wird
// unter /brand/logo/<tenant> ohne Anmeldung im eigenen Origin ausgeliefert. materials.ts sperrt
// den Typ aus demselben Grund. nosniff hilft hier nicht - es verhindert nur das Erraten eines
// anderen Typs, nicht die Ausfuehrung eines korrekt deklarierten SVG.
const ALLOWED = new Set(['image/png','image/jpeg','image/webp']);

function fileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g,'_').slice(0,180) || 'logo';
}

export async function uploadTenantLogo(env: Env, auth: CoreAuthContext, tenantId: string, request: Request): Promise<{logo_url:string}> {
  requireRole(auth,'tenant_admin');
  const form = await request.formData();
  const file = form.get('logo');
  if (!(file instanceof File)) throw new Error('LOGO_REQUIRED');
  if (!ALLOWED.has(file.type)) throw new Error('LOGO_FORMAT_INVALID');
  if (file.size <= 0 || file.size > MAX_LOGO_BYTES) throw new Error('LOGO_TOO_LARGE');

  const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE id=? AND status='active'").bind(tenantId).first();
  if (!tenant) throw new Error('TENANT_NOT_FOUND');

  const objectKey = `tenants/${tenantId}/branding/logo`;
  await env.FILES.put(objectKey, file, {
    httpMetadata: { contentType: file.type },
    customMetadata: { tenantId, kind:'branding-logo', originalName:fileName(file.name) },
  });

  const stamp = Date.now();
  const logoUrl = `/brand/logo/${encodeURIComponent(tenantId)}?v=${stamp}`;
  const ts = nowIso();
  const fileId = `branding_logo_${tenantId}`;
  await env.DB.batch([
    env.DB.prepare('UPDATE tenant_settings SET logo_url=?,updated_at=? WHERE tenant_id=?').bind(logoUrl,ts,tenantId),
    env.DB.prepare(`INSERT INTO portability_files(id,tenant_id,object_key,original_name,content_type,size_bytes,uploaded_by,created_at)
      VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(object_key) DO UPDATE SET original_name=excluded.original_name,content_type=excluded.content_type,size_bytes=excluded.size_bytes,uploaded_by=excluded.uploaded_by,created_at=excluded.created_at`)
      .bind(fileId,tenantId,objectKey,fileName(file.name),file.type,file.size,auth.userId,ts),
  ]);
  await audit(env.DB,auth.userId,'branding.logo.updated',tenantId,undefined,'tenant_settings',tenantId,{contentType:file.type,size:file.size});
  return {logo_url:logoUrl};
}

export async function serveTenantLogo(env: Env, tenantId: string): Promise<Response> {
  const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE id=? AND status='active'").bind(tenantId).first();
  if (!tenant) return new Response('Nicht gefunden',{status:404});
  const obj = await env.FILES.get(`tenants/${tenantId}/branding/logo`);
  if (!obj) return new Response('Nicht gefunden',{status:404});
  // Der gespeicherte Typ stammt aus einem frueheren Upload und kann aelter als die Allowlist
  // sein - eine vor dieser Aenderung abgelegte SVG liegt weiterhin im Bucket. Deshalb wird der
  // ausgelieferte Typ hier erneut gegen ALLOWED geklemmt, statt ihm zu vertrauen.
  const stored = String(obj.httpMetadata?.contentType || '').toLowerCase();
  const safe = ALLOWED.has(stored);
  return new Response(obj.body, {
    headers: {
      'content-type': safe ? stored : 'application/octet-stream',
      'content-disposition': safe ? 'inline' : 'attachment; filename="logo"',
      'cache-control': 'public, max-age=31536000, immutable',
      'etag': obj.etag,
      'x-content-type-options': 'nosniff',
    },
  });
}
