import type { Env } from './types.js';

export interface ProductionOriginStatus { ok:boolean; origin:string|null; reason?:string; }
export interface WorkerVersionInfo { id:string; tag:string|null; timestamp:string|null; }
export interface ProductionReleaseAccess {
  production:boolean;
  allowed:boolean;
  approved:boolean;
  origin:string|null;
  version:WorkerVersionInfo|null;
  approvedAt:string|null;
  approvedBy:string|null;
  reason:string|null;
}

export function productionOriginStatus(env:Env):ProductionOriginStatus{
  try{
    const u=new URL(String(env.APP_ORIGIN||''));
    if(u.protocol!=='https:')return{ok:false,origin:u.origin,reason:'APP_ORIGIN muss HTTPS verwenden'};
    const h=u.hostname.toLowerCase();
    if(h.endsWith('.workers.dev')||h.endsWith('.pages.dev')||h==='localhost'||h==='127.0.0.1')return{ok:false,origin:u.origin,reason:'APP_ORIGIN verwendet noch eine Vorschau-/Entwicklungsdomain'};
    return{ok:true,origin:u.origin};
  }catch{return{ok:false,origin:null,reason:'APP_ORIGIN fehlt oder ist ungültig'};}
}

export function requestLooksLikePreview(request:Request):boolean{
  try{const h=new URL(request.url).hostname.toLowerCase();return h.endsWith('.workers.dev')||h.endsWith('.pages.dev')||h==='localhost'||h==='127.0.0.1';}catch{return false;}
}

export function currentWorkerVersion(env:Env):WorkerVersionInfo|null{
  const raw=env.CF_VERSION_METADATA,id=String(raw?.id||'').trim();if(!id)return null;
  return{id,tag:String(raw?.tag||'').trim()||null,timestamp:String(raw?.timestamp||'').trim()||null};
}

export async function ensureProductionReleaseSchema(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS production_release_approvals (
    version_id TEXT PRIMARY KEY,version_tag TEXT,version_timestamp TEXT,app_origin TEXT NOT NULL,approved_by TEXT NOT NULL,approved_at TEXT NOT NULL,
    readiness_json TEXT NOT NULL,revoked_at TEXT,revoked_by TEXT,FOREIGN KEY(approved_by) REFERENCES users(id),FOREIGN KEY(revoked_by) REFERENCES users(id))`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_production_release_approvals_active ON production_release_approvals(app_origin,revoked_at,approved_at DESC)').run();
}

export async function productionReleaseAccess(env:Env,request:Request):Promise<ProductionReleaseAccess>{
  if(requestLooksLikePreview(request))return{production:false,allowed:true,approved:false,origin:null,version:currentWorkerVersion(env),approvedAt:null,approvedBy:null,reason:null};
  const origin=productionOriginStatus(env),version=currentWorkerVersion(env);
  if(!origin.ok)return{production:true,allowed:false,approved:false,origin:origin.origin,version,approvedAt:null,approvedBy:null,reason:origin.reason||'Produktionsursprung ist nicht sicher konfiguriert'};
  if(!version)return{production:true,allowed:false,approved:false,origin:origin.origin,version:null,approvedAt:null,approvedBy:null,reason:'Worker-Versionsmetadaten fehlen; Produktion bleibt gesperrt'};
  try{
    const row=await env.DB.prepare(`SELECT approved_at,approved_by FROM production_release_approvals
      WHERE version_id=? AND app_origin=? AND revoked_at IS NULL`).bind(version.id,origin.origin).first<{approved_at:string;approved_by:string}>();
    if(!row)return{production:true,allowed:false,approved:false,origin:origin.origin,version,approvedAt:null,approvedBy:null,reason:'Diese Worker-Version wurde noch nicht ausdrücklich für Produktion freigegeben'};
    return{production:true,allowed:true,approved:true,origin:origin.origin,version,approvedAt:row.approved_at,approvedBy:row.approved_by,reason:null};
  }catch{
    return{production:true,allowed:false,approved:false,origin:origin.origin,version,approvedAt:null,approvedBy:null,reason:'Produktionsfreigabe-Speicher ist nicht verfügbar'};
  }
}
