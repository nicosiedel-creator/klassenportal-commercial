import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { id, nowIso, safeString } from './utils.js';
import { parseCsv } from '../portability/csv.js';
import { parseXlsx } from '../portability/xlsx.js';
import { csvEscape, normalizeHeader } from '../portability/utils.js';

type RawRow=Record<string,unknown>;
type CourseRow={id:string;name:string;code:string;is_active:number};
type OrgUnitRow={id:string;parent_id:string|null;type_key:string;name:string;code:string|null;external_id:string|null;status:string};
type LinkRow={course_id:string;org_unit_id:string;is_primary:number};
type AliasRow={id:string;source_value_normalized:string;org_context_normalized:string;course_id:string;org_unit_id:string|null};
type Model={courses:CourseRow[];units:OrgUnitRow[];links:LinkRow[];aliases:AliasRow[];pathsByCourse:Map<string,OrgUnitRow[][]>};
export type TargetDecision={row:number;status:'automatic'|'review'|'blocked';reason:string;sourceCourse:string|null;sourceContext:string[];courseId:string|null;courseCode:string|null;courseName:string|null;orgPath:string|null};
export type TargetingSummary={hierarchyDetected:boolean;rows:number;automatic:number;review:number;blocked:number;decisions:TargetDecision[]};

type TargetingError=Error&{issues?:Array<{row:number;field:string;message:string;value?:unknown}>;targeting?:TargetingSummary};

const STANDARD:Record<string,string[]>={
  date:['datum','date','tag','unterrichtstag','schultag'],start:['beginn','start','von','startzeit','beginn_uhrzeit','uhrzeit_von','start_uhrzeit'],end:['ende','end','bis','endzeit','ende_uhrzeit','uhrzeit_bis','schluss'],
  subject:['fach','fachbezeichnung','fach_bezeichnung','fachname','fach_name','subject','unterrichtsfach','modul','modulbezeichnung','lernfeld','lernfeldbezeichnung','thema'],subjectShort:['fachkurzel','fachkuerzel','fach_kurzel','fach_kuerzel','kurzel','kuerzel','kurzbezeichnung','fachcode','fach_code','subject_code','modulcode','modul_code'],teacher:['dozent','dozentin','dozentenname','dozent_name','lehrer','lehrkraft','lehrkraftname','trainer','trainerin','trainername','teacher','referent','referentin'],
  room:['raum','room','ort','unterrichtsraum','raumbezeichnung'],notes:['hinweis','hinweise','info','infos','information','informationen','bemerkung','bemerkungen','notiz','notizen'],course:['klasse','kurs','course','class','gruppe','lehrgang','kursname','klassenname'],mode:['unterricht','unterrichtsart','format','modus','durchfuhrung','durchfuehrung','prasenz_online','praesenz_online']
};
const SITE_ALIASES=['standort','schulstandort','campus','filiale','niederlassung','betriebsstatte','betriebsstaette','location_name','site'];
const ORG_ALIASES=['bereich','fachbereich','abteilung','organisationseinheit','org_einheit','organisation','massnahme','masnahme','projekt','bildungsgang','programm','program','department','division','gruppe_bereich'];
const PATH_ALIASES=['organisationspfad','strukturpfad','hierarchiepfad','org_pfad','org_path','hierarchy_path','struktur'];
const COURSE_CODE_ALIASES=['kurscode','course_code','klassencode','class_code','klassenkurzel','klassenkuerzel','kurskurzel','kurskuerzel','course_id','external_course_id'];

