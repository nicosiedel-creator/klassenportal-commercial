import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireRole } from './permissions.js';
import { createCourse } from './data.js';
import { enforceCourseEntitlement } from './commerce.js';
import { createTenantUser } from './users.js';
import { createTeacherPortalTeacher, saveTeacherPortalAssignment } from './teacher-portal.js';
import { id, normalizeEmail, nowIso, safeString, sha256Text, slugify } from './utils.js';

export type OrganizationCandidateType='course'|'subject'|'participant'|'class_admin'|'teacher'|'tenant_admin_review';
export type OrganizationCandidate={
  type:OrganizationCandidateType;
  display_name:string|null;
  email:string|null;
  course_id:string|null;
  course_name:string|null;
  course_code:string|null;
  course_ref:string|null;
  subject_name:string|null;
  subject_short_name:string|null;
  confidence:number;
  warnings:string[];
  source_row:number|null;
};

type ExistingCourse={id:string;name:string;code:string};
const norm=(v:unknown,max=300)=>safeString(v,max).replace(/\s+/g,' ').trim();
const key=(v:unknown)=>norm(v).toLocaleLowerCase('de-DE').replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/[ß]/g,'ss').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const validEmail=(v:unknown)=>{const e=normalizeEmail(v);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:'';};
const rowValue=(row:Record<string,unknown>,...names:string[])=>{for(const n of names){const wanted=key(n);for(const [k,v] of Object.entries(row))if(key(k)===wanted&&String(v??'').trim())return v;}return'';};
function importRole(row:Record<string,unknown>):OrganizationCandidateType{
  const raw=key(rowValue(row,'role','rolle','funktion','person_type','personenart','typ','type'));
  if(/tenant_admin|kunden_?admin|bildungstraeger_admin|gesamtadmin|organisationsadmin/.test(raw))return'tenant_admin_review';
  if(/class_admin|klassen_?admin/.test(raw))return'class_admin';
  if(/teacher|dozent|dozentin|lehrkraft|trainer|trainerin/.test(raw))return'teacher';
  if(/course|kurs|klasse/.test(raw))return'course';
  if(/subject|fach/.test(raw))return'subject';
  if(/participant|teilnehmer|teilnehmerin|schueler|schuelerin|student|studentin/.test(raw))return'participant';
  const teacherSignal=rowValue(row,'teacher','teacher_name','dozent','dozent_name','lehrkraft');
  return teacherSignal?'teacher':'participant';
}
function personName(row:Record<string,unknown>,type:OrganizationCandidateType){
  const specific=type==='teacher'?rowValue(row,'teacher','teacher_name','dozent','dozent_name','lehrkraft'):rowValue(row,'participant','participant_name','teilnehmer','teilnehmer_name','schueler','student');
  const direct=norm(specific||rowValue(row,'display_name','name','person','person_name'));
  if(direct)return direct;const first=norm(rowValue(row,'first_name','vorname')),last=norm(rowValue(row,'last_name','nachname'));return[first,last].filter(Boolean).join(' ');
}
function courseData(row:Record<string,unknown>){return{id:norm(rowValue(row,'course_id','kurs_id'),120)||null,name:norm(rowValue(row,'course_name','kurs','klasse','lehrgang','massnahme','maßnahme'),200)||null,code:norm(rowValue(row,'course_code','kurscode','klassencode','massnahmennummer','maßnahmennummer'),80)||null};}
function subjectData(row:Record<string,unknown>){return{name:norm(rowValue(row,'subject_name','subject','fach','fachname'),200)||null,short:norm(rowValue(row,'subject_short_name','subject_code','fachkuerzel','fachkürzel','kuerzel','kürzel'),50)||null};}
function courseRef(c:{id:string|null;name:string|null;code:string|null}){return key(c.id||c.code||c.name||'')||null;}
function label(text:string,names:string[],max=220){for(const n of names){const m=text.match(new RegExp(`(?:^|\\n)\\s*${n}\\s*[:\\-]\\s*([^\\n]{1,${max}})`,'im'));if(m?.[1])return norm(m[1],max);}return'';}
function textRows(text:string){const blocks=text.replace(/\r/g,'\n').replace(/---+\s*Seite[^\n]*---+/gi,'\n').split(/\n\s*\n|---+\s*(?:Datensatz|Person)[^\n]*---+/i).map(x=>x.trim()).filter(Boolean).slice(0,1000);return blocks.map(block=>({rolle:label(block,['Rolle','Funktion','Typ','Personenart'],100),name:label(block,['Name','Person','Teilnehmer(?:in)?','Dozent(?:in)?','Lehrkraft'],200),email:(block.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||'',kurs:label(block,['Kurs','Klasse','Lehrgang','Maßnahme','Massnahme'],200),kurscode:label(block,['Kurscode','Klassencode','Maßnahmennummer','Massnahmennummer'],100),fach:label(block,['Fach','Subject'],200),fachkuerzel:label(block,['Fachkürzel','Fachkuerzel','Subject code'],50)}));}
function resolveCourse(c:{id:string|null;name:string|null;code:string|null},courses:ExistingCourse[]){
  if(c.id){const x=courses.find(v=>v.id===c.id);if(x)return{course:x,warning:null};return{course:null,warning:'COURSE_NOT_FOUND'};}
  const code=c.code?.toLowerCase(),name=c.name?.toLocaleLowerCase('de-DE');
  if(code){const found=courses.filter(v=>v.code.toLowerCase()===code);if(found.length===1)return{course:found[0],warning:null};if(found.length>1)return{course:null,warning:'COURSE_AMBIGUOUS'};}
  if(name){const found=courses.filter(v=>v.name.toLocaleLowerCase('de-DE')===name);if(found.length===1)return{course:found[0],warning:null};if(found.length>1)return{course:null,warning:'COURSE_AMBIGUOUS'};}
  return{course:null,warning:null};
}
function baseCandidate(row:Record<string,unknown>,i:number,courses:ExistingCourse[]):OrganizationCandidate{
  const type=importRole(row),c=courseData(row),s=subjectData(row),resolved=resolveCourse(c,courses),warnings:string[]=[];let name:string|null=null,email:string|null=null;
  if(type==='course'){name=c.name||norm(rowValue(row,'name','display_name'),200)||null;if(!name&&!c.code)warnings.push('COURSE_NAME_REQUIRED');}
  else if(type==='subject'){name=s.name||norm(rowValue(row,'name','display_name'),200)||null;if(!name)warnings.push('SUBJECT_NAME_REQUIRED');}
  else{name=personName(row,type)||null;email=validEmail(rowValue(row,'email','e_mail','mail','emailadresse','teacher_email','dozent_email'))||null;if(!name)warnings.push('NAME_REQUIRED');if(!email&&type!=='teacher')warnings.push('EMAIL_REQUIRED');if(type==='teacher'&&!email)warnings.push('TEACHER_PORTAL_EMAIL_MISSING');}
  if(['participant','class_admin'].includes(type)&&!resolved.course&&!c.name&&!c.code&&!c.id)warnings.push('COURSE_REQUIRED');
  if(resolved.warning)warnings.push(resolved.warning);
  if(!resolved.course&&(c.name||c.code)&&!resolved.warning)warnings.push('COURSE_WILL_BE_CREATED');
  if(type==='tenant_admin_review')warnings.push('TENANT_ADMIN_CONFIRMATION_REQUIRED');
  const confidence=Math.max(0,100-warnings.filter(w=>!['COURSE_WILL_BE_CREATED','TEACHER_PORTAL_EMAIL_MISSING'].includes(w)).length*25-(warnings.includes('TEACHER_PORTAL_EMAIL_MISSING')?10:0));
  return{type,display_name:name,email,course_id:resolved.course?.id||null,course_name:resolved.course?.name||c.name,course_code:resolved.course?.code||c.code,course_ref:courseRef(c),subject_name:s.name,subject_short_name:s.short,confidence,warnings,source_row:i};
}
async function existingCourses(env:Env,tenantId:string){const r=await env.DB.prepare('SELECT id,name,code FROM courses WHERE tenant_id=? AND is_active=1 ORDER BY name').bind(tenantId).all<ExistingCourse>();return(r.results??[]) as ExistingCourse[];}
function synthesize(candidates:OrganizationCandidate[],courses:ExistingCourse[]){
  const out:OrganizationCandidate[]=[],courseSeen=new Set<string>(),subjectSeen=new Set<string>();
  for(const c of candidates){if(c.type!=='course'&&!c.course_id&&(c.course_name||c.course_code)&&!c.warnings.includes('COURSE_AMBIGUOUS')&&!c.warnings.includes('COURSE_NOT_FOUND')){const k=key(c.course_code||c.course_name);if(k&&!courseSeen.has(k)){courseSeen.add(k);out.push({type:'course',display_name:c.course_name||c.course_code,email:null,course_id:null,course_name:c.course_name||c.course_code,course_code:c.course_code||null,course_ref:k,subject_name:null,subject_short_name:null,confidence:100,warnings:[],source_row:c.source_row});}}}
  for(const c of candidates){if(c.type!=='subject'&&c.subject_name){const k=key(c.subject_name);if(k&&!subjectSeen.has(k)){subjectSeen.add(k);out.push({type:'subject',display_name:c.subject_name,email:null,course_id:null,course_name:null,course_code:null,course_ref:null,subject_name:c.subject_name,subject_short_name:c.subject_short_name,confidence:100,warnings:[],source_row:c.source_row});}}}
  const existingCourseKeys=new Set(courses.flatMap(c=>[key(c.id),key(c.code),key(c.name)]));const combined=[...out.filter(c=>c.type!=='course'||!existingCourseKeys.has(key(c.course_code||c.course_name))),...candidates];return combined.filter((c,i,a)=>{const sig=c.type==='subject'?`${c.type}|${key(c.subject_name||c.display_name)}`:`${c.type}|${key(c.email||c.display_name)}|${c.course_id||c.course_ref||''}`;return a.findIndex(x=>{const other=x.type==='subject'?`${x.type}|${key(x.subject_name||x.display_name)}`:`${x.type}|${key(x.email||x.display_name)}|${x.course_id||x.course_ref||''}`;return other===sig;})===i;});
}
function summary(candidates:OrganizationCandidate[]){const counts:Record<string,number>={};for(const c of candidates)counts[c.type]=(counts[c.type]||0)+1;const needs_review=candidates.filter(c=>c.warnings.some(w=>!['COURSE_WILL_BE_CREATED'].includes(w))).length;return{counts,needs_review,total:candidates.length};}
function canonical(candidates:OrganizationCandidate[]){return candidates.map(c=>({...c,warnings:[...new Set(c.warnings)].sort()}));}
export async function previewOrganizationImport(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireRole(auth,'tenant_admin');let rows:Record<string,unknown>[]=[];if(Array.isArray(input.rows))rows=(input.rows as Record<string,unknown>[]).slice(0,5000);if(typeof input.text==='string'&&input.text.trim())rows.push(...textRows(input.text));if(Array.isArray(input.documents))for(const d of(input.documents as unknown[]).slice(0,500))rows.push(...textRows(String(d||'')));if(!rows.length)throw new Error('ORGANIZATION_IMPORT_DATA_REQUIRED');if(rows.length>5000)throw new Error('ORGANIZATION_IMPORT_TOO_LARGE');
  const courses=await existingCourses(env,tenantId),raw=rows.map((r,i)=>baseCandidate(r,i,courses)),candidates=canonical(synthesize(raw,courses)),digest=await sha256Text(JSON.stringify(candidates)),batchId=id('oib_'),ts=nowIso(),expires=new Date(Date.now()+2*3600_000).toISOString(),sourceName=norm(input.source_name,250)||'Organisationsimport',sourceKind=norm(input.source_kind,50)||'structured';
  await env.DB.prepare("INSERT INTO organization_import_batches(id,tenant_id,source_name,source_kind,preview_digest,preview_json,status,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,'preview',?,?,?)").bind(batchId,tenantId,sourceName,sourceKind,digest,JSON.stringify(candidates),auth.userId,ts,expires).run();
  await audit(env.DB,auth.userId,'organization.import.previewed',tenantId,undefined,'organization_import_batch',batchId,{sourceName,total:candidates.length,summary:summary(candidates)});return{batch_id:batchId,digest,expires_at:expires,candidates,summary:summary(candidates)};
}
async function findCourse(env:Env,tenantId:string,c:OrganizationCandidate){if(c.course_id)return c.course_id;const ref=key(c.course_ref||c.course_code||c.course_name);if(!ref)return null;const r=await env.DB.prepare('SELECT id,name,code FROM courses WHERE tenant_id=? AND is_active=1').bind(tenantId).all<ExistingCourse>();const found=(r.results??[]).filter(x=>[key(x.id),key(x.code),key(x.name)].includes(ref));return found.length===1?String(found[0].id):null;}
async function ensureSubject(env:Env,tenantId:string,name:string,shortName:string|null){const existing=await env.DB.prepare('SELECT id FROM subjects WHERE tenant_id=? AND name=? COLLATE NOCASE').bind(tenantId,name).first<{id:string}>();if(existing)return{...existing,created:false};const sid=id('sub_');await env.DB.prepare('INSERT INTO subjects(id,tenant_id,name,short_name,created_at) VALUES(?,?,?,?,?)').bind(sid,tenantId,name,shortName,nowIso()).run();return{id:sid,created:true};}
const blocking=new Set(['COURSE_NAME_REQUIRED','SUBJECT_NAME_REQUIRED','NAME_REQUIRED','EMAIL_REQUIRED','COURSE_REQUIRED','COURSE_AMBIGUOUS','COURSE_NOT_FOUND','TENANT_ADMIN_CONFIRMATION_REQUIRED']);
async function recordResult(env:Env,batchId:string,tenantId:string,index:number,type:string,action:string,entityId:string|null,detail:unknown){await env.DB.prepare('INSERT INTO organization_import_results(id,batch_id,tenant_id,candidate_index,entity_type,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id('oir_'),batchId,tenantId,index,type,action,entityId,JSON.stringify(detail??{}),nowIso()).run();}
export async function applyOrganizationImport(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireRole(auth,'tenant_admin');const batchId=norm(input.batch_id,100),digest=norm(input.digest,128),batch=await env.DB.prepare('SELECT preview_digest,preview_json,status,expires_at FROM organization_import_batches WHERE id=? AND tenant_id=?').bind(batchId,tenantId).first<{preview_digest:string;preview_json:string;status:string;expires_at:string}>();if(!batch)throw new Error('ORGANIZATION_IMPORT_NOT_FOUND');if(batch.status!=='preview')throw new Error('ORGANIZATION_IMPORT_NOT_PENDING');if(batch.expires_at<=nowIso())throw new Error('ORGANIZATION_IMPORT_EXPIRED');if(batch.preview_digest!==digest)throw new Error('ORGANIZATION_IMPORT_PREVIEW_CHANGED');const rows=JSON.parse(batch.preview_json) as OrganizationCandidate[],selected=new Set((Array.isArray(input.selected_indexes)?input.selected_indexes:rows.map((_,i)=>i)).map(Number)),results:any[]=[];
  const order:OrganizationCandidateType[]=['course','subject','participant','class_admin','teacher','tenant_admin_review'];
  for(const type of order)for(let i=0;i<rows.length;i++){const r=rows[i];if(r.type!==type||!selected.has(i))continue;if(r.warnings.some(w=>blocking.has(w))){const x={index:i,type,action:'skipped',reason:'REVIEW_REQUIRED'};results.push(x);await recordResult(env,batchId,tenantId,i,type,x.action,null,x);continue;}try{
    if(type==='course'){const name=r.course_name||r.display_name||r.course_code;if(!name)throw new Error('COURSE_NAME_REQUIRED');const found=await findCourse(env,tenantId,r);if(found){results.push({index:i,type,action:'existing',entity_id:found});await recordResult(env,batchId,tenantId,i,type,'existing',found,{});continue;}await enforceCourseEntitlement(env,tenantId);const c=await createCourse(env,auth,tenantId,{name,code:r.course_code||slugify(name),access_mode:'login'}) as any;results.push({index:i,type,action:'created',entity_id:c?.id});await recordResult(env,batchId,tenantId,i,type,'created',c?.id||null,{});continue;}
    if(type==='subject'){const name=r.subject_name||r.display_name;if(!name)throw new Error('SUBJECT_NAME_REQUIRED');const s=await ensureSubject(env,tenantId,name,r.subject_short_name);results.push({index:i,type,action:s.created?'created':'existing',entity_id:s.id});await recordResult(env,batchId,tenantId,i,type,s.created?'created':'existing',s.id,{});continue;}
    if(type==='tenant_admin_review'){const x={index:i,type,action:'skipped',reason:'TENANT_ADMIN_CONFIRMATION_REQUIRED'};results.push(x);await recordResult(env,batchId,tenantId,i,type,x.action,null,x);continue;}
    const courseId=await findCourse(env,tenantId,r);
    if(type==='participant'||type==='class_admin'){if(!courseId)throw new Error('COURSE_NOT_RESOLVED');if(!r.display_name||!r.email)throw new Error('USER_FIELDS_REQUIRED');const student=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:'participant',course_id:courseId});let capability=null;if(type==='class_admin')capability=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:'class_admin',course_id:courseId});const action=student.invitation_sent?'created_invited':'existing_added';results.push({index:i,type,action,user_id:student.user_id,course_id:courseId,class_admin_membership_id:capability?.membership_id||null});await recordResult(env,batchId,tenantId,i,type,action,student.user_id,{courseId,classAdmin:type==='class_admin'});continue;}
    if(type==='teacher'){if(!r.display_name)throw new Error('TEACHER_NAME_REQUIRED');const teacher=await createTeacherPortalTeacher(env,auth,tenantId,{name:r.display_name,email:r.email||''}) as any;if(!courseId||!r.email){const action=courseId?'teacher_master_created_portal_email_missing':'teacher_master_created_unassigned';results.push({index:i,type,action,teacher_id:teacher?.id});await recordResult(env,batchId,tenantId,i,type,action,teacher?.id||null,{courseId});continue;}const existingUser=await env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').bind(r.email).first<{id:string}>(),preGuest=existingUser?await env.DB.prepare("SELECT id FROM memberships WHERE tenant_id=? AND course_id=? AND user_id=? AND role='guest'").bind(tenantId,courseId,existingUser.id).first<{id:string}>():null;const user=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:'guest',course_id:courseId});const assignment=await saveTeacherPortalAssignment(env,auth,tenantId,{teacher_id:teacher.id,user_id:user.user_id,course_id:courseId}) as any;if(!preGuest&&user.membership_id&&assignment?.id)await env.DB.prepare('UPDATE teacher_portal_assignments SET auth_membership_id=? WHERE id=? AND tenant_id=?').bind(user.membership_id,assignment.id,tenantId).run();const action=user.invitation_sent?'teacher_invited_assigned':'teacher_assigned';results.push({index:i,type,action,teacher_id:teacher.id,user_id:user.user_id,course_id:courseId,assignment_id:assignment?.id});await recordResult(env,batchId,tenantId,i,type,action,teacher.id,{userId:user.user_id,courseId,assignmentId:assignment?.id});continue;}
  }catch(e){const reason=String((e as Error).message||e),x={index:i,type,action:'skipped',reason};results.push(x);await recordResult(env,batchId,tenantId,i,type,'skipped',null,x);}}
  await env.DB.prepare("UPDATE organization_import_batches SET status='applied',applied_at=? WHERE id=? AND tenant_id=? AND status='preview'").bind(nowIso(),batchId,tenantId).run();await audit(env.DB,auth.userId,'organization.import.applied',tenantId,undefined,'organization_import_batch',batchId,{selected:selected.size,created:results.filter(x=>String(x.action).includes('created')||String(x.action).includes('invited')).length,skipped:results.filter(x=>x.action==='skipped').length});return{batch_id:batchId,results};
}
