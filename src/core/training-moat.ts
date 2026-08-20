import type { CoreAuthContext, Env } from './types.js';
import { id, nowIso, safeString, sha256Text } from './utils.js';
import { asStudentView } from './student-role.js';
import { personalLearningCompass } from './education-personal-compass.js';
import { listMyAssignmentStates } from './assignment-participant-state.js';
import { buildCourseProofGraph } from './education-proof-graph.js';
import { stableStringify } from './education-twin.js';
import { requireAutopilotTenantAdminMfa } from './autopilot-security.js';
import { previewEducationIntent } from './education-intent.js';

export const SUPPORTED_PORTAL_LOCALES = [
  {locale:'de',label:'Deutsch',native:'Deutsch',rtl:false},
  {locale:'en',label:'Englisch',native:'English',rtl:false},
  {locale:'tr',label:'Türkisch',native:'Türkçe',rtl:false},
  {locale:'ar',label:'Arabisch',native:'العربية',rtl:true},
  {locale:'uk',label:'Ukrainisch',native:'Українська',rtl:false},
  {locale:'ru',label:'Russisch',native:'Русский',rtl:false},
  {locale:'pl',label:'Polnisch',native:'Polski',rtl:false},
  {locale:'ro',label:'Rumänisch',native:'Română',rtl:false},
  {locale:'bg',label:'Bulgarisch',native:'Български',rtl:false},
  {locale:'fa',label:'Persisch/Farsi',native:'فارسی',rtl:true},
  {locale:'prs',label:'Dari',native:'دری',rtl:true},
  {locale:'ps',label:'Paschtu',native:'پښتو',rtl:true},
  {locale:'fr',label:'Französisch',native:'Français',rtl:false},
  {locale:'es',label:'Spanisch',native:'Español',rtl:false},
  {locale:'vi',label:'Vietnamesisch',native:'Tiếng Việt',rtl:false},
] as const;

const LOCALE_SET=new Set(SUPPORTED_PORTAL_LOCALES.map(x=>x.locale));
const RTL_SET=new Set(SUPPORTED_PORTAL_LOCALES.filter(x=>x.rtl).map(x=>x.locale));
const PARTNER_CAPABILITIES=new Set(['course_schedule','reportbook_status','signature_status','participant_identity','practice_period']);
const FORBIDDEN_PARTNER_CAPABILITIES=['grades','attendance','health','private_notes','billing','roles','permissions'];

export const COMPLIANCE_PACK_CATALOG = [
  {program_key:'bamf_integration',display_name:'BAMF Integrationskurse',official_source:'https://www.bamf.de/',verification_required:true,scope:'Deutschland',legal_determination:false},
  {program_key:'azav',display_name:'AZAV / geförderte Weiterbildung',official_source:'https://www.arbeitsagentur.de/institutionen/bildungstraeger',verification_required:true,scope:'Deutschland',legal_determination:false},
  {program_key:'ba_emaw',display_name:'BA / eM@w-Unterstützung',official_source:'https://www.arbeitsagentur.de/institutionen/bildungstraeger',verification_required:true,scope:'Deutschland',legal_determination:false},
] as const;

function requireTenantAdmin(auth:CoreAuthContext){
  if(auth.isPlatformAdmin||auth.role!=='tenant_admin')throw new Error('TENANT_ADMIN_REQUIRED');
}
function ownCourse(auth:CoreAuthContext,tenantId:string,courseId:string){
  const student=asStudentView(auth);
  if(!student.tenantIds.includes(tenantId)||!student.courseIds.includes(courseId))throw new Error('FORBIDDEN_COURSE_SCOPE');
  return student;
}
function normalizeLocale(value:unknown){
  const locale=String(value||'').trim().toLowerCase();
  if(!LOCALE_SET.has(locale as any))throw new Error('LOCALE_NOT_SUPPORTED');
  return locale;
}
function safeLevel(value:unknown){
  const level=String(value||'standard');
  if(!['simple','standard','advanced'].includes(level))throw new Error('EXPLANATION_LEVEL_INVALID');
  return level;
}
function statusCounts(items:Record<string,unknown>[],key='status'){
  const out:Record<string,number>={};
  for(const item of items){const k=String(item[key]||'unknown');out[k]=(out[k]||0)+1;}
  return out;
}
async function optionalRows<T extends Record<string,unknown>>(env:Env,sql:string,args:unknown[]){
  try{return((await env.DB.prepare(sql).bind(...args).all<T>()).results??[]);}catch{return[];}
}
async function randomToken(){
  const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
  let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
  return btoa(binary).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}

