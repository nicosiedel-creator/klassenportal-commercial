import type { CoreAuthContext, Env } from './types.js';
import { responsibilityPermissions, type ResponsibilityKind } from './responsibility-policy.js';
import { nowIso } from './utils.js';

export const ORG_PERMISSIONS=[
  'org.view','org.manage','access.manage','courses.view','courses.manage','content.view','content.manage',
  'participants.view','participants.manage','reports.view'
] as const;
export type OrgPermission=typeof ORG_PERMISSIONS[number];
export type OrgProfile='responsible'|'editor'|'viewer'|'reporting'|'custom';

const PROFILE_PERMISSIONS:Record<Exclude<OrgProfile,'custom'>,OrgPermission[]>={
  responsible:['org.view','org.manage','access.manage','courses.view','courses.manage','content.view','content.manage','participants.view','participants.manage','reports.view'],
  editor:['org.view','courses.view','content.view','content.manage','participants.view'],
  viewer:['org.view','courses.view','content.view','participants.view'],
  reporting:['org.view','courses.view','content.view','participants.view','reports.view'],
};

export function profilePermissions(profile:OrgProfile,custom?:unknown):OrgPermission[]{
  if(profile!=='custom')return PROFILE_PERMISSIONS[profile]??[];
  let arr:unknown[]=[];try{arr=Array.isArray(custom)?custom:JSON.parse(String(custom||'[]'));}catch{}
  const allowed=new Set<string>(ORG_PERMISSIONS);return [...new Set(arr.map(String).filter(x=>allowed.has(x)))] as OrgPermission[];
}
export function normalizePermissions(profile:OrgProfile,input?:unknown):OrgPermission[]{return profilePermissions(profile,input);}

async function grants(env:Env,userId:string,tenantId:string){
  const now=nowIso();
  const r=await env.DB.prepare(`SELECT id,org_unit_id,profile,permissions_json,inherit_descendants
    FROM org_permission_grants WHERE tenant_id=? AND user_id=? AND status='active'
      AND (valid_from IS NULL OR valid_from<=?) AND (valid_until IS NULL OR valid_until>?)`).bind(tenantId,userId,now,now).all<Record<string,unknown>>();
  return r.results??[];
}
async function responsibilities(env:Env,userId:string,tenantId:string){
  const now=nowIso();try{const r=await env.DB.prepare(`SELECT id,org_unit_id,course_id,responsibility_kind,inherit_descendants FROM responsibility_assignments WHERE tenant_id=? AND user_id=? AND status='active' AND (valid_from IS NULL OR valid_from<=?) AND (valid_until IS NULL OR valid_until>?)`).bind(tenantId,userId,now,now).all<Record<string,unknown>>();return r.results??[];}catch{return[];}
}

async function descendants(env:Env,tenantId:string,rootId:string):Promise<string[]>{
  const r=await env.DB.prepare(`WITH RECURSIVE tree(id) AS (
    SELECT id FROM org_units WHERE tenant_id=? AND id=? AND status='active'
    UNION ALL SELECT o.id FROM org_units o JOIN tree t ON o.parent_id=t.id WHERE o.tenant_id=? AND o.status='active'
  ) SELECT id FROM tree`).bind(tenantId,rootId,tenantId).all<{id:string}>();return (r.results??[]).map(x=>x.id);
}

export async function effectiveOrgAccess(env:Env,userId:string,tenantId:string){
  let gs:Record<string,unknown>[]=[];try{gs=await grants(env,userId,tenantId);}catch{return{orgUnitIds:[] as string[],courseIds:[] as string[],permissions:[] as OrgPermission[],grants:[] as Record<string,unknown>[],responsibilities:[] as Record<string,unknown>[]};}
  const rs=await responsibilities(env,userId,tenantId),units=new Set<string>(),courses=new Set<string>(),perms=new Set<OrgPermission>();
  for(const g of gs){
    const p=profilePermissions(String(g.profile) as OrgProfile,g.permissions_json);for(const x of p)perms.add(x);
    const root=String(g.org_unit_id);units.add(root);
    if(Number(g.inherit_descendants)===1)for(const child of await descendants(env,tenantId,root))units.add(child);
  }
  for(const r of rs){for(const p of responsibilityPermissions(String(r.responsibility_kind) as ResponsibilityKind))perms.add(p);if(r.course_id)courses.add(String(r.course_id));if(r.org_unit_id){const root=String(r.org_unit_id);units.add(root);if(Number(r.inherit_descendants)===1)for(const child of await descendants(env,tenantId,root))units.add(child);}}
  const unitIds=[...units];if(unitIds.length){const marks=unitIds.map(()=>'?').join(',');const r=await env.DB.prepare(`SELECT DISTINCT course_id FROM course_org_units WHERE tenant_id=? AND org_unit_id IN (${marks})`).bind(tenantId,...unitIds).all<{course_id:string}>();for(const x of r.results??[])courses.add(x.course_id);}
  return{orgUnitIds:unitIds,courseIds:[...courses],permissions:[...perms],grants:gs,responsibilities:rs};
}

