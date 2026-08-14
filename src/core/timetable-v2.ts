import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { id, nowIso, safeString } from './utils.js';
import { parseCsv } from '../portability/csv.js';
import { parseXlsx } from '../portability/xlsx.js';
import { normalizeHeader } from '../portability/utils.js';

type MappingKey='date'|'start'|'end'|'subject'|'subjectShort'|'teacher'|'room'|'notes'|'course'|'mode';
type Mapping=Partial<Record<MappingKey,string>>;
type RawRow=Record<string,unknown>;
type CourseRow={id:string;name:string;code:string;is_active:number};
type SubjectInput={name:string;shortName:string|null};
type ConfirmationMode='individual'|'batch'|'automatic';

type NormalizedLesson={
  rowNo:number;lessonId:string;courseId:string;courseName:string;date:string;startsAt:string;endsAt:string;
  subject:string|null;subjectShort:string|null;teacher:string|null;room:string|null;notes:string|null;
};
type ExistingLesson={
  id:string;courseId:string;courseName:string;startsAt:string;endsAt:string;subject:string|null;subjectShort:string|null;
  teacher:string|null;room:string|null;notes:string|null;
};
type LessonPublic={klasse:string;datum:string;beginn:string;ende:string;fach:string|null;fachkuerzel:string|null;dozent:string|null;raum:string|null;hinweise:string|null};
type TimetableChange={key:string;type:'add'|'update'|'remove';courseId:string;before:ExistingLesson|null;after:NormalizedLesson|null};
type ImportIssue={row:number;field:string;message:string;value?:unknown};

const ALIASES:Record<MappingKey,string[]>={
  date:['datum','date','tag','unterrichtstag','schultag'],
  start:['beginn','start','von','startzeit','beginn_uhrzeit','uhrzeit_von','start_uhrzeit'],
  end:['ende','end','bis','endzeit','ende_uhrzeit','uhrzeit_bis','schluss'],
  subject:['fach','fachbezeichnung','fach_bezeichnung','fachname','fach_name','subject','unterrichtsfach','modul','modulbezeichnung','lernfeld','lernfeldbezeichnung','thema'],
  subjectShort:['fachkurzel','fachkuerzel','fach_kurzel','fach_kuerzel','kurzel','kuerzel','kurzbezeichnung','fachcode','fach_code','subject_code','modulcode','modul_code'],
  teacher:['dozent','dozentin','dozentenname','dozent_name','lehrer','lehrkraft','lehrkraftname','trainer','trainerin','trainername','teacher','referent','referentin'],
  room:['raum','room','ort','unterrichtsraum','standort'],
  notes:['hinweis','hinweise','info','infos','information','informationen','bemerkung','bemerkungen','notiz','notizen'],
  course:['klasse','kurs','course','class','gruppe','lehrgang'],
  mode:['unterricht','unterrichtsart','format','modus','durchfuhrung','durchfuehrung','prasenz_online','praesenz_online'],
};

