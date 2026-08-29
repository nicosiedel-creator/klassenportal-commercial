import type { CoreAuthContext, Env, SessionUser } from './types.js';
import { audit } from './audit.js';
import { mailConfigured, sendMail } from './mail.js';
import { applyParticipantImport, previewParticipantImport, type ParticipantCandidate } from './participant-document-import.js';
import { mapParticipantRows } from './participant-import-file.js';
import { extractIntakeDocument } from './intake-document-extract.js';
import { archiveNeedsClientText, emptyRouted, routeExtracted, type RoutedIntake } from './intake-classifier.js';
import { applyOrganizationImport, previewOrganizationImport, ORGANIZATION_BLOCKING_WARNINGS, type OrganizationCandidate } from './organization-import.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, safeString, sha256Text } from './utils.js';

const MAX_DOCUMENT_BYTES=15*1024*1024;
const MAX_BATCH_BYTES=50*1024*1024;
const MAX_BATCH_FILES=100;
const PUBLIC_UPLOADS_PER_HOUR=20;

type Channel={id:string;tenant_id:string;course_id:string|null;org_unit_id:string|null;label:string;local_key:string;status:string};
type Setting={tenant_id:string;enabled:number;processing_mode:'review_only'|'safe_auto';acknowledge_sender:number;notify_responsibles:number;default_retention_days:number};