export async function getPortalLanguagePreference(env:Env,auth:CoreAuthContext,tenantId:string){
  if(auth.isPlatformAdmin||!auth.tenantIds.includes(tenantId))throw new Error('FORBIDDEN_TENANT');
  const row=await env.DB.prepare('SELECT locale,explanation_level,rtl,updated_at FROM portal_language_preferences WHERE tenant_id=? AND user_id=?').bind(tenantId,auth.userId).first<Record<string,unknown>>();
  return row||{locale:'de',explanation_level:'standard',rtl:0,updated_at:null};
}
export async function savePortalLanguagePreference(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  if(auth.isPlatformAdmin||!auth.tenantIds.includes(tenantId))throw new Error('FORBIDDEN_TENANT');
  const locale=normalizeLocale(input.locale),level=safeLevel(input.explanation_level),rtl=RTL_SET.has(locale as any)?1:0,ts=nowIso();
  await env.DB.prepare(`INSERT INTO portal_language_preferences(tenant_id,user_id,locale,explanation_level,rtl,updated_at)
    VALUES(?,?,?,?,?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET locale=excluded.locale,explanation_level=excluded.explanation_level,rtl=excluded.rtl,updated_at=excluded.updated_at`)
    .bind(tenantId,auth.userId,locale,level,rtl,ts).run();
  return{locale,explanation_level:level,rtl:!!rtl,updated_at:ts};
}

