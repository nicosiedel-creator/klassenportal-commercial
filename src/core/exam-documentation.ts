import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { hasPermission } from './enterprise-access.js';
import { teacherAttendanceAuth } from './teacher-portal.js';
import { id, nowIso, safeString } from './utils.js';

type FieldKey=
  |'date'|'start'|'end'|'duration_minutes'|'subject'|'planned_topic'|'actual_topic'
  |'content_summary'|'homework_summary'|'teacher'|'substitute_teacher'|'room'
  |'delivery_mode'|'classbook_status'|'source';

type ProfileSettings={
  fields:FieldKey[];
  required_fields:FieldKey[];
  grouping:'chronological'|'subject'|'month';
  signature_provider:boolean;
  signature_teacher:boolean;
  signature_lead:boolean;
  include_incomplete:boolean;
  guidance?:string;
};

type ExportProfile={
  ref:string;
  name:string;
  authority_type:string;
  builtin:boolean;
  settings:ProfileSettings;
  notes?:string|null;
  source_reference?:string|null;
};

type ExportRow={
  id:string;
  date:string;
  start:string;
  end:string;
  duration_minutes:number|null;
  subject:string;
  planned_topic:string;
  actual_topic:string;
  content_summary:string;
  homework_summary:string;
  teacher:string;
  substitute_teacher:string;
  room:string;
  delivery_mode:string;
  classbook_status:string;
  source:string;
};

type ExportData={
  course:Record<string,unknown>;
  profile:ExportProfile;
  rows:ExportRow[];
  warnings:string[];
  coverage:{sessions:number;completed:number;open:number;missing_topic:number;total_minutes:number;total_hours:number};
  period:{from:string|null;to:string|null};
};

const FIELD_LABELS:Record<FieldKey,string>={
  date:'Datum',
  start:'Beginn',
  end:'Ende',
  duration_minutes:'Dauer (Min.)',
  subject:'Fach / Lerngebiet',
  planned_topic:'Geplantes Thema',
  actual_topic:'Behandeltes Thema',
  content_summary:'Behandelte Inhalte',
  homework_summary:'Hausaufgaben / nächste Schritte',
  teacher:'Dozent/in',
  substitute_teacher:'Vertretung',
  room:'Raum',
  delivery_mode:'Unterrichtsart',
  classbook_status:'Klassenbuchstatus',
  source:'Quelle',
};
const ALLOWED_FIELDS=new Set<FieldKey>(Object.keys(FIELD_LABELS) as FieldKey[]);
const DEFAULT_FIELDS:FieldKey[]=['date','start','end','duration_minutes','subject','actual_topic','content_summary','teacher','room'];
const DEFAULT_REQUIRED:FieldKey[]=['date','duration_minutes','subject','actual_topic'];

function settings(fields:FieldKey[]=DEFAULT_FIELDS,required:FieldKey[]=DEFAULT_REQUIRED):ProfileSettings{
  return{fields,required_fields:required,grouping:'chronological',signature_provider:true,signature_teacher:false,signature_lead:false,include_incomplete:true};
}