function detectMapping(headers:string[]):Mapping{
  const out:Mapping={};
  for(const key of Object.keys(ALIASES) as MappingKey[]){
    const aliases=ALIASES[key],exact=headers.find(h=>aliases.includes(normalizeHeader(h)));
    if(exact){out[key]=exact;continue;}
    const fuzzy=headers.find(h=>aliases.some(a=>normalizeHeader(h).includes(a)||a.includes(normalizeHeader(h))));
    if(fuzzy)out[key]=fuzzy;
  }
  return out;
}
async function parseFile(file:File):Promise<{headers:string[];rows:RawRow[]}>{
  const name=file.name.toLowerCase();
  if(file.type==='text/csv'||name.endsWith('.csv'))return parseCsv(await file.text());
  if(file.type==='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'||name.endsWith('.xlsx'))return parseXlsx(await file.arrayBuffer());
  throw new Error('TIMETABLE_FILE_UNSUPPORTED');
}
function two(n:number){return String(n).padStart(2,'0');}
function parseDate(value:unknown):string|null{
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number'&&Number.isFinite(value)){const d=new Date(Date.UTC(1899,11,30)+Math.floor(value)*86400000);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);}
  const s=String(value).trim();let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);if(m)return`${m[1]}-${two(Number(m[2]))}-${two(Number(m[3]))}`;
  m=s.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{2,4})/);if(m){let y=Number(m[3]);if(y<100)y+=y<70?2000:1900;return`${y}-${two(Number(m[2]))}-${two(Number(m[1]))}`;}
  const d=new Date(s);return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);
}
function parseTime(value:unknown):string|null{
  if(value===null||value===undefined||value==='')return null;
  if(typeof value==='number'&&Number.isFinite(value)){
    if(value>=0&&value<1){const mins=Math.round(value*1440)%1440;return`${two(Math.floor(mins/60))}:${two(mins%60)}`;}
    if(Number.isInteger(value)&&value>=0&&value<=2359){const h=Math.floor(value/100),m=value%100;if(h<24&&m<60)return`${two(h)}:${two(m)}`;}
    if(value>=0&&value<24){const h=Math.floor(value),m=Math.round((value-h)*60);if(m<60)return`${two(h)}:${two(m)}`;}
  }
  const s=String(value).trim();let m=s.match(/(?:^|\s)(\d{1,2})[:.](\d{2})(?::\d{2})?(?:\s|$)/);if(m){const h=Number(m[1]),mi=Number(m[2]);if(h<24&&mi<60)return`${two(h)}:${two(mi)}`;}
  m=s.match(/^(\d{1,2})$/);if(m&&Number(m[1])<24)return`${two(Number(m[1]))}:00`;
  m=s.match(/^(\d{3,4})$/);if(m){const n=Number(m[1]),h=Math.floor(n/100),mi=n%100;if(h<24&&mi<60)return`${two(h)}:${two(mi)}`;}
  const dt=s.match(/T(\d{2}):(\d{2})/);return dt?`${dt[1]}:${dt[2]}`:null;
}
function addDay(date:string){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function value(row:RawRow,mapping:Mapping,key:MappingKey):unknown{const h=mapping[key];return h?row[h]:undefined;}
function clean(v:unknown,max=500):string|null{const s=String(v??'').trim();return s?s.slice(0,max):null;}
function token(v:string){return normalizeHeader(v).replace(/_/g,'');}
function subjectKey(name:string,shortName:string|null){return`${name.toLocaleLowerCase('de-DE')}|${(shortName??'').toLocaleLowerCase('de-DE')}`;}
function canonical(v:string|null){return(v??'').trim().replace(/\s+/g,' ').toLocaleLowerCase('de-DE');}
function slotKey(courseId:string,startsAt:string){return`${courseId}|${startsAt}`;}
function changeKey(type:string,courseId:string,startsAt:string){return`${type}|${courseId}|${startsAt}`;}

async function courses(env:Env,tenantId:string):Promise<CourseRow[]>{const r=await env.DB.prepare('SELECT id,name,code,is_active FROM courses WHERE tenant_id=? ORDER BY name').bind(tenantId).all<CourseRow>();return r.results??[];}
function resolveCourse(text:unknown,all:CourseRow[]):CourseRow|null{
  const s=String(text??'').trim().toLocaleLowerCase('de-DE');if(!s)return null;
  const byCode=all.find(c=>c.code.toLocaleLowerCase('de-DE')===s);if(byCode)return byCode;
  const exact=all.filter(c=>c.name.toLocaleLowerCase('de-DE')===s);return exact.length===1?exact[0]:null;
}
function inferCourseFromFilename(fileName:string,all:CourseRow[],auth:CoreAuthContext):CourseRow|null{
  const base=token(fileName.replace(/\.(pdf|xlsx|csv)$/i,''));if(!base)return null;
  const allowed=all.filter(c=>{try{requireCourseAccess(auth,c.id);return true;}catch{return false;}});
  const scored=allowed.map(c=>{const name=token(c.name),code=token(c.code);let score=0;if(code&&base===code)score=120;else if(name&&base===name)score=115;else if(code&&base.includes(code))score=Math.max(score,90+Math.min(code.length,20));else if(name&&base.includes(name))score=Math.max(score,80+Math.min(name.length,25));return{c,score};}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(!scored.length||(scored.length>1&&scored[0].score===scored[1].score))return null;return scored[0].c;
}
function parseMapping(text:FormDataEntryValue|null,headers:string[]):Mapping{
  if(!text)return detectMapping(headers);
  try{const raw=JSON.parse(String(text)) as Record<string,unknown>,out:Mapping={};for(const key of Object.keys(ALIASES) as MappingKey[]){const h=String(raw[key]??'');if(h&&headers.includes(h))out[key]=h;}return out;}catch{return detectMapping(headers);}
}
function fallbackCourse(form:FormData,file:File,allCourses:CourseRow[],auth:CoreAuthContext):string|undefined{
  const explicit=clean(form.get('course_id'),200)??undefined;if(explicit)return explicit;
  return inferCourseFromFilename(String(form.get('source_name')??file.name),allCourses,auth)?.id;
}
function buildNormalized(rawRows:RawRow[],mapping:Mapping,allCourses:CourseRow[],fallbackCourseId:string|undefined,auth:CoreAuthContext):{rows:NormalizedLesson[];issues:ImportIssue[];duplicates:number}{
  const issues:ImportIssue[]=[],rows:NormalizedLesson[]=[];let duplicates=0;
  for(const key of ['date','start','end'] as MappingKey[])if(!mapping[key])issues.push({row:1,field:key,message:'Erforderliche Spalte wurde nicht erkannt oder zugeordnet.'});
  if(!fallbackCourseId&&!mapping.course)issues.push({row:1,field:'course',message:'Bitte eine Klasse auswählen oder eine Klassenspalte zuordnen.'});
  if(issues.length)return{rows,issues,duplicates};
  const fallback=allCourses.find(c=>c.id===fallbackCourseId);if(fallbackCourseId&&!fallback)issues.push({row:1,field:'course',message:'Die ausgewählte Klasse wurde nicht gefunden.'});
  const seenExact=new Set<string>(),seenSlot=new Set<string>();
  rawRows.forEach((raw,index)=>{
    const rowNo=index+2,course=fallback??resolveCourse(value(raw,mapping,'course'),allCourses);
    if(!course){issues.push({row:rowNo,field:'course',message:'Klasse/Kurs konnte nicht eindeutig zugeordnet werden.',value:value(raw,mapping,'course')});return;}
    if(!course.is_active){issues.push({row:rowNo,field:'course',message:'Die Klasse ist nicht aktiv.',value:course.name});return;}
    try{requireCourseAccess(auth,course.id);}catch{issues.push({row:rowNo,field:'course',message:'Keine Berechtigung für diese Klasse.',value:course.name});return;}
    const date=parseDate(value(raw,mapping,'date')),start=parseTime(value(raw,mapping,'start')),end=parseTime(value(raw,mapping,'end'));
    if(!date){issues.push({row:rowNo,field:'date',message:'Datum konnte nicht gelesen werden.',value:value(raw,mapping,'date')});return;}
    if(!start){issues.push({row:rowNo,field:'start',message:'Beginn konnte nicht gelesen werden.',value:value(raw,mapping,'start')});return;}
    if(!end){issues.push({row:rowNo,field:'end',message:'Ende konnte nicht gelesen werden.',value:value(raw,mapping,'end')});return;}
    if(end<=start){issues.push({row:rowNo,field:'end',message:'Das Ende muss nach dem Beginn liegen.',value:value(raw,mapping,'end')});return;}
    let subject=clean(value(raw,mapping,'subject'),200),subjectShort=clean(value(raw,mapping,'subjectShort'),80);if(!subject&&subjectShort)subject=subjectShort;
    const teacher=clean(value(raw,mapping,'teacher'),200),room=clean(value(raw,mapping,'room'),200),note=clean(value(raw,mapping,'notes'),2000),lessonMode=clean(value(raw,mapping,'mode'),200);
    const notes=[lessonMode?`Unterrichtsart: ${lessonMode}`:null,note].filter(Boolean).join('\n')||null,startsAt=`${date}T${start}:00`,endsAt=`${date}T${end}:00`;
    const slot=slotKey(course.id,startsAt);if(seenSlot.has(slot)){issues.push({row:rowNo,field:'start',message:'Für diese Klasse gibt es in der Datei mehr als einen Unterrichtseintrag mit demselben Beginn.',value:`${date} ${start}`});return;}seenSlot.add(slot);
    const exact=[course.id,startsAt,endsAt,canonical(subject),canonical(subjectShort),canonical(teacher),canonical(room),canonical(notes)].join('|');if(seenExact.has(exact)){duplicates++;return;}seenExact.add(exact);
    rows.push({rowNo,lessonId:id('les_'),courseId:course.id,courseName:course.name,date,startsAt,endsAt,subject,subjectShort,teacher,room,notes});
  });
  return{rows,issues,duplicates};
}
function lessonEqual(a:ExistingLesson,b:NormalizedLesson){return a.endsAt===b.endsAt&&canonical(a.subject)===canonical(b.subject)&&canonical(a.subjectShort)===canonical(b.subjectShort)&&canonical(a.teacher)===canonical(b.teacher)&&canonical(a.room)===canonical(b.room)&&canonical(a.notes)===canonical(b.notes);}
function publicExisting(x:ExistingLesson):LessonPublic{return{klasse:x.courseName,datum:x.startsAt.slice(0,10),beginn:x.startsAt.slice(11,16),ende:x.endsAt.slice(11,16),fach:x.subject,fachkuerzel:x.subjectShort,dozent:x.teacher,raum:x.room,hinweise:x.notes};}
function publicNew(x:NormalizedLesson):LessonPublic{return{klasse:x.courseName,datum:x.date,beginn:x.startsAt.slice(11,16),ende:x.endsAt.slice(11,16),fach:x.subject,fachkuerzel:x.subjectShort,dozent:x.teacher,raum:x.room,hinweise:x.notes};}

async function existingImported(env:Env,tenantId:string,rows:NormalizedLesson[]):Promise<ExistingLesson[]>{
  const byCourse=new Map<string,{from:string;to:string}>();
  for(const r of rows){const x=byCourse.get(r.courseId);if(!x)byCourse.set(r.courseId,{from:r.date,to:r.date});else{if(r.date<x.from)x.from=r.date;if(r.date>x.to)x.to=r.date;}}
  const out:ExistingLesson[]=[];
  for(const [courseId,range] of byCourse){
    const courseName=rows.find(r=>r.courseId===courseId)?.courseName??'';
    const q=await env.DB.prepare(`SELECT DISTINCT l.id,l.course_id,l.starts_at,l.ends_at,l.room,l.notes,s.name AS subject,s.short_name AS subject_short,t.name AS teacher
      FROM lessons l JOIN timetable_import_lessons til ON til.lesson_id=l.id
      LEFT JOIN subjects s ON s.id=l.subject_id LEFT JOIN teachers t ON t.id=l.teacher_id
      WHERE l.tenant_id=? AND l.course_id=? AND l.starts_at>=? AND l.starts_at<? ORDER BY l.starts_at,l.id`)
      .bind(tenantId,courseId,`${range.from}T00:00:00`,`${addDay(range.to)}T00:00:00`).all<{id:string;course_id:string;starts_at:string;ends_at:string;room:string|null;notes:string|null;subject:string|null;subject_short:string|null;teacher:string|null}>();
    for(const x of q.results??[])out.push({id:x.id,courseId:x.course_id,courseName,startsAt:x.starts_at,endsAt:x.ends_at,subject:x.subject,subjectShort:x.subject_short,teacher:x.teacher,room:x.room,notes:x.notes});
  }
  return out;
}
async function diffTimetable(env:Env,tenantId:string,rows:NormalizedLesson[],mode:string):Promise<{changes:TimetableChange[];unchanged:number}>{
  const old=await existingImported(env,tenantId,rows),groups=new Map<string,ExistingLesson[]>();
  for(const x of old){const k=slotKey(x.courseId,x.startsAt),g=groups.get(k)??[];g.push(x);groups.set(k,g);}
  const changes:TimetableChange[]=[];let unchanged=0;
  for(const n of rows){const k=slotKey(n.courseId,n.startsAt),g=groups.get(k)??[],before=g.shift()??null;if(g.length)groups.set(k,g);else groups.delete(k);
    if(!before){changes.push({key:changeKey('add',n.courseId,n.startsAt),type:'add',courseId:n.courseId,before:null,after:n});continue;}
    if(lessonEqual(before,n)){unchanged++;continue;}
    if(mode==='append'){unchanged++;continue;}
    changes.push({key:changeKey('update',n.courseId,n.startsAt),type:'update',courseId:n.courseId,before,after:n});
  }
  if(mode!=='append')for(const leftovers of groups.values())for(const before of leftovers)changes.push({key:changeKey('remove',before.courseId,before.startsAt),type:'remove',courseId:before.courseId,before,after:null});
  return{changes,unchanged};
}

async function getOrCreateSubjects(env:Env,tenantId:string,items:SubjectInput[]):Promise<Map<string,string>>{
  const out=new Map<string,string>(),existing=await env.DB.prepare('SELECT id,name,short_name FROM subjects WHERE tenant_id=?').bind(tenantId).all<{id:string;name:string;short_name:string|null}>();
  const byName=new Map<string,{id:string;short:string|null}>(),byShort=new Map<string,{id:string;name:string}>();for(const x of existing.results??[]){byName.set(x.name.toLocaleLowerCase('de-DE'),{id:x.id,short:x.short_name});if(x.short_name)byShort.set(x.short_name.toLocaleLowerCase('de-DE'),{id:x.id,name:x.name});}
  const unique=new Map<string,SubjectInput>();for(const item of items)unique.set(subjectKey(item.name,item.shortName),item);
  for(const item of unique.values()){
    const nk=item.name.toLocaleLowerCase('de-DE'),sk=item.shortName?.toLocaleLowerCase('de-DE')??'';let found=byName.get(nk),foundId=found?.id;if(!foundId&&sk)foundId=byShort.get(sk)?.id;
    if(foundId){if(item.shortName&&found&&!found.short){await env.DB.prepare('UPDATE subjects SET short_name=? WHERE id=? AND tenant_id=?').bind(item.shortName,foundId,tenantId).run();found.short=item.shortName;}out.set(subjectKey(item.name,item.shortName),foundId);continue;}
    const newId=id('sub_');await env.DB.prepare('INSERT OR IGNORE INTO subjects(id,tenant_id,name,short_name,created_at) VALUES(?,?,?,?,?)').bind(newId,tenantId,item.name,item.shortName,nowIso()).run();
    const row=await env.DB.prepare('SELECT id FROM subjects WHERE tenant_id=? AND name=? COLLATE NOCASE').bind(tenantId,item.name).first<{id:string}>();out.set(subjectKey(item.name,item.shortName),row?.id??newId);
  }
  return out;
}
async function getOrCreateTeachers(env:Env,tenantId:string,names:string[]):Promise<Map<string,string>>{
  const out=new Map<string,string>(),existing=await env.DB.prepare('SELECT id,name FROM teachers WHERE tenant_id=?').bind(tenantId).all<{id:string;name:string}>();for(const x of existing.results??[])out.set(x.name.toLocaleLowerCase('de-DE'),x.id);
  for(const name of [...new Set(names)]){const k=name.toLocaleLowerCase('de-DE');if(out.has(k))continue;const newId=id('tch_');await env.DB.prepare('INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES(?,?,?,?,?)').bind(newId,tenantId,name,null,nowIso()).run();out.set(k,newId);}return out;
}

export async function getTimetableUpdatePreference(env:Env,auth:CoreAuthContext,tenantId:string):Promise<{confirmationMode:ConfirmationMode}>{
  requireRole(auth,'class_admin');const row=await env.DB.prepare('SELECT confirmation_mode FROM timetable_update_preferences WHERE tenant_id=?').bind(tenantId).first<{confirmation_mode:ConfirmationMode}>();return{confirmationMode:row?.confirmation_mode??'batch'};
}
export async function setTimetableUpdatePreference(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>):Promise<{confirmationMode:ConfirmationMode}>{
  requireRole(auth,'tenant_admin');const mode=String(input.confirmation_mode||'') as ConfirmationMode;if(!['individual','batch','automatic'].includes(mode))throw new Error('TIMETABLE_CONFIRMATION_MODE_INVALID');
  await env.DB.prepare(`INSERT INTO timetable_update_preferences(tenant_id,confirmation_mode,updated_by,updated_at) VALUES(?,?,?,?)
    ON CONFLICT(tenant_id) DO UPDATE SET confirmation_mode=excluded.confirmation_mode,updated_by=excluded.updated_by,updated_at=excluded.updated_at`).bind(tenantId,mode,auth.userId,nowIso()).run();
  await audit(env.DB,auth.userId,'timetable.preference.updated',tenantId,undefined,'timetable_update_preference',tenantId,{confirmationMode:mode});return{confirmationMode:mode};
}

export async function previewTimetable(env:Env,auth:CoreAuthContext,tenantId:string,request:Request):Promise<Record<string,unknown>>{
  requireRole(auth,'class_admin');const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('TIMETABLE_FILE_REQUIRED');if(file.size>20*1024*1024)throw new Error('TIMETABLE_FILE_TOO_LARGE');
  const mode=String(form.get('mode')??'sync');if(!['sync','append'].includes(mode))throw new Error('TIMETABLE_MODE_INVALID');
  const parsed=await parseFile(file);if(!parsed.rows.length)throw new Error('TIMETABLE_EMPTY');if(parsed.rows.length>5000)throw new Error('TIMETABLE_TOO_MANY_ROWS');
  const mapping=parseMapping(form.get('mapping'),parsed.headers),allCourses=await courses(env,tenantId),fallbackCourseId=fallbackCourse(form,file,allCourses,auth),normalized=buildNormalized(parsed.rows,mapping,allCourses,fallbackCourseId,auth);
  const dates=normalized.rows.map(r=>r.date).sort(),subjects=[...new Map(normalized.rows.filter(r=>r.subject).map(r=>[subjectKey(r.subject!,r.subjectShort),{name:r.subject!,shortName:r.subjectShort}])).values()],teachers=[...new Set(normalized.rows.flatMap(r=>r.teacher?[r.teacher]:[]))].sort((a,b)=>a.localeCompare(b,'de'));
  let changes:TimetableChange[]=[],unchanged=0;if(!normalized.issues.length&&normalized.rows.length){const d=await diffTimetable(env,tenantId,normalized.rows,mode);changes=d.changes;unchanged=d.unchanged;}
  const pref=await getTimetableUpdatePreference(env,auth,tenantId),counts={added:changes.filter(x=>x.type==='add').length,updated:changes.filter(x=>x.type==='update').length,removed:changes.filter(x=>x.type==='remove').length,unchanged,totalChanges:changes.length};
  return{headers:parsed.headers,mapping,autoCourseId:fallbackCourseId??null,rowsSeen:parsed.rows.length,rowsValid:normalized.rows.length,rowsInvalid:new Set(normalized.issues.filter(x=>x.row>1).map(x=>x.row)).size,duplicates:normalized.duplicates,dateFrom:dates[0]??null,dateTo:dates.at(-1)??null,subjects,teachers,issues:normalized.issues.slice(0,250),sample:normalized.rows.slice(0,15).map(r=>({row:r.rowNo,...publicNew(r)})),confirmationMode:pref.confirmationMode,changeSummary:counts,changes:changes.slice(0,2000).map(c=>({key:c.key,type:c.type,before:c.before?publicExisting(c.before):null,after:c.after?publicNew(c.after):null}))};
}

export async function applyTimetable(env:Env,auth:CoreAuthContext,tenantId:string,request:Request):Promise<Record<string,unknown>>{
  requireRole(auth,'class_admin');const form=await request.formData(),file=form.get('file');if(!(file instanceof File))throw new Error('TIMETABLE_FILE_REQUIRED');if(file.size>20*1024*1024)throw new Error('TIMETABLE_FILE_TOO_LARGE');
  const mode=String(form.get('mode')??'sync');if(!['sync','append'].includes(mode))throw new Error('TIMETABLE_MODE_INVALID');
  const parsed=await parseFile(file);if(!parsed.rows.length)throw new Error('TIMETABLE_EMPTY');if(parsed.rows.length>5000)throw new Error('TIMETABLE_TOO_MANY_ROWS');
  const mapping=parseMapping(form.get('mapping'),parsed.headers),allCourses=await courses(env,tenantId),fallbackCourseId=fallbackCourse(form,file,allCourses,auth),normalized=buildNormalized(parsed.rows,mapping,allCourses,fallbackCourseId,auth);
  if(normalized.issues.length){const e=new Error('TIMETABLE_VALIDATION_FAILED') as Error&{issues?:ImportIssue[]};e.issues=normalized.issues.slice(0,500);throw e;}if(!normalized.rows.length)throw new Error('TIMETABLE_NO_VALID_ROWS');
  const diff=await diffTimetable(env,tenantId,normalized.rows,mode),saved=(await getTimetableUpdatePreference(env,auth,tenantId)).confirmationMode,requested=String(form.get('confirmation_mode')??saved) as ConfirmationMode;
  if(!['individual','batch','automatic'].includes(requested))throw new Error('TIMETABLE_CONFIRMATION_MODE_INVALID');
  let approvedKeys=new Set<string>();if(requested==='automatic')approvedKeys=new Set(diff.changes.map(x=>x.key));else if(requested==='batch'){if(String(form.get('confirm_batch')??'')!=='1')throw new Error('TIMETABLE_BATCH_CONFIRMATION_REQUIRED');approvedKeys=new Set(diff.changes.map(x=>x.key));}else{try{const arr=JSON.parse(String(form.get('approved_changes')??'[]'));if(Array.isArray(arr))approvedKeys=new Set(arr.map(String));}catch{throw new Error('TIMETABLE_INDIVIDUAL_CONFIRMATION_INVALID');}}
  const applied=diff.changes.filter(c=>approvedKeys.has(c.key)),rejected=diff.changes.filter(c=>!approvedKeys.has(c.key));
  const newRows=applied.flatMap(c=>c.after?[c.after]:[]),subjectInputs=newRows.flatMap(r=>r.subject?[{name:r.subject,shortName:r.subjectShort}]:[]),subjectMap=await getOrCreateSubjects(env,tenantId,subjectInputs),teacherMap=await getOrCreateTeachers(env,tenantId,newRows.flatMap(r=>r.teacher?[r.teacher]:[]));
  const dates=normalized.rows.map(r=>r.date).sort(),dateFrom=dates[0]??null,dateTo=dates.at(-1)??null,runId=id('tti_'),created=nowIso(),originalName=safeString(String(form.get('source_name')??file.name),250);
  await env.DB.prepare("INSERT INTO timetable_import_runs(id,tenant_id,original_name,mode,row_count,status,created_by,created_at,date_from,date_to) VALUES(?,?,?,?,?,'staging',?,?,?,?)").bind(runId,tenantId,originalName,mode,normalized.rows.length,auth.userId,created,dateFrom,dateTo).run();
  try{
    const statements=[];
    for(const c of applied){
      if(c.before)statements.push(env.DB.prepare('DELETE FROM lessons WHERE id=? AND tenant_id=?').bind(c.before.id,tenantId));
      if(c.after){const r=c.after,subjectId=r.subject?subjectMap.get(subjectKey(r.subject,r.subjectShort))??null:null,teacherId=r.teacher?teacherMap.get(r.teacher.toLocaleLowerCase('de-DE'))??null:null;
        statements.push(env.DB.prepare('INSERT INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(r.lessonId,tenantId,r.courseId,subjectId,teacherId,r.startsAt,r.endsAt,r.room,r.notes,created));
        statements.push(env.DB.prepare('INSERT INTO timetable_import_lessons(run_id,tenant_id,course_id,lesson_id,starts_at,ends_at,source_row_no) VALUES(?,?,?,?,?,?,?)').bind(runId,tenantId,r.courseId,r.lessonId,r.startsAt,r.endsAt,r.rowNo));
      }
    }
    for(const c of diff.changes){const decision=approvedKeys.has(c.key)?'applied':'rejected';statements.push(env.DB.prepare('INSERT INTO timetable_update_decisions(id,run_id,tenant_id,course_id,change_key,change_type,before_json,after_json,decision,decided_by,decided_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id('tud_'),runId,tenantId,c.courseId,c.key,c.type,c.before?JSON.stringify(publicExisting(c.before)):null,c.after?JSON.stringify(publicNew(c.after)):null,decision,auth.userId,nowIso()));}
    for(let i=0;i<statements.length;i+=70)await env.DB.batch(statements.slice(i,i+70));
    const added=applied.filter(x=>x.type==='add').length,updated=applied.filter(x=>x.type==='update').length,removed=applied.filter(x=>x.type==='remove').length,imported=added+updated,skipped=diff.unchanged+rejected.length+normalized.duplicates;
    await env.DB.prepare("UPDATE timetable_import_runs SET status='completed',imported_count=?,skipped_count=?,completed_at=? WHERE id=?").bind(imported,skipped,nowIso(),runId).run();
    await audit(env.DB,auth.userId,'timetable.updated',tenantId,undefined,'timetable_import',runId,{mode,confirmationMode:requested,added,updated,removed,rejected:rejected.length,unchanged:diff.unchanged,dateFrom,dateTo});
    return{runId,imported,skipped,added,updated,removed,rejected:rejected.length,unchanged:diff.unchanged,dateFrom,dateTo,confirmationMode:requested,totalChanges:diff.changes.length};
  }catch(e){await env.DB.prepare("UPDATE timetable_import_runs SET status='failed',error_message=?,completed_at=? WHERE id=?").bind(String((e as Error)?.message||'IMPORT_FAILED').slice(0,1000),nowIso(),runId).run();throw e;}
}