function norm(value:unknown):string{return String(value??'').trim().toLocaleLowerCase('de-DE').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/ß/g,'ss').replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');}
function clean(value:unknown,max=500):string|null{const s=String(value??'').trim();return s?s.slice(0,max):null;}
function column(headers:string[],aliases:string[]):string|undefined{const set=new Set(aliases.map(normalizeHeader));return headers.find(h=>set.has(normalizeHeader(h)));}
function columns(headers:string[],aliases:string[]):string[]{const set=new Set(aliases.map(normalizeHeader));return headers.filter(h=>set.has(normalizeHeader(h)));}
function mappedColumn(mappingRaw:Record<string,unknown>,key:string,headers:string[]):string|undefined{const wanted=normalizeHeader(String(mappingRaw[key]??''));return wanted?headers.find(h=>normalizeHeader(h)===wanted):undefined;}
function rowValue(row:RawRow,header?:string):unknown{return header?row[header]:undefined;}
function splitPath(value:unknown):string[]{return String(value??'').split(/\s*(?:>|›|→|\/|\\|\||;)\s*/).map(norm).filter(Boolean);}
function escapeCsvRow(values:unknown[]):string{return values.map(csvEscape).join(',');}
async function parseFile(file:File):Promise<{headers:string[];rows:RawRow[]}>{const name=file.name.toLowerCase();if(file.type==='text/csv'||name.endsWith('.csv'))return parseCsv(await file.text());if(file.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'||name.endsWith('.xlsx'))return parseXlsx(await file.arrayBuffer());throw new Error('TIMETABLE_FILE_UNSUPPORTED');}

function unitTokens(unit:OrgUnitRow):Set<string>{return new Set([unit.name,unit.code,unit.external_id].map(norm).filter(Boolean));}
function unitPath(unitId:string,byId:Map<string,OrgUnitRow>):OrgUnitRow[]{const out:OrgUnitRow[]=[],seen=new Set<string>();let current=byId.get(unitId);while(current&&!seen.has(current.id)){seen.add(current.id);out.unshift(current);current=current.parent_id?byId.get(current.parent_id):undefined;}return out;}
function pathLabel(path:OrgUnitRow[]):string{return path.map(x=>x.name).join(' › ');}
function pathMatches(path:OrgUnitRow[],context:string[]):boolean{if(!context.length)return true;if(path.some(x=>x.status!=='active'))return false;const tokens=path.map(unitTokens);return context.every(part=>tokens.some(set=>set.has(part)));}
function coursePaths(model:Model,courseId:string,context:string[]):OrgUnitRow[][]{const paths=model.pathsByCourse.get(courseId)??[];return context.length?paths.filter(p=>pathMatches(p,context)):paths.filter(p=>p.every(x=>x.status==='active'));}
function courseAllowed(auth:CoreAuthContext,courseId:string):boolean{try{requireCourseAccess(auth,courseId);return true;}catch{return false;}}
function preferredPath(paths:OrgUnitRow[][]):OrgUnitRow[]|null{return paths.length===1?paths[0]:paths[0]??null;}

async function loadModel(env:Env,tenantId:string):Promise<Model>{
  const [c,u,l,a]=await Promise.all([
    env.DB.prepare('SELECT id,name,code,is_active FROM courses WHERE tenant_id=? ORDER BY name').bind(tenantId).all<CourseRow>(),
    env.DB.prepare('SELECT id,parent_id,type_key,name,code,external_id,status FROM org_units WHERE tenant_id=? ORDER BY sort_order,name').bind(tenantId).all<OrgUnitRow>(),
    env.DB.prepare('SELECT course_id,org_unit_id,is_primary FROM course_org_units WHERE tenant_id=? ORDER BY is_primary DESC,course_id').bind(tenantId).all<LinkRow>(),
    env.DB.prepare('SELECT id,source_value_normalized,org_context_normalized,course_id,org_unit_id FROM timetable_target_aliases WHERE tenant_id=?').bind(tenantId).all<AliasRow>().catch(()=>({success:true,results:[]} as {success:boolean;results:AliasRow[]})),
  ]);
  const units=u.results??[],byId=new Map(units.map(x=>[x.id,x])),pathsByCourse=new Map<string,OrgUnitRow[][]>();
  for(const link of l.results??[]){const p=unitPath(link.org_unit_id,byId),arr=pathsByCourse.get(link.course_id)??[];if(p.length)arr.push(p);pathsByCourse.set(link.course_id,arr);}
  return{courses:c.results??[],units,links:l.results??[],aliases:a.results??[],pathsByCourse};
}

function resolveTarget(model:Model,auth:CoreAuthContext,sourceCourse:string|null,sourceCode:string|null,context:string[]):{course:CourseRow|null;path:OrgUnitRow[]|null;status:'automatic'|'review'|'blocked';reason:string}{
  const courseText=norm(sourceCourse),codeText=norm(sourceCode),contextKey=context.join(' > ');
  const byCode=codeText?model.courses.filter(c=>norm(c.code)===codeText):courseText?model.courses.filter(c=>norm(c.code)===courseText):[];
  if(byCode.length===1){const c=byCode[0];if(!c.is_active)return{course:c,path:null,status:'blocked',reason:'Klasse/Kurs ist archiviert oder inaktiv.'};if(!courseAllowed(auth,c.id))return{course:c,path:null,status:'blocked',reason:'Keine Berechtigung für diese Klasse/Kurs.'};const paths=coursePaths(model,c.id,context);if(context.length&&!paths.length)return{course:c,path:null,status:'blocked',reason:'Klasse/Kurs passt nicht zum angegebenen Standort/Organisationsbereich.'};return{course:c,path:preferredPath(paths),status:'automatic',reason:'Eindeutiger Klassen-/Kurscode.'};}
  const aliasSource=courseText||codeText;if(aliasSource){const alias=model.aliases.find(x=>x.source_value_normalized===aliasSource&&x.org_context_normalized===contextKey);if(alias){const c=model.courses.find(x=>x.id===alias.course_id);if(!c||!c.is_active)return{course:c??null,path:null,status:'blocked',reason:'Bestätigte Zuordnung verweist auf eine inaktive Klasse.'};if(!courseAllowed(auth,c.id))return{course:c,path:null,status:'blocked',reason:'Keine Berechtigung für die bestätigte Zielklasse.'};const paths=coursePaths(model,c.id,context);if(context.length&&!paths.length)return{course:c,path:null,status:'blocked',reason:'Bestätigte Zuordnung passt nicht mehr zur aktuellen Organisationsstruktur.'};return{course:c,path:preferredPath(paths),status:'automatic',reason:'Bereits bestätigte Zuordnung wurde wiederverwendet.'};}}
  let candidates=courseText?model.courses.filter(c=>norm(c.name)===courseText):model.courses.slice();
  if(context.length)candidates=candidates.filter(c=>coursePaths(model,c.id,context).length>0);
  const active=candidates.filter(c=>c.is_active&&courseAllowed(auth,c.id));
  if(active.length===1){const c=active[0],paths=coursePaths(model,c.id,context);return{course:c,path:preferredPath(paths),status:'automatic',reason:courseText?'Eindeutiger Klassen-/Kursname im angegebenen Organisationskontext.':'Im angegebenen Organisationskontext existiert genau eine berechtigte aktive Klasse.'};}
  if(candidates.some(c=>!c.is_active))return{course:null,path:null,status:'blocked',reason:'Passende Klasse/Kurs ist nicht aktiv.'};
  if(candidates.length&&active.length===0)return{course:null,path:null,status:'blocked',reason:'Passende Klasse/Kurs liegt außerhalb des freigegebenen Zuständigkeitsbereichs.'};
  if(active.length>1)return{course:null,path:null,status:'review',reason:'Mehrere Klassen/Kurse passen zu Standort/Organisation und Bezeichnung; automatische Zuordnung wäre unsicher.'};
  return{course:null,path:null,status:'review',reason:'Standort/Organisation/Klasse konnte nicht eindeutig einer vorhandenen aktiven Klasse zugeordnet werden.'};
}

function detectInput(headers:string[],rows:RawRow[],mappingRaw:Record<string,unknown>){
  const std=(key:string)=>mappedColumn(mappingRaw,key,headers)??column(headers,STANDARD[key]??[]),course=std('course'),courseCode=column(headers,COURSE_CODE_ALIASES),site=column(headers,SITE_ALIASES),org=columns(headers,ORG_ALIASES),orgPath=column(headers,PATH_ALIASES);
  const distinctCourse=course?new Set(rows.map(r=>norm(rowValue(r,course))).filter(Boolean)).size:0;
  return{std,course,courseCode,site,org,orgPath,hierarchyDetected:!!(site||org.length||orgPath||courseCode||distinctCourse>1)};
}

export async function prepareHierarchyAwareTimetableRequest(env:Env,auth:CoreAuthContext,tenantId:string,request:Request):Promise<{request:Request;targeting:TargetingSummary|null}>{
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('FILE_REQUIRED');
  const parsed=await parseFile(file);if(!parsed.rows.length)return{request,targeting:null};
  let mappingRaw:Record<string,unknown>={};try{mappingRaw=JSON.parse(String(form.get('mapping')||'{}')) as Record<string,unknown>;}catch{}
  const detected=detectInput(parsed.headers,parsed.rows,mappingRaw);if(!detected.hierarchyDetected)return{request,targeting:null};
  const model=await loadModel(env,tenantId),explicitCourseId=clean(form.get('course_id'),200),explicit=model.courses.find(c=>c.id===explicitCourseId),decisions:TargetDecision[]=[],canonicalRows:string[][]=[];
  for(let i=0;i<parsed.rows.length;i++){
    const row=parsed.rows[i],sourceCourse=clean(rowValue(row,detected.course),250),sourceCode=clean(rowValue(row,detected.courseCode),250),context=[clean(rowValue(row,detected.site),250),...detected.org.map(h=>clean(rowValue(row,h),250))].filter((x):x is string=>!!x).map(norm);if(detected.orgPath)context.push(...splitPath(rowValue(row,detected.orgPath)));const uniqueContext=[...new Set(context.filter(Boolean))];
    let resolved;if(explicit&&!sourceCourse&&!sourceCode&&!uniqueContext.length){resolved={course:explicit,path:null,status:(explicit.is_active&&courseAllowed(auth,explicit.id)?'automatic':'blocked') as 'automatic'|'blocked',reason:explicit.is_active?(courseAllowed(auth,explicit.id)?'Explizit ausgewählte Klasse/Kurs.':'Keine Berechtigung für die ausgewählte Klasse/Kurs.'):'Ausgewählte Klasse/Kurs ist inaktiv.'};}else resolved=resolveTarget(model,auth,sourceCourse,sourceCode,uniqueContext);
    const d:TargetDecision={row:i+2,status:resolved.status,reason:resolved.reason,sourceCourse:sourceCode||sourceCourse,sourceContext:uniqueContext,courseId:resolved.course?.id??null,courseCode:resolved.course?.code??null,courseName:resolved.course?.name??null,orgPath:resolved.path?pathLabel(resolved.path):null};decisions.push(d);
    if(resolved.status!=='automatic'||!resolved.course)continue;
    const g=(key:string)=>rowValue(row,detected.std(key));canonicalRows.push([g('date'),g('start'),g('end'),g('subject'),g('subjectShort'),g('teacher'),g('room'),g('notes'),resolved.course.code,g('mode')].map(v=>String(v??'')));
  }
  const summary:TargetingSummary={hierarchyDetected:true,rows:parsed.rows.length,automatic:decisions.filter(x=>x.status==='automatic').length,review:decisions.filter(x=>x.status==='review').length,blocked:decisions.filter(x=>x.status==='blocked').length,decisions:decisions.slice(0,200)};
  const unresolved=decisions.filter(x=>x.status!=='automatic');if(unresolved.length){const e=new Error('TIMETABLE_TARGET_REVIEW_REQUIRED') as TargetingError;e.targeting=summary;e.issues=unresolved.slice(0,200).map(x=>({row:x.row,field:'course',message:x.reason,value:[x.sourceContext.join(' › '),x.sourceCourse].filter(Boolean).join(' · ')}));throw e;}
  const headers=['Datum','Beginn','Ende','Fach','Fachkürzel','Dozent','Raum','Hinweise','Klasse','Unterricht'],csv=[escapeCsvRow(headers),...canonicalRows.map(escapeCsvRow)].join('\n'),normalizedFile=new File([csv],`hierarchy-${file.name.replace(/\.[^.]+$/,'')}.csv`,{type:'text/csv'}),next=new FormData();
  for(const [key,value] of form.entries())if(!['file','mapping','course_id'].includes(key))next.append(key,value);next.set('file',normalizedFile);next.set('course_id','');next.set('mapping',JSON.stringify({date:'datum',start:'beginn',end:'ende',subject:'fach',subjectShort:'fachkurzel',teacher:'dozent',room:'raum',notes:'hinweise',course:'klasse',mode:'unterricht'}));
  const headersOut=new Headers(request.headers);headersOut.delete('content-type');return{request:new Request(request.url,{method:request.method,headers:headersOut,body:next}),targeting:summary};
}

export async function listTimetableTargetAliases(env:Env,auth:CoreAuthContext,tenantId:string){requireRole(auth,'tenant_admin');const r=await env.DB.prepare(`SELECT a.id,a.source_value_normalized,a.org_context_normalized,a.course_id,a.org_unit_id,a.confirmed_by,a.created_at,a.updated_at,c.name AS course_name,c.code AS course_code,o.name AS org_unit_name FROM timetable_target_aliases a JOIN courses c ON c.id=a.course_id LEFT JOIN org_units o ON o.id=a.org_unit_id WHERE a.tenant_id=? ORDER BY a.updated_at DESC`).bind(tenantId).all<Record<string,unknown>>();return r.results??[];}
export async function saveTimetableTargetAlias(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireRole(auth,'tenant_admin');const source=norm(input.source_value),context=Array.isArray(input.org_context)?(input.org_context as unknown[]).map(norm).filter(Boolean).join(' > '):norm(input.org_context),courseId=safeString(input.course_id,200),orgUnitId=safeString(input.org_unit_id,200)||null;if(!source||!courseId)throw new Error('TIMETABLE_ALIAS_FIELDS_REQUIRED');
  const course=await env.DB.prepare('SELECT id,is_active FROM courses WHERE id=? AND tenant_id=?').bind(courseId,tenantId).first<{id:string;is_active:number}>();if(!course)throw new Error('COURSE_NOT_FOUND');if(!course.is_active)throw new Error('COURSE_INACTIVE');if(orgUnitId){const unit=await env.DB.prepare("SELECT id FROM org_units WHERE id=? AND tenant_id=? AND status='active'").bind(orgUnitId,tenantId).first<{id:string}>();if(!unit)throw new Error('ORG_UNIT_NOT_FOUND');const linked=await env.DB.prepare('SELECT 1 AS ok FROM course_org_units WHERE tenant_id=? AND course_id=? AND org_unit_id=?').bind(tenantId,courseId,orgUnitId).first<{ok:number}>();if(!linked)throw new Error('COURSE_ORG_LINK_REQUIRED');}
  const existing=await env.DB.prepare('SELECT id FROM timetable_target_aliases WHERE tenant_id=? AND source_value_normalized=? AND org_context_normalized=?').bind(tenantId,source,context).first<{id:string}>(),aliasId=existing?.id||id('tta_'),ts=nowIso();await env.DB.prepare(`INSERT INTO timetable_target_aliases(id,tenant_id,source_value_normalized,org_context_normalized,course_id,org_unit_id,confirmed_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,source_value_normalized,org_context_normalized) DO UPDATE SET course_id=excluded.course_id,org_unit_id=excluded.org_unit_id,confirmed_by=excluded.confirmed_by,updated_at=excluded.updated_at`).bind(aliasId,tenantId,source,context,courseId,orgUnitId,auth.userId,ts,ts).run();await audit(env.DB,auth.userId,'timetable.target_alias.saved',tenantId,courseId,'timetable_target_alias',aliasId,{source,context,orgUnitId});return{id:aliasId,source_value_normalized:source,org_context_normalized:context,course_id:courseId,org_unit_id:orgUnitId};
}
export async function deleteTimetableTargetAlias(env:Env,auth:CoreAuthContext,tenantId:string,aliasId:string){requireRole(auth,'tenant_admin');const row=await env.DB.prepare('SELECT course_id FROM timetable_target_aliases WHERE id=? AND tenant_id=?').bind(aliasId,tenantId).first<{course_id:string}>();if(!row)throw new Error('TIMETABLE_ALIAS_NOT_FOUND');await env.DB.prepare('DELETE FROM timetable_target_aliases WHERE id=? AND tenant_id=?').bind(aliasId,tenantId).run();await audit(env.DB,auth.userId,'timetable.target_alias.deleted',tenantId,row.course_id,'timetable_target_alias',aliasId);}
