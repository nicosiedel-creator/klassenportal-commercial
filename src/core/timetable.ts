import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { id, nowIso, safeString } from './utils.js';
import { parseCsv } from '../portability/csv.js';
import { parseXlsx } from '../portability/xlsx.js';
import { normalizeHeader } from '../portability/utils.js';

type MappingKey = 'date'|'start'|'end'|'subject'|'subjectShort'|'teacher'|'room'|'notes'|'course'|'mode';
type Mapping = Partial<Record<MappingKey,string>>;
type RawRow = Record<string,unknown>;
type CourseRow = {id:string;name:string;code:string;is_active:number};
type NormalizedLesson = {
  rowNo:number; lessonId:string; courseId:string; courseName:string;
  date:string; startsAt:string; endsAt:string;
  subject:string|null; subjectShort:string|null; teacher:string|null;
  room:string|null; notes:string|null;
};
type ImportIssue = {row:number;field:string;message:string;value?:unknown};
type SubjectInput = {name:string;shortName:string|null};

const ALIASES: Record<MappingKey,string[]> = {
  date:['datum','date','tag','unterrichtstag','schultag'],
  start:['beginn','start','von','startzeit','beginn_uhrzeit','uhrzeit_von','start_uhrzeit'],
  end:['ende','end','bis','endzeit','ende_uhrzeit','uhrzeit_bis','schluss'],
  subject:['fach','topic','thema_der_stunde','fachbezeichnung','fach_bezeichnung','fachname','fach_name','subject','unterrichtsfach','modul','modulbezeichnung','lernfeld','lernfeldbezeichnung','thema'],
  subjectShort:['fachkurzel','fachkuerzel','fach_kurzel','fach_kuerzel','kurzel','kuerzel','kurzbezeichnung','fachcode','fach_code','subject_code','modulcode','modul_code'],
  teacher:['dozent','dozentin','dozentenname','dozent_name','lehrer','lehrkraft','lehrkraftname','trainer','trainerin','trainername','teacher','referent','referentin'],
  room:['raum','room','ort','unterrichtsraum','standort'],
  notes:['hinweis','hinweise','info','infos','information','informationen','bemerkung','bemerkungen','notiz','notizen'],
  // Reihenfolge ist hier Absicht: eine Kursliste eines Bildungstraegers fuehrt oft mehrere
  // Kursspalten nebeneinander - course_id (seine eigene Kennung), course_code und
  // course_external_id. Die eigene Kennung des Kunden sagt dem Portal nichts; sein Kurscode
  // dagegen steht auch an den Kursen, die aus derselben Kursliste entstanden sind. Wird die
  // erste passende Spalte genommen und das ist course_id, scheitert jede einzelne Zeile an
  // "Klasse/Kurs konnte nicht eindeutig zugeordnet werden" - gemessen an 07_Stundenplan.csv
  // eines echten Abnahmepakets.
  course:['kurscode','course_code','klassencode','class_code','course_external_id','external_course_id','klasse','kurs','course','class','gruppe','lehrgang','course_id','kurs_id'],
  mode:['unterricht','unterrichtsart','format','modus','durchfuhrung','durchfuehrung','prasenz_online','praesenz_online'],
};

// Gesucht wird in der Reihenfolge der Bezeichnungen, nicht in der Reihenfolge der Kopfzeilen.
// Vorher entschied, welche passende Spalte in der Datei zuerst stand: fuehrt eine Datei
// course_id vor course_code, gewann die eigene Kennung des Kunden - und jede Zeile scheiterte an
// der Klassenzuordnung. Die Bezeichnungsliste ist eine Rangfolge, und so wird sie jetzt auch
// gelesen.
function detectMapping(headers:string[]):Mapping {
  const out:Mapping={};
  for(const key of Object.keys(ALIASES) as MappingKey[]){
    const aliases=ALIASES[key];
    const exact=aliases.map(alias=>headers.find(h=>normalizeHeader(h)===alias)).find(Boolean);
    if(exact){out[key]=exact;continue;}
    const fuzzy=aliases.map(alias=>headers.find(h=>normalizeHeader(h).includes(alias)||alias.includes(normalizeHeader(h)))).find(Boolean);
    if(fuzzy)out[key]=fuzzy;
  }
  return out;
}