const BUILTIN_PROFILES:ExportProfile[]=[
  {
    ref:'builtin:topics',
    name:'Unterrichtsnachweis · Themen (datensparsam)',
    authority_type:'internal',
    builtin:true,
    settings:{...settings(),guidance:'Neutraler Unterrichtsnachweis ohne Teilnehmer-, Anwesenheits- oder Notendaten.'},
    notes:'Geeignet als allgemeiner fachlicher Nachweis oder Anlage für Prüfungs- und Qualitätsstellen.',
  },
  {
    ref:'builtin:ihk-berlin-umschulung',
    name:'IHK Berlin · Umschulung / Unterrichtsgebiete',
    authority_type:'ihk',
    builtin:true,
    settings:{
      ...settings(['date','start','end','duration_minutes','subject','planned_topic','actual_topic','content_summary','teacher','delivery_mode'],DEFAULT_REQUIRED),
      signature_lead:true,
      guidance:'IHK Berlin verlangt bei außerbetrieblichen Umschulungen insbesondere den Nachweis, dass theoretische und praktische Ausbildungsinhalte vermittelt wurden. Bei erheblichen Fehlzeiten kann zusätzlich ein detaillierter Nachweis der betroffenen Unterrichts-/Praxisgebiete und ihres Ausgleichs nötig sein. Dieser Export enthält bewusst keine personenbezogenen Fehlzeiten.',
    },
    notes:'Dokumentationsvorlage – kein von der IHK vorgegebenes Uploadformat. Individuelle Fehlzeiten/Nachholnachweise bleiben ein getrenntes, stärker geschütztes Verfahren.',
    source_reference:'IHK Berlin: Zulassung zur IHK-Prüfung im Anschluss an außerbetriebliche Umschulungsmaßnahmen',
  },
  {
    ref:'builtin:hwk-berlin',
    name:'Handwerkskammer Berlin · Ausbildungs-/Umschulungsnachweis',
    authority_type:'hwk',
    builtin:true,
    settings:{
      ...settings(['date','start','end','duration_minutes','subject','actual_topic','content_summary','teacher','delivery_mode','room'],DEFAULT_REQUIRED),
      signature_teacher:true,
      guidance:'Die Handwerkskammer Berlin nennt regelmäßig geführte Ausbildungsnachweise/Berichtshefte als Zulassungsnachweis; Inhalte und zeitliche Dauer sollen nachvollziehbar sein. Dieser Klassenbuch-Export kann die trägerseitige Unterrichtsdokumentation unterstützen, ersetzt aber nicht automatisch einen individuell zu führenden Ausbildungsnachweis.',
    },
    notes:'Dokumentationsvorlage – die konkrete Ausbildungsordnung und ggf. Innungsanforderungen bleiben maßgeblich.',
    source_reference:'Handwerkskammer Berlin: Prüfungen / Berichtsheftführung',
  },
  {
    ref:'builtin:vak-berlin-vfa',
    name:'VAk Berlin · Verwaltungsfachangestellte/r',
    authority_type:'vak',
    builtin:true,
    settings:{
      ...settings(['date','start','end','duration_minutes','subject','planned_topic','actual_topic','content_summary','teacher'],DEFAULT_REQUIRED),
      signature_lead:true,
      guidance:'Die VAk Berlin ist zuständige Stelle nach dem BBiG für den öffentlichen Dienst des Landes Berlin. Für Verwaltungsfachangestellte sind Ausbildungsinhalte sachlich und zeitlich gegliedert zu vermitteln; die Abschlussprüfung erfasst den während Ausbildung, Berufsschule und dienstbegleitender Unterweisung erworbenen Lehrstoff. Für einen reinen Klassenbuch-Themenexport ist öffentlich kein verbindliches VAk-Dateiformat ausgewiesen.',
    },
    notes:'Deshalb bleibt das Profil bewusst anpassbar und behauptet keine automatische Anerkennung als amtlicher Ausbildungsnachweis.',
    source_reference:'VAk Berlin: Prüfungsamt / Lehrgang Verwaltungsfachangestellte/r',
  },
];

function fieldList(value:unknown,fallback:FieldKey[]):FieldKey[]{
  const source:unknown[]=Array.isArray(value)?value:fallback;
  const result=source.map(v=>String(v)).filter((v):v is FieldKey=>ALLOWED_FIELDS.has(v as FieldKey));
  return result.length?result:[...fallback];
}

