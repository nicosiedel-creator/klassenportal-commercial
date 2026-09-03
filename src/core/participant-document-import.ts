import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { createTenantUser } from './users.js';
import { createParticipantTargetResolver, splitOrgPath } from './participant-hierarchy-targeting.js';
import { id, normalizeEmail, nowIso, safeString, sha256Text } from './utils.js';

export type ParticipantCandidate={
  display_name:string;email:string;external_id:string|null;course_id:string|null;course_code:string|null;course_name:string|null;
  org_context:string[];org_path:string|null;enrollment_start:string|null;enrollment_end:string|null;confidence:number;warnings:string[];source_excerpt:string|null;
  detected_not_imported:{birth_date?:string;address?:string;bank_data?:boolean;special_category_hint?:boolean};
};

function canImport(auth:CoreAuthContext){if(auth.isPlatformAdmin||auth.role==='tenant_admin'||auth.permissions?.includes('participants.manage'))return;throw new Error('FORBIDDEN_PERMISSION');}
const norm=(v:unknown)=>safeString(v,500).replace(/\s+/g,' ').trim();
function emailOf(v:unknown){const e=normalizeEmail(v);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:'';}
function isoDate(raw:string):string|null{const s=raw.trim();let m=s.match(/\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/);if(m){const d=new Date(Date.UTC(Number(m[3]),Number(m[2])-1,Number(m[1])));return Number.isNaN(d.getTime())?null:d.toISOString().slice(0,10);}m=s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);return m?`${m[1]}-${m[2]}-${m[3]}`:null;}
function label(text:string,labels:string[],max=180):string{
  const stop='(?=\\s{2,}|\\n|\\r|(?:E-?Mail|Geburtsdatum|Anschrift|Adresse|Standort|Campus|Bereich|Fachbereich|Abteilung|Kurs(?:code)?|Klasse|Maßnahme|Bildungsgang|Studiengang|Beginn|Ende|Vertragsnummer|Teilnehmernummer|Matrikelnummer)\\s*[:\\-]|$)';
  for(const l of labels){for(const source of [`(?:^|\\n)\\s*${l}\\s*[:\\-]?\\s*([^\\n]{1,${max}})`,`\\b${l}\\s*[:\\-]\\s*(.{1,${max}}?)${stop}`]){const m=text.match(new RegExp(source,'im'));if(m){const value=norm(m[1]);if(value)return value;}}}return'';
}
function detectSensitive(text:string){const birth=label(text,['Geburtsdatum','Geboren am','Date of birth'],40),address=label(text,['Anschrift','Adresse','Wohnanschrift'],220),bank=/\b(?:IBAN|BIC|Kontonummer|Bankverbindung)\b/i.test(text),special=/\b(?:Gesundheit|Diagnose|Behinderung|Schwerbehindert|Religion|Konfession|ethnisch|Gewerkschaft|sexuelle Orientierung)\b/i.test(text);return{...(birth?{birth_date:isoDate(birth)||birth}:{}),...(address?{address}:{}),...(bank?{bank_data:true}:{}),...(special?{special_category_hint:true}:{})};}
function contractOrgContext(text:string){const path=label(text,['Organisationspfad','Strukturpfad','Hierarchiepfad'],260),site=label(text,['Standort','Schulstandort','Campus','Filiale','Niederlassung','Betriebsstätte','Betriebsstaette'],160),area=label(text,['Bereich','Fachbereich','Abteilung','Organisationseinheit','Department'],160),measure=label(text,['Maßnahme','Massnahme','Bildungsgang','Studiengang','Programm','Projekt'],200);return[...new Set([...(path?splitOrgPath(path):[]),site,area,measure].map(x=>norm(x)).filter(Boolean))];}
function extractContract(textRaw:string):ParticipantCandidate{
  const text=textRaw.replace(/\r/g,'\n').replace(/\u00a0/g,' '),emails=[...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)||[]).map(x=>x.toLowerCase()))];
  const name=label(text,['Teilnehmer(?:in)?','Teilnehmende(?:r)?','Name(?: des Teilnehmers| der Teilnehmerin)?','Vertragspartner(?:in)?','Schüler(?:in)?','Student(?:in)?'],160);
  const external=label(text,['Teilnehmernummer','Teilnehmer-ID','Teilnehmer ID','Vertragsnummer','Matrikelnummer','Schülernummer'],100);
  const courseCode=label(text,['Kurscode','Kurs-Code','Klassencode','Klassen-Code','Maßnahmennummer','Maßnahme-Nr\\.?','Lehrgangsnummer'],100);
  const courseName=label(text,['Kurs','Klasse','Lehrgang'],200);
  const orgContext=contractOrgContext(text),start=label(text,['Beginn','Vertragsbeginn','Maßnahmebeginn','Kursbeginn','Start'],80),end=label(text,['Ende','Vertragsende','Maßnahmeende','Kursende'],80);
  const warnings:string[]=[];if(!name)warnings.push('NAME_NOT_DETECTED');if(emails.length!==1)warnings.push(emails.length?'MULTIPLE_EMAILS':'EMAIL_NOT_DETECTED');if(!courseCode&&!courseName&&!orgContext.length)warnings.push('COURSE_NOT_DETECTED');
  const confidence=Math.max(0,Math.min(100,(name?35:0)+(emails.length===1?35:0)+(courseCode||courseName||orgContext.length?20:0)+(external?10:0)));
  return{display_name:name,email:emails.length===1?emails[0]:'',external_id:external||null,course_id:null,course_code:courseCode||null,course_name:courseName||null,org_context:orgContext,org_path:null,enrollment_start:isoDate(start),enrollment_end:isoDate(end),confidence,warnings,source_excerpt:text.slice(0,500),detected_not_imported:detectSensitive(text)};
}
function fromRow(row:Record<string,unknown>):ParticipantCandidate{
  const pick=(...keys:string[])=>{for(const k of keys)if(row[k]!==undefined&&row[k]!==null&&String(row[k]).trim())return row[k];return'';};
  const first=norm(pick('first_name','vorname')),last=norm(pick('last_name','nachname')),name=norm(pick('display_name','name','teilnehmer','schueler','student'))||[first,last].filter(Boolean).join(' '),email=emailOf(pick('email','e_mail','mail','emailadresse'));
  const courseCode=norm(pick('course_code','kurscode','klassencode','massnahmennummer'))||null,courseName=norm(pick('course_name','kurs','klasse','lehrgang'))||null,external=norm(pick('external_id','teilnehmernummer','teilnehmer_id','matrikelnummer','schuelernummer','vertragsnummer'))||null,warnings:string[]=[];
  const path=pick('org_path','organisationspfad','strukturpfad','hierarchiepfad'),orgContext=[...splitOrgPath(path),norm(pick('site','standort','schulstandort','campus','filiale','niederlassung')),norm(pick('area','bereich','fachbereich','abteilung','organisationseinheit')),norm(pick('measure','massnahme','maßnahme','bildungsgang','studiengang','programm','projekt'))].filter(Boolean);
  if(!name)warnings.push('NAME_NOT_DETECTED');if(!email)warnings.push('EMAIL_NOT_DETECTED');if(!courseCode&&!courseName&&!pick('course_id')&&!orgContext.length)warnings.push('COURSE_NOT_DETECTED');
  return{display_name:name,email,external_id:external,course_id:norm(pick('course_id'))||null,course_code:courseCode,course_name:courseName,org_context:[...new Set(orgContext)],org_path:null,enrollment_start:isoDate(norm(pick('enrollment_start','beginn','start'))),enrollment_end:isoDate(norm(pick('enrollment_end','ende'))),confidence:Math.max(0,100-warnings.length*30),warnings,source_excerpt:null,detected_not_imported:{}};
}
async function resolveCourses(env:Env,auth:CoreAuthContext,tenantId:string,candidates:ParticipantCandidate[],fallbackCourseId:string|null,fallbackOrgUnitId:string|null){
  const resolve=await createParticipantTargetResolver(env,auth,tenantId);for(const c of candidates){const target=resolve({courseId:c.course_id,courseCode:c.course_code,courseName:c.course_name,orgContext:c.org_context,fallbackCourseId,fallbackOrgUnitId});c.course_id=target.courseId;c.org_path=target.orgPath;if(target.warning)c.warnings.push(target.warning);if(c.course_id)c.warnings=c.warnings.filter(x=>x!=='COURSE_NOT_DETECTED'&&x!=='COURSE_NOT_RESOLVED'&&x!=='ORG_CONTEXT_UNRESOLVED');}
}
function canonical(candidates:ParticipantCandidate[]){return candidates.map(c=>({display_name:c.display_name,email:c.email,external_id:c.external_id,course_id:c.course_id,course_code:c.course_code,course_name:c.course_name,org_context:c.org_context,org_path:c.org_path,enrollment_start:c.enrollment_start,enrollment_end:c.enrollment_end,confidence:c.confidence,warnings:[...new Set(c.warnings)].sort()}));}
export async function previewParticipantImport(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  canImport(auth);const sourceName=safeString(input.source_name,250)||'Import',kind=String(input.source_kind||'structured'),fallbackCourseId=safeString(input.default_course_id,100)||null,fallbackOrgUnitId=safeString(input.default_org_unit_id,100)||null;let candidates:ParticipantCandidate[]=[];
  if(Array.isArray(input.rows))candidates.push(...(input.rows as Record<string,unknown>[]).slice(0,5000).map(fromRow));
  if(Array.isArray(input.documents))candidates.push(...(input.documents as unknown[]).slice(0,500).map(x=>extractContract(String(x||''))));
  if(typeof input.text==='string'&&input.text.trim())candidates.push(extractContract(input.text));
  if(!candidates.length)throw new Error('PARTICIPANT_IMPORT_DATA_REQUIRED');if(candidates.length>5000)throw new Error('PARTICIPANT_IMPORT_TOO_LARGE');
  await resolveCourses(env,auth,tenantId,candidates,fallbackCourseId,fallbackOrgUnitId);const seen=new Set<string>();for(const c of candidates){if(c.email){const k=`${c.email}|${c.course_id||''}`;if(seen.has(k))c.warnings.push('DUPLICATE_IN_IMPORT');seen.add(k);}if(c.detected_not_imported.special_category_hint)c.warnings.push('SPECIAL_CATEGORY_DATA_DETECTED_NOT_IMPORTED');if(c.detected_not_imported.bank_data)c.warnings.push('BANK_DATA_DETECTED_NOT_IMPORTED');}
  const clean=canonical(candidates),digest=await sha256Text(JSON.stringify(clean)),batchId=id('pib_'),ts=nowIso(),expires=new Date(Date.now()+2*3600_000).toISOString();const storedKind=['contract_text','pdf_text','pasted_text','api'].includes(kind)?kind:'structured';await env.DB.prepare("INSERT INTO participant_import_batches(id,tenant_id,source_name,source_kind,course_id,preview_digest,preview_json,status,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,?,'preview',?,?,?)").bind(batchId,tenantId,sourceName,storedKind,fallbackCourseId,digest,JSON.stringify(clean),auth.userId,ts,expires).run();await audit(env.DB,auth.userId,'participants.import.previewed',tenantId,fallbackCourseId??undefined,'participant_import_batch',batchId,{sourceName,rows:clean.length,fallbackOrgUnitId});return{batch_id:batchId,digest,expires_at:expires,candidates};
}
// Wie viele Personen ein einzelner Aufruf anlegt. Gemessen, nicht geschaetzt: eine Person kostet
// rund 16 Unteranfragen (Konto suchen, Konto anlegen, Mandantenzuordnung, Mitgliedschaft,
// Einladung samt Mailversand, Nachweiszeile) - die Plattform laesst 1000 je Aufruf zu.
//
// Ohne diese Grenze brach eine Liste mit hundert Teilnehmenden mitten im Anlegen ab: ein Teil war
// angelegt und eingeladen, der Rest nicht, und der Kunde sah nur einen Abbruch, ohne zu wissen wer
// schon drin ist. Jetzt bleibt der Rest ausdruecklich uebrig und wird fortgesetzt - von der
// Oberflaeche sofort, im automatischen Betrieb vom naechsten Lauf.
const PARTICIPANT_APPLY_MAX=50;

