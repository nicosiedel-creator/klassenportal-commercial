import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireRole } from './permissions.js';
import { createCourse } from './data.js';
import { enforceCourseEntitlement } from './commerce.js';
import { createTenantUser } from './users.js';
import { createTeacherPortalTeacher, saveTeacherPortalAssignment } from './teacher-portal.js';
import { createOrgUnit } from './enterprise-organization.js';
import { savePlanningResource } from './planning-constraints.js';
import { id, normalizeEmail, nowIso, safeString, sha256Text, slugify } from './utils.js';

export type OrganizationCandidateType='org_unit'|'resource'|'course'|'subject'|'participant'|'class_admin'|'guest'|'teacher'|'tenant_admin_review';
export type OrganizationCandidate={type:OrganizationCandidateType;display_name:string|null;email:string|null;course_id:string|null;course_name:string|null;course_code:string|null;course_ref:string|null;subject_name:string|null;subject_short_name:string|null;confidence:number;warnings:string[];source_row:number|null;synthesized?:boolean;external_id?:string|null;parent_external_id?:string|null;org_unit_type_key?:string|null;org_unit_type_label?:string|null;org_unit_ref?:string|null;address?:Record<string,string>|null;resource_kind?:string|null;resource_status?:string|null;capacity?:number|null;features?:string[]|null;};
type ExistingCourse={id:string;name:string;code:string};
const norm=(v:unknown,max=300)=>safeString(v,max).replace(/\s+/g,' ').trim();
const key=(v:unknown)=>norm(v).toLocaleLowerCase('de-DE').replace(/[ä]/g,'ae').replace(/[ö]/g,'oe').replace(/[ü]/g,'ue').replace(/[ß]/g,'ss').replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
const validEmail=(v:unknown)=>{const e=normalizeEmail(v);return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)?e:'';};
export const rowValue=(row:Record<string,unknown>,...names:string[])=>{for(const n of names){const wanted=key(n);for(const [k,v] of Object.entries(row))if(key(k)===wanted&&String(v??'').trim())return v;}return'';};
const ORG_UNIT_TYPE_KEY=/^[a-z][a-z0-9_-]{1,48}$/;
const ORG_UNIT_NODE_WORDS=/^(location|standort|org_unit|orgunit|organisationseinheit|abteilung|bereich|einheit|unit|knoten)$/;
// Eindeutige Einheitenwoerter: so heisst nie die Funktion einer Person.
const ORG_UNIT_WORDS_STRONG=/^(standort|location|campus|niederlassung|filiale|fachbereich|abteilung|department|organisationseinheit|org_unit|orgunit|verwaltungseinheit|stabsstelle|referat|sachgebiet)$/;
// Mehrdeutige Woerter: "Leitung" oder "Service" steht in einer Personalliste genauso in der
// Rollenspalte. Sie zaehlen nur zusammen mit einem Strukturmerkmal der Zeile.
const ORG_UNIT_WORDS_WEAK=/^(leitung|geschaeftsfuehrung|geschaeftsleitung|service|servicebereich|bereich|einheit|unit)$/;
const ORG_UNIT_TYPES:[RegExp,string,string][]=[
  [/^(standort|location|campus|niederlassung|filiale)$/,'location','Standort'],
  [/^(abteilung|bereich|fachbereich|department|organisationseinheit|org_unit|orgunit|einheit|unit|verwaltungseinheit|referat|sachgebiet)$/,'department','Bereich / Fachbereich'],
  [/^(bildungsgang|programm|program|studiengang)$/,'program','Bildungsgang / Programm'],
  [/^(massnahme|projekt|measure|project)$/,'measure','Maßnahme / Projekt'],
  [/^(gruppe|group|team)$/,'group','Gruppe'],
];
// Ein Organigramm nennt seine Ebenen selten so, wie das Portal sie intern fuehrt. "Fachbereich",
// "Leitung", "Service" sind Beschriftungen des Kunden. Bekannte Beschriftungen werden auf die
// mitgelieferten Typen abgebildet, alles andere wird als eigener Typ mit genau der Beschriftung
// des Kunden angelegt - erfunden wird nichts.
function orgUnitType(label:string,hasAddress:boolean){const k=key(label);for(const [re,typeKey,typeLabel] of ORG_UNIT_TYPES)if(re.test(k))return{key:typeKey,label:typeLabel};if(k&&ORG_UNIT_TYPE_KEY.test(k))return{key:k,label:norm(label,120)};return hasAddress?{key:'location',label:'Standort'}:{key:'department',label:'Bereich / Fachbereich'};}
const orgUnitAddress=(row:Record<string,unknown>)=>({street:norm(rowValue(row,'street','strasse','straße','adresse'),160),postal_code:norm(rowValue(row,'postal_code','plz','zip'),20),city:norm(rowValue(row,'city','ort','stadt'),120),country:norm(rowValue(row,'country','land'),80)});
function orgUnitData(row:Record<string,unknown>){
  const address=orgUnitAddress(row),hasAddress=Object.values(address).some(Boolean);
  const declared=norm(rowValue(row,'type','typ','art','kategorie'),120)||norm(rowValue(row,'node_type','knotentyp','ebene'),120);
  const filled:Record<string,string>={};for(const [k,v] of Object.entries(address))if(v)filled[k]=v;
  return{external_id:norm(rowValue(row,'external_id','externe_id','unit_id','location_id','org_unit_id','standort_id'),160)||null,
    parent_external_id:norm(rowValue(row,'parent_external_id','parent_id','uebergeordnet','uebergeordnete_einheit','elternknoten'),160)||null,
    name:norm(rowValue(row,'display_name','name','bezeichnung','einheit','standort'),200)||null,
    type:orgUnitType(declared,hasAddress),address:Object.keys(filled).length?filled:null};
}
// Eine Zeile ist genau dann ein Standort oder eine Organisationseinheit, wenn der Kunde das
// entweder ausdruecklich sagt (node_type/Typ) oder wenn die Zeile eine Einheit beschreibt und
// keine Person, keinen Kurs und kein Fach: kein Vor-/Nachname, keine E-Mail, dafuer eine
// Standort-/Einheitenkennung oder eine Anschrift. Vorher fiel jede solche Zeile in den
// Auffangfall "Teilnehmer" - ein Campus wurde als Person zum Import vorgeschlagen.
export function orgUnitSignal(row:Record<string,unknown>,raw:string):boolean{
  if(ORG_UNIT_NODE_WORDS.test(key(rowValue(row,'node_type','knotentyp','ebene'))))return true;
  if(rowValue(row,'email','e_mail','mail','emailadresse','teacher_email')||rowValue(row,'first_name','vorname','last_name','nachname'))return false;
  if(rowValue(row,'course_name','course_code','kurs','klasse','kurscode','subject_name','fach','fachname'))return false;
  if(ORG_UNIT_WORDS_STRONG.test(raw))return true;
  if(!rowValue(row,'display_name','name','bezeichnung','einheit'))return false;
  const structural=!!(rowValue(row,'location_id','unit_id','org_unit_id','standort_id')||Object.values(orgUnitAddress(row)).some(Boolean));
  return structural&&(!raw||ORG_UNIT_WORDS_WEAK.test(raw)||ORG_UNIT_WORDS_STRONG.test(raw));
}
const RESOURCE_WORDS=/^(raum|room|seminarraum|klassenraum|unterrichtsraum|hoersaal|labor|werkstatt|ressource|resource|equipment|ausstattung|geraet|technik|material|fahrzeug|vehicle|online_raum|onlineraum|online_room|virtueller_raum)$/;
const RESOURCE_KINDS:[RegExp,string][]=[
  [/^(online_raum|onlineraum|online_room|virtueller_raum|virtual|webinar)$/,'online_room'],
  [/^(raum|room|seminarraum|klassenraum|unterrichtsraum|hoersaal|labor|werkstatt)$/,'room'],
  [/^(fahrzeug|vehicle|bus|transporter)$/,'vehicle'],
  [/^(equipment|ausstattung|geraet|technik|material|werkzeug)$/,'equipment'],
];
const RESOURCE_STATUS:[RegExp,string][]=[
  [/^(wartung|maintenance|reparatur|gesperrt|belegt)$/,'maintenance'],
  [/^(inaktiv|inactive|stillgelegt|ausser_betrieb|ausgemustert)$/,'inactive'],
];
const resourceTypeWord=(row:Record<string,unknown>)=>key(rowValue(row,'resource_type','ressourcentyp','ressourcenart','raumtyp','raumart','art_der_ressource'));
// Ein Raum ist keine Person. Ohne diese Unterscheidung landete jede Raumliste im Auffangfall
// "Teilnehmer" und wurde dem Kunden als Personenimport ohne E-Mail vorgelegt.
export function resourceSignal(row:Record<string,unknown>,raw:string):boolean{
  if(RESOURCE_WORDS.test(resourceTypeWord(row)))return true;
  if(rowValue(row,'email','e_mail','mail','emailadresse','teacher_email')||rowValue(row,'first_name','vorname','last_name','nachname'))return false;
  if(rowValue(row,'course_name','course_code','kurs','klasse','kurscode','subject_name','fach','fachname'))return false;
  if(RESOURCE_WORDS.test(raw))return true;
  return!!(rowValue(row,'resource_id','raum_id','room_id','raumnummer')&&rowValue(row,'display_name','name','bezeichnung'));
}
function resourceData(row:Record<string,unknown>){
  const word=resourceTypeWord(row)||key(rowValue(row,'role','rolle','typ','type'));let kind='other';for(const [re,k] of RESOURCE_KINDS)if(re.test(word)){kind=k;break;}
  const statusWord=key(rowValue(row,'status','zustand','verfuegbarkeit'));let status='active';for(const [re,v] of RESOURCE_STATUS)if(re.test(statusWord)){status=v;break;}
  const rawCapacity=norm(rowValue(row,'capacity','kapazitaet','plaetze','sitzplaetze'),20).replace(/[^0-9]/g,''),capacity=rawCapacity?Math.min(100000,Number(rawCapacity)):null;
  const features=norm(rowValue(row,'features','ausstattung','merkmale','austattung'),500).split(/[;,|\/]/).map(x=>x.trim()).filter(Boolean).slice(0,100);
  return{name:norm(rowValue(row,'display_name','name','bezeichnung','raum'),200)||null,kind,status,capacity:Number.isFinite(capacity as number)?capacity:null,features:features.length?features:null,
    external_id:norm(rowValue(row,'external_id','externe_id','resource_id','raum_id','room_id','raumnummer'),160)||null};
}
// Nennt die Zeile ihre Art ausdruecklich und genau, gilt das - vor jeder Struktur- und
// Wortmustererkennung. Genau diese Werte stellt auch die Typkorrektur in der Vorschau ein: eine
// Richtigstellung des Pruefenden muss sich gegen jedes Erkennungsmerkmal der Zeile durchsetzen.
const EXPLICIT_ROLE:[RegExp,OrganizationCandidateType][]=[
  [/^(tenant_admin|kunden_?admin|bildungstraeger_admin|gesamtadmin|organisationsadmin)$/,'tenant_admin_review'],
  [/^(class_admin|klassen_?admin)$/,'class_admin'],
  [/^(teacher|dozent|dozentin|lehrkraft|trainer|trainerin)$/,'teacher'],
  [/^(guest|gast)$/,'guest'],
  [/^(course|kurs|klasse)$/,'course'],
  [/^(subject|fach)$/,'subject'],
  [/^(participant|teilnehmer|teilnehmerin|schueler|schuelerin|student|studentin)$/,'participant'],
  [/^(org_unit|orgunit|organisationseinheit|standort|location)$/,'org_unit'],
  [/^(resource|ressource|raum|room)$/,'resource'],
];
export function importRole(row:Record<string,unknown>):OrganizationCandidateType{
  const raw=key(rowValue(row,'role','rolle','funktion','person_type','personenart','typ','type'));
  for(const [pattern,role] of EXPLICIT_ROLE)if(pattern.test(raw))return role;
  if(/tenant_admin|kunden_?admin|bildungstraeger_admin|gesamtadmin|organisationsadmin/.test(raw))return'tenant_admin_review';
  if(resourceSignal(row,raw))return'resource';
  if(orgUnitSignal(row,raw))return'org_unit';
  if(/class_admin|klassen_?admin/.test(raw))return'class_admin';
  if(/teacher|dozent|dozentin|lehrkraft|trainer|trainerin/.test(raw))return'teacher';
  if(/guest|gast/.test(raw))return'guest';
  if(/course|kurs|klasse/.test(raw))return'course';
  if(/subject|fach/.test(raw))return'subject';
  if(/participant|teilnehmer|teilnehmerin|schueler|schuelerin|student|studentin/.test(raw))return'participant';
  const teacherSignal=rowValue(row,'teacher','teacher_name','dozent','dozent_name','lehrkraft');if(teacherSignal)return'teacher';
  const personSignal=rowValue(row,'display_name','name','person','person_name','participant','participant_name','teilnehmer','schueler','student'),emailSignal=rowValue(row,'email','e_mail','mail','emailadresse');
  if(!personSignal&&!emailSignal){if(rowValue(row,'course_name','kurs','klasse','lehrgang','massnahme','course_code','kurscode','klassencode'))return'course';if(rowValue(row,'subject_name','subject','fach','fachname'))return'subject';}
  return'participant';
}
function personName(row:Record<string,unknown>,type:OrganizationCandidateType){const specific=type==='teacher'?rowValue(row,'teacher','teacher_name','dozent','dozent_name','lehrkraft'):rowValue(row,'participant','participant_name','teilnehmer','teilnehmer_name','schueler','student');const direct=norm(specific||rowValue(row,'display_name','name','person','person_name'));if(direct)return direct;const first=norm(rowValue(row,'first_name','vorname')),last=norm(rowValue(row,'last_name','nachname'));return[first,last].filter(Boolean).join(' ');}
function courseData(row:Record<string,unknown>){return{id:norm(rowValue(row,'course_id','kurs_id'),120)||null,name:norm(rowValue(row,'course_name','kurs','klasse','lehrgang','massnahme','maßnahme'),200)||null,code:norm(rowValue(row,'course_code','kurscode','klassencode','massnahmennummer','maßnahmennummer'),80)||null};}
function subjectData(row:Record<string,unknown>){return{name:norm(rowValue(row,'subject_name','subject','fach','fachname'),200)||null,short:norm(rowValue(row,'subject_short_name','subject_code','fachkuerzel','fachkürzel','kuerzel','kürzel'),50)||null};}
function courseRef(c:{id:string|null;name:string|null;code:string|null}){return key(c.id||c.code||c.name||'')||null;}
function label(text:string,names:string[],max=220){for(const n of names){const m=text.match(new RegExp(`(?:^|\\n)\\s*${n}\\s*[:\\-]\\s*([^\\n]{1,${max}})`,'im'));if(m?.[1])return norm(m[1],max);}return'';}
export function textRows(text:string){const blocks=text.replace(/\r/g,'\n').replace(/---+\s*Seite[^\n]*---+/gi,'\n').split(/\n\s*\n|---+\s*(?:Datensatz|Person)[^\n]*---+/i).map(x=>x.trim()).filter(Boolean).slice(0,1000);return blocks.map(block=>({rolle:label(block,['Rolle','Funktion','Typ','Personenart'],100),name:label(block,['Name','Person','Teilnehmer(?:in)?','Dozent(?:in)?','Lehrkraft'],200),email:(block.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)||[])[0]||'',kurs:label(block,['Kurs','Klasse','Lehrgang','Maßnahme','Massnahme'],200),kurscode:label(block,['Kurscode','Klassencode','Maßnahmennummer','Massnahmennummer'],100),fach:label(block,['Fach','Subject'],200),fachkuerzel:label(block,['Fachkürzel','Fachkuerzel','Subject code'],50)}));}
// Eine Kurskennung aus der Datei des Kunden ist seine eigene, nicht die des Portals. Sie hier zu
// finden ist ein Glueck, sie nicht zu finden ist der Normalfall - eine Kursliste wird ja gerade
// eingelesen, um die Kurse erst anzulegen.
//
// Vorher brach die Aufloesung bei einer unbekannten Kennung sofort mit COURSE_NOT_FOUND ab und
// sah den Kursnamen, der direkt daneben stand, nie an. Ergebnis in einer echten Kundendatei:
// 24 Funde, jede einzelne Kurszeile mit "Angegebener Kurs existiert nicht" abgewaehlt - obwohl
// genau diese Kurse angelegt werden sollten.
//
// Jetzt ist eine unbekannte Kennung nur dann ein Hindernis, wenn daneben weder Kursname noch
// Kurscode steht. Nur dann ist wirklich nicht zu erkennen, welcher Kurs gemeint ist.
function resolveCourse(c:{id:string|null;name:string|null;code:string|null},courses:ExistingCourse[]){if(c.id){const x=courses.find(v=>v.id===c.id);if(x)return{course:x,warning:null};if(!c.code&&!c.name)return{course:null,warning:'COURSE_NOT_FOUND'};}const code=c.code?.toLowerCase(),name=c.name?.toLocaleLowerCase('de-DE');if(code){const found=courses.filter(v=>v.code.toLowerCase()===code);if(found.length===1)return{course:found[0],warning:null};if(found.length>1)return{course:null,warning:'COURSE_AMBIGUOUS'};}if(name){const found=courses.filter(v=>v.name.toLocaleLowerCase('de-DE')===name);if(found.length===1)return{course:found[0],warning:null};if(found.length>1)return{course:null,warning:'COURSE_AMBIGUOUS'};}return{course:null,warning:null};}
function baseCandidate(row:Record<string,unknown>,i:number,courses:ExistingCourse[]):OrganizationCandidate{
  const type=importRole(row),c=courseData(row),s=subjectData(row),resolved=resolveCourse(c,courses),warnings:string[]=[];let name:string|null=null,email:string|null=null;
  if(type==='resource'){const x=resourceData(row);if(!x.name)warnings.push('RESOURCE_NAME_REQUIRED');
    return{type,display_name:x.name,email:null,course_id:null,course_name:null,course_code:null,course_ref:null,subject_name:null,subject_short_name:null,confidence:Math.max(0,100-warnings.length*25),warnings,source_row:i,external_id:x.external_id,parent_external_id:null,org_unit_ref:norm(rowValue(row,'location_external_id','org_unit_external_id','standort','location'),160)||null,resource_kind:x.kind,resource_status:x.status,capacity:x.capacity,features:x.features};}
  if(type==='org_unit'){const u=orgUnitData(row);if(!u.name)warnings.push('ORG_UNIT_NAME_REQUIRED');if(u.external_id&&u.parent_external_id&&key(u.external_id)===key(u.parent_external_id))warnings.push('ORG_UNIT_PARENT_INVALID');
    return{type,display_name:u.name,email:null,course_id:null,course_name:null,course_code:null,course_ref:null,subject_name:null,subject_short_name:null,confidence:Math.max(0,100-warnings.length*25),warnings,source_row:i,external_id:u.external_id,parent_external_id:u.parent_external_id,org_unit_type_key:u.type.key,org_unit_type_label:u.type.label,address:u.address};}
  if(type==='course'){name=c.name||norm(rowValue(row,'name','display_name'),200)||null;if(!name&&!c.code)warnings.push('COURSE_NAME_REQUIRED');}
  else if(type==='subject'){name=s.name||norm(rowValue(row,'name','display_name'),200)||null;if(!name)warnings.push('SUBJECT_NAME_REQUIRED');}
  else{name=personName(row,type)||null;email=validEmail(rowValue(row,'email','e_mail','mail','emailadresse','teacher_email','dozent_email'))||null;if(!name)warnings.push('NAME_REQUIRED');if(!email&&type!=='teacher')warnings.push('EMAIL_REQUIRED');if(type==='teacher'&&!email)warnings.push('TEACHER_PORTAL_EMAIL_MISSING');}
  if(['participant','class_admin','guest'].includes(type)&&!resolved.course&&!c.name&&!c.code&&!c.id)warnings.push('COURSE_REQUIRED');if(resolved.warning)warnings.push(resolved.warning);if(!resolved.course&&(c.name||c.code)&&!resolved.warning)warnings.push('COURSE_WILL_BE_CREATED');if(type==='tenant_admin_review')warnings.push('TENANT_ADMIN_CONFIRMATION_REQUIRED');
  const confidence=Math.max(0,100-warnings.filter(w=>!['COURSE_WILL_BE_CREATED','TEACHER_PORTAL_EMAIL_MISSING'].includes(w)).length*25-(warnings.includes('TEACHER_PORTAL_EMAIL_MISSING')?10:0));return{type,display_name:name,email,course_id:resolved.course?.id||null,course_name:resolved.course?.name||c.name,course_code:resolved.course?.code||c.code,course_ref:courseRef(c),subject_name:s.name,subject_short_name:s.short,confidence,warnings,source_row:i,org_unit_ref:norm(rowValue(row,'org_unit_external_id','location_external_id','org_unit','organisationseinheit_id'),160)||null};
}
async function existingCourses(env:Env,tenantId:string){const r=await env.DB.prepare('SELECT id,name,code FROM courses WHERE tenant_id=? AND is_active=1 ORDER BY name').bind(tenantId).all<ExistingCourse>();return(r.results??[]) as ExistingCourse[];}
// Zwei Einheiten koennen gleich heissen ("IT" an zwei Standorten). Unterschieden werden sie an
// ihrer externen Kennung; nur ohne Kennung bleibt der Name das einzige Merkmal.
function candidateSignature(c:OrganizationCandidate){if(c.type==='resource')return`${c.type}|${key(c.resource_kind||'')}|${key(c.display_name)}`;if(c.type==='subject')return`${c.type}|${key(c.subject_name||c.display_name)}`;if(c.type==='org_unit')return`${c.type}|${key(c.external_id||c.display_name)}`;return`${c.type}|${key(c.email||c.display_name)}|${c.course_id||c.course_ref||''}`;}
function synthesize(candidates:OrganizationCandidate[],courses:ExistingCourse[]){const out:OrganizationCandidate[]=[],courseSeen=new Set<string>(),subjectSeen=new Set<string>();for(const c of candidates){if(c.type!=='course'&&!c.course_id&&(c.course_name||c.course_code)&&!c.warnings.includes('COURSE_AMBIGUOUS')&&!c.warnings.includes('COURSE_NOT_FOUND')){const k=key(c.course_code||c.course_name);if(k&&!courseSeen.has(k)){courseSeen.add(k);out.push({synthesized:true,type:'course',display_name:c.course_name||c.course_code,email:null,course_id:null,course_name:c.course_name||c.course_code,course_code:c.course_code||null,course_ref:k,subject_name:null,subject_short_name:null,confidence:100,warnings:[],source_row:c.source_row});}}}for(const c of candidates){if(c.type!=='subject'&&c.subject_name){const k=key(c.subject_name);if(k&&!subjectSeen.has(k)){subjectSeen.add(k);out.push({synthesized:true,type:'subject',display_name:c.subject_name,email:null,course_id:null,course_name:null,course_code:null,course_ref:null,subject_name:c.subject_name,subject_short_name:c.subject_short_name,confidence:100,warnings:[],source_row:c.source_row});}}}const existingCourseKeys=new Set(courses.flatMap(c=>[key(c.id),key(c.code),key(c.name)]));const combined=[...out.filter(c=>c.type!=='course'||!existingCourseKeys.has(key(c.course_code||c.course_name))),...candidates];return combined.filter((c,i,a)=>{const sig=candidateSignature(c);return a.findIndex(x=>candidateSignature(x)===sig)===i;});}
function summary(candidates:OrganizationCandidate[]){const counts:Record<string,number>={};for(const c of candidates)counts[c.type]=(counts[c.type]||0)+1;const needs_review=candidates.filter(c=>c.warnings.some(w=>!['COURSE_WILL_BE_CREATED','ORG_UNIT_PARENT_NOT_FOUND'].includes(w))).length;return{counts,needs_review,total:candidates.length};}
function canonical(candidates:OrganizationCandidate[]){return candidates.map(c=>({...c,warnings:[...new Set(c.warnings)].sort()}));}
// Ein Organigramm beginnt fast immer beim Bildungstraeger selbst - und genau diese Zeile liegt
// nicht in der Datei. Eine unbekannte uebergeordnete Kennung ist deshalb kein Fehler: die Einheit
// wird als oberste Ebene angelegt, und die Vorschau sagt das auch. Blockiert wird nur, was
// wirklich unaufloesbar ist.
async function markOrgUnitParents(env:Env,tenantId:string,candidates:OrganizationCandidate[]){
  const units=candidates.filter(c=>c.type==='org_unit');if(!units.length)return;
  const rows=await env.DB.prepare('SELECT external_id FROM org_units WHERE tenant_id=? AND external_id IS NOT NULL').bind(tenantId).all<{external_id:string}>().catch(()=>({results:[] as {external_id:string}[]}));
  const known=new Set<string>();for(const x of rows.results??[])known.add(key(x.external_id));
  for(const u of units)if(u.external_id)known.add(key(u.external_id));
  for(const u of units){const parent=key(u.parent_external_id||'');if(parent&&!known.has(parent))u.warnings.push('ORG_UNIT_PARENT_NOT_FOUND');}
}
export async function previewOrganizationImport(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireRole(auth,'tenant_admin');let rows:Record<string,unknown>[]=[];if(Array.isArray(input.rows))rows=(input.rows as Record<string,unknown>[]).slice(0,5000);if(typeof input.text==='string'&&input.text.trim())rows.push(...textRows(input.text));if(Array.isArray(input.documents))for(const d of(input.documents as unknown[]).slice(0,500))rows.push(...textRows(String(d||'')));if(!rows.length)throw new Error('ORGANIZATION_IMPORT_DATA_REQUIRED');if(rows.length>5000)throw new Error('ORGANIZATION_IMPORT_TOO_LARGE');const courses=await existingCourses(env,tenantId);
  // Eine Rueckfrage, die keine Antwort zulaesst, ist keine Rueckfrage. Erkennt die Automatik eine
  // Zeile falsch - ein Standort als Teilnehmer etwa -, kann der Pruefende ihren Typ hier
  // richtigstellen oder sie ganz weglassen. Die Korrektur wird als Rollenspalte in die Zeile
  // geschrieben und laeuft danach durch genau dieselbe Erkennung wie alles andere: es gibt
  // keinen zweiten, nur fuer Korrekturen gebauten Weg, der abweichen koennte.
  const overrides=input.role_overrides&&typeof input.role_overrides==='object'?input.role_overrides as Record<string,unknown>:{};
  const kept:{row:Record<string,unknown>;index:number}[]=[];
  rows.forEach((row,index)=>{const choice=norm(overrides[String(index)],40).toLowerCase();if(choice==='ignore')return;kept.push({row:choice?{...row,role:choice}:row,index});});
  if(!kept.length)throw new Error('ORGANIZATION_IMPORT_DATA_REQUIRED');
  const raw=kept.map(r=>baseCandidate(r.row,r.index,courses)),merged=synthesize(raw,courses);await markOrgUnitParents(env,tenantId,merged);const candidates=canonical(merged),digest=await sha256Text(JSON.stringify(candidates)),batchId=id('oib_'),ts=nowIso(),expires=new Date(Date.now()+2*3600_000).toISOString(),sourceName=norm(input.source_name,250)||'Organisationsimport',sourceKind=norm(input.source_kind,50)||'structured';await env.DB.prepare("INSERT INTO organization_import_batches(id,tenant_id,source_name,source_kind,preview_digest,preview_json,status,created_by,created_at,expires_at) VALUES(?,?,?,?,?,?,'preview',?,?,?)").bind(batchId,tenantId,sourceName,sourceKind,digest,JSON.stringify(candidates),auth.userId,ts,expires).run();await audit(env.DB,auth.userId,'organization.import.previewed',tenantId,undefined,'organization_import_batch',batchId,{sourceName,total:candidates.length,summary:summary(candidates)});return{batch_id:batchId,digest,expires_at:expires,candidates,summary:summary(candidates)};}
