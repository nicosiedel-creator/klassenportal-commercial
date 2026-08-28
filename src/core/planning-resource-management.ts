import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { hasPermission } from './enterprise-access.js';
import { id, nowIso, safeString } from './utils.js';

const SUBTYPES=['teaching_room','computer_room','exam_room','meeting_room','workshop','lab','event_space','office','storage','outdoor','equipment','vehicle','online_room','other'] as const;
type Subtype=(typeof SUBTYPES)[number];

function admin(auth:CoreAuthContext){return auth.isPlatformAdmin||auth.role==='tenant_admin';}
function requireManage(auth:CoreAuthContext){if(!admin(auth)&&!hasPermission(auth,'courses.manage'))throw new Error('FORBIDDEN_PLANNING_MANAGE');}
function optional(v:unknown,max=4000){return safeString(v,max)||null;}
function required(v:unknown,max=400){const s=safeString(v,max);if(!s)throw new Error('FIELD_REQUIRED');return s;}
function subtype(v:unknown):Subtype{const value=String(v||'teaching_room') as Subtype;if(!SUBTYPES.includes(value))throw new Error('RESOURCE_SUBTYPE_INVALID');return value;}
function coarseType(value:Subtype){if(['equipment'].includes(value))return'equipment';if(['vehicle'].includes(value))return'vehicle';if(['online_room'].includes(value))return'online_room';if(value==='other')return'other';return'room';}
function capacityValue(input:unknown,kind:Subtype){if(input===null||input===''||input===undefined)return null;const n=Math.floor(Number(input));if(!Number.isFinite(n)||n<0)throw new Error('RESOURCE_CAPACITY_INVALID');if(!['equipment','vehicle','online_room','other'].includes(kind)&&n<1)throw new Error('RESOURCE_CAPACITY_INVALID');return n;}
function featuresValue(input:Record<string,unknown>){if(Array.isArray(input.features))return JSON.stringify(input.features.map(v=>safeString(v,160)).filter(Boolean).slice(0,100));const raw=optional(input.features_json,5000);if(!raw)return null;try{const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw new Error();return JSON.stringify(parsed.map(v=>safeString(v,160)).filter(Boolean).slice(0,100));}catch{throw new Error('RESOURCE_FEATURES_INVALID');}}

export async function listPlanningResourcesManaged(env:Env,auth:CoreAuthContext,tenantId:string){
  requireManage(auth);
  return(await env.DB.prepare(`SELECT r.*,
    -- Die Anwendung schreibt ISO-8601 mit T und Z; datetime('now') liefert dagegen
    -- "YYYY-MM-DD HH:MM:SS". Am selben Tag sortiert deshalb jeder gespeicherte Zeitpunkt
    -- danach, und schon beendete Sperren zählten weiter als bevorstehend.
    (SELECT COUNT(*) FROM planning_resource_unavailability u WHERE u.tenant_id=r.tenant_id AND u.resource_id=r.id AND u.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) future_blocks,
    (SELECT COUNT(*) FROM lesson_resource_reservations rr JOIN lessons l ON l.id=rr.lesson_id AND l.tenant_id=rr.tenant_id WHERE rr.tenant_id=r.tenant_id AND rr.resource_id=r.id AND l.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) future_reservations
    FROM planning_resources r WHERE r.tenant_id=?
    ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'maintenance' THEN 1 ELSE 2 END,
             CASE r.resource_type WHEN 'room' THEN 0 WHEN 'online_room' THEN 1 ELSE 2 END,r.name`).bind(tenantId).all<Record<string,unknown>>()).results??[];
}

export async function savePlanningResourceManaged(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireManage(auth);
  const resourceId=optional(input.id,120)||id('res_'),kind=subtype(input.resource_subtype||input.subtype||input.type),resourceType=coarseType(kind),name=required(input.name,300),status=String(input.status||'active');
  if(!['active','inactive','maintenance'].includes(status))throw new Error('RESOURCE_STATUS_INVALID');
  const duplicate=await env.DB.prepare('SELECT id FROM planning_resources WHERE tenant_id=? AND resource_type=? AND lower(trim(name))=lower(trim(?)) AND id<>? LIMIT 1').bind(tenantId,resourceType,name,resourceId).first<{id:string}>();
  if(duplicate)throw new Error('RESOURCE_NAME_EXISTS');
  const capacity=capacityValue(input.capacity,kind),features=featuresValue(input),ts=nowIso(),found=await env.DB.prepare('SELECT 1 ok FROM planning_resources WHERE tenant_id=? AND id=?').bind(tenantId,resourceId).first();
  if(found){
    await env.DB.prepare('UPDATE planning_resources SET resource_type=?,resource_subtype=?,name=?,code=?,location=?,capacity=?,features_json=?,status=?,updated_at=? WHERE tenant_id=? AND id=?').bind(resourceType,kind,name,optional(input.code,120),optional(input.location,500),capacity,features,status,ts,tenantId,resourceId).run();
  }else{
    await env.DB.prepare('INSERT INTO planning_resources(id,tenant_id,resource_type,resource_subtype,name,code,location,capacity,features_json,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(resourceId,tenantId,resourceType,kind,name,optional(input.code,120),optional(input.location,500),capacity,features,status,auth.userId,ts,ts).run();
  }
  await audit(env.DB,auth.userId,'planning.resource_saved',tenantId,undefined,'planning_resource',resourceId,{resource_type:resourceType,resource_subtype:kind,status,capacity});
  return{resource_id:resourceId};
}

export async function listResourceUnavailabilityManaged(env:Env,auth:CoreAuthContext,tenantId:string){
  requireManage(auth);
  return(await env.DB.prepare(`SELECT u.*,r.name resource_name,r.resource_subtype
    FROM planning_resource_unavailability u
    JOIN planning_resources r ON r.id=u.resource_id AND r.tenant_id=u.tenant_id
    WHERE u.tenant_id=? AND u.ends_at>=datetime('now','-60 day')
    ORDER BY u.starts_at LIMIT 1000`).bind(tenantId).all<Record<string,unknown>>()).results??[];
}

export async function listPlanningTeachersManaged(env:Env,auth:CoreAuthContext,tenantId:string){
  requireManage(auth);
  return(await env.DB.prepare('SELECT id,name FROM teachers WHERE tenant_id=? ORDER BY name LIMIT 2000').bind(tenantId).all<{id:string;name:string}>()).results??[];
}