async function parseFile(file:File):Promise<{headers:string[];rows:RawRow[]}> {
  const name=file.name.toLowerCase();
  if(file.type==='text/csv'||name.endsWith('.csv')) return parseCsv(await file.text());
  if(file.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'||name.endsWith('.xlsx')) return parseXlsx(await file.arrayBuffer());
  throw new Error('TIMETABLE_FILE_UNSUPPORTED');
}

function two(n:number):string{return String(n).padStart(2,'0');}
// Auch der Organisationsimport liest inzwischen Stundenplanzeilen. Er benutzt bewusst dieselbe
// Datums- und Zeiterkennung wie der Stundenplanimport - zwei eigene Definitionen wuerden
// auseinanderlaufen, und dann laese der eine Weg ein anderes Datum als der andere.
export function parseDate(value:unknown):string|null {
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number'&&Number.isFinite(value)){
    const d=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000);
    return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
  }
  const s=String(value).trim();
  let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if(m)return `${m[1]}-${two(Number(m[2]))}-${two(Number(m[3]))}`;
  m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/); if(m){let y=Number(m[3]);if(y<100)y+=y<70?2000:1900;return `${y}-${two(Number(m[2]))}-${two(Number(m[1]))}`;}
  const d=new Date(s); return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
export function parseTime(value:unknown):string|null {
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number'&&Number.isFinite(value)){
    if(value>=0&&value<1){const mins=Math.round(value*24*60)%1440;return `${two(Math.floor(mins/60))}:${two(mins%60)}`;}
    if(Number.isInteger(value)&&value>=0&&value<=2359){const h=Math.floor(value/100),m=value%100;if(h<24&&m<60)return `${two(h)}:${two(m)}`;}
    if(value>=0&&value<24){const h=Math.floor(value),m=Math.round((value-h)*60);if(m<60)return `${two(h)}:${two(m)}`;}
  }
  const s=String(value).trim();
  let m=s.match(/(?:^|\s)(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s|$)/);if(m){const h=Number(m[1]),mi=Number(m[2]);if(h<24&&mi<60)return `${two(h)}:${two(mi)}`;}
  m=s.match(/^(\d{1,2})$/);if(m){const h=Number(m[1]);if(h<24)return `${two(h)}:00`;}
  m=s.match(/^(\d{3,4})$/);if(m){const n=Number(m[1]),h=Math.floor(n/100),mi=n%100;if(h<24&&mi<60)return `${two(h)}:${two(mi)}`;}
  const dt=s.match(/T(\d{2}):(\d{2})/);if(dt)return `${dt[1]}:${dt[2]}`;
  return null;
}
function addDay(date:string):string {const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function value(row:RawRow,mapping:Mapping,key:MappingKey):unknown {const h=mapping[key];return h?row[h]:undefined;}
function clean(value:unknown,max=500):string|null {const s=String(value??'').trim();return s?s.slice(0,max):null;}
function token(v:string):string{return normalizeHeader(v).replace(/_/g,'');}
function subjectKey(name:string,shortName:string|null):string{return `${name.toLocaleLowerCase('de-DE')}|${(shortName??'').toLocaleLowerCase('de-DE')}`;}

async function courses(env:Env,tenantId:string):Promise<CourseRow[]> {
  const r=await env.DB.prepare('SELECT id,name,code,is_active FROM courses WHERE tenant_id=? ORDER BY name').bind(tenantId).all<CourseRow>();
  return r.results??[];
}
function resolveCourse(text:unknown,all:CourseRow[]):CourseRow|null {
  const s=String(text??'').trim().toLocaleLowerCase('de-DE'); if(!s)return null;
  const byCode=all.find(c=>c.code.toLocaleLowerCase('de-DE')===s); if(byCode)return byCode;
  const matches=all.filter(c=>c.name.toLocaleLowerCase('de-DE')===s); return matches.length===1?matches[0]:null;
}
function inferCourseFromFilename(fileName:string,all:CourseRow[],auth:CoreAuthContext):CourseRow|null {
  const base=token(fileName.replace(/\.(pdf|xlsx|csv)$/i,'')); if(!base)return null;
  const allowed=all.filter(c=>{try{requireCourseAccess(auth,c.id);return true;}catch{return false;}});
  const scored=allowed.map(c=>{
    const name=token(c.name),code=token(c.code);
    let score=0;
    if(code&&base===code)score=120;else if(name&&base===name)score=115;
    else if(code&&base.includes(code))score=Math.max(score,90+Math.min(code.length,20));
    else if(name&&base.includes(name))score=Math.max(score,80+Math.min(name.length,25));
    return{c,score};
  }).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(!scored.length)return null;
  if(scored.length>1&&scored[0].score===scored[1].score)return null;
  return scored[0].c;
}

// Nennt eine Zeile ihren Kurs mehrfach - eigene Kennung, Kurscode, externe Kennung -, darf der
// Import nicht daran scheitern, dass die Spaltenzuordnung auf die unbrauchbarste davon fiel.
// Zuerst gilt die zugeordnete Spalte; loest sie nicht auf, zaehlen die uebrigen Kursspalten
// derselben Zeile. Aufgeloest wird dabei mit demselben Verfahren wie zuvor, also nur eindeutig.
const ROW_COURSE_HEADERS=['course_code','kurscode','klassencode','class_code','course_external_id','external_course_id','klasse','kurs','course','class','course_id','kurs_id'];
function resolveCourseFromRow(raw:RawRow,mapping:Mapping,allCourses:CourseRow[]):CourseRow|null{
  const direct=resolveCourse(value(raw,mapping,'course'),allCourses);if(direct)return direct;
  // Auch hier gilt die Rangfolge der Bezeichnungen und nicht die Spaltenfolge der Datei: sonst
  // entschiede wieder der Zufall des Exports, welche Kursspalte einer Zeile zaehlt.
  for(const alias of ROW_COURSE_HEADERS){
    for(const header of Object.keys(raw)){
      if(header===mapping.course)continue;
      if(normalizeHeader(header)!==alias)continue;
      const found=resolveCourse(String(raw[header]??''),allCourses);if(found)return found;
    }
  }
  return null;
}
function buildNormalized(rawRows:RawRow[],mapping:Mapping,allCourses:CourseRow[],fallbackCourseId:string|undefined,auth:CoreAuthContext):{rows:NormalizedLesson[];issues:ImportIssue[];duplicates:number} {
  const issues:ImportIssue[]=[],rows:NormalizedLesson[]=[];let duplicates=0;
  for(const key of ['date','start','end'] as MappingKey[]) if(!mapping[key]) issues.push({row:1,field:key,message:'Erforderliche Spalte wurde nicht erkannt oder zugeordnet.'});
  if(!fallbackCourseId&&!mapping.course) issues.push({row:1,field:'course',message:'Bitte eine Klasse auswählen oder eine Klassenspalte zuordnen.'});
  if(issues.length)return{rows,issues,duplicates};
  const fallback=allCourses.find(c=>c.id===fallbackCourseId);
  if(fallbackCourseId&&!fallback)issues.push({row:1,field:'course',message:'Die ausgewählte Klasse wurde nicht gefunden.'});
  const seen=new Set<string>();
  rawRows.forEach((raw,index)=>{
    const rowNo=index+2;
    const course=fallback??resolveCourseFromRow(raw,mapping,allCourses);
    if(!course){issues.push({row:rowNo,field:'course',message:'Klasse/Kurs konnte nicht eindeutig zugeordnet werden.',value:value(raw,mapping,'course')});return;}
    if(!course.is_active){issues.push({row:rowNo,field:'course',message:'Die Klasse ist nicht aktiv.',value:course.name});return;}
    try{requireCourseAccess(auth,course.id);}catch{issues.push({row:rowNo,field:'course',message:'Keine Berechtigung für diese Klasse.',value:course.name});return;}
    const date=parseDate(value(raw,mapping,'date')),start=parseTime(value(raw,mapping,'start')),end=parseTime(value(raw,mapping,'end'));
    if(!date){issues.push({row:rowNo,field:'date',message:'Datum konnte nicht gelesen werden.',value:value(raw,mapping,'date')});return;}
    if(!start){issues.push({row:rowNo,field:'start',message:'Beginn konnte nicht gelesen werden.',value:value(raw,mapping,'start')});return;}
    if(!end){issues.push({row:rowNo,field:'end',message:'Ende konnte nicht gelesen werden.',value:value(raw,mapping,'end')});return;}
    if(end<=start){issues.push({row:rowNo,field:'end',message:'Das Ende muss nach dem Beginn liegen.',value:value(raw,mapping,'end')});return;}
    let subject=clean(value(raw,mapping,'subject'),200),subjectShort=clean(value(raw,mapping,'subjectShort'),80);
    if(!subject&&subjectShort)subject=subjectShort;
    const teacher=clean(value(raw,mapping,'teacher'),200),room=clean(value(raw,mapping,'room'),200);
    const note=clean(value(raw,mapping,'notes'),2000),mode=clean(value(raw,mapping,'mode'),200);
    const notes=[mode?`Unterrichtsart: ${mode}`:null,note].filter(Boolean).join('\n')||null;
    const startsAt=`${date}T${start}:00`,endsAt=`${date}T${end}:00`;
    const key=[course.id,startsAt,endsAt,subject?.toLocaleLowerCase('de-DE')||'',subjectShort?.toLocaleLowerCase('de-DE')||'',teacher?.toLocaleLowerCase('de-DE')||'',room?.toLocaleLowerCase('de-DE')||''].join('|');
    if(seen.has(key)){duplicates++;return;}seen.add(key);
    rows.push({rowNo,lessonId:id('les_'),courseId:course.id,courseName:course.name,date,startsAt,endsAt,subject,subjectShort,teacher,room,notes});
  });
  return{rows,issues,duplicates};
}

function parseMapping(text:FormDataEntryValue|null,headers:string[]):Mapping {
  if(!text)return detectMapping(headers);
  try{const raw=JSON.parse(String(text)) as Record<string,unknown>,out:Mapping={};for(const key of Object.keys(ALIASES) as MappingKey[]){const h=String(raw[key]??'');if(h&&headers.includes(h))out[key]=h;}return out;}catch{return detectMapping(headers);}
}
function fallbackCourse(form:FormData,file:File,allCourses:CourseRow[],auth:CoreAuthContext):string|undefined {
  const explicit=clean(form.get('course_id'),200)??undefined;
  if(explicit)return explicit;
  return inferCourseFromFilename(String(form.get('source_name')??file.name),allCourses,auth)?.id;
}

export async function previewTimetable(env:Env,auth:CoreAuthContext,tenantId:string,request:Request):Promise<Record<string,unknown>> {
  requireRole(auth,'class_admin');
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('TIMETABLE_FILE_REQUIRED');
  if(file.size>20*1024*1024)throw new Error('TIMETABLE_FILE_TOO_LARGE');
  const parsed=await parseFile(file);if(!parsed.rows.length)throw new Error('TIMETABLE_EMPTY');if(parsed.rows.length>5000)throw new Error('TIMETABLE_TOO_MANY_ROWS');
  const mapping=parseMapping(form.get('mapping'),parsed.headers),allCourses=await courses(env,tenantId),fallbackCourseId=fallbackCourse(form,file,allCourses,auth);
  const normalized=buildNormalized(parsed.rows,mapping,allCourses,fallbackCourseId,auth);
  const dates=normalized.rows.map(r=>r.date).sort();
  const subjects=[...new Map(normalized.rows.filter(r=>r.subject).map(r=>[subjectKey(r.subject!,r.subjectShort),{name:r.subject!,shortName:r.subjectShort}])).values()];
  const teachers=[...new Set(normalized.rows.flatMap(r=>r.teacher?[r.teacher]:[]))].sort((a,b)=>a.localeCompare(b,'de'));
  return {headers:parsed.headers,mapping,autoCourseId:fallbackCourseId??null,rowsSeen:parsed.rows.length,rowsValid:normalized.rows.length,rowsInvalid:new Set(normalized.issues.filter(x=>x.row>1).map(x=>x.row)).size,duplicates:normalized.duplicates,dateFrom:dates[0]??null,dateTo:dates.at(-1)??null,subjects,teachers,issues:normalized.issues.slice(0,250),sample:normalized.rows.slice(0,15).map(r=>({row:r.rowNo,klasse:r.courseName,datum:r.date,beginn:r.startsAt.slice(11,16),ende:r.endsAt.slice(11,16),fach:r.subject,fachkuerzel:r.subjectShort,dozent:r.teacher,raum:r.room,hinweise:r.notes}))};
}

async function getOrCreateSubjects(env:Env,tenantId:string,items:SubjectInput[]):Promise<Map<string,string>> {
  const out=new Map<string,string>();
  const existing=await env.DB.prepare('SELECT id,name,short_name FROM subjects WHERE tenant_id=?').bind(tenantId).all<{id:string;name:string;short_name:string|null}>();
  const byName=new Map<string,{id:string;short:string|null}>(),byShort=new Map<string,{id:string;name:string}>();
  for(const x of existing.results??[]){byName.set(x.name.toLocaleLowerCase('de-DE'),{id:x.id,short:x.short_name});if(x.short_name)byShort.set(x.short_name.toLocaleLowerCase('de-DE'),{id:x.id,name:x.name});}
  const unique=new Map<string,SubjectInput>();for(const item of items)unique.set(subjectKey(item.name,item.shortName),item);
  for(const item of unique.values()){
    const nameKey=item.name.toLocaleLowerCase('de-DE'),shortKey=item.shortName?.toLocaleLowerCase('de-DE')??'';
    let found=byName.get(nameKey);let foundId=found?.id;
    if(!foundId&&shortKey)foundId=byShort.get(shortKey)?.id;
    if(foundId){if(item.shortName&&found&&!found.short){await env.DB.prepare('UPDATE subjects SET short_name=? WHERE id=? AND tenant_id=?').bind(item.shortName,foundId,tenantId).run();found.short=item.shortName;byShort.set(shortKey,{id:foundId,name:item.name});}out.set(subjectKey(item.name,item.shortName),foundId);continue;}
    const newId=id('sub_');await env.DB.prepare('INSERT OR IGNORE INTO subjects(id,tenant_id,name,short_name,created_at) VALUES(?,?,?,?,?)').bind(newId,tenantId,item.name,item.shortName,nowIso()).run();
    const row=await env.DB.prepare('SELECT id,short_name FROM subjects WHERE tenant_id=? AND name=? COLLATE NOCASE').bind(tenantId,item.name).first<{id:string;short_name:string|null}>();
    const actual=row?.id??newId;byName.set(nameKey,{id:actual,short:row?.short_name??item.shortName});if(shortKey)byShort.set(shortKey,{id:actual,name:item.name});out.set(subjectKey(item.name,item.shortName),actual);
  }
  return out;
}
async function getOrCreateTeachers(env:Env,tenantId:string,names:string[]):Promise<Map<string,string>> {
  const out=new Map<string,string>(),existing=await env.DB.prepare('SELECT id,name FROM teachers WHERE tenant_id=?').bind(tenantId).all<{id:string;name:string}>();
  for(const x of existing.results??[])if(!out.has(x.name.toLocaleLowerCase('de-DE')))out.set(x.name.toLocaleLowerCase('de-DE'),x.id);
  for(const name of [...new Set(names)]){const key=name.toLocaleLowerCase('de-DE');if(out.has(key))continue;const newId=id('tch_');await env.DB.prepare('INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES(?,?,?,?,?)').bind(newId,tenantId,name,null,nowIso()).run();out.set(key,newId);}
  return out;
}

export async function applyTimetable(env:Env,auth:CoreAuthContext,tenantId:string,request:Request):Promise<{runId:string;imported:number;skipped:number;dateFrom:string|null;dateTo:string|null}> {
  requireRole(auth,'class_admin');
  const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('TIMETABLE_FILE_REQUIRED');
  if(file.size>20*1024*1024)throw new Error('TIMETABLE_FILE_TOO_LARGE');
  const mode=String(form.get('mode')??'sync');if(!['sync','append'].includes(mode))throw new Error('TIMETABLE_MODE_INVALID');
  const parsed=await parseFile(file);if(!parsed.rows.length)throw new Error('TIMETABLE_EMPTY');if(parsed.rows.length>5000)throw new Error('TIMETABLE_TOO_MANY_ROWS');
  const mapping=parseMapping(form.get('mapping'),parsed.headers),allCourses=await courses(env,tenantId),fallbackCourseId=fallbackCourse(form,file,allCourses,auth);
  const normalized=buildNormalized(parsed.rows,mapping,allCourses,fallbackCourseId,auth);
  if(normalized.issues.length){const e=new Error('TIMETABLE_VALIDATION_FAILED') as Error&{issues?:ImportIssue[]};e.issues=normalized.issues.slice(0,500);throw e;}
  if(!normalized.rows.length)throw new Error('TIMETABLE_NO_VALID_ROWS');
  const subjectInputs=normalized.rows.flatMap(r=>r.subject?[{name:r.subject,shortName:r.subjectShort}]:[]);
  const subjectMap=await getOrCreateSubjects(env,tenantId,subjectInputs);
  const teacherMap=await getOrCreateTeachers(env,tenantId,normalized.rows.flatMap(r=>r.teacher?[r.teacher]:[]));
  const runId=id('tti_'),created=nowIso(),dates=normalized.rows.map(r=>r.date).sort(),dateFrom=dates[0]??null,dateTo=dates.at(-1)??null;
  const originalName=safeString(String(form.get('source_name')??file.name),250);
  await env.DB.prepare("INSERT INTO timetable_import_runs(id,tenant_id,original_name,mode,row_count,status,created_by,created_at,date_from,date_to) VALUES(?,?,?,?,?,'staging',?,?,?,?)").bind(runId,tenantId,originalName,mode,normalized.rows.length,auth.userId,created,dateFrom,dateTo).run();
  try{
    const staged=normalized.rows.map(r=>({lesson_id:r.lessonId,tenant_id:tenantId,course_id:r.courseId,subject_id:r.subject?subjectMap.get(subjectKey(r.subject,r.subjectShort))??null:null,teacher_id:r.teacher?teacherMap.get(r.teacher.toLocaleLowerCase('de-DE'))??null:null,starts_at:r.startsAt,ends_at:r.endsAt,room:r.room,notes:r.notes,source_row_no:r.rowNo}));
    for(let i=0;i<staged.length;i+=70){const statements=staged.slice(i,i+70).map((row,j)=>env.DB.prepare('INSERT INTO timetable_import_rows(run_id,row_no,row_json) VALUES(?,?,?)').bind(runId,i+j+1,JSON.stringify(row)));await env.DB.batch(statements);}
    const commit=[];
    if(mode==='sync'){
      const byCourse=new Map<string,{from:string;to:string}>();
      for(const r of normalized.rows){const x=byCourse.get(r.courseId);if(!x)byCourse.set(r.courseId,{from:r.date,to:r.date});else{if(r.date<x.from)x.from=r.date;if(r.date>x.to)x.to=r.date;}}
      for(const [courseId,range] of byCourse)commit.push(env.DB.prepare(`DELETE FROM lessons WHERE id IN (SELECT lesson_id FROM timetable_import_lessons WHERE tenant_id=? AND course_id=? AND starts_at>=? AND starts_at<?)`).bind(tenantId,courseId,`${range.from}T00:00:00`,`${addDay(range.to)}T00:00:00`));
    }
    commit.push(env.DB.prepare(`INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,notes,created_at) SELECT json_extract(r.row_json,'$.lesson_id'),json_extract(r.row_json,'$.tenant_id'),json_extract(r.row_json,'$.course_id'),json_extract(r.row_json,'$.subject_id'),json_extract(r.row_json,'$.teacher_id'),json_extract(r.row_json,'$.starts_at'),json_extract(r.row_json,'$.ends_at'),json_extract(r.row_json,'$.room'),json_extract(r.row_json,'$.notes'),CURRENT_TIMESTAMP FROM timetable_import_rows r WHERE r.run_id=? AND NOT EXISTS(SELECT 1 FROM lessons l WHERE l.tenant_id=json_extract(r.row_json,'$.tenant_id') AND l.course_id=json_extract(r.row_json,'$.course_id') AND l.starts_at=json_extract(r.row_json,'$.starts_at') AND l.ends_at=json_extract(r.row_json,'$.ends_at') AND l.subject_id IS json_extract(r.row_json,'$.subject_id') AND l.teacher_id IS json_extract(r.row_json,'$.teacher_id') AND COALESCE(l.room,'')=COALESCE(json_extract(r.row_json,'$.room'),''))`).bind(runId));
    commit.push(env.DB.prepare(`INSERT INTO timetable_import_lessons(run_id,tenant_id,course_id,lesson_id,starts_at,ends_at,source_row_no) SELECT ?,json_extract(r.row_json,'$.tenant_id'),json_extract(r.row_json,'$.course_id'),json_extract(r.row_json,'$.lesson_id'),json_extract(r.row_json,'$.starts_at'),json_extract(r.row_json,'$.ends_at'),json_extract(r.row_json,'$.source_row_no') FROM timetable_import_rows r WHERE r.run_id=? AND EXISTS(SELECT 1 FROM lessons l WHERE l.id=json_extract(r.row_json,'$.lesson_id'))`).bind(runId,runId));
    commit.push(env.DB.prepare('DELETE FROM timetable_import_rows WHERE run_id=?').bind(runId));
    await env.DB.batch(commit);
    const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM timetable_import_lessons WHERE run_id=?').bind(runId).first<{n:number}>(),imported=Number(count?.n??0),skipped=normalized.rows.length-imported+normalized.duplicates;
    await env.DB.prepare("UPDATE timetable_import_runs SET status='completed',imported_count=?,skipped_count=?,completed_at=? WHERE id=?").bind(imported,skipped,nowIso(),runId).run();
    await audit(env.DB,auth.userId,'timetable.imported',tenantId,undefined,'timetable_import',runId,{mode,rows:parsed.rows.length,imported,skipped,dateFrom,dateTo,subjects:subjectInputs.length,teachers:teacherMap.size});
    return{runId,imported,skipped,dateFrom,dateTo};
  }catch(e){await env.DB.prepare("UPDATE timetable_import_runs SET status='failed',error_message=?,completed_at=? WHERE id=?").bind(String((e as Error)?.message||'IMPORT_FAILED').slice(0,1000),nowIso(),runId).run();await env.DB.prepare('DELETE FROM timetable_import_rows WHERE run_id=?').bind(runId).run();throw e;}
}