export async function buildPersonalLearnerTwin(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  const student=ownCourse(auth,tenantId,courseId),compass=await personalLearningCompass(env,student,tenantId,courseId);
  let states:Record<string,unknown>[]=[];try{states=await listMyAssignmentStates(env,student,tenantId,courseId) as Record<string,unknown>[];}catch{}
  const reports=await optionalRows(env,`SELECT status,COUNT(*) count,COALESCE(SUM(total_minutes),0) minutes
    FROM report_book_periods WHERE tenant_id=? AND course_id=? AND participant_user_id=? GROUP BY status`,[tenantId,courseId,student.userId]);
  const signatures=await optionalRows(env,`SELECT r.status,COUNT(*) count FROM signature_requests r JOIN signature_documents d ON d.id=r.document_id AND d.tenant_id=r.tenant_id
    WHERE r.tenant_id=? AND d.course_id=? AND r.signer_user_id=? GROUP BY r.status`,[tenantId,courseId,student.userId]);
  const payload={
    schema:'personal-learner-twin/v1',
    tenant_id:tenantId,course_id:courseId,participant_user_id:student.userId,captured_at:nowIso(),
    learning:{assignment_status_counts:statusCounts(states),open_priorities:compass.items.slice(0,8),top_action:compass.top_action},
    evidence:{report_book_status_counts:Object.fromEntries(reports.map(x=>[String(x.status),Number(x.count||0)])),signature_status_counts:Object.fromEntries(signatures.map(x=>[String(x.status),Number(x.count||0)]))},
    safeguards:{
      own_data_only:true,peer_comparison:false,emotion_recognition:false,biometrics:false,personality_scoring:false,
      official_grade_data_used:false,automated_high_stakes_decision:false,teacher_replacement:false
    }
  };
  const digest=await sha256Text(stableStringify(payload));
  return{...payload,snapshot_sha256:digest};
}
export async function capturePersonalLearnerTwin(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  const twin=await buildPersonalLearnerTwin(env,auth,tenantId,courseId),snapshotId=id('plt_');
  await env.DB.prepare('INSERT INTO learner_twin_snapshots(id,tenant_id,course_id,participant_user_id,captured_at,payload_json,snapshot_sha256) VALUES(?,?,?,?,?,?,?)')
    .bind(snapshotId,tenantId,courseId,auth.userId,twin.captured_at,stableStringify(twin),twin.snapshot_sha256).run();
  return{snapshot_id:snapshotId,...twin};
}
export async function createLearningCoachPlan(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){
  const student=ownCourse(auth,tenantId,courseId),twin=await buildPersonalLearnerTwin(env,student,tenantId,courseId);
  const goal=safeString(input.goal,500)||'Die wichtigsten offenen Lernaufgaben bearbeiten';
  const minutes=Math.max(10,Math.min(180,Number(input.minutes||30))),locale=LOCALE_SET.has(String(input.locale||'') as any)?String(input.locale):'de';
  const priorities=(twin.learning.open_priorities as any[]).slice(0,3);
  const blocks=priorities.length?priorities.map((x,i)=>({order:i+1,minutes:Math.max(5,Math.floor(minutes/priorities.length)),title:String(x.title||'Lernaufgabe'),reason:String(x.reason||''),action_target:String(x.action_target||'')}))
    :[{order:1,minutes,title:'Wiederholung des zuletzt behandelten Stoffes',reason:'Aktuell sind keine offenen priorisierten Vorgänge vorhanden.',action_target:'#wochenplan'}];
  const plan={
    schema:'learning-coach-plan/v1',goal,minutes,locale,blocks,
    method:['kurze Aktivierung des Vorwissens','aktive Bearbeitung statt passivem Lesen','kurzer Selbstcheck am Ende'],
    disclaimer:'Lernhilfe, keine automatische Benotung oder pädagogische Hochrisikoentscheidung.',
    safeguards:twin.safeguards
  },planId=id('lcp_'),ts=nowIso();
  await env.DB.prepare('INSERT INTO learner_coach_plans(id,tenant_id,course_id,participant_user_id,target_json,plan_json,source_twin_sha256,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,\'active\',?,?)')
    .bind(planId,tenantId,courseId,student.userId,JSON.stringify({goal,minutes,locale}),JSON.stringify(plan),twin.snapshot_sha256,ts,ts).run();
  return{id:planId,source_twin_sha256:twin.snapshot_sha256,...plan};
}