export async function augmentOrgAuth(env:Env,auth:CoreAuthContext,tenantId?:string):Promise<CoreAuthContext>{
  if(auth.isPlatformAdmin)return auth;
  const tenantIds=new Set(auth.tenantIds),courseIds=new Set(auth.courseIds),orgUnitIds=new Set(auth.orgUnitIds??[]),permissions=new Set(auth.permissions??[]);
  let targets:string[]=[];
  if(tenantId)targets=[tenantId];
  else{
    try{const now=nowIso();const r=await env.DB.prepare(`SELECT DISTINCT tenant_id FROM (SELECT tenant_id FROM org_permission_grants WHERE user_id=? AND status='active' AND (valid_from IS NULL OR valid_from<=?) AND (valid_until IS NULL OR valid_until>?) UNION ALL SELECT tenant_id FROM responsibility_assignments WHERE user_id=? AND status='active' AND (valid_from IS NULL OR valid_from<=?) AND (valid_until IS NULL OR valid_until>?))`).bind(auth.userId,now,now,auth.userId,now,now).all<{tenant_id:string}>();targets=(r.results??[]).map(x=>x.tenant_id);}catch{return auth;}
  }
  for(const tid of targets){const x=await effectiveOrgAccess(env,auth.userId,tid);if(x.orgUnitIds.length||x.courseIds.length||x.permissions.length){tenantIds.add(tid);for(const id of x.orgUnitIds)orgUnitIds.add(id);for(const id of x.courseIds)courseIds.add(id);for(const p of x.permissions)permissions.add(p);}}
  let role=auth.role;
  if(role==='guest'||role==='participant'){
    if(permissions.has('content.manage')||permissions.has('participants.manage')||permissions.has('courses.manage')||permissions.has('org.manage'))role='class_admin';
  }
  return{...auth,role,tenantIds:[...tenantIds],courseIds:[...courseIds],orgUnitIds:[...orgUnitIds],permissions:[...permissions]};
}

export function hasPermission(auth:CoreAuthContext,permission:OrgPermission):boolean{return auth.isPlatformAdmin||auth.role==='tenant_admin'||new Set(auth.permissions??[]).has(permission);}
export function requirePermission(auth:CoreAuthContext,permission:OrgPermission):void{if(!hasPermission(auth,permission))throw new Error('FORBIDDEN_PERMISSION');}

export async function isOrgUnitWithin(env:Env,tenantId:string,rootId:string,targetId:string):Promise<boolean>{
  if(rootId===targetId)return true;const r=await env.DB.prepare(`WITH RECURSIVE tree(id) AS (SELECT id FROM org_units WHERE tenant_id=? AND id=? UNION ALL SELECT o.id FROM org_units o JOIN tree t ON o.parent_id=t.id WHERE o.tenant_id=?) SELECT 1 AS ok FROM tree WHERE id=? LIMIT 1`).bind(tenantId,rootId,tenantId,targetId).first<{ok:number}>();return !!r;
}

export async function canManageOrgUnit(env:Env,auth:CoreAuthContext,tenantId:string,targetId:string,permission:OrgPermission='org.manage'):Promise<boolean>{
  if(auth.isPlatformAdmin||auth.role==='tenant_admin')return true;
  const now=nowIso(),r=await env.DB.prepare(`SELECT org_unit_id,profile,permissions_json,inherit_descendants FROM org_permission_grants WHERE tenant_id=? AND user_id=? AND status='active' AND (valid_from IS NULL OR valid_from<=?) AND (valid_until IS NULL OR valid_until>?)`).bind(tenantId,auth.userId,now,now).all<Record<string,unknown>>();
  for(const g of r.results??[]){const ps=profilePermissions(String(g.profile) as OrgProfile,g.permissions_json);if(!ps.includes(permission))continue;const root=String(g.org_unit_id);if(root===targetId||Number(g.inherit_descendants)===1&&await isOrgUnitWithin(env,tenantId,root,targetId))return true;}
  try{const rr=await env.DB.prepare(`SELECT org_unit_id,responsibility_kind,inherit_descendants FROM responsibility_assignments WHERE tenant_id=? AND user_id=? AND org_unit_id IS NOT NULL AND status='active' AND (valid_from IS NULL OR valid_from<=?) AND (valid_until IS NULL OR valid_until>?)`).bind(tenantId,auth.userId,now,now).all<Record<string,unknown>>();for(const a of rr.results??[]){if(!responsibilityPermissions(String(a.responsibility_kind) as ResponsibilityKind).includes(permission))continue;const root=String(a.org_unit_id);if(root===targetId||Number(a.inherit_descendants)===1&&await isOrgUnitWithin(env,tenantId,root,targetId))return true;}}catch{}
  return false;
}

export async function requireOrgUnitPermission(env:Env,auth:CoreAuthContext,tenantId:string,targetId:string,permission:OrgPermission):Promise<void>{if(!await canManageOrgUnit(env,auth,tenantId,targetId,permission))throw new Error('FORBIDDEN_ORG_SCOPE');}

export async function ensureTenantUser(env:Env,tenantId:string,userId:string,source:'manual'|'scim'|'sso'|'import'='manual',externalId?:string|null){
  const ts=nowIso();await env.DB.prepare(`INSERT INTO tenant_users(tenant_id,user_id,status,external_id,source,created_at,updated_at) VALUES(?,?,'active',?,?,?,?)
    ON CONFLICT(tenant_id,user_id) DO UPDATE SET status='active',external_id=COALESCE(excluded.external_id,tenant_users.external_id),updated_at=excluded.updated_at`).bind(tenantId,userId,externalId??null,source,ts,ts).run();
}

export async function tenantUserActive(env:Env,tenantId:string,userId:string):Promise<boolean>{
  try{const x=await env.DB.prepare("SELECT status FROM tenant_users WHERE tenant_id=? AND user_id=?").bind(tenantId,userId).first<{status:string}>();return !x||x.status==='active';}catch{return true;}
}
