import type { Env } from './types.js';

let ensurePromise:Promise<void>|null=null;

async function tableExists(env:Env,name:string):Promise<boolean>{
  const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first<{name:string}>();
  return !!row?.name;
}

async function ensure(env:Env):Promise<void>{
  if(await tableExists(env,'managed_setup_jobs'))return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS managed_setup_jobs (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    order_id TEXT NOT NULL UNIQUE,
    setup_option_id TEXT NOT NULL,
    setup_name TEXT NOT NULL,
    course_count INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('ready','in_progress','completed')) DEFAULT 'ready',
    paid_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    internal_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(order_id) REFERENCES commercial_orders(id) ON DELETE CASCADE,
    FOREIGN KEY(setup_option_id) REFERENCES managed_setup_options(id)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_managed_setup_jobs_status ON managed_setup_jobs(status,paid_at DESC)').run();
  await env.DB.prepare(`INSERT OR IGNORE INTO managed_setup_jobs(
      id,tenant_id,order_id,setup_option_id,setup_name,course_count,status,paid_at,created_at,updated_at
    )
    SELECT
      'msj_' || lower(hex(randomblob(12))),i.tenant_id,i.order_id,
      json_extract(i.snapshot_json,'$.managedSetupOptionId'),
      COALESCE(json_extract(i.snapshot_json,'$.managedSetupName'),'Managed Setup'),
      COALESCE(CAST(json_extract(i.snapshot_json,'$.courseCount') AS INTEGER),o.course_limit,1),
      'ready',COALESCE(i.paid_at,CURRENT_TIMESTAMP),COALESCE(i.paid_at,CURRENT_TIMESTAMP),COALESCE(i.paid_at,CURRENT_TIMESTAMP)
    FROM commercial_invoices i
    JOIN commercial_orders o ON o.id=i.order_id
    WHERE i.type='initial' AND i.status='paid' AND i.order_id IS NOT NULL
      AND COALESCE(CAST(json_extract(i.snapshot_json,'$.managedSetupCents') AS INTEGER),0)>0
      AND COALESCE(json_extract(i.snapshot_json,'$.managedSetupOptionId'),'self_service')<>'self_service'`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_managed_setup_job_after_invoice_paid
    AFTER UPDATE OF status ON commercial_invoices
    WHEN NEW.status='paid' AND OLD.status<>'paid' AND NEW.type='initial' AND NEW.order_id IS NOT NULL
      AND COALESCE(CAST(json_extract(NEW.snapshot_json,'$.managedSetupCents') AS INTEGER),0)>0
      AND COALESCE(json_extract(NEW.snapshot_json,'$.managedSetupOptionId'),'self_service')<>'self_service'
    BEGIN
      INSERT OR IGNORE INTO managed_setup_jobs(
        id,tenant_id,order_id,setup_option_id,setup_name,course_count,status,paid_at,created_at,updated_at
      )
      SELECT
        'msj_' || lower(hex(randomblob(12))),NEW.tenant_id,NEW.order_id,
        json_extract(NEW.snapshot_json,'$.managedSetupOptionId'),
        COALESCE(json_extract(NEW.snapshot_json,'$.managedSetupName'),'Managed Setup'),
        COALESCE(CAST(json_extract(NEW.snapshot_json,'$.courseCount') AS INTEGER),o.course_limit,1),
        'ready',COALESCE(NEW.paid_at,CURRENT_TIMESTAMP),COALESCE(NEW.paid_at,CURRENT_TIMESTAMP),COALESCE(NEW.paid_at,CURRENT_TIMESTAMP)
      FROM commercial_orders o WHERE o.id=NEW.order_id;
    END`).run();
}

export async function ensureManagedSetupSchema(env:Env):Promise<void>{
  if(!ensurePromise)ensurePromise=ensure(env).catch(error=>{ensurePromise=null;throw error;});
  await ensurePromise;
}
