import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { audit } from './audit.js';
import { nowIso } from './utils.js';

const materialColumns=['purpose','course_id','title','description','visible','updated_at'] as const;

async function tableExists(env:Env,name:string):Promise<boolean>{
  const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").bind(name).first<{name:string}>();
  return !!row?.name;
}
async function triggerExists(env:Env,name:string):Promise<boolean>{
  const row=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?").bind(name).first<{name:string}>();
  return !!row?.name;
}
async function columns(env:Env,table:string):Promise<Set<string>>{
  const rows=await env.DB.prepare(`PRAGMA table_info(${table})`).all<{name:string}>();
  return new Set((rows.results??[]).map(x=>String(x.name)));
}

export async function releaseSchemaStatus(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);
  const material=await columns(env,'portability_files');
  const missingMaterial=materialColumns.filter(x=>!material.has(x));
  const managed=await tableExists(env,'managed_setup_jobs');
  const portalLayouts=await tableExists(env,'user_portal_layouts');
  const notificationTrigger=await triggerExists(env,'trg_notify_announcement_after_insert');
  return {ready:managed&&missingMaterial.length===0&&notificationTrigger&&portalLayouts,managedSetupTable:managed,missingMaterialColumns:missingMaterial,notificationTriggers:notificationTrigger,userPortalLayoutsTable:portalLayouts};
}