function parseSettings(raw:unknown):ProfileSettings{
  let value:Record<string,unknown>={};
  try{
    const parsed=typeof raw==='string'?JSON.parse(raw):raw;
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))value=parsed as Record<string,unknown>;
  }catch{}
  const fields=fieldList(value.fields,DEFAULT_FIELDS);
  const required=fieldList(value.required_fields,DEFAULT_REQUIRED).filter(v=>fields.includes(v));
  const groupingValue=String(value.grouping||'chronological');
  const grouping:ProfileSettings['grouping']=groupingValue==='subject'||groupingValue==='month'?groupingValue:'chronological';
  return{
    fields,
    required_fields:required,
    grouping,
    signature_provider:value.signature_provider!==false,
    signature_teacher:value.signature_teacher===true,
    signature_lead:value.signature_lead===true,
    include_incomplete:value.include_incomplete!==false,
    guidance:safeString(value.guidance,3000)||undefined,
  };
}

function tenantAdmin(auth:CoreAuthContext){
  if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin')throw new Error('TENANT_ADMIN_REQUIRED');
}
function day(value:unknown):string|null{
  const result=safeString(value,20);
  if(!result)return null;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(result))throw new Error('CLASSBOOK_EXPORT_DATE_INVALID');
  return result;
}
function esc(value:unknown):string{
  return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char));
}
function csvCell(value:unknown):string{return `"${String(value??'').replace(/"/g,'""')}"`;}
function localDate(value:unknown):string{const d=new Date(String(value||''));return Number.isNaN(d.getTime())?'':d.toLocaleDateString('de-DE');}
function localTime(value:unknown):string{const d=new Date(String(value||''));return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'});}
function modeLabel(value:unknown):string{return({onsite:'Präsenz',remote:'Online',hybrid:'Hybrid'} as Record<string,string>)[String(value||'')]||String(value||'');}

export async function classbookReportAuth(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string):Promise<CoreAuthContext>{
  if(auth.isPlatformAdmin||auth.role==='tenant_admin')return auth;
  if(hasPermission(auth,'reports.view')&&auth.courseIds.includes(courseId))return auth;
  try{return await teacherAttendanceAuth(env,auth,tenantId,courseId);}
  catch{throw new Error('FORBIDDEN_CLASSBOOK_EXPORT');}
}

export async function listExamAuthorityProfiles(env:Env,auth:CoreAuthContext,tenantId:string,courseId?:string){
  if(courseId)await classbookReportAuth(env,auth,tenantId,courseId);
  else if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'&&!hasPermission(auth,'reports.view'))throw new Error('FORBIDDEN_CLASSBOOK_EXPORT');
  const custom=(await env.DB.prepare('SELECT id,name,authority_type,settings_json,notes,source_reference FROM exam_authority_profiles WHERE tenant_id=? AND is_active=1 ORDER BY name').bind(tenantId).all<Record<string,unknown>>()).results??[];
  let selected:string|null=null;
  if(courseId){
    const row=await env.DB.prepare('SELECT profile_ref FROM course_exam_authority_profiles WHERE tenant_id=? AND course_id=?').bind(tenantId,courseId).first<{profile_ref:string}>();
    selected=row?.profile_ref||null;
  }
  const customProfiles:ExportProfile[]=custom.map(row=>({
    ref:`custom:${String(row.id)}`,
    name:String(row.name||''),
    authority_type:String(row.authority_type||'custom'),
    builtin:false,
    settings:parseSettings(row.settings_json),
    notes:row.notes?String(row.notes):null,
    source_reference:row.source_reference?String(row.source_reference):null,
  }));
  return{profiles:[...BUILTIN_PROFILES,...customProfiles],selected_profile_ref:selected||'builtin:topics',field_labels:FIELD_LABELS};
}

export async function saveExamAuthorityProfile(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  tenantAdmin(auth);
  const name=safeString(input.name,200),authorityType=String(input.authority_type||'custom');
  if(!name||!['ihk','hwk','vak','internal','custom','other'].includes(authorityType))throw new Error('EXAM_PROFILE_INVALID');
  const profileSettings=parseSettings(input.settings),profileId=safeString(input.id,120)||id('eap_'),ts=nowIso(),notes=safeString(input.notes,5000)||null,source=safeString(input.source_reference,1000)||null;
  const exists=await env.DB.prepare('SELECT id FROM exam_authority_profiles WHERE tenant_id=? AND id=?').bind(tenantId,profileId).first();
  if(exists){
    await env.DB.prepare('UPDATE exam_authority_profiles SET name=?,authority_type=?,settings_json=?,notes=?,source_reference=?,is_active=1,updated_at=? WHERE tenant_id=? AND id=?').bind(name,authorityType,JSON.stringify(profileSettings),notes,source,ts,tenantId,profileId).run();
  }else{
    await env.DB.prepare('INSERT INTO exam_authority_profiles(id,tenant_id,name,authority_type,settings_json,notes,source_reference,is_active,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,?,?,?)').bind(profileId,tenantId,name,authorityType,JSON.stringify(profileSettings),notes,source,auth.userId,ts,ts).run();
  }
  await audit(env.DB,auth.userId,'exam_documentation.profile_saved',tenantId,undefined,'exam_authority_profile',profileId,{name,type:authorityType});
  return{ref:`custom:${profileId}`,id:profileId,name,authority_type:authorityType,settings:profileSettings,notes,source_reference:source};
}

export async function deleteExamAuthorityProfile(env:Env,auth:CoreAuthContext,tenantId:string,profileId:string){
  tenantAdmin(auth);
  const row=await env.DB.prepare('SELECT id FROM exam_authority_profiles WHERE tenant_id=? AND id=?').bind(tenantId,profileId).first();
  if(!row)throw new Error('EXAM_PROFILE_NOT_FOUND');
  await env.DB.prepare('UPDATE exam_authority_profiles SET is_active=0,updated_at=? WHERE tenant_id=? AND id=?').bind(nowIso(),tenantId,profileId).run();
  await audit(env.DB,auth.userId,'exam_documentation.profile_disabled',tenantId,undefined,'exam_authority_profile',profileId);
}

export async function saveCourseExamAuthorityProfile(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,profileRef:string){
  tenantAdmin(auth);
  const course=await env.DB.prepare('SELECT id FROM courses WHERE tenant_id=? AND id=?').bind(tenantId,courseId).first();
  if(!course)throw new Error('COURSE_NOT_FOUND');
  await resolveProfile(env,tenantId,profileRef);
  const ts=nowIso();
  await env.DB.prepare('INSERT INTO course_exam_authority_profiles(tenant_id,course_id,profile_ref,updated_by,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(tenant_id,course_id) DO UPDATE SET profile_ref=excluded.profile_ref,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(tenantId,courseId,profileRef,auth.userId,ts).run();
  await audit(env.DB,auth.userId,'exam_documentation.course_profile_saved',tenantId,courseId,'course',courseId,{profileRef});
  return{course_id:courseId,profile_ref:profileRef};
}

async function resolveProfile(env:Env,tenantId:string,ref:string):Promise<ExportProfile>{
  const builtin=BUILTIN_PROFILES.find(profile=>profile.ref===ref);
  if(builtin)return builtin;
  if(!ref.startsWith('custom:'))throw new Error('EXAM_PROFILE_NOT_FOUND');
  const profileId=ref.slice(7);
  const row=await env.DB.prepare('SELECT id,name,authority_type,settings_json,notes,source_reference FROM exam_authority_profiles WHERE tenant_id=? AND id=? AND is_active=1').bind(tenantId,profileId).first<Record<string,unknown>>();
  if(!row)throw new Error('EXAM_PROFILE_NOT_FOUND');
  return{
    ref,
    name:String(row.name||''),
    authority_type:String(row.authority_type||'custom'),
    builtin:false,
    settings:parseSettings(row.settings_json),
    notes:row.notes?String(row.notes):null,
    source_reference:row.source_reference?String(row.source_reference):null,
  };
}

async function exportData(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>):Promise<ExportData>{
  await classbookReportAuth(env,auth,tenantId,courseId);
  const from=day(input.from),to=day(input.to);
  if(from&&to&&from>to)throw new Error('CLASSBOOK_EXPORT_RANGE_INVALID');
  const course=await env.DB.prepare('SELECT c.id,c.name,c.code,c.start_date,c.end_date,t.name tenant_name FROM courses c JOIN tenants t ON t.id=c.tenant_id WHERE c.tenant_id=? AND c.id=?').bind(tenantId,courseId).first<Record<string,unknown>>();
  if(!course)throw new Error('COURSE_NOT_FOUND');
  let profileRef=safeString(input.profile_ref,180);
  if(!profileRef){
    const selected=await env.DB.prepare('SELECT profile_ref FROM course_exam_authority_profiles WHERE tenant_id=? AND course_id=?').bind(tenantId,courseId).first<{profile_ref:string}>();
    profileRef=selected?.profile_ref||'builtin:topics';
  }
  const profile=await resolveProfile(env,tenantId,profileRef);
  let sql=`SELECT s.id,s.session_date,s.starts_at,s.ends_at,s.subject,s.room,s.instructor_text,s.delivery_mode,s.status,s.source,s.source_ref,
    cb.topic,cb.content_summary,cb.homework_summary,cb.substitute_instructor,cb.completed,
    hd.planned_topic
    FROM attendance_sessions s
    LEFT JOIN classbook_entries cb ON cb.session_id=s.id
    LEFT JOIN lesson_hub_details hd ON s.source='timetable' AND s.source_ref=('lesson:' || hd.lesson_id) AND hd.tenant_id=s.tenant_id AND hd.course_id=s.course_id
    WHERE s.tenant_id=? AND s.course_id=? AND s.status<>'cancelled'`;
  const args:unknown[]=[tenantId,courseId];
  if(from){sql+=' AND s.session_date>=?';args.push(from);}
  if(to){sql+=' AND s.session_date<=?';args.push(to);}
  sql+=' ORDER BY s.starts_at ASC LIMIT 5000';
  const raw=(await env.DB.prepare(sql).bind(...args).all<Record<string,unknown>>()).results??[];
  const rows:ExportRow[]=raw.map(row=>{
    const startDate=new Date(String(row.starts_at||'')),endDate=new Date(String(row.ends_at||''));
    const duration=Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime())?null:Math.max(0,Math.round((endDate.getTime()-startDate.getTime())/60000));
    return{
      id:String(row.id),
      date:localDate(row.starts_at)||String(row.session_date||''),
      start:localTime(row.starts_at),
      end:localTime(row.ends_at),
      duration_minutes:duration,
      subject:String(row.subject||''),
      planned_topic:String(row.planned_topic||''),
      actual_topic:String(row.topic||''),
      content_summary:String(row.content_summary||''),
      homework_summary:String(row.homework_summary||''),
      teacher:String(row.instructor_text||''),
      substitute_teacher:String(row.substitute_instructor||''),
      room:String(row.room||''),
      delivery_mode:modeLabel(row.delivery_mode),
      classbook_status:Number(row.completed||0)===1?'Abgeschlossen':row.topic||row.content_summary?'In Bearbeitung':'Offen',
      source:String(row.source||''),
    };
  }).filter(row=>profile.settings.include_incomplete||row.classbook_status==='Abgeschlossen');
  const warnings:string[]=[];
  if(!rows.length)warnings.push('Für den gewählten Zeitraum liegen keine Klassenbucheinträge/Unterrichtssitzungen vor.');
  for(const row of rows){
    const missing=profile.settings.required_fields.filter(field=>!String(row[field]??'').trim());
    if(missing.length)warnings.push(`${row.date} ${row.start} · ${row.subject||'Unterricht'}: fehlt ${missing.map(field=>FIELD_LABELS[field]).join(', ')}`);
  }
  const completed=rows.filter(row=>row.classbook_status==='Abgeschlossen').length;
  const minutes=rows.reduce((sum,row)=>sum+Number(row.duration_minutes||0),0);
  const missingTopic=rows.filter(row=>!row.actual_topic.trim()).length;
  return{
    course,
    profile,
    rows,
    warnings,
    coverage:{sessions:rows.length,completed,open:rows.length-completed,missing_topic:missingTopic,total_minutes:minutes,total_hours:Math.round(minutes/6)/10},
    period:{from,to},
  };
}

async function digest(value:unknown):Promise<string>{
  const bytes=new TextEncoder().encode(JSON.stringify(value));
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  return [...hash].map(value=>value.toString(16).padStart(2,'0')).join('');
}

async function recordRun(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,data:ExportData,format:'preview'|'csv'|'html'){
  const runId=id('cer_'),ts=nowIso(),hash=await digest({profile:data.profile.ref,period:data.period,rows:data.rows});
  await env.DB.prepare('INSERT INTO classbook_export_runs(id,tenant_id,course_id,profile_ref,period_from,period_to,format,row_count,warning_count,content_digest,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(runId,tenantId,courseId,data.profile.ref,data.period.from,data.period.to,format,data.rows.length,data.warnings.length,hash,auth.userId,ts).run();
  await audit(env.DB,auth.userId,'classbook.export_generated',tenantId,courseId,'classbook_export_run',runId,{format,profile:data.profile.ref,rowCount:data.rows.length,warningCount:data.warnings.length,digest:hash});
  return{run_id:runId,digest:hash};
}

export async function previewClassbookExport(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){
  const data=await exportData(env,auth,tenantId,courseId,input),run=await recordRun(env,auth,tenantId,courseId,data,'preview');
  return{...data,...run};
}

export async function classbookExportCsv(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){
  const data=await exportData(env,auth,tenantId,courseId,input),fields=data.profile.settings.fields;
  const header=fields.map(field=>csvCell(FIELD_LABELS[field])).join(';');
  const lines=data.rows.map(row=>fields.map(field=>csvCell(row[field])).join(';'));
  const text='\uFEFF'+[header,...lines].join('\r\n');
  const run=await recordRun(env,auth,tenantId,courseId,data,'csv');
  return{text,filename:`unterrichtsnachweis-${String(data.course.code||data.course.id).replace(/[^A-Za-z0-9_-]+/g,'-')}.csv`,...run};
}

export async function classbookExportHtml(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){
  const data=await exportData(env,auth,tenantId,courseId,input),fields=data.profile.settings.fields,profileSettings=data.profile.settings;
  const signatures=[profileSettings.signature_teacher?'Dozent/in':null,profileSettings.signature_lead?'Fachbereichsleitung / Ausbildungsleitung':null,profileSettings.signature_provider?'Bildungsträger / Prüfungsorganisation':null].filter((value):value is string=>!!value);
  const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${esc(data.profile.name)} · ${esc(data.course.name)}</title><style>body{font:11px Arial,sans-serif;color:#111;margin:22mm 14mm}h1{font-size:18px;margin:0 0 4px}h2{font-size:13px;margin:0 0 14px;color:#555}.meta{margin:0 0 14px;line-height:1.5}.notice{border:1px solid #bbb;padding:8px 10px;margin:0 0 12px;background:#f7f7f7}.summary{display:flex;gap:18px;margin:0 0 12px}.summary b{font-size:14px}table{width:100%;border-collapse:collapse;table-layout:auto}th,td{border:1px solid #aaa;padding:5px;vertical-align:top}th{background:#eee;font-size:9px}td{white-space:pre-wrap}.warn{margin-top:12px;color:#8a5200}.signatures{display:grid;grid-template-columns:repeat(${Math.max(1,signatures.length)},1fr);gap:18px;margin-top:28px}.sig{padding-top:24px;border-bottom:1px solid #333}.privacy{margin-top:16px;font-size:9px;color:#666}@page{size:landscape;margin:12mm}@media print{body{margin:0}.notice{background:#fff}}</style></head><body><h1>Unterrichts- / Klassenbuchnachweis</h1><h2>${esc(data.profile.name)}</h2><div class="meta"><strong>${esc(data.course.tenant_name)}</strong><br>${esc(data.course.name)}${data.course.code?` · ${esc(data.course.code)}`:''}<br>Zeitraum: ${esc(data.period.from||'Beginn')} bis ${esc(data.period.to||'Ende')}</div>${profileSettings.guidance?`<div class="notice">${esc(profileSettings.guidance)}</div>`:''}<div class="summary"><span><b>${data.coverage.sessions}</b><br>Unterrichtseinträge</span><span><b>${data.coverage.total_hours}</b><br>Unterrichtsstunden (h)</span><span><b>${data.coverage.completed}</b><br>abgeschlossen</span><span><b>${data.coverage.missing_topic}</b><br>ohne behandeltes Thema</span></div><table><thead><tr>${fields.map(field=>`<th>${esc(FIELD_LABELS[field])}</th>`).join('')}</tr></thead><tbody>${data.rows.map(row=>`<tr>${fields.map(field=>`<td>${esc(row[field])}</td>`).join('')}</tr>`).join('')}</tbody></table>${data.warnings.length?`<div class="warn"><strong>Prüfhinweise (${data.warnings.length})</strong><ul>${data.warnings.slice(0,100).map(warning=>`<li>${esc(warning)}</li>`).join('')}</ul></div>`:''}${signatures.length?`<div class="signatures">${signatures.map(label=>`<div><div class="sig"></div><div>${esc(label)}</div><div>Datum / Unterschrift</div></div>`).join('')}</div>`:''}<div class="privacy">Datensparsame Ausgabe: Dieser Export enthält keine Teilnehmernamen, Anwesenheiten, Fehlzeiten oder Noten. Je nach zuständiger Stelle können zusätzliche, getrennte Nachweise erforderlich sein.</div></body></html>`;
  const run=await recordRun(env,auth,tenantId,courseId,data,'html');
  return{html,filename:`unterrichtsnachweis-${String(data.course.code||data.course.id).replace(/[^A-Za-z0-9_-]+/g,'-')}.html`,...run};
}

export async function reviewClassbookEntry(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,sessionId:string,input:Record<string,unknown>){
  if(!auth.isPlatformAdmin&&auth.role!=='tenant_admin'&&!(hasPermission(auth,'reports.view')&&hasPermission(auth,'content.view')&&auth.courseIds.includes(courseId)))throw new Error('FORBIDDEN_CLASSBOOK_REVIEW');
  const status=String(input.status||'reviewed');
  if(!['reviewed','approved','revision_required'].includes(status))throw new Error('CLASSBOOK_REVIEW_STATUS_INVALID');
  const session=await env.DB.prepare('SELECT id FROM attendance_sessions WHERE tenant_id=? AND course_id=? AND id=?').bind(tenantId,courseId,sessionId).first();
  if(!session)throw new Error('ATTENDANCE_SESSION_NOT_FOUND');
  const note=safeString(input.review_note,3000)||null,ts=nowIso();
  await env.DB.prepare('INSERT INTO classbook_entry_reviews(session_id,tenant_id,course_id,status,review_note,reviewed_by,reviewed_at,updated_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET status=excluded.status,review_note=excluded.review_note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at,updated_at=excluded.updated_at').bind(sessionId,tenantId,courseId,status,note,auth.userId,ts,ts).run();
  await audit(env.DB,auth.userId,'classbook.review_saved',tenantId,courseId,'attendance_session',sessionId,{status,hasNote:!!note});
  return{session_id:sessionId,status,review_note:note,reviewed_at:ts};
}