export async function listCompliancePrograms(env:Env,auth:CoreAuthContext,tenantId:string){
  requireTenantAdmin(auth);
  return optionalRows(env,'SELECT * FROM tenant_compliance_programs WHERE tenant_id=? ORDER BY display_name',[tenantId]);
}
export async function upsertComplianceProgram(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  await requireAutopilotTenantAdminMfa(env,auth);
  const key=safeString(input.program_key,100),catalog=COMPLIANCE_PACK_CATALOG.find(x=>x.program_key===key);if(!catalog)throw new Error('COMPLIANCE_PROGRAM_INVALID');
  const status=String(input.status||'draft');if(!['draft','active','paused','retired'].includes(status))throw new Error('COMPLIANCE_PROGRAM_STATUS_INVALID');
  if(status==='active'&&input.verification_confirmed!==true)throw new Error('COMPLIANCE_RULE_VERIFICATION_REQUIRED');
  const source=safeString(input.source_reference,1000)||catalog.official_source,version=safeString(input.rules_version,100),ts=nowIso(),programId=id('cmp_');
  await env.DB.prepare(`INSERT INTO tenant_compliance_programs(id,tenant_id,program_key,display_name,status,rules_version,source_reference,verified_at,verified_by,configured_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tenant_id,program_key) DO UPDATE SET display_name=excluded.display_name,status=excluded.status,rules_version=excluded.rules_version,source_reference=excluded.source_reference,verified_at=excluded.verified_at,verified_by=excluded.verified_by,updated_at=excluded.updated_at`)
    .bind(programId,tenantId,key,catalog.display_name,status,version||null,source,status==='active'?ts:null,status==='active'?auth.userId:null,auth.userId,ts,ts).run();
  return{program_key:key,display_name:catalog.display_name,status,rules_version:version||null,source_reference:source,legal_determination:false};
}
export async function listComplianceRequirements(env:Env,auth:CoreAuthContext,tenantId:string,courseId?:string){
  requireTenantAdmin(auth);
  const args:unknown[]=[tenantId];let sql='SELECT * FROM compliance_requirements WHERE tenant_id=?';
  if(courseId){sql+=' AND (course_id=? OR course_id IS NULL)';args.push(courseId);}sql+=' ORDER BY COALESCE(due_at,\'9999\'),created_at';
  return optionalRows(env,sql,args);
}
export async function createComplianceRequirement(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  await requireAutopilotTenantAdminMfa(env,auth);
  const programKey=safeString(input.program_key,100),program=await env.DB.prepare("SELECT status,rules_version,source_reference FROM tenant_compliance_programs WHERE tenant_id=? AND program_key=?").bind(tenantId,programKey).first<Record<string,unknown>>();
  if(!program||String(program.status)!=='active')throw new Error('COMPLIANCE_PROGRAM_NOT_ACTIVE');
  const title=safeString(input.title,500);if(!title)throw new Error('COMPLIANCE_REQUIREMENT_TITLE_REQUIRED');
  const requirementId=id('crq_'),ts=nowIso(),source=safeString(input.source_reference,1000)||safeString(program.source_reference,1000);
  await env.DB.prepare(`INSERT INTO compliance_requirements(id,tenant_id,program_key,course_id,participant_user_id,requirement_key,title,description,due_at,evidence_type,source_reference,rule_version,status,created_by,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?, 'open',?,?,?)`)
    .bind(requirementId,tenantId,programKey,safeString(input.course_id,120)||null,safeString(input.participant_user_id,120)||null,safeString(input.requirement_key,160)||requirementId,title,safeString(input.description,3000)||null,safeString(input.due_at,50)||null,safeString(input.evidence_type,80)||'document',source||null,safeString(program.rules_version,100)||null,auth.userId,ts,ts).run();
  return{id:requirementId,title,program_key:programKey,status:'open',source_reference:source||null};
}
export async function attachComplianceEvidence(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  await requireAutopilotTenantAdminMfa(env,auth);
  const requirementId=safeString(input.requirement_id,120);if(!requirementId)throw new Error('COMPLIANCE_REQUIREMENT_REQUIRED');
  const req=await env.DB.prepare('SELECT id,course_id,participant_user_id FROM compliance_requirements WHERE tenant_id=? AND id=?').bind(tenantId,requirementId).first<Record<string,unknown>>();if(!req)throw new Error('COMPLIANCE_REQUIREMENT_NOT_FOUND');
  const evidenceId=id('cev_'),ts=nowIso(),sourceType=safeString(input.source_type,80)||'document',sourceId=safeString(input.source_id,200)||null,sourceSha=safeString(input.source_sha256,128)||null;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO compliance_evidence(id,tenant_id,requirement_id,course_id,participant_user_id,source_type,source_id,source_sha256,metadata_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(evidenceId,tenantId,requirementId,req.course_id||null,req.participant_user_id||null,sourceType,sourceId,sourceSha,JSON.stringify(input.metadata||{}),auth.userId,ts),
    env.DB.prepare("UPDATE compliance_requirements SET status='fulfilled',updated_at=? WHERE tenant_id=? AND id=?").bind(ts,tenantId,requirementId)
  ]);
  return{id:evidenceId,requirement_id:requirementId,status:'fulfilled'};
}
export async function scanComplianceTenant(env:Env,tenantId:string){
  const active=(await optionalRows(env,"SELECT program_key FROM tenant_compliance_programs WHERE tenant_id=? AND status='active'",[tenantId])).map(x=>String(x.program_key));
  if(!active.length)return{tenant_id:tenantId,active_programs:0,findings_created:0};
  const requirements=await optionalRows(env,`SELECT r.id,r.program_key,r.course_id,r.participant_user_id,r.title,r.due_at,r.source_reference,r.status,
    (SELECT COUNT(*) FROM compliance_evidence e WHERE e.tenant_id=r.tenant_id AND e.requirement_id=r.id) evidence_count
    FROM compliance_requirements r WHERE r.tenant_id=? AND r.status IN ('open','needs_review')`,[tenantId]);
  let created=0;const ts=nowIso();
  for(const r of requirements){
    const evidence=Number(r.evidence_count||0),due=r.due_at?Date.parse(String(r.due_at)):NaN,days=Number.isFinite(due)?Math.floor((due-Date.now())/86400000):null;
    const type=evidence===0?'missing-evidence':days!==null&&days<0?'overdue-requirement':days!==null&&days<=7?'due-soon':null;if(!type)continue;
    const source=`requirement:${String(r.id)}`,exists=await env.DB.prepare("SELECT id FROM compliance_findings WHERE tenant_id=? AND source_reference=? AND finding_type=? AND status IN ('open','acknowledged') LIMIT 1").bind(tenantId,source,type).first<{id:string}>();if(exists)continue;
    const severity=type==='overdue-requirement'&&days!==null&&days<-7?'high':type==='missing-evidence'?'medium':'low';
    await env.DB.prepare("INSERT INTO compliance_findings(id,tenant_id,course_id,participant_user_id,program_key,severity,finding_type,title,detail,source_reference,status,detected_at) VALUES(?,?,?,?,?,?,?,?,?,?,'open',?)")
      .bind(id('cfd_'),tenantId,r.course_id||null,r.participant_user_id||null,r.program_key,severity,type,String(r.title),type==='missing-evidence'?'Für diese Anforderung ist noch kein Nachweis verknüpft.':type==='due-soon'?`Fälligkeit in ${days} Tag(en).`:`Anforderung ist seit ${Math.abs(days||0)} Tag(en) überfällig.`,source,ts).run();created++;
  }
  return{tenant_id:tenantId,active_programs:active.length,requirements_checked:requirements.length,findings_created:created};
}
export async function runComplianceRadarAllTenants(env:Env){
  const tenants=await optionalRows(env,"SELECT DISTINCT tenant_id FROM tenant_compliance_programs WHERE status='active'",[]);
  let findings=0;for(const t of tenants){const r=await scanComplianceTenant(env,String(t.tenant_id));findings+=Number(r.findings_created||0);}
  return{tenants:tenants.length,findings_created:findings};
}
export async function complianceOverview(env:Env,auth:CoreAuthContext,tenantId:string){
  requireTenantAdmin(auth);
  const programs=await listCompliancePrograms(env,auth,tenantId),requirements=await listComplianceRequirements(env,auth,tenantId),findings=await optionalRows(env,"SELECT * FROM compliance_findings WHERE tenant_id=? AND status IN ('open','acknowledged') ORDER BY CASE severity WHEN 'critical' THEN 5 WHEN 'high' THEN 4 WHEN 'medium' THEN 3 WHEN 'low' THEN 2 ELSE 1 END DESC,detected_at DESC LIMIT 200",[tenantId]);
  const fulfilled=requirements.filter(x=>String(x.status)==='fulfilled').length,applicable=requirements.filter(x=>String(x.status)!=='not_applicable').length;
  return{programs,summary:{requirements:requirements.length,fulfilled,readiness_percent:applicable?Math.round(fulfilled/applicable*1000)/10:100,open_findings:findings.length,high_findings:findings.filter(x=>['high','critical'].includes(String(x.severity))).length},findings,legal_notice:'Vollständigkeits-/Nachweisprüfung, keine automatische Rechts- oder Förderfähigkeitsentscheidung.'};
}
export async function createComplianceEvidencePackage(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,input:Record<string,unknown>){
  await requireAutopilotTenantAdminMfa(env,auth);
  const graph=await buildCourseProofGraph(env,auth,tenantId,courseId,{from_date:input.from_date,to_date:input.to_date});
  const requirements=await optionalRows(env,`SELECT r.id,r.program_key,r.requirement_key,r.title,r.status,r.due_at,r.source_reference,
    (SELECT COUNT(*) FROM compliance_evidence e WHERE e.tenant_id=r.tenant_id AND e.requirement_id=r.id) evidence_count
    FROM compliance_requirements r WHERE r.tenant_id=? AND (r.course_id=? OR r.course_id IS NULL) ORDER BY r.program_key,r.title`,[tenantId,courseId]);
  const payload={schema:'compliance-evidence-graph/v1',generated_at:nowIso(),tenant_id:tenantId,course_id:courseId,period:graph.period,education_proof:graph,requirements,
    safeguards:{original_sources_preserved:true,legal_determination:false,individual_attendance_included:false,grades_included:false,private_notes_included:false}};
  const digest=await sha256Text(stableStringify(payload)),packageId=id('cep_');
  await env.DB.prepare('INSERT INTO compliance_evidence_packages(id,tenant_id,course_id,period_from,period_to,graph_sha256,payload_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
    .bind(packageId,tenantId,courseId,graph.period.from,graph.period.to,digest,stableStringify(payload),auth.userId,nowIso()).run();
  return{package_id:packageId,graph_sha256:digest,summary:{requirements:requirements.length,fulfilled:requirements.filter(x=>String(x.status)==='fulfilled').length,proof_completeness:graph.completeness},safeguards:payload.safeguards};
}

export async function migrationQualityPreflight(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requireTenantAdmin(auth);
  const records=Array.isArray(input.records)?input.records as Record<string,unknown>[]:[];
  if(!records.length)throw new Error('MIGRATION_RECORDS_REQUIRED');if(records.length>5000)throw new Error('MIGRATION_TOO_MANY_RECORDS');
  const required=Array.isArray(input.required_fields)?input.required_fields.map(String):[],seen=new Map<string,number>(),findings:any[]=[];let accepted=0,warnings=0,rejected=0;
  const keyOf=(r:Record<string,unknown>)=>String(r.email||r['E-Mail']||r.participant_number||r['Teilnehmernummer']||`${r.first_name||r.Vorname||''}|${r.last_name||r.Nachname||''}|${r.course_code||r.Klassencode||r.Klasse||''}`).trim().toLowerCase();
  records.forEach((r,index)=>{const missing=required.filter(k=>String(r[k]??'').trim()===''),key=keyOf(r),rowFind:string[]=[];if(missing.length)rowFind.push(`Pflichtfelder fehlen: ${missing.join(', ')}`);if(!key)rowFind.push('Kein stabiler Identifikator erkannt.');if(key){const prior=seen.get(key);if(prior!==undefined)rowFind.push(`Mögliche Dublette zu Zeile ${prior+1}.`);else seen.set(key,index);}const email=String(r.email||r['E-Mail']||'');if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))rowFind.push('E-Mail-Format ist unplausibel.');if(missing.length||!key)rejected++;else if(rowFind.length)warnings++;else accepted++;if(rowFind.length)findings.push({row:index+1,key:key||null,issues:rowFind});});
  const confidence=Math.max(0,Math.min(1,(accepted+warnings*0.65)/records.length)),result={total_records:records.length,accepted_records:accepted,warning_records:warnings,rejected_records:rejected,confidence:Math.round(confidence*1000)/1000,findings:findings.slice(0,500),silent_data_loss_allowed:false};
  if(input.persist===true){const runId=id('mqr_');await env.DB.prepare('INSERT INTO migration_quality_runs(id,tenant_id,batch_key,total_records,accepted_records,warning_records,rejected_records,confidence,findings_json,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(runId,tenantId,safeString(input.batch_key,200)||null,records.length,accepted,warnings,rejected,result.confidence,JSON.stringify(result.findings),auth.userId,nowIso()).run();return{run_id:runId,...result};}
  return result;
}

function validatePartnerCapabilities(value:unknown){
  const list=Array.isArray(value)?[...new Set(value.map(String))]:[];
  if(!list.length)throw new Error('PARTNER_CAPABILITIES_REQUIRED');
  for(const cap of list){if(FORBIDDEN_PARTNER_CAPABILITIES.some(x=>cap.includes(x))||!PARTNER_CAPABILITIES.has(cap))throw new Error('PARTNER_CAPABILITY_FORBIDDEN');}
  return list;
}
export async function listPartnerGrants(env:Env,auth:CoreAuthContext,tenantId:string){
  requireTenantAdmin(auth);return optionalRows(env,'SELECT id,partner_type,partner_name,partner_email,course_id,participant_user_id,capabilities_json,status,expires_at,created_at,revoked_at FROM partner_access_grants WHERE tenant_id=? ORDER BY created_at DESC',[tenantId]);
}
export async function createPartnerGrant(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  await requireAutopilotTenantAdminMfa(env,auth);
  const capabilities=validatePartnerCapabilities(input.capabilities),name=safeString(input.partner_name,300);if(!name)throw new Error('PARTNER_NAME_REQUIRED');
  const days=Math.max(1,Math.min(90,Number(input.expires_in_days||14))),expiresAt=new Date(Date.now()+days*86400000).toISOString(),token=await randomToken(),tokenHash=await sha256Text(token),grantId=id('pag_'),ts=nowIso();
  await env.DB.prepare('INSERT INTO partner_access_grants(id,tenant_id,partner_type,partner_name,partner_email,course_id,participant_user_id,capabilities_json,token_hash,status,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,\'active\',?,?,?)')
    .bind(grantId,tenantId,safeString(input.partner_type,100)||'partner',name,safeString(input.partner_email,320)||null,safeString(input.course_id,120)||null,safeString(input.participant_user_id,120)||null,JSON.stringify(capabilities),tokenHash,expiresAt,auth.userId,ts).run();
  return{id:grantId,partner_name:name,capabilities,expires_at:expiresAt,access_token:token,token_shown_once:true};
}
export async function revokePartnerGrant(env:Env,auth:CoreAuthContext,tenantId:string,grantId:string){
  await requireAutopilotTenantAdminMfa(env,auth);await env.DB.prepare("UPDATE partner_access_grants SET status='revoked',revoked_at=? WHERE tenant_id=? AND id=? AND status='active'").bind(nowIso(),tenantId,grantId).run();return{revoked:true};
}
export async function publicPartnerContext(env:Env,token:string){
  if(token.length<32||token.length>200)throw new Error('PARTNER_ACCESS_NOT_FOUND');const hash=await sha256Text(token),grant=await env.DB.prepare("SELECT * FROM partner_access_grants WHERE token_hash=? AND status='active' AND expires_at>?").bind(hash,nowIso()).first<Record<string,unknown>>();if(!grant)throw new Error('PARTNER_ACCESS_NOT_FOUND');
  const caps=JSON.parse(String(grant.capabilities_json||'[]')) as string[],tenantId=String(grant.tenant_id),courseId=safeString(grant.course_id,120),participantId=safeString(grant.participant_user_id,120),data:Record<string,unknown>={};
  if(courseId&&caps.includes('course_schedule'))data.schedule=await optionalRows(env,'SELECT starts_at,ends_at,room,notes FROM lessons WHERE tenant_id=? AND course_id=? AND ends_at>=? ORDER BY starts_at LIMIT 30',[tenantId,courseId,nowIso()]);
  if(courseId&&participantId&&caps.includes('reportbook_status'))data.report_book=await optionalRows(env,'SELECT period_start,period_end,status,updated_at FROM report_book_periods WHERE tenant_id=? AND course_id=? AND participant_user_id=? ORDER BY period_end DESC LIMIT 12',[tenantId,courseId,participantId]);
  if(courseId&&participantId&&caps.includes('signature_status'))data.signatures=await optionalRows(env,`SELECT d.document_type,r.status,r.due_at FROM signature_requests r JOIN signature_documents d ON d.id=r.document_id AND d.tenant_id=r.tenant_id WHERE r.tenant_id=? AND d.course_id=? AND r.signer_user_id=? ORDER BY r.created_at DESC LIMIT 20`,[tenantId,courseId,participantId]);
  if(caps.includes('participant_identity')&&participantId){const u=await env.DB.prepare('SELECT display_name FROM users WHERE id=?').bind(participantId).first<Record<string,unknown>>().catch(()=>null);if(u)data.participant={display_name:u.display_name};}
  return{partner:{type:grant.partner_type,name:grant.partner_name},scope:{course_id:courseId||null,participant_scoped:!!participantId},capabilities:caps,data,privacy:{grades:false,individual_attendance:false,health:false,private_notes:false,billing:false,role_management:false}};
}

export function integrationCapabilityCatalog(){
  return{
    microsoft365:{status:'integrated',capabilities:['teams_meetings','calendar_feeds','oauth_pkce']},
    enterprise_identity:{status:'integrated',capabilities:['oidc_sso','scim','api']},
    finance:{status:'integrated',capabilities:['stripe','erp_webhook','accounting_outbox']},
    migration:{status:'integrated',capabilities:['csv','xlsx','pdf','zero_touch_intake','quality_preflight']},
    open_api:{status:'available',capabilities:['tenant_scoped_api','audit','rate_limits']},
    principle:'Integrate best-of-breed systems instead of rebuilding payroll, accounting or transport.'
  };
}
export async function actionCopilotPreview(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  const intent=safeString(input.intent,5000);if(!intent)throw new Error('INTENT_REQUIRED');const lower=intent.toLowerCase(),courseId=safeString(input.course_id,120)||undefined;
  const safety={direct_write:false,preview_only:true,approval_required_for_mutation:true,critical_domains_forbidden:['roles','permissions','payments','grades','individual_attendance','signatures']};
  if(/bamf|azav|e.?m@w|nachweis|prüfakte|förder/.test(lower))return{domain:'compliance',action:/akte|nachweis/.test(lower)?'evidence_package':'scan',confidence:.91,course_id:courseId||null,safety};
  if(/import|migration|altbestand|übernehmen/.test(lower))return{domain:'migration',action:'quality_preflight',confidence:.88,safety};
  if(/lernplan|lerncoach|lernen|wiederholen|prüfung lernen/.test(lower))return{domain:'learning',action:'coach_plan',confidence:.9,course_id:courseId||null,safety};
  if(/partner|praktikumsbetrieb|kostenträger|jobcenter/.test(lower))return{domain:'partner',action:'grant_preview',confidence:.84,safety};
  try{const preview=await previewEducationIntent(env,auth,tenantId,intent,input.context&&typeof input.context==='object'?input.context as Record<string,unknown>:{});if(preview.scenario_type)return{domain:'operations',action:'scenario',confidence:preview.confidence,preview,safety};}catch{}
  return{domain:'unknown',action:null,confidence:0,ambiguities:['Die Absicht kann noch keiner sicheren Aktion zugeordnet werden.'],safety};
}