async function findCourse(env:Env,tenantId:string,c:OrganizationCandidate){if(c.course_id)return c.course_id;const ref=key(c.course_ref||c.course_code||c.course_name);if(!ref)return null;const r=await env.DB.prepare('SELECT id,name,code FROM courses WHERE tenant_id=? AND is_active=1').bind(tenantId).all<ExistingCourse>();const found=(r.results??[]).filter(x=>[key(x.id),key(x.code),key(x.name)].includes(ref));return found.length===1?String(found[0].id):null;}
async function ensureSubject(env:Env,tenantId:string,name:string,shortName:string|null){const existing=await env.DB.prepare('SELECT id FROM subjects WHERE tenant_id=? AND name=? COLLATE NOCASE').bind(tenantId,name).first<{id:string}>();if(existing)return{...existing,created:false};const sid=id('sub_');await env.DB.prepare('INSERT INTO subjects(id,tenant_id,name,short_name,created_at) VALUES(?,?,?,?,?)').bind(sid,tenantId,name,shortName,nowIso()).run();return{id:sid,created:true};}
export const ORGANIZATION_BLOCKING_WARNINGS=new Set(['RESOURCE_NAME_REQUIRED','ORG_UNIT_NAME_REQUIRED','ORG_UNIT_PARENT_INVALID','COURSE_NAME_REQUIRED','SUBJECT_NAME_REQUIRED','NAME_REQUIRED','EMAIL_REQUIRED','COURSE_REQUIRED','COURSE_AMBIGUOUS','COURSE_NOT_FOUND','TENANT_ADMIN_CONFIRMATION_REQUIRED']);
async function recordResult(env:Env,batchId:string,tenantId:string,index:number,type:string,action:string,entityId:string|null,detail:unknown){await env.DB.prepare('INSERT INTO organization_import_results(id,batch_id,tenant_id,candidate_index,entity_type,action,entity_id,detail_json,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(id('oir_'),batchId,tenantId,index,type,action,entityId,JSON.stringify(detail??{}),nowIso()).run();}
// Der Typ einer Einheit muss im Mandanten bekannt sein, bevor eine Einheit ihn tragen darf.
// Angelegt wird er nur, wenn er fehlt: hat der Kunde einen Typ bewusst abgeschaltet oder
// umbenannt, bleibt seine Entscheidung stehen und der Import meldet das offen.
async function ensureOrgUnitType(env:Env,tenantId:string,typeKey:string,label:string){
  const ts=nowIso();
  await env.DB.prepare("INSERT INTO org_unit_types(tenant_id,type_key,label,sort_order,is_active,created_at,updated_at) VALUES(?,?,?,100,1,?,?) ON CONFLICT(tenant_id,type_key) DO NOTHING").bind(tenantId,typeKey,label,ts,ts).run();
  const row=await env.DB.prepare('SELECT is_active FROM org_unit_types WHERE tenant_id=? AND type_key=?').bind(tenantId,typeKey).first<{is_active:number}>();
  if(!row)throw new Error('ORG_UNIT_TYPE_MISSING');
  if(Number(row.is_active)!==1)throw new Error('ORG_UNIT_TYPE_INACTIVE');
}
// Ein Kurs gehoert zu einem Standort oder Bereich - diese Spalte liegt in jeder ordentlichen
// Kursliste daneben und wurde bisher weggeworfen. Die erste Zuordnung eines Kurses ist seine
// fuehrende; weitere kommen additiv dazu.
async function linkCourseOrgUnit(env:Env,tenantId:string,courseId:string,unitId:string|null){
  if(!courseId||!unitId)return null;
  const link=await env.DB.prepare('SELECT org_unit_id FROM course_org_units WHERE tenant_id=? AND course_id=? AND org_unit_id=?').bind(tenantId,courseId,unitId).first().catch(()=>null);
  if(link)return unitId;
  const primary=await env.DB.prepare('SELECT org_unit_id FROM course_org_units WHERE tenant_id=? AND course_id=? AND is_primary=1 LIMIT 1').bind(tenantId,courseId).first<{org_unit_id:string}>().catch(()=>null);
  return env.DB.prepare('INSERT INTO course_org_units(tenant_id,course_id,org_unit_id,is_primary,created_at) VALUES(?,?,?,?,?)').bind(tenantId,courseId,unitId,primary?0:1,nowIso()).run().then(()=>unitId).catch(()=>null);
}
// Einheiten werden von oben nach unten angelegt: eine Zeile wartet, solange ihr Elternknoten in
// derselben Datei noch nicht existiert. Die Reihenfolge in der Datei ist damit egal. Zeilen,
// deren Elternknoten nie entsteht - Ringschluss oder uebersprungener Elternknoten -, werden
// offen gemeldet und nicht heimlich an die Wurzel gehaengt.
async function applyOrgUnits(env:Env,auth:CoreAuthContext,tenantId:string,batchId:string,rows:OrganizationCandidate[],selected:Set<number>,results:any[]){
  const byExternal=new Map<string,{id:string;name:string}>(),byName=new Map<string,string>();
  const existing=await env.DB.prepare('SELECT id,name,type_key,external_id FROM org_units WHERE tenant_id=?').bind(tenantId).all<{id:string;name:string;type_key:string;external_id:string|null}>().catch(()=>({results:[] as {id:string;name:string;type_key:string;external_id:string|null}[]}));
  for(const x of existing.results??[]){if(x.external_id)byExternal.set(key(x.external_id),{id:String(x.id),name:String(x.name)});byName.set(`${key(x.type_key)}|${key(x.name)}`,String(x.id));}
  let pending=rows.map((_,i)=>i).filter(i=>rows[i].type==='org_unit'&&selected.has(i));
  const inBatch=new Set(pending.map(i=>key(rows[i].external_id||'')).filter(Boolean));
  while(pending.length){
    const deferred:number[]=[];let progressed=false;
    for(const i of pending){
      const r=rows[i],parentKey=key(r.parent_external_id||'');
      if(parentKey&&!byExternal.has(parentKey)&&inBatch.has(parentKey)){deferred.push(i);continue;}
      progressed=true;
      if(r.warnings.some(w=>ORGANIZATION_BLOCKING_WARNINGS.has(w))){const x={index:i,type:'org_unit',action:'skipped',reason:'REVIEW_REQUIRED'};results.push(x);await recordResult(env,batchId,tenantId,i,'org_unit',x.action,null,x);continue;}
      try{
        const external=norm(r.external_id,160)||null,typeKey=norm(r.org_unit_type_key,50)||'department',nameKey=`${key(typeKey)}|${key(r.display_name)}`;
        const known=external?byExternal.get(key(external))?.id:byName.get(nameKey);
        if(known){if(external)byExternal.set(key(external),{id:known,name:String(r.display_name||'')});results.push({index:i,type:'org_unit',action:'existing',entity_id:known});await recordResult(env,batchId,tenantId,i,'org_unit','existing',known,{});continue;}
        await ensureOrgUnitType(env,tenantId,typeKey,norm(r.org_unit_type_label,120)||typeKey);
        const unit=await createOrgUnit(env,auth,tenantId,{name:r.display_name,type_key:typeKey,parent_id:parentKey?byExternal.get(parentKey)?.id||null:null,external_id:external,metadata:r.address||undefined}) as {id:string}|null;
        const unitId=String(unit?.id||'');
        if(external&&unitId)byExternal.set(key(external),{id:unitId,name:String(r.display_name||'')});
        if(unitId)byName.set(nameKey,unitId);
        results.push({index:i,type:'org_unit',action:'created',entity_id:unitId});
        await recordResult(env,batchId,tenantId,i,'org_unit','created',unitId||null,{parent:r.parent_external_id||null,type_key:typeKey});
      }catch(e){const reason=String((e as Error).message||e),x={index:i,type:'org_unit',action:'skipped',reason};results.push(x);await recordResult(env,batchId,tenantId,i,'org_unit','skipped',null,x);}
    }
    if(!progressed){for(const i of deferred){const x={index:i,type:'org_unit',action:'skipped',reason:'ORG_UNIT_PARENT_UNRESOLVED'};results.push(x);await recordResult(env,batchId,tenantId,i,'org_unit',x.action,null,x);}break;}
    pending=deferred;
  }
  return byExternal;
}
export async function applyOrganizationImport(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){requireRole(auth,'tenant_admin');const batchId=norm(input.batch_id,100),digest=norm(input.digest,128),batch=await env.DB.prepare('SELECT preview_digest,preview_json,status,expires_at FROM organization_import_batches WHERE id=? AND tenant_id=?').bind(batchId,tenantId).first<{preview_digest:string;preview_json:string;status:string;expires_at:string}>();if(!batch)throw new Error('ORGANIZATION_IMPORT_NOT_FOUND');if(batch.status!=='preview')throw new Error('ORGANIZATION_IMPORT_NOT_PENDING');if(batch.expires_at<=nowIso())throw new Error('ORGANIZATION_IMPORT_EXPIRED');if(batch.preview_digest!==digest)throw new Error('ORGANIZATION_IMPORT_PREVIEW_CHANGED');const rows=JSON.parse(batch.preview_json) as OrganizationCandidate[],selected=new Set((Array.isArray(input.selected_indexes)?input.selected_indexes:rows.map((_,i)=>i)).map(Number)),results:any[]=[];const orgUnits=await applyOrgUnits(env,auth,tenantId,batchId,rows,selected,results);const order:OrganizationCandidateType[]=['resource','course','subject','participant','class_admin','guest','teacher','tenant_admin_review'];for(const type of order)for(let i=0;i<rows.length;i++){const r=rows[i];if(r.type!==type||!selected.has(i))continue;if(r.warnings.some(w=>ORGANIZATION_BLOCKING_WARNINGS.has(w))){const x={index:i,type,action:'skipped',reason:'REVIEW_REQUIRED'};results.push(x);await recordResult(env,batchId,tenantId,i,type,x.action,null,x);continue;}try{
    if(type==='resource'){const name=r.display_name;if(!name)throw new Error('RESOURCE_NAME_REQUIRED');const kind=norm(r.resource_kind,30)||'room',found=await env.DB.prepare('SELECT id FROM planning_resources WHERE tenant_id=? AND resource_type=? AND name=?').bind(tenantId,kind,name).first<{id:string}>();if(found){results.push({index:i,type,action:'existing',entity_id:found.id});await recordResult(env,batchId,tenantId,i,type,'existing',found.id,{});continue;}const unit=orgUnits.get(key(r.org_unit_ref||'')),saved=await savePlanningResource(env,auth,tenantId,{name,resource_type:kind,code:r.external_id||null,location:unit?.name||norm(r.org_unit_ref,160)||null,capacity:r.capacity??null,features:r.features??null,status:r.resource_status||'active'}) as {resource_id:string};results.push({index:i,type,action:'created',entity_id:saved.resource_id});await recordResult(env,batchId,tenantId,i,type,'created',saved.resource_id,{kind});continue;}
    if(type==='course'){const name=r.course_name||r.display_name||r.course_code;if(!name)throw new Error('COURSE_NAME_REQUIRED');const unitId=orgUnits.get(key(r.org_unit_ref||''))?.id||null,found=await findCourse(env,tenantId,r);if(found){const linked=await linkCourseOrgUnit(env,tenantId,found,unitId);results.push({index:i,type,action:'existing',entity_id:found,org_unit_id:linked});await recordResult(env,batchId,tenantId,i,type,'existing',found,{org_unit_id:linked});continue;}await enforceCourseEntitlement(env,tenantId);const c=await createCourse(env,auth,tenantId,{name,code:r.course_code||slugify(name),access_mode:'login'}) as any;const linked=await linkCourseOrgUnit(env,tenantId,String(c?.id||''),unitId);results.push({index:i,type,action:'created',entity_id:c?.id,org_unit_id:linked});await recordResult(env,batchId,tenantId,i,type,'created',c?.id||null,{org_unit_id:linked});continue;}
    if(type==='subject'){const name=r.subject_name||r.display_name;if(!name)throw new Error('SUBJECT_NAME_REQUIRED');const s=await ensureSubject(env,tenantId,name,r.subject_short_name);results.push({index:i,type,action:s.created?'created':'existing',entity_id:s.id});await recordResult(env,batchId,tenantId,i,type,s.created?'created':'existing',s.id,{});continue;}
    if(type==='tenant_admin_review'){const x={index:i,type,action:'skipped',reason:'TENANT_ADMIN_CONFIRMATION_REQUIRED'};results.push(x);await recordResult(env,batchId,tenantId,i,type,x.action,null,x);continue;}
    const courseId=await findCourse(env,tenantId,r);
    if(type==='participant'||type==='class_admin'||type==='guest'){if(!courseId)throw new Error('COURSE_NOT_RESOLVED');if(!r.display_name||!r.email)throw new Error('USER_FIELDS_REQUIRED');const baseRole=type==='guest'?'guest':'participant',user=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:baseRole,course_id:courseId});let capability=null;if(type==='class_admin')capability=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:'class_admin',course_id:courseId});const action=user.invitation_sent?'created_invited':'existing_added';results.push({index:i,type,action,user_id:user.user_id,course_id:courseId,class_admin_membership_id:capability?.membership_id||null});await recordResult(env,batchId,tenantId,i,type,action,user.user_id,{courseId,classAdmin:type==='class_admin'});continue;}
    if(type==='teacher'){if(!r.display_name)throw new Error('TEACHER_NAME_REQUIRED');const teacher=await createTeacherPortalTeacher(env,auth,tenantId,{name:r.display_name,email:r.email||''}) as any;if(!courseId||!r.email){const action=courseId?'teacher_master_created_portal_email_missing':'teacher_master_created_unassigned';results.push({index:i,type,action,teacher_id:teacher?.id});await recordResult(env,batchId,tenantId,i,type,action,teacher?.id||null,{courseId});continue;}const existingUser=await env.DB.prepare('SELECT id FROM users WHERE email=? COLLATE NOCASE').bind(r.email).first<{id:string}>(),preGuest=existingUser?await env.DB.prepare("SELECT id FROM memberships WHERE tenant_id=? AND course_id=? AND user_id=? AND role='guest'").bind(tenantId,courseId,existingUser.id).first<{id:string}>():null;const user=await createTenantUser(env,auth,tenantId,{display_name:r.display_name,email:r.email,role:'guest',course_id:courseId});const assignment=await saveTeacherPortalAssignment(env,auth,tenantId,{teacher_id:teacher.id,user_id:user.user_id,course_id:courseId}) as any;if(!preGuest&&user.membership_id&&assignment?.id)await env.DB.prepare('UPDATE teacher_portal_assignments SET auth_membership_id=? WHERE id=? AND tenant_id=?').bind(user.membership_id,assignment.id,tenantId).run();const action=user.invitation_sent?'teacher_invited_assigned':'teacher_assigned';results.push({index:i,type,action,teacher_id:teacher.id,user_id:user.user_id,course_id:courseId,assignment_id:assignment?.id});await recordResult(env,batchId,tenantId,i,type,action,teacher.id,{userId:user.user_id,courseId,assignmentId:assignment?.id});continue;}
  }catch(e){const reason=String((e as Error).message||e),x={index:i,type,action:'skipped',reason};results.push(x);await recordResult(env,batchId,tenantId,i,type,'skipped',null,x);}}await env.DB.prepare("UPDATE organization_import_batches SET status='applied',applied_at=? WHERE id=? AND tenant_id=? AND status='preview'").bind(nowIso(),batchId,tenantId).run();await audit(env.DB,auth.userId,'organization.import.applied',tenantId,undefined,'organization_import_batch',batchId,{selected:selected.size,created:results.filter(x=>String(x.action).includes('created')||String(x.action).includes('invited')).length,skipped:results.filter(x=>x.action==='skipped').length});return{batch_id:batchId,results};}
