import { portabilityConfig } from './config.js';
import type { BackupManifest, PortabilityEnv } from './types.js';
import { randomId, textEncoder } from './utils.js';
import { audit, deleteAllByTenant, insertRows, selectAllByTenant } from './db.js';
import { listTenantFiles } from './files.js';

async function putJson(env: PortabilityEnv, key: string, data: unknown): Promise<void> {
  await env.FILES.put(key, textEncoder.encode(JSON.stringify(data)), { httpMetadata: { contentType: 'application/json' } });
}
async function readJson<T>(env: PortabilityEnv, key: string): Promise<T> {
  const obj = await env.FILES.get(key); if (!obj) throw new Error(`BACKUP_OBJECT_MISSING:${key}`);
  return JSON.parse(await obj.text()) as T;
}

export async function createBackup(env: PortabilityEnv, tenantId: string, reason: BackupManifest['reason'], actor: string): Promise<BackupManifest> {
  const backupId = randomId('bkp_');
  const root = `backups/${tenantId}/${backupId}`;
  await env.DB.prepare('INSERT INTO portability_backups(id, tenant_id, reason, manifest_key, status, created_by) VALUES(?,?,?,?,?,?)').bind(backupId, tenantId, reason, `${root}/manifest.json`, 'running', actor).run();
  const manifest: BackupManifest = { version: 1, backupId, tenantId, createdAt: new Date().toISOString(), reason, resources: [], files: [] };
  try {
    for (const resource of [...portabilityConfig.resources].sort((a,b)=>a.restoreOrder-b.restoreOrder)) {
      const rows = await selectAllByTenant(env.DB, resource, tenantId);
      const key = `${root}/data/${resource.key}.json`;
      await putJson(env, key, rows);
      manifest.resources.push({ key: resource.key, objectKey: key, rowCount: rows.length });
    }
    const files = await listTenantFiles(env, tenantId);
    for (const f of files) {
      const body = await env.FILES.get(f.object_key); if (!body) continue;
      const backupKey = `${root}/files/${f.id}/${f.original_name}`;
      await env.FILES.put(backupKey, body.body, { httpMetadata: body.httpMetadata, customMetadata: body.customMetadata });
      manifest.files.push({ id:f.id, originalKey:f.object_key, backupKey, originalName:f.original_name, size:f.size, contentType:f.content_type, uploadedBy:f.uploaded_by, createdAt:f.created_at });
    }
    await putJson(env, `${root}/manifest.json`, manifest);
    await env.DB.prepare("UPDATE portability_backups SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(backupId).run();
    await audit(env.DB, tenantId, actor, 'backup_created', { backupId, reason });
    return manifest;
  } catch (e) {
    await env.DB.prepare("UPDATE portability_backups SET status='failed', completed_at=CURRENT_TIMESTAMP WHERE id=?").bind(backupId).run();
    throw e;
  }
}

export async function restoreBackup(env: PortabilityEnv, backupId: string, actor: string): Promise<void> {
  const row = await env.DB.prepare('SELECT tenant_id, manifest_key, status FROM portability_backups WHERE id=?').bind(backupId).first<{tenant_id:string;manifest_key:string;status:string}>();
  if (!row || row.status !== 'completed') throw new Error('BACKUP_NOT_RESTORABLE');
  const manifest = await readJson<BackupManifest>(env, row.manifest_key);
  await createBackup(env, row.tenant_id, 'pre_restore', actor);

  // Load and validate all backup payloads before destructive work.
  const payloads = new Map<string, Record<string, unknown>[]>();
  for (const res of manifest.resources) payloads.set(res.key, await readJson<Record<string, unknown>[]>(env, res.objectKey));
  for (const f of manifest.files) if (!(await env.FILES.get(f.backupKey))) throw new Error(`BACKUP_FILE_MISSING:${f.backupKey}`);

  const resources = [...portabilityConfig.resources].sort((a,b)=>b.restoreOrder-a.restoreOrder);
  const deletes = resources.map((r) => env.DB.prepare(`DELETE FROM ${r.table} WHERE ${r.tenantColumn}=?`).bind(row.tenant_id));
  await env.DB.batch(deletes);

  for (const r of [...portabilityConfig.resources].sort((a,b)=>a.restoreOrder-b.restoreOrder)) {
    const rows = payloads.get(r.key) ?? [];
    if (rows.length) await insertRows(env.DB, r, row.tenant_id, rows, true);
  }

  const currentFiles = await listTenantFiles(env, row.tenant_id);
  for (const f of currentFiles) await env.FILES.delete(f.object_key);
  await env.DB.prepare('DELETE FROM portability_files WHERE tenant_id=?').bind(row.tenant_id).run();
  for (const f of manifest.files) {
    const body = await env.FILES.get(f.backupKey); if (!body) throw new Error(`BACKUP_FILE_MISSING:${f.backupKey}`);
    await env.FILES.put(f.originalKey, body.body, { httpMetadata: body.httpMetadata, customMetadata: body.customMetadata });
    await env.DB.prepare('INSERT INTO portability_files(id, tenant_id, original_name, object_key, content_type, size, uploaded_by, created_at) VALUES(?,?,?,?,?,?,?,?)').bind(f.id,row.tenant_id,f.originalName,f.originalKey,f.contentType ?? null,f.size,f.uploadedBy ?? null,f.createdAt ?? new Date().toISOString()).run();
  }
  await audit(env.DB, row.tenant_id, actor, 'backup_restored', { backupId });
}

export async function pruneAutomaticBackups(env: PortabilityEnv, tenantId: string, keep = 14): Promise<number> {
  const rows = await env.DB.prepare("SELECT id, manifest_key FROM portability_backups WHERE tenant_id=? AND reason='automatic' AND status='completed' ORDER BY created_at DESC").bind(tenantId).all<{id:string;manifest_key:string}>();
  const doomed = (rows.results ?? []).slice(keep);
  for (const b of doomed) {
    const prefix = b.manifest_key.replace(/\/manifest\.json$/, '/');
    let cursor: string | undefined;
    do { const l = await env.FILES.list({prefix,cursor,limit:1000}); if(l.objects.length) await env.FILES.delete(l.objects.map(o=>o.key)); cursor=l.truncated?l.cursor:undefined; } while(cursor);
    await env.DB.prepare('DELETE FROM portability_backups WHERE id=?').bind(b.id).run();
  }
  return doomed.length;
}