function requireReviewer(auth:CoreAuthContext){if(auth.isPlatformAdmin||auth.role==='tenant_admin'||auth.permissions?.includes('participants.manage'))return;throw new Error('FORBIDDEN_PERMISSION');}
function requireIntakeAdmin(auth:CoreAuthContext){if(auth.isPlatformAdmin||auth.role==='tenant_admin')return;throw new Error('TENANT_ADMIN_REQUIRED');}
function randomKey(prefix='in'){return `${prefix}-${b64(randomBytes(12)).replace(/[+/=]/g,'').toLowerCase()}`;}
function rawToken(){return b64(randomBytes(32)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function safeFilename(raw:unknown){const value=safeString(raw,220).replace(/[\\/\0<>:"|?*]/g,'_').replace(/^\.+/,'').trim();return value||'dokument';}
async function sha256Bytes(buffer:ArrayBuffer){return b64(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)));}
// Teilnehmer- und Organisationsimport bekommen bewusst getrennte Dienstkennungen. Sonst
// verweisen beide auf dieselbe users-Zeile, und die Aufraeumregel des einen loescht sie,
// waehrend der andere sie noch braucht - deren Fremdschluessel raeumt per ON DELETE CASCADE
// gleich den fremden Import mit weg. Getrennte Kennungen schliessen das aus, ohne eine
// bestehende und laengst angewandte Regel anfassen zu muessen.
function systemAuth(tenantId:string,batchId:string,kind:'participants'|'organization'='participants'):CoreAuthContext{const userId=kind==='organization'?`system:intake:org:${batchId}`:`system:intake:${batchId}`,session:SessionUser={userId,email:`${userId.replace(/:/g,'-')}@localhost.invalid`,displayName:'Automatischer Eingang',isPlatformAdmin:false,mustChangePassword:false,tenantRoles:[{tenantId,courseId:null,role:'tenant_admin'}],authMethod:'api',authTenantId:tenantId};return{userId,role:'tenant_admin',tenantIds:[tenantId],courseIds:[],orgUnitIds:[],permissions:['participants.view','participants.manage'],isPlatformAdmin:false,session};}
async function settings(env:Env,tenantId:string):Promise<Setting>{const ts=nowIso();await env.DB.prepare("INSERT OR IGNORE INTO tenant_intake_settings(tenant_id,enabled,processing_mode,acknowledge_sender,notify_responsibles,default_retention_days,created_at,updated_at) VALUES(?,1,'safe_auto',1,1,14,?,?)").bind(tenantId,ts,ts).run();return (await env.DB.prepare('SELECT * FROM tenant_intake_settings WHERE tenant_id=?').bind(tenantId).first<Setting>())!;}
async function ensureDefaultChannel(env:Env,tenantId:string,actor:string){let channel=await env.DB.prepare("SELECT id,tenant_id,course_id,org_unit_id,label,local_key,status FROM intake_channels WHERE tenant_id=? AND course_id IS NULL AND org_unit_id IS NULL AND status='active' ORDER BY created_at LIMIT 1").bind(tenantId).first<Channel>();if(channel)return channel;const cid=id('inch_'),key=randomKey('eingang'),ts=nowIso();await env.DB.prepare("INSERT INTO intake_channels(id,tenant_id,course_id,org_unit_id,label,local_key,status,created_by,created_at) VALUES(?,?,NULL,NULL,'Allgemeiner Eingang',?,'active',?,?)").bind(cid,tenantId,key,actor,ts).run();channel=await env.DB.prepare('SELECT id,tenant_id,course_id,org_unit_id,label,local_key,status FROM intake_channels WHERE id=?').bind(cid).first<Channel>();return channel!;}
function inboundAddress(env:Env,key:string){const domain=String(env.INBOUND_MAIL_DOMAIN||'').trim().toLowerCase();return domain?`${key}@${domain}`:null;}

export async function getIntakeOverview(env:Env,auth:CoreAuthContext,tenantId:string){requireReviewer(auth);const cfg=await settings(env,tenantId),def=await ensureDefaultChannel(env,tenantId,auth.userId),channels=(await env.DB.prepare('SELECT id,tenant_id,course_id,org_unit_id,label,local_key,status,created_at FROM intake_channels WHERE tenant_id=? ORDER BY status,label').bind(tenantId).all<Record<string,unknown>>()).results??[],submitters=(await env.DB.prepare('SELECT id,email,email_domain,label,status,created_at FROM intake_submitters WHERE tenant_id=? ORDER BY status,label,email,email_domain').bind(tenantId).all()).results??[],batches=(await env.DB.prepare('SELECT id,source,source_sender,source_subject,status,document_count,accepted_count,skipped_count,error_code,created_at,updated_at,completed_at FROM intake_batches WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').bind(tenantId).all()).results??[],tasks=(await env.DB.prepare("SELECT id,task_type,severity,title,detail_json,source_type,source_id,org_unit_id,course_id,status,due_at,created_at FROM automation_tasks WHERE tenant_id=? AND status IN ('open','in_progress') ORDER BY CASE severity WHEN 'urgent' THEN 1 WHEN 'important' THEN 2 WHEN 'normal' THEN 3 ELSE 4 END,COALESCE(due_at,created_at),created_at DESC LIMIT 100").bind(tenantId).all()).results??[];return{settings:cfg,inbound_domain:env.INBOUND_MAIL_DOMAIN||null,inbound_ready:!!env.INBOUND_MAIL_DOMAIN,default_channel_id:def.id,channels:channels.map((x:any)=>({...x,email:inboundAddress(env,String(x.local_key))})),submitters,batches,tasks};}
export async function updateIntakeSettings(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireIntakeAdmin(auth);await settings(env,tenantId);const mode=String(input.processing_mode)==='review_only'?'review_only':'safe_auto',ack=input.acknowledge_sender===false?0:1,notify=input.notify_responsibles===false?0:1,retention=Math.max(1,Math.min(30,Math.round(Number(input.default_retention_days||14))));await env.DB.prepare('UPDATE tenant_intake_settings SET processing_mode=?,acknowledge_sender=?,notify_responsibles=?,default_retention_days=?,updated_by=?,updated_at=? WHERE tenant_id=?').bind(mode,ack,notify,retention,auth.userId,nowIso(),tenantId).run();await audit(env.DB,auth.userId,'intake.settings.updated',tenantId,undefined,'tenant_intake_settings',tenantId,{mode,acknowledgeSender:!!ack,notifyResponsibles:!!notify,retention});return getIntakeOverview(env,auth,tenantId);}
export async function createIntakeChannel(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireIntakeAdmin(auth);const courseId=safeString(input.course_id,100)||null,orgUnitId=safeString(input.org_unit_id,100)||null;if(courseId&&orgUnitId)throw new Error('INTAKE_CHANNEL_SCOPE_INVALID');if(courseId&&!await env.DB.prepare('SELECT id FROM courses WHERE tenant_id=? AND id=?').bind(tenantId,courseId).first())throw new Error('COURSE_NOT_FOUND');if(orgUnitId&&!await env.DB.prepare('SELECT id FROM org_units WHERE tenant_id=? AND id=?').bind(tenantId,orgUnitId).first())throw new Error('ORG_UNIT_NOT_FOUND');const label=safeString(input.label,160)||'Eingang',cid=id('inch_'),key=randomKey(courseId?'kurs':'eingang'),ts=nowIso();await env.DB.prepare("INSERT INTO intake_channels(id,tenant_id,course_id,org_unit_id,label,local_key,status,created_by,created_at) VALUES(?,?,?,?,?,?,'active',?,?)").bind(cid,tenantId,courseId,orgUnitId,label,key,auth.userId,ts).run();await audit(env.DB,auth.userId,'intake.channel.created',tenantId,courseId??undefined,'intake_channel',cid,{label,courseId,orgUnitId});return{id:cid,label,course_id:courseId,org_unit_id:orgUnitId,email:inboundAddress(env,key)};}
export async function revokeIntakeChannel(env:Env,auth:CoreAuthContext,tenantId:string,channelId:string){requireIntakeAdmin(auth);await env.DB.prepare("UPDATE intake_channels SET status='revoked',revoked_at=? WHERE tenant_id=? AND id=? AND status='active'").bind(nowIso(),tenantId,channelId).run();await audit(env.DB,auth.userId,'intake.channel.revoked',tenantId,undefined,'intake_channel',channelId);}
export async function addIntakeSubmitter(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireIntakeAdmin(auth);const email=normalizeEmail(input.email),domain=safeString(input.email_domain,200).toLowerCase().replace(/^@/,'');if((email?1:0)+(domain?1:0)!==1)throw new Error('INTAKE_SUBMITTER_REQUIRED');if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error('EMAIL_INVALID');if(domain&&!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain))throw new Error('DOMAIN_INVALID');const sid=id('ins_'),label=safeString(input.label,160)||null,ts=nowIso();await env.DB.prepare("INSERT INTO intake_submitters(id,tenant_id,email,email_domain,label,status,created_by,created_at) VALUES(?,?,?,?,?,'active',?,?)").bind(sid,tenantId,email||null,domain||null,label,auth.userId,ts).run();await audit(env.DB,auth.userId,'intake.submitter.added',tenantId,undefined,'intake_submitter',sid,{email:email||null,domain:domain||null,label});return{id:sid,email:email||null,email_domain:domain||null,label};}
export async function revokeIntakeSubmitter(env:Env,auth:CoreAuthContext,tenantId:string,submitterId:string){requireIntakeAdmin(auth);await env.DB.prepare("UPDATE intake_submitters SET status='revoked',revoked_at=? WHERE tenant_id=? AND id=? AND status='active'").bind(nowIso(),tenantId,submitterId).run();await audit(env.DB,auth.userId,'intake.submitter.revoked',tenantId,undefined,'intake_submitter',submitterId);}
export async function createIntakeUploadLink(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>,request:Request){requireIntakeAdmin(auth);const courseId=safeString(input.course_id,100)||null,orgUnitId=safeString(input.org_unit_id,100)||null;if(courseId&&orgUnitId)throw new Error('INTAKE_LINK_SCOPE_INVALID');if(courseId&&!await env.DB.prepare('SELECT id FROM courses WHERE tenant_id=? AND id=?').bind(tenantId,courseId).first())throw new Error('COURSE_NOT_FOUND');if(orgUnitId&&!await env.DB.prepare('SELECT id FROM org_units WHERE tenant_id=? AND id=?').bind(tenantId,orgUnitId).first())throw new Error('ORG_UNIT_NOT_FOUND');const raw=rawToken(),hash=await sha256Text(raw),lid=id('inl_'),days=Math.max(1,Math.min(365,Math.round(Number(input.valid_days||90)))),expires=new Date(Date.now()+days*86400000).toISOString(),max=Math.max(1,Math.min(10000,Math.round(Number(input.max_uploads||500)))),label=safeString(input.label,160)||'Vertragsupload',ts=nowIso();await env.DB.prepare('INSERT INTO intake_upload_links(id,tenant_id,course_id,org_unit_id,label,token_hash,max_uploads,upload_count,expires_at,created_by,created_at) VALUES(?,?,?,?,?,?,?,0,?,?,?)').bind(lid,tenantId,courseId,orgUnitId,label,hash,max,expires,auth.userId,ts).run();await audit(env.DB,auth.userId,'intake.upload_link.created',tenantId,courseId??undefined,'intake_upload_link',lid,{label,expires,maxUploads:max});const origin=env.APP_ORIGIN||new URL(request.url).origin;return{id:lid,url:`${origin}/eingang/${encodeURIComponent(raw)}`,expires_at:expires,max_uploads:max,label};}

async function event(env:Env,tenantId:string,type:string,batchId:string,payload?:unknown){await env.DB.prepare('INSERT INTO automation_events(id,tenant_id,event_type,source_type,source_id,payload_json,created_at) VALUES(?,?,?,?,?,?,?)').bind(id('aev_'),tenantId,type,'intake_batch',batchId,payload===undefined?null:JSON.stringify(payload),nowIso()).run();}
async function reviewerEmails(env:Env,tenantId:string,courseId:string|null){const emails=new Set<string>(),admins=(await env.DB.prepare("SELECT DISTINCT u.email FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.role='tenant_admin' AND u.status='active'").bind(tenantId).all<{email:string}>()).results??[];for(const x of admins)emails.add(x.email);if(courseId){const rs=(await env.DB.prepare("SELECT DISTINCT u.email FROM responsibility_assignments r JOIN users u ON u.id=r.user_id WHERE r.tenant_id=? AND r.course_id=? AND r.status='active' AND (r.valid_from IS NULL OR r.valid_from<=?) AND (r.valid_until IS NULL OR r.valid_until>?) AND u.status='active'").bind(tenantId,courseId,nowIso(),nowIso()).all<{email:string}>()).results??[];for(const x of rs)emails.add(x.email);}return[...emails];}
async function notifyReviewers(env:Env,tenantId:string,batchId:string,title:string,courseId:string|null){const cfg=await settings(env,tenantId);if(!cfg.notify_responsibles||!mailConfigured(env))return;const origin=env.APP_ORIGIN||'',text=`Im Klassenportal wartet ein Vorgang auf Prüfung.\n\n${title}\nVorgang: ${batchId}\n\nEs werden bewusst keine Teilnehmer- oder Vertragsdaten per E-Mail versendet.\n${origin?`${origin}/kunden-admin`:''}`;for(const email of await reviewerEmails(env,tenantId,courseId))await sendMail(env,email,'Klassenportal: Unterlagen prüfen',text,`<p>Im Klassenportal wartet ein Vorgang auf Prüfung.</p><p><strong>${title.replace(/[<>]/g,'')}</strong><br>Vorgang: ${batchId}</p><p>Es werden bewusst keine Teilnehmer- oder Vertragsdaten per E-Mail versendet.</p>${origin?`<p><a href="${origin.replace(/"/g,'')}/kunden-admin">Kunden-Admin öffnen</a></p>`:''}`,`intake-review:${batchId}:${email}`).catch(()=>undefined);}
async function createTask(env:Env,tenantId:string,batchId:string,title:string,severity:'normal'|'important'|'urgent'='important',detail?:unknown,courseId?:string|null,orgUnitId?:string|null){const ts=nowIso(),existing=await env.DB.prepare("SELECT id FROM automation_tasks WHERE tenant_id=? AND source_type='intake_batch' AND source_id=? AND status IN ('open','in_progress') LIMIT 1").bind(tenantId,batchId).first<{id:string}>();if(existing)return;await env.DB.prepare("INSERT INTO automation_tasks(id,tenant_id,task_type,severity,title,detail_json,source_type,source_id,org_unit_id,course_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?,'intake_batch',?,?,?,'open',?,?)").bind(id('tsk_'),tenantId,'intake_review',severity,title,detail===undefined?null:JSON.stringify(detail),batchId,orgUnitId??null,courseId??null,ts,ts).run();await notifyReviewers(env,tenantId,batchId,title,courseId??null);}
export function safeAutoCandidate(c:ParticipantCandidate){const blocked=new Set(['EMAIL_NOT_DETECTED','MULTIPLE_EMAILS','COURSE_AMBIGUOUS','COURSE_NOT_FOUND','COURSE_NOT_RESOLVED','DUPLICATE_IN_IMPORT','SPECIAL_CATEGORY_DATA_DETECTED_NOT_IMPORTED','BANK_DATA_DETECTED_NOT_IMPORTED']);if(!c.display_name||!c.email||!c.course_id||c.warnings.some(x=>blocked.has(x)))return false;if(c.confidence>=100&&c.warnings.length===0)return true;return c.confidence>=70&&c.warnings.every(x=>x==='COURSE_FALLBACK_USED');}
async function purgeBatchDocuments(env:Env,batchId:string){const docs=(await env.DB.prepare("SELECT id,r2_key FROM intake_documents WHERE batch_id=? AND r2_key IS NOT NULL AND extraction_state<>'purged'").bind(batchId).all<{id:string;r2_key:string}>()).results??[];for(const d of docs)await env.FILES.delete(d.r2_key).catch(()=>undefined);if(docs.length)await env.DB.prepare("UPDATE intake_documents SET r2_key=NULL,extracted_text=NULL,extraction_state='purged' WHERE batch_id=? AND r2_key IS NOT NULL").bind(batchId).run();}

type IntakeOrganizationPreview={batch_id:string;digest:string;candidates:OrganizationCandidate[];summary:unknown};
type BuiltIntake={pending_document_ids:string[];preview:{batch_id:string;digest:string;candidates:ParticipantCandidate[]}|null;organization:IntakeOrganizationPreview|null;routed:RoutedIntake|null;unsupported:string[];source_subject:string|null;default_course_id:string|null};

// Der Organisationsimport legt Kurse an. Erst danach lassen sich Teilnehmer ihnen zuordnen -
// deshalb wird der Teilnehmerentwurf bewusst erst nach dem Anlegen der Struktur gebaut. Wird das
// vertauscht, meldet jeder Teilnehmer eines neuen Kurses COURSE_NOT_FOUND, und ein Stapel, der
// vollstaendig eindeutig ist, landet trotzdem in der Handpruefung.
async function readRouted(env:Env,tenantId:string,batchId:string,clientTexts:Record<string,string>){
  const docs=(await env.DB.prepare("SELECT id,filename,content_type,r2_key,extraction_state FROM intake_documents WHERE tenant_id=? AND batch_id=? AND extraction_state<>'purged' ORDER BY created_at,id").bind(tenantId,batchId).all<{id:string;filename:string;content_type:string;r2_key:string|null;extraction_state:string}>()).results??[];
  const routed=emptyRouted(),pending:string[]=[];
  for(const d of docs){
    if(d.extraction_state==='client_pdf'||d.extraction_state==='ocr_required'){const text=String(clientTexts[d.id]||'').trim();if(text)routeExtracted(routed,d.filename,{kind:'texts',texts:[text]});else pending.push(d.id);continue;}
    if(!d.r2_key||['unsupported','failed'].includes(d.extraction_state))continue;
    const obj=await env.FILES.get(d.r2_key);if(!obj)continue;
    const extracted=await extractIntakeDocument(d.filename,d.content_type,await obj.arrayBuffer());
    // Ein Ordner kann Vertraege als PDF enthalten. Deren Text entsteht erst im Browser und steht
    // im Archiv nicht zur Verfuegung - sie werden zur Pruefung gestellt, nicht verschwiegen.
    if(extracted.kind==='client_pdf'||extracted.kind==='ocr_required'){pending.push(d.id);continue;}
    routeExtracted(routed,d.filename,extracted);
    if(archiveNeedsClientText(extracted).length)pending.push(d.id);
  }
  return{routed,pending};
}
async function rememberOrganizationBatch(env:Env,tenantId:string,batchId:string,organizationBatchId:string|null){
  // Faellt diese Spalte in einer Datenbank aus, darf das den Eingang nicht anhalten: der Import
  // selbst ist damit bereits gebaut, nur die Rueckverfolgung fehlt.
  await env.DB.prepare('UPDATE intake_batches SET organization_import_batch_id=? WHERE id=? AND tenant_id=?').bind(organizationBatchId,batchId,tenantId).run().catch(()=>undefined);
}
async function buildParticipantPreview(env:Env,tenantId:string,batchId:string,auth:CoreAuthContext,routed:RoutedIntake,sourceSubject:string|null,defaultCourseId:string|null){
  if(!routed.participantRows.length&&!routed.participantTexts.length)return null;
  const preview=await previewParticipantImport(env,auth,tenantId,{source_name:sourceSubject||`Eingang ${batchId}`,source_kind:'api',rows:mapParticipantRows(routed.participantRows),documents:routed.participantTexts,default_course_id:defaultCourseId});
  await env.DB.prepare('UPDATE intake_batches SET participant_import_batch_id=?,updated_at=? WHERE id=? AND tenant_id=?').bind(preview.batch_id,nowIso(),batchId,tenantId).run();
  return preview;
}
async function createPreviewFromStored(env:Env,tenantId:string,batchId:string,auth:CoreAuthContext,clientTexts:Record<string,string>={}):Promise<BuiltIntake>{
  const batch=await env.DB.prepare('SELECT default_course_id,source_subject FROM intake_batches WHERE tenant_id=? AND id=?').bind(tenantId,batchId).first<{default_course_id:string|null;source_subject:string|null}>();if(!batch)throw new Error('INTAKE_BATCH_NOT_FOUND');
  const{routed,pending}=await readRouted(env,tenantId,batchId,clientTexts);
  if(pending.length)return{pending_document_ids:pending,preview:null,organization:null,routed:null,unsupported:routed.unsupported,source_subject:batch.source_subject,default_course_id:batch.default_course_id};
  if(!routed.participantRows.length&&!routed.participantTexts.length&&!routed.organizationRows.length&&!routed.organizationTexts.length)throw new Error('INTAKE_NO_EXTRACTABLE_DATA');
  let organization:IntakeOrganizationPreview|null=null;
  if(routed.organizationRows.length||routed.organizationTexts.length){
    organization=await previewOrganizationImport(env,auth.userId.startsWith('system:intake:')?systemAuth(tenantId,batchId,'organization'):auth,tenantId,{rows:routed.organizationRows,documents:routed.organizationTexts,source_name:batch.source_subject||`Eingang ${batchId}`,source_kind:'api'}) as IntakeOrganizationPreview;
    await rememberOrganizationBatch(env,tenantId,batchId,organization.batch_id);
  }
  const preview=await buildParticipantPreview(env,tenantId,batchId,auth,routed,batch.source_subject,batch.default_course_id);
  await env.DB.prepare("UPDATE intake_batches SET status='review',updated_at=? WHERE id=? AND tenant_id=?").bind(nowIso(),batchId,tenantId).run();
  return{pending_document_ids:[],preview,organization,routed,unsupported:routed.unsupported,source_subject:batch.source_subject,default_course_id:batch.default_course_id};
}
// Ein Organisationseintrag darf nur dann ohne Rueckfrage angelegt werden, wenn nichts an ihm
// unklar ist. COURSE_WILL_BE_CREATED ist ausdruecklich kein Hinderungsgrund - genau das ist die
// Aufgabe. Ein Kundenadministrator entsteht dagegen nie von selbst.
export function safeAutoOrganizationCandidate(c:OrganizationCandidate){
  if(c.type==='tenant_admin_review')return false;
  if(c.warnings.some(w=>ORGANIZATION_BLOCKING_WARNINGS.has(w)))return false;
  return c.confidence>=70;
}
async function maybeAutoApply(env:Env,tenantId:string,batchId:string,built:BuiltIntake,trusted:boolean){
  const cfg=await settings(env,tenantId);
  if(cfg.processing_mode!=='safe_auto'||!trusted)return false;
  const org=built.organization,participants=built.preview;
  if(!org&&!participants)return false;
  // Ueber die Struktur wird jetzt entschieden. Ueber die Personen bewusst noch nicht: ihr
  // Entwurf wurde gegen die Kurse von VOR dieser Anlage aufgeloest und meldet fuer jeden neuen
  // Kurs COURSE_NOT_FOUND. Wuerde er hier mitgeprueft, koennte sich nie etwas selbst anlegen -
  // genau der Fall, um den es geht.
  if(org&&!(org.candidates.length&&org.candidates.every(safeAutoOrganizationCandidate)))return false;
  if(!org&&!(participants!.candidates.length&&participants!.candidates.every(safeAutoCandidate)))return false;
  const auth=systemAuth(tenantId,batchId),orgAuth=systemAuth(tenantId,batchId,'organization');
  await env.DB.prepare("UPDATE intake_batches SET status='processing',updated_at=? WHERE id=?").bind(nowIso(),batchId).run();
  let accepted=0,skipped=0;
  if(org){const r=await applyOrganizationImport(env,orgAuth,tenantId,{batch_id:org.batch_id,digest:org.digest});accepted+=r.results.filter((x:any)=>x.action!=='skipped').length;skipped+=r.results.filter((x:any)=>x.action==='skipped').length;}
  // Erst jetzt den Teilnehmerentwurf bauen: die eben angelegten Kurse sind ab hier auffindbar.
  const rebuilt=org&&built.routed?await buildParticipantPreview(env,tenantId,batchId,auth,built.routed,built.source_subject,built.default_course_id):participants;
  if(rebuilt){
    if(!rebuilt.candidates.length||!rebuilt.candidates.every(safeAutoCandidate)){
      const ts=nowIso();await env.DB.prepare("UPDATE intake_batches SET status='review',accepted_count=?,skipped_count=?,updated_at=? WHERE id=?").bind(accepted,skipped,ts,batchId).run();
      await createTask(env,tenantId,batchId,'Teilnehmerangaben pruefen','important',{accepted,reason:'PARTICIPANTS_NEED_REVIEW'});
      await event(env,tenantId,'intake.partially_auto_applied',batchId,{accepted,skipped});
      return true;
    }
    const r=await applyParticipantImport(env,auth,tenantId,{batch_id:rebuilt.batch_id,digest:rebuilt.digest});
    accepted+=r.results.filter((x:any)=>x.action!=='skipped').length;skipped+=r.results.filter((x:any)=>x.action==='skipped').length;
  }
  const status=skipped?'partial':'completed',ts=nowIso();
  await env.DB.prepare('UPDATE intake_batches SET status=?,accepted_count=?,skipped_count=?,completed_at=?,updated_at=? WHERE id=?').bind(status,accepted,skipped,ts,ts,batchId).run();
  await purgeBatchDocuments(env,batchId);
  await event(env,tenantId,'intake.auto_applied',batchId,{accepted,skipped});
  return true;
}

async function storeBuffer(env:Env,tenantId:string,batchId:string,filename:string,contentType:string,buffer:ArrayBuffer,expires:string){const name=safeFilename(filename),type=(contentType||'application/octet-stream').toLowerCase();if(buffer.byteLength<=0||buffer.byteLength>MAX_DOCUMENT_BYTES)return{stored:false,documentId:null,error:'DOCUMENT_TOO_LARGE'};const hash=await sha256Bytes(buffer),docId=id('ind_'),duplicate=await env.DB.prepare("SELECT id FROM intake_documents WHERE tenant_id=? AND sha256=? AND extraction_state<>'purged' LIMIT 1").bind(tenantId,hash).first<{id:string}>();if(duplicate){await env.DB.prepare("INSERT INTO intake_documents(id,batch_id,tenant_id,filename,content_type,size_bytes,sha256,r2_key,extraction_state,error_code,created_at,expires_at) VALUES(?,?,?,?,?,?,?,NULL,'failed','DUPLICATE_DOCUMENT',?,?)").bind(docId,batchId,tenantId,name,type,buffer.byteLength,hash,nowIso(),expires).run();return{stored:false,documentId:docId,error:'DUPLICATE_DOCUMENT'};}const extracted=await extractIntakeDocument(name,type,buffer),state=extracted.kind==='client_pdf'?'client_pdf':extracted.kind==='ocr_required'?'ocr_required':extracted.kind==='unsupported'?'unsupported':'stored';if(state==='unsupported'){await env.DB.prepare("INSERT INTO intake_documents(id,batch_id,tenant_id,filename,content_type,size_bytes,sha256,r2_key,extraction_state,error_code,created_at,expires_at) VALUES(?,?,?,?,?,?,?,NULL,'unsupported','UNSUPPORTED_DOCUMENT',?,?)").bind(docId,batchId,tenantId,name,type,buffer.byteLength,hash,nowIso(),expires).run();return{stored:false,documentId:docId,error:'UNSUPPORTED_DOCUMENT'};}const key=`intake/${tenantId}/${batchId}/${docId}/${encodeURIComponent(name)}`;await env.FILES.put(key,buffer,{httpMetadata:{contentType:type,contentDisposition:`attachment; filename="${name.replace(/"/g,'')}"`},customMetadata:{tenantId,batchId,documentId:docId,sha256:hash}});await env.DB.prepare('INSERT INTO intake_documents(id,batch_id,tenant_id,filename,content_type,size_bytes,sha256,r2_key,extraction_state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(docId,batchId,tenantId,name,type,buffer.byteLength,hash,key,state,nowIso(),expires).run();return{stored:true,documentId:docId,error:null};}

async function linkByToken(env:Env,raw:string){const hash=await sha256Text(raw),row=await env.DB.prepare('SELECT id,tenant_id,course_id,org_unit_id,label,max_uploads,upload_count,expires_at,revoked_at FROM intake_upload_links WHERE token_hash=?').bind(hash).first<Record<string,unknown>>();if(!row||row.revoked_at||String(row.expires_at)<=nowIso()||Number(row.upload_count)>=Number(row.max_uploads))throw new Error('INTAKE_UPLOAD_LINK_INVALID');return row;}
async function publicRateLimit(env:Env,request:Request,linkId:string){const ip=request.headers.get('CF-Connecting-IP')||'unknown',key=await sha256Text(`intake:${linkId}:${ip}`),now=Date.now(),cut=new Date(now-3600000).toISOString(),r=await env.DB.prepare('SELECT window_started_at,attempts FROM intake_public_rate_limits WHERE key_hash=?').bind(key).first<{window_started_at:string;attempts:number}>();if(!r||r.window_started_at<cut){await env.DB.prepare('INSERT INTO intake_public_rate_limits(key_hash,window_started_at,attempts) VALUES(?,?,1) ON CONFLICT(key_hash) DO UPDATE SET window_started_at=excluded.window_started_at,attempts=1').bind(key,new Date(now).toISOString()).run();return;}if(Number(r.attempts)>=PUBLIC_UPLOADS_PER_HOUR)throw new Error('INTAKE_RATE_LIMITED');await env.DB.prepare('UPDATE intake_public_rate_limits SET attempts=attempts+1 WHERE key_hash=?').bind(key).run();}
export async function renderIntakeUploadPage(env:Env,raw:string){try{const l=await linkByToken(env,raw),label=String(l.label||'Vertrags-/Teilnehmerunterlagen').replace(/[&<>"']/g,'');const html=`<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unterlagen sicher einreichen</title><style>body{font-family:system-ui,sans-serif;background:#f5f3ef;margin:0;color:#172033}.wrap{max-width:720px;margin:7vh auto;padding:20px}.card{background:#fff;border:1px solid #d9d4cb;border-radius:18px;padding:28px}.drop{display:grid;place-items:center;min-height:210px;border:2px dashed #aab2c0;border-radius:14px;padding:20px;text-align:center}button{padding:11px 16px;border:0;border-radius:10px;background:#172033;color:#fff;font-weight:700}.muted{color:#667085}progress{width:100%}</style></head><body><div class="wrap"><div class="card"><h1>Unterlagen sicher einreichen</h1><p>${label}</p><p class="muted">Ein Vertrag, viele auf einmal oder gleich der ganze Ordner: auswählen, hochladen, fertig. Was eindeutig ist, wird selbst übernommen. Dieser Link erlaubt ausschließlich das Einreichen und niemals das Lesen vorhandener Teilnehmerdaten.</p><form id="f"><label class="drop">Dateien auswählen oder hier ablegen<input id="files" type="file" multiple accept=".pdf,.csv,.xlsx,.json,.txt,.docx,.odt,.zip,.rtf,.html,.htm,.png,.jpg,.jpeg,.webp,.tif,.tiff"></label><p><button id="pickFolder" type="button" style="background:#fff;color:#172033;border:1px solid #aab2c0">Ganzen Ordner auswählen</button> <button type="submit">Sicher hochladen</button></p><input id="folder" type="file" multiple webkitdirectory directory hidden accept=".pdf,.csv,.xlsx,.json,.txt,.docx,.odt,.zip,.rtf,.html,.htm,.png,.jpg,.jpeg,.webp,.tif,.tiff"><progress id="p" hidden></progress><p id="s"></p></form></div></div><script type="module" src="/intake-public-upload.js"></script></body></html>`;return new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});}catch{return new Response('Upload-Link ist ungültig oder abgelaufen.',{status:410,headers:{'cache-control':'no-store'}});}}
export async function handleIntakePublicUpload(env:Env,raw:string,request:Request){const link=await linkByToken(env,raw);await publicRateLimit(env,request,String(link.id));const form=await request.formData(),files=form.getAll('files').filter(x=>x instanceof File) as File[];if(!files.length)throw new Error('INTAKE_FILES_REQUIRED');if(files.length>MAX_BATCH_FILES)throw new Error('INTAKE_TOO_MANY_FILES');const total=files.reduce((n,f)=>n+f.size,0);if(total>MAX_BATCH_BYTES||files.some(f=>f.size>MAX_DOCUMENT_BYTES))throw new Error('INTAKE_UPLOAD_TOO_LARGE');const tenantId=String(link.tenant_id),batchId=id('inb_'),cfg=await settings(env,tenantId),expires=new Date(Date.now()+cfg.default_retention_days*86400000).toISOString(),ts=nowIso();await env.DB.prepare("INSERT INTO intake_batches(id,tenant_id,source,source_sender,source_subject,sender_authenticated,default_course_id,status,document_count,created_at,updated_at,expires_at) VALUES(?,?,'web',?,'Sicherer Upload-Link',1,?,'extracting',0,?,?,?)").bind(batchId,tenantId,`upload-link:${String(link.id)}`,link.course_id||null,ts,ts,expires).run();const clientTexts:Record<string,string>={};let stored=0,issues=0;for(let i=0;i<files.length;i++){const file=files[i],x=await storeBuffer(env,tenantId,batchId,file.name,file.type||'application/octet-stream',await file.arrayBuffer(),expires);if(x.stored&&x.documentId){stored++;const text=String(form.get(`client_text_${i}`)||'').trim();if(text)clientTexts[x.documentId]=text;}else issues++;}await env.DB.batch([env.DB.prepare('UPDATE intake_batches SET document_count=?,updated_at=? WHERE id=?').bind(stored,nowIso(),batchId),env.DB.prepare('UPDATE intake_upload_links SET upload_count=upload_count+1 WHERE id=?').bind(String(link.id))]);let built:BuiltIntake={pending_document_ids:[],preview:null,organization:null,routed:null,unsupported:[],source_subject:null,default_course_id:null};try{built=await createPreviewFromStored(env,tenantId,batchId,systemAuth(tenantId,batchId),clientTexts);}catch(e){issues++;await env.DB.prepare('UPDATE intake_batches SET error_code=?,updated_at=? WHERE id=?').bind(String((e as Error).message||'EXTRACTION_FAILED').slice(0,100),nowIso(),batchId).run();}let auto=false;if(built.preview||built.organization)auto=await maybeAutoApply(env,tenantId,batchId,built,true);if(!auto){await env.DB.prepare("UPDATE intake_batches SET status='review',error_code=COALESCE(error_code,?),updated_at=? WHERE id=?").bind(issues?'SOME_DOCUMENTS_REQUIRE_REVIEW':null,nowIso(),batchId).run();await createTask(env,tenantId,batchId,built.pending_document_ids.length?'Hochgeladene Unterlagen: OCR/PDF-Prüfung erforderlich':built.organization?'Neue Kurs-, Fach- oder Rollenangaben prüfen':'Neue Teilnehmerdaten prüfen','important',{documents:stored,pending:built.pending_document_ids.length,routing:built.routed?.decisions??[],unsupported:built.unsupported},String(link.course_id||'')||null,String(link.org_unit_id||'')||null);}await event(env,tenantId,'intake.web_received',batchId,{documents:stored,auto});return{batch_id:batchId,status:auto?'automatisch verarbeitet':'eingegangen – Prüfung läuft'};}

export async function getIntakeBatch(env:Env,auth:CoreAuthContext,tenantId:string,batchId:string){requireReviewer(auth);const batch=await env.DB.prepare('SELECT * FROM intake_batches WHERE tenant_id=? AND id=?').bind(tenantId,batchId).first<Record<string,unknown>>();if(!batch)throw new Error('INTAKE_BATCH_NOT_FOUND');const documents=(await env.DB.prepare('SELECT id,filename,content_type,size_bytes,extraction_state,error_code,created_at FROM intake_documents WHERE tenant_id=? AND batch_id=? ORDER BY created_at').bind(tenantId,batchId).all()).results??[];let preview:null|{batch_id:string;digest:string;candidates:unknown[]}=null;if(batch.participant_import_batch_id){const p=await env.DB.prepare('SELECT id,preview_digest,preview_json,status,expires_at FROM participant_import_batches WHERE tenant_id=? AND id=?').bind(tenantId,batch.participant_import_batch_id).first<{id:string;preview_digest:string;preview_json:string;status:string;expires_at:string}>();if(p)preview={batch_id:p.id,digest:p.preview_digest,candidates:JSON.parse(p.preview_json)};}
  let organization:null|{batch_id:string;digest:string;candidates:unknown[]}=null;
  if(batch.organization_import_batch_id){const o=await env.DB.prepare('SELECT id,preview_digest,preview_json FROM organization_import_batches WHERE tenant_id=? AND id=?').bind(tenantId,batch.organization_import_batch_id).first<{id:string;preview_digest:string;preview_json:string}>();if(o)organization={batch_id:o.id,digest:o.preview_digest,candidates:JSON.parse(o.preview_json)};}
  return{batch,documents,preview,organization};}
export async function getIntakeDocument(env:Env,auth:CoreAuthContext,tenantId:string,documentId:string){requireReviewer(auth);const d=await env.DB.prepare('SELECT filename,content_type,r2_key FROM intake_documents WHERE tenant_id=? AND id=?').bind(tenantId,documentId).first<{filename:string;content_type:string;r2_key:string|null}>();if(!d?.r2_key)throw new Error('INTAKE_DOCUMENT_NOT_FOUND');const obj=await env.FILES.get(d.r2_key);if(!obj)throw new Error('INTAKE_DOCUMENT_NOT_FOUND');return new Response(obj.body,{headers:{'content-type':d.content_type,'content-disposition':`attachment; filename="${d.filename.replace(/"/g,'')}"`,'x-content-type-options':'nosniff','cache-control':'no-store'}});}
export async function previewIntakeBatch(env:Env,auth:CoreAuthContext,tenantId:string,batchId:string,input:Record<string,unknown>){requireReviewer(auth);const texts=input.document_texts&&typeof input.document_texts==='object'?input.document_texts as Record<string,string>:{};const built=await createPreviewFromStored(env,tenantId,batchId,auth,texts);
  return{pending_document_ids:built.pending_document_ids,unsupported:built.unsupported,routing:built.routed?.decisions??[],
    preview:built.preview?{batch_id:built.preview.batch_id,digest:built.preview.digest,candidates:built.preview.candidates}:null,
    organization:built.organization?{batch_id:built.organization.batch_id,digest:built.organization.digest,candidates:built.organization.candidates,summary:built.organization.summary}:null};}
// Die Handpruefung wendet beide Seiten in derselben Reihenfolge an wie die Automatik: erst die
// Struktur, dann die Personen. Der Teilnehmerentwurf wird danach neu gebaut, damit die eben
// angelegten Kurse gefunden werden - sonst muesste der Pruefende zweimal durchlaufen.
export async function applyIntakeBatch(env:Env,auth:CoreAuthContext,tenantId:string,batchId:string,input:Record<string,unknown>){
  requireReviewer(auth);
  const b=await env.DB.prepare('SELECT participant_import_batch_id,organization_import_batch_id,source_subject,default_course_id FROM intake_batches WHERE tenant_id=? AND id=?').bind(tenantId,batchId).first<{participant_import_batch_id:string|null;organization_import_batch_id:string|null;source_subject:string|null;default_course_id:string|null}>();
  if(!b?.participant_import_batch_id&&!b?.organization_import_batch_id)throw new Error('INTAKE_PREVIEW_REQUIRED');
  await env.DB.prepare("UPDATE intake_batches SET status='processing',updated_at=? WHERE tenant_id=? AND id=?").bind(nowIso(),tenantId,batchId).run();
  const results:unknown[]=[];let accepted=0,skipped=0,organizationApplied=false;

  if(b.organization_import_batch_id){
    const o=await env.DB.prepare("SELECT preview_digest,status FROM organization_import_batches WHERE tenant_id=? AND id=?").bind(tenantId,b.organization_import_batch_id).first<{preview_digest:string;status:string}>();
    if(!o)throw new Error('INTAKE_PREVIEW_REQUIRED');
    if(o.status==='preview'){
      const r=await applyOrganizationImport(env,auth,tenantId,{batch_id:b.organization_import_batch_id,digest:o.preview_digest,selected_indexes:input.selected_organization_indexes});
      accepted+=r.results.filter((x:any)=>x.action!=='skipped').length;skipped+=r.results.filter((x:any)=>x.action==='skipped').length;
      results.push(...r.results.map((x:any)=>({...x,source:'organization'})));
      organizationApplied=true;
    }
  }

  let participantBatchId=b.participant_import_batch_id,participantDigest:string|null=null;
  // Nach dem Anlegen der Struktur ist der alte Teilnehmerentwurf veraltet: er wurde gegen die
  // Kurse von vorher aufgeloest. Neu bauen statt einen ueberholten Entwurf anzuwenden.
  if(organizationApplied){
    const{routed}=await readRouted(env,tenantId,batchId,{});
    const rebuilt=await buildParticipantPreview(env,tenantId,batchId,auth,routed,b.source_subject,b.default_course_id);
    participantBatchId=rebuilt?.batch_id??null;participantDigest=rebuilt?.digest??null;
  }
  if(participantBatchId){
    if(!participantDigest){
      const p=await env.DB.prepare('SELECT preview_digest FROM participant_import_batches WHERE tenant_id=? AND id=?').bind(tenantId,participantBatchId).first<{preview_digest:string}>();
      if(!p)throw new Error('INTAKE_PREVIEW_REQUIRED');
      participantDigest=p.preview_digest;
    }
    // Der Neubau erzeugt dieselben Zeilen in derselben Reihenfolge - nur die Kurszuordnung ist
    // jetzt aufgeloest. Die Auswahl des Pruefenden bleibt deshalb gueltig und wird nicht
    // uebergangen: sonst wuerde uebernommen, was jemand ausdruecklich abgewaehlt hat.
    const r=await applyParticipantImport(env,auth,tenantId,{batch_id:participantBatchId,digest:participantDigest,selected_indexes:input.selected_indexes});
    accepted+=r.results.filter((x:any)=>x.action!=='skipped').length;skipped+=r.results.filter((x:any)=>x.action==='skipped').length;
    results.push(...r.results.map((x:any)=>({...x,source:'participants'})));
  }

  const status=skipped?'partial':'completed',ts=nowIso();
  await env.DB.batch([
    env.DB.prepare('UPDATE intake_batches SET status=?,accepted_count=?,skipped_count=?,completed_at=?,updated_at=? WHERE tenant_id=? AND id=?').bind(status,accepted,skipped,ts,ts,tenantId,batchId),
    env.DB.prepare("UPDATE automation_tasks SET status='done',completed_at=?,updated_at=? WHERE tenant_id=? AND source_type='intake_batch' AND source_id=? AND status IN ('open','in_progress')").bind(ts,ts,tenantId,batchId),
  ]);
  await purgeBatchDocuments(env,batchId);
  await event(env,tenantId,'intake.applied',batchId,{accepted,skipped});
  return{status,accepted,skipped,results};
}

export async function completeAutomationTask(env:Env,auth:CoreAuthContext,tenantId:string,taskId:string,status:'done'|'dismissed'='done'){requireReviewer(auth);const ts=nowIso();await env.DB.prepare("UPDATE automation_tasks SET status=?,completed_at=?,updated_at=? WHERE tenant_id=? AND id=? AND status IN ('open','in_progress')").bind(status,ts,ts,tenantId,taskId).run();await audit(env.DB,auth.userId,'automation.task.completed',tenantId,undefined,'automation_task',taskId,{status});}

export async function cleanupIntake(env:Env){const now=nowIso(),expired=(await env.DB.prepare("SELECT id FROM intake_batches WHERE expires_at<=? AND status NOT IN ('completed','partial','expired') LIMIT 100").bind(now).all<{id:string}>()).results??[];for(const b of expired){await purgeBatchDocuments(env,b.id);await env.DB.prepare("UPDATE intake_batches SET status='expired',updated_at=? WHERE id=?").bind(now,b.id).run();}const docs=(await env.DB.prepare('SELECT id,r2_key FROM intake_documents WHERE expires_at<=? AND r2_key IS NOT NULL LIMIT 200').bind(now).all<{id:string;r2_key:string}>()).results??[];for(const d of docs)await env.FILES.delete(d.r2_key).catch(()=>undefined);if(docs.length)await env.DB.prepare("UPDATE intake_documents SET r2_key=NULL,extracted_text=NULL,extraction_state='purged' WHERE expires_at<=? AND r2_key IS NOT NULL").bind(now).run();await env.DB.batch([env.DB.prepare('DELETE FROM intake_webhook_events WHERE received_at<=?').bind(new Date(Date.now()-30*86400000).toISOString()),env.DB.prepare('DELETE FROM intake_public_rate_limits WHERE window_started_at<=?').bind(new Date(Date.now()-24*3600000).toISOString())]);}
