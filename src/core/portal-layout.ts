import type { CoreAuthContext, Env } from './types.js';
import { nowIso } from './utils.js';

const ALLOWED_SECTIONS=new Set([
  'benachrichtigungen','meldungen','woche','stundenplan','aufgaben','termine','pruefungen','erinnerungen','kalender','materialien','links',
]);

function normalizeOrder(value:unknown):string[]{
  if(!Array.isArray(value))throw new Error('PORTAL_LAYOUT_INVALID');
  const out:string[]=[];
  for(const raw of value){
    const id=String(raw||'').trim();
    if(!ALLOWED_SECTIONS.has(id)||out.includes(id))continue;
    out.push(id);
  }
  if(out.length>ALLOWED_SECTIONS.size)throw new Error('PORTAL_LAYOUT_INVALID');
  return out;
}

async function assertCourse(env:Env,tenantId:string,courseId:string):Promise<void>{
  const row=await env.DB.prepare('SELECT id FROM courses WHERE id=? AND tenant_id=? AND is_active=1').bind(courseId,tenantId).first<{id:string}>();
  if(!row)throw new Error('COURSE_NOT_FOUND');
}

async function ensurePortalLayoutSchema(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS user_portal_layouts (
    user_id TEXT NOT NULL,
    tenant_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    layout_json TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(user_id,tenant_id,course_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_user_portal_layouts_course ON user_portal_layouts(tenant_id,course_id,updated_at DESC)').run();
}

export async function getPortalLayout(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string):Promise<string[]>{
  await assertCourse(env,tenantId,courseId);
  await ensurePortalLayoutSchema(env);
  const row=await env.DB.prepare('SELECT layout_json FROM user_portal_layouts WHERE user_id=? AND tenant_id=? AND course_id=?')
    .bind(auth.userId,tenantId,courseId).first<{layout_json:string}>();
  if(!row?.layout_json)return [];
  try{return normalizeOrder(JSON.parse(row.layout_json));}catch{return [];}
}

export async function savePortalLayout(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>):Promise<string[]>{
  await assertCourse(env,tenantId,courseId);
  await ensurePortalLayoutSchema(env);
  const order=normalizeOrder(input.order),ts=nowIso();
  await env.DB.prepare(`INSERT INTO user_portal_layouts(user_id,tenant_id,course_id,layout_json,updated_at)
    VALUES(?,?,?,?,?)
    ON CONFLICT(user_id,tenant_id,course_id) DO UPDATE SET layout_json=excluded.layout_json,updated_at=excluded.updated_at`)
    .bind(auth.userId,tenantId,courseId,JSON.stringify(order),ts).run();
  return order;
}

export async function resetPortalLayout(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string):Promise<void>{
  await assertCourse(env,tenantId,courseId);
  await ensurePortalLayoutSchema(env);
  await env.DB.prepare('DELETE FROM user_portal_layouts WHERE user_id=? AND tenant_id=? AND course_id=?').bind(auth.userId,tenantId,courseId).run();
}
