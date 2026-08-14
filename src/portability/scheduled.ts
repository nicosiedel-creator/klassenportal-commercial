import type { PortabilityEnv } from './types.js';
import { createBackup } from './backup.js';

export async function runAutomaticBackups(env: PortabilityEnv, tenantsPerRun = 25): Promise<{ backedUp: string[]; failed: Array<{tenantId:string; error:string}> }> {
  const cursorRow = await env.DB.prepare("SELECT details_json FROM portability_audit WHERE tenant_id='__system__' AND action='automatic_backup_cursor' ORDER BY created_at DESC LIMIT 1").first<{details_json:string}>();
  let cursor = '';
  try { cursor = cursorRow?.details_json ? JSON.parse(cursorRow.details_json).cursor ?? '' : ''; } catch {}
  const rows = await env.DB.prepare('SELECT id FROM tenants WHERE id > ? ORDER BY id LIMIT ?').bind(cursor, tenantsPerRun).all<{id:string}>();
  let tenantRows = rows.results ?? [];
  if (!tenantRows.length) {
    const wrap = await env.DB.prepare('SELECT id FROM tenants ORDER BY id LIMIT ?').bind(tenantsPerRun).all<{id:string}>();
    tenantRows = wrap.results ?? [];
  }
  const backedUp: string[] = []; const failed: Array<{tenantId:string;error:string}> = [];
  for (const row of tenantRows) {
    try { await createBackup(env, row.id, 'automatic', 'system'); backedUp.push(row.id); }
    catch (e) { failed.push({tenantId:row.id,error:e instanceof Error?e.message:String(e)}); }
  }
  const last = tenantRows.at(-1)?.id ?? '';
  await env.DB.prepare('INSERT INTO portability_audit(id, tenant_id, actor_user_id, action, details_json) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),'__system__','system','automatic_backup_cursor',JSON.stringify({cursor:last,backedUp,failed})).run();
  return { backedUp, failed };
}