async function ensureManagedSetup(env:Env){
  if(await tableExists(env,'managed_setup_jobs'))return;
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS managed_setup_jobs (
    id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,order_id TEXT NOT NULL UNIQUE,setup_option_id TEXT NOT NULL,setup_name TEXT NOT NULL,
    course_count INTEGER NOT NULL,status TEXT NOT NULL CHECK(status IN ('ready','in_progress','completed')) DEFAULT 'ready',paid_at TEXT NOT NULL,
    started_at TEXT,completed_at TEXT,internal_note TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,FOREIGN KEY(order_id) REFERENCES commercial_orders(id) ON DELETE CASCADE,
    FOREIGN KEY(setup_option_id) REFERENCES managed_setup_options(id))`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_managed_setup_jobs_status ON managed_setup_jobs(status, paid_at DESC)').run();
  await env.DB.prepare(`INSERT OR IGNORE INTO managed_setup_jobs(id,tenant_id,order_id,setup_option_id,setup_name,course_count,status,paid_at,created_at,updated_at)
    SELECT 'msj_' || lower(hex(randomblob(12))),i.tenant_id,i.order_id,json_extract(i.snapshot_json,'$.managedSetupOptionId'),
      COALESCE(json_extract(i.snapshot_json,'$.managedSetupName'),'Managed Setup'),COALESCE(CAST(json_extract(i.snapshot_json,'$.courseCount') AS INTEGER),o.course_limit,1),
      'ready',COALESCE(i.paid_at,CURRENT_TIMESTAMP),COALESCE(i.paid_at,CURRENT_TIMESTAMP),COALESCE(i.paid_at,CURRENT_TIMESTAMP)
    FROM commercial_invoices i JOIN commercial_orders o ON o.id=i.order_id
    WHERE i.type='initial' AND i.status='paid' AND i.order_id IS NOT NULL
      AND COALESCE(CAST(json_extract(i.snapshot_json,'$.managedSetupCents') AS INTEGER),0)>0
      AND COALESCE(json_extract(i.snapshot_json,'$.managedSetupOptionId'),'self_service')<>'self_service'`).run();
  await env.DB.prepare(`CREATE TRIGGER IF NOT EXISTS trg_managed_setup_job_after_invoice_paid AFTER UPDATE OF status ON commercial_invoices
    WHEN NEW.status='paid' AND OLD.status<>'paid' AND NEW.type='initial' AND NEW.order_id IS NOT NULL
      AND COALESCE(CAST(json_extract(NEW.snapshot_json,'$.managedSetupCents') AS INTEGER),0)>0
      AND COALESCE(json_extract(NEW.snapshot_json,'$.managedSetupOptionId'),'self_service')<>'self_service'
    BEGIN
      INSERT OR IGNORE INTO managed_setup_jobs(id,tenant_id,order_id,setup_option_id,setup_name,course_count,status,paid_at,created_at,updated_at)
      SELECT 'msj_' || lower(hex(randomblob(12))),NEW.tenant_id,NEW.order_id,json_extract(NEW.snapshot_json,'$.managedSetupOptionId'),
        COALESCE(json_extract(NEW.snapshot_json,'$.managedSetupName'),'Managed Setup'),COALESCE(CAST(json_extract(NEW.snapshot_json,'$.courseCount') AS INTEGER),o.course_limit,1),
        'ready',COALESCE(NEW.paid_at,CURRENT_TIMESTAMP),COALESCE(NEW.paid_at,CURRENT_TIMESTAMP),COALESCE(NEW.paid_at,CURRENT_TIMESTAMP)
      FROM commercial_orders o WHERE o.id=NEW.order_id;
    END`).run();
}

async function ensureMaterials(env:Env){
  const c=await columns(env,'portability_files');
  const defs:Record<string,string>={purpose:"TEXT NOT NULL DEFAULT 'source'",course_id:'TEXT',title:'TEXT',description:'TEXT',visible:'INTEGER NOT NULL DEFAULT 1',updated_at:'TEXT'};
  for(const name of materialColumns)if(!c.has(name))await env.DB.prepare(`ALTER TABLE portability_files ADD COLUMN ${name} ${defs[name]}`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_portability_files_materials ON portability_files(tenant_id,purpose,course_id,visible,created_at DESC)').run();
}

async function ensureNotifications(env:Env){
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_notifications_user_time ON notifications(user_id, created_at DESC)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_id, read_at, created_at DESC)').run();
  const triggers:[string,string][]=[
    ['trg_notify_announcement_after_insert',`CREATE TRIGGER IF NOT EXISTS trg_notify_announcement_after_insert AFTER INSERT ON announcements WHEN NEW.visible=1 BEGIN INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at) SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,'announcement','Neue Meldung: ' || NEW.title,NEW.body,CURRENT_TIMESTAMP FROM (SELECT DISTINCT user_id FROM memberships WHERE tenant_id=NEW.tenant_id AND role IN ('participant','guest') AND (NEW.course_id IS NULL OR course_id=NEW.course_id)) x; END`],
    ['trg_notify_announcement_after_publish',`CREATE TRIGGER IF NOT EXISTS trg_notify_announcement_after_publish AFTER UPDATE OF visible ON announcements WHEN OLD.visible=0 AND NEW.visible=1 BEGIN INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at) SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,'announcement','Neue Meldung: ' || NEW.title,NEW.body,CURRENT_TIMESTAMP FROM (SELECT DISTINCT user_id FROM memberships WHERE tenant_id=NEW.tenant_id AND role IN ('participant','guest') AND (NEW.course_id IS NULL OR course_id=NEW.course_id)) x; END`],
    ['trg_notify_homework_after_insert',`CREATE TRIGGER IF NOT EXISTS trg_notify_homework_after_insert AFTER INSERT ON homework BEGIN INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at) SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,'homework','Neue Aufgabe: ' || NEW.title,CASE WHEN NEW.due_at IS NULL THEN NEW.description ELSE 'Fällig: ' || NEW.due_at || CASE WHEN NEW.description IS NULL OR NEW.description='' THEN '' ELSE char(10) || NEW.description END END,CURRENT_TIMESTAMP FROM (SELECT DISTINCT user_id FROM memberships WHERE tenant_id=NEW.tenant_id AND course_id=NEW.course_id AND role IN ('participant','guest')) x; END`],
    ['trg_notify_appointment_after_insert',`CREATE TRIGGER IF NOT EXISTS trg_notify_appointment_after_insert AFTER INSERT ON appointments BEGIN INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at) SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,'appointment','Neuer Termin: ' || NEW.title,'Beginn: ' || NEW.starts_at || CASE WHEN NEW.location IS NULL OR NEW.location='' THEN '' ELSE char(10) || 'Ort: ' || NEW.location END,CURRENT_TIMESTAMP FROM (SELECT DISTINCT user_id FROM memberships WHERE tenant_id=NEW.tenant_id AND role IN ('participant','guest') AND (NEW.course_id IS NULL OR course_id=NEW.course_id)) x; END`],
    ['trg_notify_exam_after_insert',`CREATE TRIGGER IF NOT EXISTS trg_notify_exam_after_insert AFTER INSERT ON exams WHEN NEW.visible_to_students=1 BEGIN INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at) SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,'exam','Neue Prüfung: ' || NEW.title,'Termin: ' || NEW.starts_at || CASE WHEN NEW.room IS NULL OR NEW.room='' THEN '' ELSE char(10) || 'Raum: ' || NEW.room END,CURRENT_TIMESTAMP FROM (SELECT DISTINCT user_id FROM memberships WHERE tenant_id=NEW.tenant_id AND course_id=NEW.course_id AND role IN ('participant','guest')) x; END`],
    ['trg_notify_exam_after_publish',`CREATE TRIGGER IF NOT EXISTS trg_notify_exam_after_publish AFTER UPDATE OF visible_to_students ON exams WHEN OLD.visible_to_students=0 AND NEW.visible_to_students=1 BEGIN INSERT INTO notifications(id,tenant_id,course_id,user_id,type,title,body,created_at) SELECT 'ntf_' || lower(hex(randomblob(16))),NEW.tenant_id,NEW.course_id,x.user_id,'exam','Neue Prüfung: ' || NEW.title,'Termin: ' || NEW.starts_at || CASE WHEN NEW.room IS NULL OR NEW.room='' THEN '' ELSE char(10) || 'Raum: ' || NEW.room END,CURRENT_TIMESTAMP FROM (SELECT DISTINCT user_id FROM memberships WHERE tenant_id=NEW.tenant_id AND course_id=NEW.course_id AND role IN ('participant','guest')) x; END`],
  ];
  for(const [name,sql] of triggers)if(!(await triggerExists(env,name)))await env.DB.prepare(sql).run();
}

async function ensurePortalLayouts(env:Env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_portal_layouts (
    user_id TEXT NOT NULL,tenant_id TEXT NOT NULL,course_id TEXT NOT NULL,layout_json TEXT NOT NULL,updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id,tenant_id,course_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_portal_layouts_course ON user_portal_layouts(tenant_id,course_id,updated_at DESC)').run();
}

export async function applyReleaseSchema(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);
  const before=await releaseSchemaStatus(env,auth);
  await ensureManagedSetup(env);await ensureMaterials(env);await ensureNotifications(env);await ensurePortalLayouts(env);
  const after=await releaseSchemaStatus(env,auth);
  await audit(env.DB,auth.userId,'platform.schema_upgraded',undefined,undefined,'platform_schema','commercial_v1',{before,after,at:nowIso()});
  return after;
}