export async function applyParticipantImport(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  canImport(auth);
  const batchId=safeString(input.batch_id,100),digest=safeString(input.digest,128);
  const batch=await env.DB.prepare("SELECT preview_digest,preview_json,status,expires_at FROM participant_import_batches WHERE id=? AND tenant_id=?").bind(batchId,tenantId).first<{preview_digest:string;preview_json:string;status:string;expires_at:string}>();
  if(!batch)throw new Error('PARTICIPANT_IMPORT_NOT_FOUND');
  if(batch.status!=='preview')throw new Error('PARTICIPANT_IMPORT_NOT_PENDING');
  if(batch.expires_at<=nowIso())throw new Error('PARTICIPANT_IMPORT_EXPIRED');
  if(batch.preview_digest!==digest)throw new Error('PARTICIPANT_IMPORT_PREVIEW_CHANGED');
  const rows=JSON.parse(batch.preview_json) as ParticipantCandidate[],selected=new Set((Array.isArray(input.selected_indexes)?input.selected_indexes:rows.map((_,i)=>i)).map(Number)),results:any[]=[];
  // Eine Obergrenze aus der Anfrage darf die gemessene Grenze nur unterschreiten, nie anheben.
  const grenze=Math.max(1,Math.min(PARTICIPANT_APPLY_MAX,Math.floor(Number(input.max_apply))||PARTICIPANT_APPLY_MAX));
  const blocking=new Set(['EMAIL_NOT_DETECTED','MULTIPLE_EMAILS','COURSE_AMBIGUOUS','COURSE_NOT_FOUND','COURSE_NOT_RESOLVED','COURSE_INACTIVE','COURSE_FORBIDDEN','ORG_CONTEXT_MISMATCH','ORG_CONTEXT_AMBIGUOUS','ORG_CONTEXT_UNRESOLVED','ORG_FALLBACK_INVALID','DUPLICATE_IN_IMPORT']);
  // Was ein frueherer Aufruf schon erledigt hat, steht in den Ergebniszeilen. Daran erkennt ein
  // Folgeaufruf, wo er weitermachen muss - auch dann, wenn dazwischen etwas abgestuerzt ist.
  const erledigt=new Set((((await env.DB.prepare('SELECT email FROM participant_import_results WHERE batch_id=? AND tenant_id=?').bind(batchId,tenantId).all<{email:string}>()).results)??[]).map(x=>String(x.email||'').toLowerCase()));
  let bearbeitet=0,offen=0;
  for(let i=0;i<rows.length;i++){
    const r=rows[i];
    if(!selected.has(i))continue;
    if(!r.display_name||!r.email||!r.course_id||r.warnings.some(w=>blocking.has(w))){results.push({index:i,action:'skipped',reason:'REVIEW_REQUIRED'});continue;}
    if(erledigt.has(r.email.toLowerCase())){results.push({index:i,action:'already_applied'});continue;}
    if(bearbeitet>=grenze){offen++;continue;}
    bearbeitet++;
    const ts=nowIso();
    try{
      const created=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:'participant',course_id:r.course_id});
      if(r.external_id)await env.DB.prepare("UPDATE tenant_users SET external_id=COALESCE(external_id,?),source=CASE WHEN source='manual' THEN 'import' ELSE source END,updated_at=? WHERE tenant_id=? AND user_id=? AND (external_id IS NULL OR external_id=?)").bind(r.external_id,ts,tenantId,created.user_id,r.external_id).run();
      const action=created.invitation_sent?'created_invited':'existing_added';
      await env.DB.prepare('INSERT INTO participant_import_results(id,batch_id,tenant_id,course_id,user_id,email,display_name,external_id,action,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(id('pir_'),batchId,tenantId,r.course_id,created.user_id,r.email,r.display_name,r.external_id,action,JSON.stringify({enrollment_start:r.enrollment_start,enrollment_end:r.enrollment_end,org_path:r.org_path}),ts).run();
      erledigt.add(r.email.toLowerCase());
      results.push({index:i,action,user_id:created.user_id,invitation_sent:created.invitation_sent});
    }catch(e){
      // Auch das Scheitern wird festgehalten. Sonst versuchte es jeder Folgeaufruf erneut, kaeme
      // nie ans Ende der Liste - und niemand koennte spaeter nachlesen, wer nicht angelegt wurde.
      const grund=String((e as Error).message||e).slice(0,200);
      await env.DB.prepare('INSERT INTO participant_import_results(id,batch_id,tenant_id,course_id,user_id,email,display_name,external_id,action,detail_json,created_at) VALUES(?,?,?,?,NULL,?,?,?,?,?,?)').bind(id('pir_'),batchId,tenantId,r.course_id,r.email,r.display_name,r.external_id,'skipped',JSON.stringify({reason:grund}),ts).run();
      erledigt.add(r.email.toLowerCase());
      results.push({index:i,action:'skipped',reason:grund});
    }
  }
  const fertig=!offen;
  if(fertig)await env.DB.prepare("UPDATE participant_import_batches SET status='applied',applied_at=? WHERE id=? AND tenant_id=? AND status='preview'").bind(nowIso(),batchId,tenantId).run();
  await audit(env.DB,auth.userId,'participants.import.applied',tenantId,undefined,'participant_import_batch',batchId,{selected:selected.size,created:results.filter(x=>x.action==='created_invited').length,skipped:results.filter(x=>x.action==='skipped').length,remaining:offen,completed:fertig});
  return{batch_id:batchId,results,completed:fertig,remaining:offen};
}
