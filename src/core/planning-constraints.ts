import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { hasPermission } from './enterprise-access.js';
import { getTimetablePlan, publishTimetablePlan, saveTimetablePlanEntry, validateTimetablePlan } from './learning-operations.js';
import { id, nowIso, safeString } from './utils.js';

function admin(auth:CoreAuthContext){return auth.isPlatformAdmin||auth.role==='tenant_admin';}
function requireManage(auth:CoreAuthContext){if(!admin(auth)&&!hasPermission(auth,'courses.manage'))throw new Error('FORBIDDEN_PLANNING_MANAGE');}
function courseScope(auth:CoreAuthContext,courseId:string){if(!admin(auth)&&!auth.courseIds.includes(courseId))throw new Error('FORBIDDEN_COURSE_SCOPE');}
function required(v:unknown,max=400){const s=safeString(v,max);if(!s)throw new Error('FIELD_REQUIRED');return s;}
function optional(v:unknown,max=4000){return safeString(v,max)||null;}
function iso(v:unknown){const s=safeString(v,50);if(!s)return null;const d=new Date(s);if(Number.isNaN(d.getTime()))throw new Error('DATE_INVALID');return d.toISOString();}
function bool(v:unknown){return v===true||v===1||String(v)==='1'?1:0;}
function enumValue<T extends readonly string[]>(v:unknown,allowed:T,fallback:T[number]):T[number]{const x=String(v||fallback);if(!allowed.includes(x as T[number]))throw new Error('ENUM_VALUE_INVALID');return x as T[number];}
function minutes(start:string,end:string){return Math.max(0,Math.round((Date.parse(end)-Date.parse(start))/60000));}
function dateKey(v:string){return String(v).slice(0,10);}
function mondayKey(v:string){const d=new Date(v),day=(d.getUTCDay()+6)%7;d.setUTCDate(d.getUTCDate()-day);return d.toISOString().slice(0,10);}
function localTime(v:string){return String(v).slice(11,16);}
function overlaps(aStart:string,aEnd:string,bStart:string,bEnd:string){return aStart<bEnd&&bStart<aEnd;}

export async function listPlanningResources(env:Env,auth:CoreAuthContext,tenantId:string){requireManage(auth);return(await env.DB.prepare(`SELECT r.*,(SELECT COUNT(*) FROM planning_resource_unavailability u WHERE u.tenant_id=r.tenant_id AND u.resource_id=r.id AND u.ends_at>strftime('%Y-%m-%dT%H:%M:%fZ','now')) future_blocks FROM planning_resources r WHERE r.tenant_id=? ORDER BY CASE r.resource_type WHEN 'room' THEN 0 WHEN 'online_room' THEN 1 ELSE 2 END,r.name`).bind(tenantId).all<Record<string,unknown>>()).results??[];}
export async function savePlanningResource(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireManage(auth);const resourceId=optional(input.id,120)||id('res_'),type=enumValue(input.resource_type,['room','equipment','vehicle','online_room','other'] as const,'room'),status=enumValue(input.status,['active','inactive','maintenance'] as const,'active'),ts=nowIso(),found=await env.DB.prepare('SELECT 1 ok FROM planning_resources WHERE tenant_id=? AND id=?').bind(tenantId,resourceId).first();const features=Array.isArray(input.features)?JSON.stringify(input.features.map(String).slice(0,100)):optional(input.features_json,5000),capacity=input.capacity===null||input.capacity===''||input.capacity===undefined?null:Math.max(0,Math.floor(Number(input.capacity)||0));if(found)await env.DB.prepare('UPDATE planning_resources SET resource_type=?,name=?,code=?,location=?,capacity=?,features_json=?,status=?,updated_at=? WHERE tenant_id=? AND id=?').bind(type,required(input.name,300),optional(input.code,120),optional(input.location,500),capacity,features,status,ts,tenantId,resourceId).run();else await env.DB.prepare('INSERT INTO planning_resources(id,tenant_id,resource_type,name,code,location,capacity,features_json,status,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(resourceId,tenantId,type,required(input.name,300),optional(input.code,120),optional(input.location,500),capacity,features,status,auth.userId,ts,ts).run();await audit(env.DB,auth.userId,'planning.resource_saved',tenantId,undefined,'planning_resource',resourceId,{type,status,capacity});return{resource_id:resourceId};}
export async function saveResourceUnavailability(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireManage(auth);const resourceId=required(input.resource_id,120),starts=iso(input.starts_at),ends=iso(input.ends_at);if(!starts||!ends||starts>=ends)throw new Error('RESOURCE_BLOCK_TIME_INVALID');if(!await env.DB.prepare('SELECT 1 ok FROM planning_resources WHERE tenant_id=? AND id=?').bind(tenantId,resourceId).first())throw new Error('RESOURCE_NOT_FOUND');const blockId=optional(input.id,120)||id('rblk_'),source=enumValue(input.source,['manual','maintenance','external','automation'] as const,'manual'),ts=nowIso();await env.DB.prepare('INSERT INTO planning_resource_unavailability(id,tenant_id,resource_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,reason=excluded.reason,source=excluded.source,updated_at=excluded.updated_at').bind(blockId,tenantId,resourceId,starts,ends,optional(input.reason,2000),source,auth.userId,ts,ts).run();return{block_id:blockId};}

export async function saveTeacherUnavailability(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireManage(auth);const teacherId=required(input.teacher_id,120),starts=iso(input.starts_at),ends=iso(input.ends_at);if(!starts||!ends||starts>=ends)throw new Error('TEACHER_BLOCK_TIME_INVALID');if(!await env.DB.prepare('SELECT 1 ok FROM teachers WHERE tenant_id=? AND id=?').bind(tenantId,teacherId).first())throw new Error('TEACHER_NOT_FOUND');const blockId=optional(input.id,120)||id('tblk_'),source=enumValue(input.source,['manual','sickness','vacation','training','external','automation'] as const,'manual'),ts=nowIso();await env.DB.prepare('INSERT INTO teacher_unavailability(id,tenant_id,teacher_id,starts_at,ends_at,reason,source,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at,reason=excluded.reason,source=excluded.source,updated_at=excluded.updated_at').bind(blockId,tenantId,teacherId,starts,ends,optional(input.reason,2000),source,auth.userId,ts,ts).run();return{block_id:blockId};}
export async function listTeacherUnavailability(env:Env,auth:CoreAuthContext,tenantId:string){requireManage(auth);return(await env.DB.prepare(`SELECT u.*,t.name teacher_name FROM teacher_unavailability u JOIN teachers t ON t.id=u.teacher_id AND t.tenant_id=u.tenant_id WHERE u.tenant_id=? AND u.ends_at>=datetime('now','-60 day') ORDER BY u.starts_at LIMIT 1000`).bind(tenantId).all<Record<string,unknown>>()).results??[];}

export async function savePlanningBlackout(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireManage(auth);const blackoutId=optional(input.id,120)||id('blk_'),courseId=optional(input.course_id,120),starts=iso(input.starts_at),ends=iso(input.ends_at);if(courseId)courseScope(auth,courseId);if(!starts||!ends||starts>=ends)throw new Error('BLACKOUT_TIME_INVALID');const type=enumValue(input.blackout_type,['holiday','closure','exam_block','practice_block','maintenance','other'] as const,'closure'),ts=nowIso();await env.DB.prepare('INSERT INTO planning_blackouts(id,tenant_id,course_id,title,starts_at,ends_at,blackout_type,blocks_teaching,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET course_id=excluded.course_id,title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,blackout_type=excluded.blackout_type,blocks_teaching=excluded.blocks_teaching,updated_at=excluded.updated_at').bind(blackoutId,tenantId,courseId,required(input.title,300),starts,ends,type,bool(input.blocks_teaching??true),auth.userId,ts,ts).run();return{blackout_id:blackoutId};}
export async function listPlanningBlackouts(env:Env,auth:CoreAuthContext,tenantId:string){requireManage(auth);return(await env.DB.prepare(`SELECT b.*,c.name course_name FROM planning_blackouts b LEFT JOIN courses c ON c.id=b.course_id AND c.tenant_id=b.tenant_id WHERE b.tenant_id=? AND b.ends_at>=datetime('now','-180 day') ORDER BY b.starts_at LIMIT 1000`).bind(tenantId).all<Record<string,unknown>>()).results??[];}

export async function getCourseSchedulingRules(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){requireManage(auth);courseScope(auth,courseId);return await env.DB.prepare('SELECT * FROM course_scheduling_rules WHERE tenant_id=? AND course_id=?').bind(tenantId,courseId).first<Record<string,unknown>>()||{tenant_id:tenantId,course_id:courseId};}
export async function saveCourseSchedulingRules(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){requireManage(auth);courseScope(auth,courseId);const ts=nowIso(),earliest=optional(input.earliest_start,5),latest=optional(input.latest_end,5);if(earliest&&!/^\d\d:\d\d$/.test(earliest)||latest&&!/^\d\d:\d\d$/.test(latest))throw new Error('SCHEDULING_TIME_INVALID');const num=(v:unknown)=>v===null||v===''||v===undefined?null:Math.max(0,Math.floor(Number(v)||0));await env.DB.prepare(`INSERT INTO course_scheduling_rules(tenant_id,course_id,earliest_start,latest_end,max_daily_minutes,max_consecutive_minutes,min_break_minutes,allow_saturday,allow_sunday,default_lesson_minutes,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,course_id) DO UPDATE SET earliest_start=excluded.earliest_start,latest_end=excluded.latest_end,max_daily_minutes=excluded.max_daily_minutes,max_consecutive_minutes=excluded.max_consecutive_minutes,min_break_minutes=excluded.min_break_minutes,allow_saturday=excluded.allow_saturday,allow_sunday=excluded.allow_sunday,default_lesson_minutes=excluded.default_lesson_minutes,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(tenantId,courseId,earliest,latest,num(input.max_daily_minutes),num(input.max_consecutive_minutes),num(input.min_break_minutes),bool(input.allow_saturday),bool(input.allow_sunday),num(input.default_lesson_minutes),auth.userId,ts).run();return getCourseSchedulingRules(env,auth,tenantId,courseId);}
export async function saveTeacherWorkloadRules(env:Env,auth:CoreAuthContext,tenantId:string,teacherId:string,input:Record<string,unknown>){requireManage(auth);if(!await env.DB.prepare('SELECT 1 ok FROM teachers WHERE tenant_id=? AND id=?').bind(tenantId,teacherId).first())throw new Error('TEACHER_NOT_FOUND');const num=(v:unknown)=>v===null||v===''||v===undefined?null:Math.max(0,Math.floor(Number(v)||0)),ts=nowIso();await env.DB.prepare(`INSERT INTO teacher_workload_rules(tenant_id,teacher_id,max_daily_minutes,max_weekly_minutes,max_consecutive_minutes,min_break_minutes,updated_by,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,teacher_id) DO UPDATE SET max_daily_minutes=excluded.max_daily_minutes,max_weekly_minutes=excluded.max_weekly_minutes,max_consecutive_minutes=excluded.max_consecutive_minutes,min_break_minutes=excluded.min_break_minutes,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(tenantId,teacherId,num(input.max_daily_minutes),num(input.max_weekly_minutes),num(input.max_consecutive_minutes),num(input.min_break_minutes),auth.userId,ts).run();return{teacher_id:teacherId};}

export async function linkPlanEntryResource(env:Env,auth:CoreAuthContext,tenantId:string,planId:string,entryId:string,input:Record<string,unknown>){requireManage(auth);const resourceId=required(input.resource_id,120),quantity=Math.max(1,Math.floor(Number(input.quantity||1)||1));if(!await env.DB.prepare('SELECT 1 ok FROM timetable_plan_entries WHERE tenant_id=? AND plan_id=? AND id=?').bind(tenantId,planId,entryId).first())throw new Error('PLAN_ENTRY_NOT_FOUND');if(!await env.DB.prepare("SELECT 1 ok FROM planning_resources WHERE tenant_id=? AND id=? AND status='active'").bind(tenantId,resourceId).first())throw new Error('RESOURCE_NOT_AVAILABLE');await env.DB.prepare('INSERT INTO timetable_plan_entry_resources(tenant_id,plan_id,entry_id,resource_id,quantity,created_by,created_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(tenant_id,entry_id,resource_id) DO UPDATE SET quantity=excluded.quantity').bind(tenantId,planId,entryId,resourceId,quantity,auth.userId,nowIso()).run();return{entry_id:entryId,resource_id:resourceId};}

async function addConflict(env:Env,tenantId:string,planId:string,entryId:string,type:string,severity:'warning'|'error',message:string,otherId?:string|null){await env.DB.prepare('INSERT INTO timetable_plan_conflicts(id,tenant_id,plan_id,entry_id,conflicting_entry_id,conflict_type,severity,message,detected_at,resolved_at) VALUES(?,?,?,?,?,?,?,?,?,NULL)').bind(id('tpc_'),tenantId,planId,entryId,otherId||null,type,severity,message,nowIso()).run();}

export async function validateAdvancedTimetablePlan(env:Env,auth:CoreAuthContext,tenantId:string,planId:string){
  requireManage(auth);const base=await validateTimetablePlan(env,auth,tenantId,planId),data=await getTimetablePlan(env,auth,tenantId,planId),entries=data.entries as any[],issues:Array<{entry_id:string;type:string;severity:'warning'|'error';message:string}>=[];
  const add=async(e:any,type:string,severity:'warning'|'error',message:string,otherId?:string|null)=>{issues.push({entry_id:String(e.id),type,severity,message});await addConflict(env,tenantId,planId,String(e.id),type,severity,message,otherId);};
  const courseRules=new Map<string,any>(),teacherRules=new Map<string,any>();
  for(const e of entries){
    const start=String(e.starts_at),end=String(e.ends_at),day=dateKey(start),dow=new Date(start).getUTCDay();
    if(!courseRules.has(String(e.course_id)))courseRules.set(String(e.course_id),await env.DB.prepare('SELECT * FROM course_scheduling_rules WHERE tenant_id=? AND course_id=?').bind(tenantId,e.course_id).first<Record<string,unknown>>());const rule=courseRules.get(String(e.course_id));
    if(rule){if(rule.earliest_start&&localTime(start)<String(rule.earliest_start))await add(e,'course_time_window','warning',`Beginn ${localTime(start)} liegt vor der gewünschten Startzeit ${rule.earliest_start}.`);if(rule.latest_end&&localTime(end)>String(rule.latest_end))await add(e,'course_time_window','warning',`Ende ${localTime(end)} liegt nach der gewünschten Endzeit ${rule.latest_end}.`);if(dow===6&&!Number(rule.allow_saturday))await add(e,'weekend_not_allowed','error','Samstagsunterricht ist für diesen Kurs nicht freigegeben.');if(dow===0&&!Number(rule.allow_sunday))await add(e,'weekend_not_allowed','error','Sonntagsunterricht ist für diesen Kurs nicht freigegeben.');}
    const blackouts=(await env.DB.prepare(`SELECT title,blackout_type FROM planning_blackouts WHERE tenant_id=? AND blocks_teaching=1 AND (course_id IS NULL OR course_id=?) AND starts_at<? AND ends_at>?`).bind(tenantId,e.course_id,end,start).all<Record<string,unknown>>()).results??[];for(const b of blackouts)await add(e,'planning_blackout','error',`Termin liegt in Sperrzeit: ${String(b.title)} (${String(b.blackout_type)}).`);
    if(e.teacher_id){const blocks=(await env.DB.prepare('SELECT reason FROM teacher_unavailability WHERE tenant_id=? AND teacher_id=? AND starts_at<? AND ends_at>?').bind(tenantId,e.teacher_id,end,start).all<Record<string,unknown>>()).results??[];for(const b of blocks)await add(e,'teacher_unavailable','error',`Dozent/in ist nicht verfügbar${b.reason?`: ${String(b.reason)}`:''}.`);if(!teacherRules.has(String(e.teacher_id)))teacherRules.set(String(e.teacher_id),await env.DB.prepare('SELECT * FROM teacher_workload_rules WHERE tenant_id=? AND teacher_id=?').bind(tenantId,e.teacher_id).first<Record<string,unknown>>());
      // Hat die Person Arbeitszeiten zugesagt, darf ausserhalb davon nicht stillschweigend
      // geplant werden. Bewusst ein Hinweis und kein Fehler: eine Absprache im Einzelfall soll
      // moeglich bleiben, sie muss nur sichtbar sein.
      const zusagen=Number((await env.DB.prepare('SELECT COUNT(*) n FROM teacher_availability WHERE tenant_id=? AND teacher_id=?').bind(tenantId,e.teacher_id).first<{n:number}>())?.n||0);
      if(zusagen){const passend=await env.DB.prepare(`SELECT 1 ok FROM teacher_availability av WHERE av.tenant_id=? AND av.teacher_id=? AND av.weekday=? AND av.starts_time<=? AND av.ends_time>=? AND (av.valid_from IS NULL OR av.valid_from<=?) AND (av.valid_until IS NULL OR av.valid_until>=?) LIMIT 1`).bind(tenantId,e.teacher_id,wochentag(start),localTime(start),localTime(end),day,day).first();
        if(!passend)await add(e,'teacher_outside_availability','warning','Der Termin liegt außerhalb der zugesagten Arbeitszeiten dieser Dozentin oder dieses Dozenten.');}}
    const participantCount=Number((await env.DB.prepare("SELECT COUNT(DISTINCT user_id) n FROM memberships WHERE tenant_id=? AND course_id=? AND role IN ('participant','class_admin')").bind(tenantId,e.course_id).first<{n:number}>())?.n||0);
    let resources=(await env.DB.prepare(`SELECT r.* FROM timetable_plan_entry_resources pr JOIN planning_resources r ON r.id=pr.resource_id AND r.tenant_id=pr.tenant_id WHERE pr.tenant_id=? AND pr.plan_id=? AND pr.entry_id=?`).bind(tenantId,planId,e.id).all<Record<string,unknown>>()).results??[];
    if(!resources.length&&e.room){const r=await env.DB.prepare("SELECT * FROM planning_resources WHERE tenant_id=? AND resource_type='room' AND status='active' AND (lower(name)=lower(?) OR lower(code)=lower(?)) LIMIT 1").bind(tenantId,String(e.room),String(e.room)).first<Record<string,unknown>>();if(r)resources=[r];}
    for(const r of resources){if(String(r.status)!=='active')await add(e,'resource_inactive','error',`Ressource ${String(r.name)} ist nicht aktiv.`);if(r.capacity!==null&&r.capacity!==undefined&&participantCount>Number(r.capacity))await add(e,'resource_capacity','error',`${String(r.name)} hat nur ${Number(r.capacity)} Plätze für ${participantCount} Teilnehmende.`);const unavailable=await env.DB.prepare('SELECT reason FROM planning_resource_unavailability WHERE tenant_id=? AND resource_id=? AND starts_at<? AND ends_at>? LIMIT 1').bind(tenantId,r.id,end,start).first<Record<string,unknown>>();if(unavailable)await add(e,'resource_unavailable','error',`${String(r.name)} ist nicht verfügbar${unavailable.reason?`: ${String(unavailable.reason)}`:''}.`);const planned=(await env.DB.prepare(`SELECT pe.id FROM timetable_plan_entry_resources pr JOIN timetable_plan_entries pe ON pe.id=pr.entry_id AND pe.tenant_id=pr.tenant_id WHERE pr.tenant_id=? AND pr.plan_id=? AND pr.resource_id=? AND pe.id<>? AND pe.starts_at<? AND pe.ends_at>? LIMIT 1`).bind(tenantId,planId,r.id,e.id,end,start).first<{id:string}>());if(planned)await add(e,'resource_overlap','error',`${String(r.name)} ist im selben Plan bereits belegt.`,planned.id);const published=await env.DB.prepare(`SELECT l.id FROM lesson_resource_reservations rr JOIN lessons l ON l.id=rr.lesson_id AND l.tenant_id=rr.tenant_id WHERE rr.tenant_id=? AND rr.resource_id=? AND l.starts_at<? AND l.ends_at>? LIMIT 1`).bind(tenantId,r.id,end,start).first<{id:string}>();if(published)await add(e,'resource_overlap','error',`${String(r.name)} ist durch veröffentlichten Unterricht belegt.`);}
    void day;
  }
  for(const [courseId,rule] of courseRules){if(!rule?.max_daily_minutes)continue;const days=new Map<string,number>();for(const e of entries.filter(x=>String(x.course_id)===courseId)){const k=dateKey(String(e.starts_at));days.set(k,(days.get(k)||0)+minutes(String(e.starts_at),String(e.ends_at)));}for(const [d,total] of days)if(total>Number(rule.max_daily_minutes)){const e=entries.find(x=>String(x.course_id)===courseId&&dateKey(String(x.starts_at))===d);if(e)await add(e,'course_daily_limit','warning',`Geplante Unterrichtszeit ${total} Min. überschreitet das Tagesziel ${rule.max_daily_minutes} Min.`);}}
  for(const [teacherId,rule] of teacherRules){if(!rule)continue;const teacherEntries=entries.filter(x=>String(x.teacher_id||'')===teacherId),days=new Map<string,number>(),weeks=new Map<string,number>();for(const e of teacherEntries){const m=minutes(String(e.starts_at),String(e.ends_at)),d=dateKey(String(e.starts_at)),w=mondayKey(String(e.starts_at));days.set(d,(days.get(d)||0)+m);weeks.set(w,(weeks.get(w)||0)+m);}if(rule.max_daily_minutes)for(const [d,total] of days)if(total>Number(rule.max_daily_minutes)){const e=teacherEntries.find(x=>dateKey(String(x.starts_at))===d);if(e)await add(e,'teacher_daily_limit','warning',`Dozentenbelastung ${total} Min. überschreitet Tagesgrenze ${rule.max_daily_minutes} Min.`);}if(rule.max_weekly_minutes)for(const [w,total] of weeks)if(total>Number(rule.max_weekly_minutes)){const e=teacherEntries.find(x=>mondayKey(String(x.starts_at))===w);if(e)await add(e,'teacher_weekly_limit','warning',`Dozentenbelastung ${total} Min. überschreitet Wochengrenze ${rule.max_weekly_minutes} Min.`);}}
  const errors=Number(base.errors||0)+issues.filter(x=>x.severity==='error').length,warnings=Number(base.warnings||0)+issues.filter(x=>x.severity==='warning').length;await audit(env.DB,auth.userId,'planning.advanced_validated',tenantId,undefined,'timetable_plan',planId,{errors,warnings,advancedIssues:issues.length});return{issues:[...(base.issues||[]),...issues],errors,warnings};
}

async function reservePublishedResources(env:Env,tenantId:string,planId:string){const data=await env.DB.prepare(`SELECT e.id,e.published_lesson_id,e.room FROM timetable_plan_entries e WHERE e.tenant_id=? AND e.plan_id=? AND e.published_lesson_id IS NOT NULL`).bind(tenantId,planId).all<Record<string,unknown>>();for(const e of data.results??[]){let resources=(await env.DB.prepare('SELECT resource_id,quantity FROM timetable_plan_entry_resources WHERE tenant_id=? AND plan_id=? AND entry_id=?').bind(tenantId,planId,e.id).all<{resource_id:string;quantity:number}>()).results??[];if(!resources.length&&e.room){const r=await env.DB.prepare("SELECT id FROM planning_resources WHERE tenant_id=? AND resource_type='room' AND status='active' AND (lower(name)=lower(?) OR lower(code)=lower(?)) LIMIT 1").bind(tenantId,String(e.room),String(e.room)).first<{id:string}>();if(r)resources=[{resource_id:r.id,quantity:1}];}for(const r of resources)await env.DB.prepare('INSERT OR IGNORE INTO lesson_resource_reservations(tenant_id,lesson_id,resource_id,quantity,source_plan_id,created_at) VALUES(?,?,?,?,?,?)').bind(tenantId,String(e.published_lesson_id),r.resource_id,r.quantity||1,planId,nowIso()).run();}}
export async function publishAdvancedTimetablePlan(env:Env,auth:CoreAuthContext,tenantId:string,planId:string){const validation=await validateAdvancedTimetablePlan(env,auth,tenantId,planId);if(validation.errors)throw new Error('TIMETABLE_PLAN_HAS_CONFLICTS');const result=await publishTimetablePlan(env,auth,tenantId,planId);await reservePublishedResources(env,tenantId,planId);return{...result,validation};}

// Wann eine Dozentin oder ein Dozent arbeiten MOECHTE - fuer Honorarkraefte der eigentliche
// Planungsschluessel. Bewusst opt-in: wer kein Fenster angibt, wird geplant wie bisher. Erst wer
// mindestens eines angibt, wird ausschliesslich innerhalb seiner Fenster vorgeschlagen.
//
// Wochentag und Uhrzeit werden - wie im ganzen Planungsmodul - aus der Zeichenkette des Termins
// gelesen. Das ist dieselbe Rechnung, die auch die Kursregeln (earliest_start/latest_end) und die
// Konfliktpruefung verwenden; alles bleibt damit in einer einzigen, durchgaengigen Zeitrechnung.
function wochentag(iso:string){const d=new Date(iso);if(Number.isNaN(d.getTime()))throw new Error('DATE_INVALID');return((d.getUTCDay()+6)%7)+1;}
const AVAILABILITY_MAX_PER_TEACHER=200;
function zeitFeld(v:unknown,fehler:string){const t=safeString(v,5);if(!t||!/^\d\d:\d\d$/.test(t))throw new Error(fehler);return t;}
async function assertTeacherSelfOrManage(env:Env,auth:CoreAuthContext,tenantId:string,teacherId:string){
  if(admin(auth)||hasPermission(auth,'courses.manage'))return'admin' as const;
  const eigen=await env.DB.prepare(`SELECT 1 ok FROM teacher_portal_assignments WHERE tenant_id=? AND teacher_id=? AND user_id=? AND status='active' LIMIT 1`).bind(tenantId,teacherId,auth.userId).first();
  if(!eigen)throw new Error('FORBIDDEN_TEACHER_AVAILABILITY');
  return'teacher' as const;
}
export async function listTeacherAvailability(env:Env,auth:CoreAuthContext,tenantId:string,teacherId?:string){
  const gefiltert=safeString(teacherId,120);
  if(gefiltert)await assertTeacherSelfOrManage(env,auth,tenantId,gefiltert);
  else if(!admin(auth)&&!hasPermission(auth,'courses.manage'))throw new Error('FORBIDDEN_TEACHER_AVAILABILITY');
  const sql=`SELECT a.*,t.name teacher_name FROM teacher_availability a JOIN teachers t ON t.id=a.teacher_id AND t.tenant_id=a.tenant_id WHERE a.tenant_id=?${gefiltert?' AND a.teacher_id=?':''} ORDER BY t.name,a.weekday,a.starts_time`;
  const r=gefiltert?await env.DB.prepare(sql).bind(tenantId,gefiltert).all<Record<string,unknown>>():await env.DB.prepare(sql).bind(tenantId).all<Record<string,unknown>>();
  return r.results??[];
}
export async function saveTeacherAvailability(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  const teacherId=required(input.teacher_id,120);
  const quelle=await assertTeacherSelfOrManage(env,auth,tenantId,teacherId);
  const vorhanden=await env.DB.prepare('SELECT 1 ok FROM teachers WHERE tenant_id=? AND id=?').bind(tenantId,teacherId).first();
  if(!vorhanden)throw new Error('TEACHER_NOT_FOUND');
  const weekday=Math.trunc(Number(input.weekday));
  if(!Number.isFinite(weekday)||weekday<1||weekday>7)throw new Error('AVAILABILITY_WEEKDAY_INVALID');
  const start=zeitFeld(input.starts_time,'AVAILABILITY_TIME_INVALID'),ende=zeitFeld(input.ends_time,'AVAILABILITY_TIME_INVALID');
  if(start>=ende)throw new Error('AVAILABILITY_TIME_INVALID');
  const von=safeString(input.valid_from,10)||null,bis=safeString(input.valid_until,10)||null;
  if(von&&bis&&von>bis)throw new Error('AVAILABILITY_PERIOD_INVALID');
  const praeferenz=String(input.preference||'available');
  if(!['available','preferred'].includes(praeferenz))throw new Error('AVAILABILITY_PREFERENCE_INVALID');
  const anzahl=Number((await env.DB.prepare('SELECT COUNT(*) n FROM teacher_availability WHERE tenant_id=? AND teacher_id=?').bind(tenantId,teacherId).first<{n:number}>())?.n||0);
  const eintragId=safeString(input.id,120)||'';
  if(!eintragId&&anzahl>=AVAILABILITY_MAX_PER_TEACHER)throw new Error('AVAILABILITY_TOO_MANY');
  const ts=nowIso();
  if(eintragId){
    const alt=await env.DB.prepare('SELECT teacher_id FROM teacher_availability WHERE tenant_id=? AND id=?').bind(tenantId,eintragId).first<{teacher_id:string}>();
    if(!alt)throw new Error('AVAILABILITY_NOT_FOUND');
    if(alt.teacher_id!==teacherId)throw new Error('AVAILABILITY_NOT_FOUND');
    await env.DB.prepare('UPDATE teacher_availability SET weekday=?,starts_time=?,ends_time=?,valid_from=?,valid_until=?,preference=?,note=?,updated_at=? WHERE tenant_id=? AND id=?')
      .bind(weekday,start,ende,von,bis,praeferenz,safeString(input.note,500)||null,ts,tenantId,eintragId).run();
    await audit(env.DB,auth.userId,'planning.teacher_availability_updated',tenantId,undefined,'teacher_availability',eintragId,{teacherId,weekday,quelle});
    return{availability_id:eintragId};
  }
  const neu=id('tav_');
  await env.DB.prepare('INSERT INTO teacher_availability(id,tenant_id,teacher_id,weekday,starts_time,ends_time,valid_from,valid_until,preference,note,source,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(neu,tenantId,teacherId,weekday,start,ende,von,bis,praeferenz,safeString(input.note,500)||null,quelle==='teacher'?'teacher':'admin',auth.userId,ts,ts).run();
  await audit(env.DB,auth.userId,'planning.teacher_availability_added',tenantId,undefined,'teacher_availability',neu,{teacherId,weekday,quelle});
  return{availability_id:neu};
}
export async function deleteTeacherAvailability(env:Env,auth:CoreAuthContext,tenantId:string,availabilityId:string){
  const row=await env.DB.prepare('SELECT teacher_id FROM teacher_availability WHERE tenant_id=? AND id=?').bind(tenantId,availabilityId).first<{teacher_id:string}>();
  if(!row)throw new Error('AVAILABILITY_NOT_FOUND');
  await assertTeacherSelfOrManage(env,auth,tenantId,row.teacher_id);
  await env.DB.prepare('DELETE FROM teacher_availability WHERE tenant_id=? AND id=?').bind(tenantId,availabilityId).run();
  await audit(env.DB,auth.userId,'planning.teacher_availability_removed',tenantId,undefined,'teacher_availability',availabilityId,{teacherId:row.teacher_id});
  return{availability_id:availabilityId};
}

export async function planningSuggestions(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireManage(auth);const courseId=required(input.course_id,120),starts=iso(input.starts_at),ends=iso(input.ends_at),subjectId=optional(input.subject_id,120);courseScope(auth,courseId);if(!starts||!ends||starts>=ends)throw new Error('SUGGESTION_TIME_INVALID');
  const tag=wochentag(starts),zeitVon=localTime(starts),zeitBis=localTime(ends),datum=dateKey(starts);
  const participantCount=Number((await env.DB.prepare("SELECT COUNT(DISTINCT user_id) n FROM memberships WHERE tenant_id=? AND course_id=? AND role IN ('participant','class_admin')").bind(tenantId,courseId).first<{n:number}>())?.n||0);
  const teachers=(await env.DB.prepare(`SELECT t.id,t.name,t.email,
    CASE WHEN ? IS NOT NULL AND EXISTS(SELECT 1 FROM teacher_qualifications q WHERE q.tenant_id=t.tenant_id AND q.teacher_id=t.id AND q.subject_id=? AND q.status='valid' AND (q.valid_until IS NULL OR q.valid_until>=date('now'))) THEN 1 ELSE 0 END qualified,
    (SELECT COUNT(*) FROM lessons l WHERE l.tenant_id=t.tenant_id AND l.teacher_id=t.id AND l.course_id=?) familiarity,
    (SELECT COALESCE(SUM((julianday(l.ends_at)-julianday(l.starts_at))*1440),0) FROM lessons l WHERE l.tenant_id=t.tenant_id AND l.teacher_id=t.id AND substr(l.starts_at,1,10)=substr(?,1,10)) day_minutes,
    (SELECT COALESCE(MAX(CASE WHEN av.preference='preferred' THEN 1 ELSE 0 END),0) FROM teacher_availability av
      WHERE av.tenant_id=t.tenant_id AND av.teacher_id=t.id AND av.weekday=? AND av.starts_time<=? AND av.ends_time>=?
        AND (av.valid_from IS NULL OR av.valid_from<=?) AND (av.valid_until IS NULL OR av.valid_until>=?)) preferred
    FROM teachers t WHERE t.tenant_id=?
      AND NOT EXISTS(SELECT 1 FROM teacher_unavailability u WHERE u.tenant_id=t.tenant_id AND u.teacher_id=t.id AND u.starts_at<? AND u.ends_at>?)
      AND NOT EXISTS(SELECT 1 FROM lessons l WHERE l.tenant_id=t.tenant_id AND l.teacher_id=t.id AND l.starts_at<? AND l.ends_at>?)
      AND NOT EXISTS(SELECT 1 FROM timetable_plan_entries e JOIN timetable_plan_versions v ON v.id=e.plan_id AND v.tenant_id=e.tenant_id
        WHERE e.tenant_id=t.tenant_id AND e.teacher_id=t.id AND v.status IN ('draft','review') AND e.starts_at<? AND e.ends_at>?
          AND NOT(e.course_id=? AND e.starts_at=? AND e.ends_at=?))
      AND (NOT EXISTS(SELECT 1 FROM teacher_availability av WHERE av.tenant_id=t.tenant_id AND av.teacher_id=t.id)
        OR EXISTS(SELECT 1 FROM teacher_availability av WHERE av.tenant_id=t.tenant_id AND av.teacher_id=t.id
          AND av.weekday=? AND av.starts_time<=? AND av.ends_time>=?
          AND (av.valid_from IS NULL OR av.valid_from<=?) AND (av.valid_until IS NULL OR av.valid_until>=?)))
    ORDER BY qualified DESC,preferred DESC,familiarity DESC,day_minutes ASC,t.name LIMIT 20`).bind(subjectId,subjectId,courseId,starts,tag,zeitVon,zeitBis,datum,datum,tenantId,ends,starts,ends,starts,ends,starts,courseId,starts,ends,tag,zeitVon,zeitBis,datum,datum).all<Record<string,unknown>>()).results??[];
  const rooms=(await env.DB.prepare(`SELECT r.id,r.name,r.code,r.location,r.capacity,r.features_json FROM planning_resources r WHERE r.tenant_id=? AND r.resource_type='room' AND r.status='active' AND (r.capacity IS NULL OR r.capacity>=?) AND NOT EXISTS(SELECT 1 FROM planning_resource_unavailability u WHERE u.tenant_id=r.tenant_id AND u.resource_id=r.id AND u.starts_at<? AND u.ends_at>?) AND NOT EXISTS(SELECT 1 FROM lesson_resource_reservations rr JOIN lessons l ON l.id=rr.lesson_id AND l.tenant_id=rr.tenant_id WHERE rr.tenant_id=r.tenant_id AND rr.resource_id=r.id AND l.starts_at<? AND l.ends_at>?) AND NOT EXISTS(SELECT 1 FROM timetable_plan_entries e JOIN timetable_plan_versions v ON v.id=e.plan_id AND v.tenant_id=e.tenant_id LEFT JOIN timetable_plan_entry_resources pr ON pr.tenant_id=e.tenant_id AND pr.entry_id=e.id WHERE e.tenant_id=r.tenant_id AND v.status IN ('draft','review') AND e.starts_at<? AND e.ends_at>? AND (pr.resource_id=r.id OR lower(COALESCE(e.room,''))=lower(r.name) OR (r.code IS NOT NULL AND r.code<>'' AND lower(COALESCE(e.room,''))=lower(r.code))) AND NOT(e.course_id=? AND e.starts_at=? AND e.ends_at=?)) ORDER BY CASE WHEN r.capacity IS NULL THEN 999999 ELSE r.capacity END,r.name LIMIT 20`).bind(tenantId,participantCount,ends,starts,ends,starts,ends,starts,courseId,starts,ends).all<Record<string,unknown>>()).results??[];return{teachers,rooms,participant_count:participantCount};}

// Erzeugt aus den hinterlegten Kursregeln einen vollstaendigen Stundenplanentwurf.
// Bewusst nur ein Entwurf: es wird nichts veroeffentlicht, nichts im laufenden
// Betrieb veraendert. Wo keine freie Person oder kein freier Raum gefunden wird,
// entsteht KEIN Termin - die Luecke wird benannt, damit sie jemand entscheidet.
const AUTOFILL_MAX_ENTRIES=500,AUTOFILL_MAX_DAYS=400;
function tagSchluessel(d:Date){return d.toISOString().slice(0,10);}
function uhrzeit(v:unknown,fallback:string){const s=safeString(v,5);return s&&/^\d\d:\d\d$/.test(s)?s:fallback;}
export async function autofillTimetablePlan(env:Env,auth:CoreAuthContext,tenantId:string,planId:string,input:Record<string,unknown>){
  requireManage(auth);
  const plan=await env.DB.prepare('SELECT starts_on,ends_on,status FROM timetable_plan_versions WHERE tenant_id=? AND id=?').bind(tenantId,planId).first<{starts_on:string;ends_on:string;status:string}>();
  if(!plan)throw new Error('TIMETABLE_PLAN_NOT_FOUND');
  if(plan.status==='published'||plan.status==='archived')throw new Error('TIMETABLE_PLAN_LOCKED');
  const gewuenscht=Array.isArray(input.course_ids)?[...new Set(input.course_ids.map(x=>safeString(x,120)).filter((x):x is string=>!!x))]:[];
  const alle=(await env.DB.prepare(`SELECT c.id,c.name,r.earliest_start,r.latest_end,r.default_lesson_minutes,r.allow_saturday,r.allow_sunday
    FROM courses c JOIN course_scheduling_rules r ON r.tenant_id=c.tenant_id AND r.course_id=c.id
    WHERE c.tenant_id=? ORDER BY c.name`).bind(tenantId).all<Record<string,unknown>>()).results??[];
  // Ohne ausdrueckliche Liste plant der Lauf, was die aufrufende Person verantwortet - eine
  // Stundenplanung mit begrenztem Bereich koennte sonst nie ohne Liste starten, weil die erste
  // fremde Klasse den ganzen Lauf abbraeche. Wird eine Klasse ausdruecklich genannt, gilt
  // weiterhin: fehlt die Berechtigung, bricht der Lauf ab, statt sie still zu uebergehen.
  const kurse=gewuenscht.length?alle.filter(k=>gewuenscht.includes(String(k.id)))
    :alle.filter(k=>admin(auth)||auth.courseIds.includes(String(k.id)));
  if(gewuenscht.length)for(const k of kurse)courseScope(auth,String(k.id));
  if(!kurse.length)throw new Error('PLAN_AUTOFILL_NO_RULES');
  const von=new Date(`${plan.starts_on}T00:00:00Z`),bis=new Date(`${plan.ends_on}T00:00:00Z`);
  if(Number.isNaN(von.getTime())||Number.isNaN(bis.getTime())||von>bis)throw new Error('PLAN_RANGE_INVALID');
  if((bis.getTime()-von.getTime())/86400000>AUTOFILL_MAX_DAYS)throw new Error('PLAN_RANGE_TOO_LONG');
  let erzeugt=0;const luecken:Array<{course_id:string;course_name:string;date:string;reason:string}>=[];
  for(const gewollt of gewuenscht)if(!kurse.some(k=>String(k.id)===gewollt)){
    courseScope(auth,gewollt);
    const name=await env.DB.prepare('SELECT name FROM courses WHERE tenant_id=? AND id=?').bind(tenantId,gewollt).first<{name:string}>();
    luecken.push({course_id:gewollt,course_name:String(name?.name||''),date:plan.starts_on,reason:name?'NO_COURSE_RULES':'COURSE_NOT_FOUND'});
  }
  const proKurs=new Map<string,number>();
  for(const k of kurse){
    const kursId=String(k.id),kursName=String(k.name||''),
      beginn=uhrzeit(k.earliest_start,'08:00'),dauer=Math.max(15,Math.min(600,Number(k.default_lesson_minutes||0)||90));
    const [bh,bm]=beginn.split(':').map(Number),endeMinuten=bh*60+bm+dauer;
    if(endeMinuten>=24*60){luecken.push({course_id:kursId,course_name:kursName,date:plan.starts_on,reason:'LESSON_EXCEEDS_DAY'});continue;}
    const ende=`${String(Math.floor(endeMinuten/60)).padStart(2,'0')}:${String(endeMinuten%60).padStart(2,'0')}`;
    if(k.latest_end&&ende>String(k.latest_end)){luecken.push({course_id:kursId,course_name:kursName,date:plan.starts_on,reason:'LESSON_AFTER_LATEST_END'});continue;}
    proKurs.set(kursId,0);
    for(let d=new Date(von.getTime());d<=bis;d.setUTCDate(d.getUTCDate()+1)){
      if(erzeugt>=AUTOFILL_MAX_ENTRIES)break;
      const dow=d.getUTCDay(),datum=tagSchluessel(d);
      if(dow===6&&!Number(k.allow_saturday))continue;
      if(dow===0&&!Number(k.allow_sunday))continue;
      const start=`${datum}T${beginn}:00.000Z`,schluss=`${datum}T${ende}:00.000Z`;
      if(await env.DB.prepare('SELECT 1 ok FROM timetable_plan_entries WHERE tenant_id=? AND plan_id=? AND course_id=? AND substr(starts_at,1,10)=? LIMIT 1').bind(tenantId,planId,kursId,datum).first())continue;
      const gesperrt=await env.DB.prepare('SELECT title FROM planning_blackouts WHERE tenant_id=? AND blocks_teaching=1 AND (course_id IS NULL OR course_id=?) AND starts_at<? AND ends_at>? LIMIT 1').bind(tenantId,kursId,schluss,start).first<{title:string}>();
      if(gesperrt)continue;
      const vorschlag=await planningSuggestions(env,auth,tenantId,{course_id:kursId,starts_at:start,ends_at:schluss});
      const person=(vorschlag.teachers as Array<Record<string,unknown>>)[0],raum=(vorschlag.rooms as Array<Record<string,unknown>>)[0];
      if(!person||!raum){luecken.push({course_id:kursId,course_name:kursName,date:datum,reason:person?'NO_ROOM_AVAILABLE':'NO_TEACHER_AVAILABLE'});continue;}
      const {entry_id}=await saveTimetablePlanEntry(env,auth,tenantId,planId,{course_id:kursId,teacher_id:String(person.id),room:String(raum.name||''),starts_at:start,ends_at:schluss,activity_type:'classroom',source:'automation'});
      await linkPlanEntryResource(env,auth,tenantId,planId,entry_id,{resource_id:String(raum.id)});
      erzeugt++;proKurs.set(kursId,(proKurs.get(kursId)||0)+1);
    }
  }
  await audit(env.DB,auth.userId,'education.timetable_plan_autofilled',tenantId,undefined,'timetable_plan',planId,{created:erzeugt,gaps:luecken.length,courses:kurse.length});
  return{plan_id:planId,created:erzeugt,limit_reached:erzeugt>=AUTOFILL_MAX_ENTRIES,
    courses:kurse.map(k=>({course_id:String(k.id),course_name:String(k.name||''),created:proKurs.get(String(k.id))||0})),
    gaps:luecken.slice(0,200),gap_count:luecken.length,published:false};
}

export async function substituteSuggestions(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string){requireManage(auth);courseScope(auth,courseId);const lesson=await env.DB.prepare('SELECT id,subject_id,teacher_id,starts_at,ends_at FROM lessons WHERE tenant_id=? AND course_id=? AND id=?').bind(tenantId,courseId,lessonId).first<Record<string,unknown>>();if(!lesson)throw new Error('LESSON_NOT_FOUND');const result=await planningSuggestions(env,auth,tenantId,{course_id:courseId,subject_id:lesson.subject_id,starts_at:lesson.starts_at,ends_at:lesson.ends_at});return{...result,teachers:(result.teachers as any[]).filter(t=>String(t.id)!==String(lesson.teacher_id||''))};}
