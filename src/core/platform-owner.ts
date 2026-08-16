import type { D1PreparedStatementLike } from '../portability/types.js';
import type { CoreAuthContext, Env } from './types.js';
import { hashPassword } from './auth.js';
import { audit } from './audit.js';
import { requirePlatform } from './permissions.js';
import { nowIso, safeString, slugify } from './utils.js';

const DEMO_TENANT_ID='ten_demo_spreeblick';
const DEMO_SLUG='bildungszentrum-spreeblick-demo';
const DEMO_DOMAIN='spreeblick-demo.invalid';
const DEMO_NAME='Bildungszentrum Spreeblick (Demo)';

const courseDefs=[
  ['VFA 26/1','vfa-26-1',0],['VFA 26/2','vfa-26-2',0],['VFA 26/3','vfa-26-3',0],['VFA 26/4','vfa-26-4',0],['VFA 26/5','vfa-26-5',0],
  ['Kaufleute Büromanagement 26/1','kbm-26-1',1],['Kaufleute Büromanagement 26/2','kbm-26-2',1],['Kaufleute Büromanagement 26/3','kbm-26-3',1],['Kaufleute Büromanagement 26/4','kbm-26-4',1],['Kaufleute Büromanagement 26/5','kbm-26-5',1],
  ['Fachinformatik Systemintegration 26/1','fisi-26-1',2],['Fachinformatik Systemintegration 26/2','fisi-26-2',2],['Fachinformatik Systemintegration 26/3','fisi-26-3',2],['Fachinformatik Systemintegration 26/4','fisi-26-4',2],['Fachinformatik Systemintegration 26/5','fisi-26-5',2],
  ['Sozialverwaltung 26/1','sozv-26-1',3],['Sozialverwaltung 26/2','sozv-26-2',3],['Sozialverwaltung 26/3','sozv-26-3',3],['Sozialverwaltung 26/4','sozv-26-4',3],['Sozialverwaltung 26/5','sozv-26-5',3],
] as const;
const subjects=[
  ['Allgemeines Verwaltungsrecht','AVR'],['Staats- und Verfassungsrecht','StR'],['Personalwesen','PersW'],['Allgemeine Wirtschaftslehre','AWL'],['Bürgerliches Recht','BGB'],['Sozialrecht','SozR'],['Rechnungswesen','ReWe'],['Kommunikation und Deutsch','Kom'],['Wirtschafts- und Sozialkunde','WiSo'],['Büroprozesse','Büro'],['Projektmanagement','PM'],['Kaufmännische Steuerung','KSt'],['IT-Grundlagen','ITG'],['Netzwerktechnik','NET'],['Systemadministration','SYS'],['Datenbanken und Scripting','DB'],['Sozialleistungsrecht','SLR'],['Fallmanagement','FM'],
] as const;
const programSubjects=[[0,1,2,3,4,5,6,7],[3,6,8,9,10,11,4,7],[12,13,14,15,10,8,3,7],[0,2,5,16,17,3,7,1]] as const;
const teacherNames=['Anja Becker','Thomas Arlt','Miriam Sperling','Stefan Krüger','Julia Hartmann','Daniel Wolf','Leonie Richter','Martin Schulz','Nadine Lehmann','Sven Köhler','Katharina Vogel','Jan Peters','Claudia Neumann','Felix Braun','Sarah König','Andreas Hoffmann','Melanie Werner','Tobias Lange','Franziska Schmitt','Robert Krause','Laura Jansen','Christian Brandt','Sophie Walter','Mehmet Yilmaz'] as const;
const firstNames=['Lena','Jonas','Mia','Emil','Hannah','Noah','Lea','Paul','Sofia','Ben','Amelie','Finn','Clara','Leon','Nele','Max','Aylin','David','Jana','Tim','Elif','Moritz','Luisa','Samir','Marie','Lukas','Zeynep','Niklas','Alina','Oskar'] as const;
const lastNames=['Müller','Schmidt','Schneider','Fischer','Weber','Meyer','Wagner','Becker','Schulz','Hoffmann','Schäfer','Koch','Bauer','Richter','Klein','Wolf','Schröder','Neumann','Schwarz','Zimmermann','Braun','Krüger','Hofmann','Hartmann','Lange','Schmitt','Werner','Krause','Meier','Lehmann'] as const;
const coreFeatures=['schedule','homework','appointments','announcements','links','files','calendar','reminders','weekly_overview','exams_progress','personal_grades','learning_materials','statistics','surveys','substitution_updates'];
const teaserFeatures=['microsoft_teams','microsoft_365','custom_domain','white_label'];

function bool(v:unknown):number{return v===true||v===1||v==='1'?1:0;}
function courseId(i:number){return`crs_demo_${String(i+1).padStart(2,'0')}`;}
function userId(kind:string,i:number,j?:number){return`usr_demo_${kind}_${String(i+1).padStart(2,'0')}${j===undefined?'':`_${String(j+1).padStart(2,'0')}`}`;}
function membershipId(kind:string,i:number,j?:number){return`mem_demo_${kind}_${String(i+1).padStart(2,'0')}${j===undefined?'':`_${String(j+1).padStart(2,'0')}`}`;}
function subjectId(i:number){return`sub_demo_${String(i+1).padStart(2,'0')}`;}
function teacherId(i:number){return`tch_demo_${String(i+1).padStart(2,'0')}`;}
async function runBatches(env:Env,statements:D1PreparedStatementLike[],size=60):Promise<void>{for(let i=0;i<statements.length;i+=size)await env.DB.batch(statements.slice(i,i+size));}
function addDays(date:string,days:number):string{const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
function stamp(date:string,time:string):string{return`${date}T${time}:00+02:00`;}
function cleanSlug(v:unknown,current:string):string{const s=slugify(v??current).slice(0,80);if(!s)throw new Error('TENANT_SLUG_REQUIRED');return s;}

export async function platformTenantDetail(env:Env,auth:CoreAuthContext,tenantId:string){
  requirePlatform(auth);
  const tenant=await env.DB.prepare(`SELECT t.id,t.name,t.slug,t.status,t.created_at,t.updated_at,
    s.portal_name,s.welcome_text,s.logo_url,s.primary_color,s.secondary_color,s.background_color,s.custom_domain,s.white_label,s.locale,s.timezone,
    sub.plan_id,sub.status AS subscription_status,sub.starts_at,sub.ends_at,
    (SELECT COUNT(*) FROM courses c WHERE c.tenant_id=t.id) AS course_count,
    (SELECT COUNT(DISTINCT m.user_id) FROM memberships m WHERE m.tenant_id=t.id) AS user_count
    FROM tenants t LEFT JOIN tenant_settings s ON s.tenant_id=t.id LEFT JOIN subscriptions sub ON sub.tenant_id=t.id WHERE t.id=?`).bind(tenantId).first<Record<string,unknown>>();
  if(!tenant)throw new Error('TENANT_NOT_FOUND');
  const admins=(await env.DB.prepare(`SELECT u.id,u.display_name,u.email,u.status FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.tenant_id=? AND m.role='tenant_admin' ORDER BY u.display_name`).bind(tenantId).all()).results??[];
  const plans=(await env.DB.prepare('SELECT id,name,monthly_price_cents,setup_price_cents,is_active FROM plans WHERE is_active=1 ORDER BY monthly_price_cents,name').all()).results??[];
  return{tenant,admins,plans};
}

export async function updatePlatformTenant(env:Env,auth:CoreAuthContext,tenantId:string,input:Record<string,unknown>){
  requirePlatform(auth);
  const current=await env.DB.prepare('SELECT id,name,slug,status FROM tenants WHERE id=?').bind(tenantId).first<Record<string,unknown>>();if(!current)throw new Error('TENANT_NOT_FOUND');
  const name=safeString(input.name??current.name,200);if(!name)throw new Error('TENANT_NAME_REQUIRED');const slug=cleanSlug(input.slug,current.slug as string),status=String(input.status??current.status);
  if(!['active','suspended','ended','deleting'].includes(status))throw new Error('TENANT_STATUS_INVALID');
  const duplicate=await env.DB.prepare('SELECT id FROM tenants WHERE slug=? AND id<>?').bind(slug,tenantId).first();if(duplicate)throw new Error('TENANT_SLUG_EXISTS');
  const planId=safeString(input.plan_id,80),subscriptionStatus=String(input.subscription_status||'active');if(planId){const p=await env.DB.prepare('SELECT id FROM plans WHERE id=? AND is_active=1').bind(planId).first();if(!p)throw new Error('PLAN_NOT_FOUND');if(!['trial','active','past_due','cancelled','ended'].includes(subscriptionStatus))throw new Error('SUBSCRIPTION_STATUS_INVALID');}
  const ts=nowIso();const statements:D1PreparedStatementLike[]=[env.DB.prepare('UPDATE tenants SET name=?,slug=?,status=?,updated_at=? WHERE id=?').bind(name,slug,status,ts,tenantId)];
  const settings=await env.DB.prepare('SELECT tenant_id FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first();
  const portalName=safeString(input.portal_name||name,200),welcome=safeString(input.welcome_text,4000)||null,primary=safeString(input.primary_color||'#2563eb',20),secondary=safeString(input.secondary_color||'#0f172a',20),background=safeString(input.background_color||'#f8fafc',20),domain=safeString(input.custom_domain,253)||null,white=bool(input.white_label);
  if(settings)statements.push(env.DB.prepare('UPDATE tenant_settings SET portal_name=?,welcome_text=?,primary_color=?,secondary_color=?,background_color=?,custom_domain=?,white_label=?,updated_at=? WHERE tenant_id=?').bind(portalName,welcome,primary,secondary,background,domain,white,ts,tenantId));
  else statements.push(env.DB.prepare('INSERT INTO tenant_settings(tenant_id,portal_name,welcome_text,primary_color,secondary_color,background_color,custom_domain,white_label,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(tenantId,portalName,welcome,primary,secondary,background,domain,white,ts));
  if(planId)statements.push(env.DB.prepare(`INSERT INTO subscriptions(tenant_id,plan_id,status,starts_at) VALUES(?,?,?,?) ON CONFLICT(tenant_id) DO UPDATE SET plan_id=excluded.plan_id,status=excluded.status`).bind(tenantId,planId,subscriptionStatus,ts));
  await env.DB.batch(statements);await audit(env.DB,auth.userId,'platform.tenant_updated',tenantId,undefined,'tenant',tenantId,{name,slug,status,planId:planId||undefined,subscriptionStatus:planId?subscriptionStatus:undefined});
  return platformTenantDetail(env,auth,tenantId);
}

export async function demoFixtureStatus(env:Env,auth:CoreAuthContext){
  requirePlatform(auth);const tenant=await env.DB.prepare('SELECT id,name,slug,status FROM tenants WHERE id=? OR slug=?').bind(DEMO_TENANT_ID,DEMO_SLUG).first<Record<string,unknown>>();if(!tenant)return{exists:false,tenantId:DEMO_TENANT_ID,name:DEMO_NAME,counts:{courses:0,participants:0,classAdmins:0,lessons:0}};
  const tid=String(tenant.id);const counts={
    courses:Number(await env.DB.prepare('SELECT COUNT(*) AS n FROM courses WHERE tenant_id=?').bind(tid).first<number>('n')||0),
    participants:Number(await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE tenant_id=? AND role='participant'").bind(tid).first<number>('n')||0),
    classAdmins:Number(await env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE tenant_id=? AND role='class_admin'").bind(tid).first<number>('n')||0),
    lessons:Number(await env.DB.prepare('SELECT COUNT(*) AS n FROM lessons WHERE tenant_id=?').bind(tid).first<number>('n')||0),
    announcements:Number(await env.DB.prepare('SELECT COUNT(*) AS n FROM announcements WHERE tenant_id=?').bind(tid).first<number>('n')||0),
    homework:Number(await env.DB.prepare('SELECT COUNT(*) AS n FROM homework WHERE tenant_id=?').bind(tid).first<number>('n')||0),
  };
  return{exists:true,tenantId:tid,name:tenant.name,slug:tenant.slug,status:tenant.status,counts,logins:{tenantAdmin:`leitung@${DEMO_DOMAIN}`,sampleClassAdmin:`klassenleitung.vfa-26-1@${DEMO_DOMAIN}`,sampleParticipant:`lena.mueller.vfa-26-1@${DEMO_DOMAIN}`}};
}

async function demoCore(env:Env,auth:CoreAuthContext,password:string){
  const ts=nowIso(),hash=await hashPassword(password);const preferred=await env.DB.prepare("SELECT id FROM plans WHERE id='provider' AND is_active=1").first<{id:string}>(),fallback=await env.DB.prepare('SELECT id FROM plans WHERE is_active=1 ORDER BY monthly_price_cents DESC,name LIMIT 1').first<{id:string}>(),planId=preferred?.id||fallback?.id;if(!planId)throw new Error('DEMO_ACTIVE_PLAN_REQUIRED');
  const st:D1PreparedStatementLike[]=[];
  st.push(env.DB.prepare("INSERT OR IGNORE INTO tenants(id,name,slug,status,created_at,updated_at) VALUES(?,?,?,'active',?,?)").bind(DEMO_TENANT_ID,DEMO_NAME,DEMO_SLUG,ts,ts));
  st.push(env.DB.prepare("UPDATE tenants SET name=?,status='active',updated_at=? WHERE id=?").bind(DEMO_NAME,ts,DEMO_TENANT_ID));
  st.push(env.DB.prepare(`INSERT INTO tenant_settings(tenant_id,portal_name,welcome_text,primary_color,secondary_color,background_color,white_label,locale,timezone,updated_at) VALUES(?,?,?,?,?,?,0,'de-DE','Europe/Berlin',?) ON CONFLICT(tenant_id) DO UPDATE SET portal_name=excluded.portal_name,welcome_text=excluded.welcome_text,updated_at=excluded.updated_at`).bind(DEMO_TENANT_ID,'Spreeblick Lernportal','Willkommen im Lernportal des Bildungszentrums Spreeblick. Hier findest du Stundenplan, Aufgaben, Termine und Lernmaterialien.','#2563eb','#0f172a','#f8fafc',ts));
  st.push(env.DB.prepare(`INSERT INTO subscriptions(tenant_id,plan_id,status,starts_at) VALUES(?,?,'active',?) ON CONFLICT(tenant_id) DO UPDATE SET plan_id=excluded.plan_id,status='active'`).bind(DEMO_TENANT_ID,planId,ts));
  st.push(env.DB.prepare('INSERT OR IGNORE INTO locations(id,tenant_id,name,address,created_at) VALUES(?,?,?,?,?)').bind('loc_demo_mitte',DEMO_TENANT_ID,'Campus Mitte','Alexanderstraße 7, 10178 Berlin',ts));
  st.push(env.DB.prepare('INSERT OR IGNORE INTO locations(id,tenant_id,name,address,created_at) VALUES(?,?,?,?,?)').bind('loc_demo_ost',DEMO_TENANT_ID,'Campus Ost','Allee der Kosmonauten 27, 12681 Berlin',ts));
  for(const f of coreFeatures)st.push(env.DB.prepare(`INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES(?,?,1,'manual',?) ON CONFLICT(tenant_id,feature_key) DO UPDATE SET enabled=1,source='manual',updated_at=excluded.updated_at`).bind(DEMO_TENANT_ID,f,ts));
  for(const f of teaserFeatures)st.push(env.DB.prepare(`INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES(?,?,0,'manual',?) ON CONFLICT(tenant_id,feature_key) DO UPDATE SET enabled=0,source='manual',updated_at=excluded.updated_at`).bind(DEMO_TENANT_ID,f,ts));
  st.push(env.DB.prepare(`INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES(?,?,?,?,0,0,'active',?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,password_hash=excluded.password_hash,status='active',updated_at=excluded.updated_at`).bind('usr_demo_tenant_admin',`leitung@${DEMO_DOMAIN}`,'Dr. Miriam Feld',hash,ts,ts));
  st.push(env.DB.prepare("INSERT OR IGNORE INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES(?,?,NULL,?,'tenant_admin',?)").bind('mem_demo_tenant_admin',DEMO_TENANT_ID,'usr_demo_tenant_admin',ts));
  for(let i=0;i<courseDefs.length;i++){const [name,code]=courseDefs[i],loc=i%2===0?'loc_demo_mitte':'loc_demo_ost';st.push(env.DB.prepare(`INSERT INTO courses(id,tenant_id,location_id,name,code,start_date,end_date,access_mode,is_active,created_at,updated_at) VALUES(?,?,?,?,?,'2026-08-17','2027-07-16','login',1,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,code=excluded.code,location_id=excluded.location_id,is_active=1,updated_at=excluded.updated_at`).bind(courseId(i),DEMO_TENANT_ID,loc,name,code,ts,ts));const adminName=teacherNames[i%teacherNames.length];st.push(env.DB.prepare(`INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES(?,?,?,?,0,0,'active',?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,password_hash=excluded.password_hash,status='active',updated_at=excluded.updated_at`).bind(userId('class',i),`klassenleitung.${code}@${DEMO_DOMAIN}`,adminName,hash,ts,ts));st.push(env.DB.prepare("INSERT OR IGNORE INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES(?,?,?,?, 'class_admin',?)").bind(membershipId('class',i),DEMO_TENANT_ID,courseId(i),userId('class',i),ts));}
  for(let i=0;i<subjects.length;i++)st.push(env.DB.prepare('INSERT OR IGNORE INTO subjects(id,tenant_id,name,short_name,created_at) VALUES(?,?,?,?,?)').bind(subjectId(i),DEMO_TENANT_ID,subjects[i][0],subjects[i][1],ts));
  for(let i=0;i<teacherNames.length;i++)st.push(env.DB.prepare('INSERT OR IGNORE INTO teachers(id,tenant_id,name,email,created_at) VALUES(?,?,?,?,?)').bind(teacherId(i),DEMO_TENANT_ID,teacherNames[i],`dozent${String(i+1).padStart(2,'0')}@${DEMO_DOMAIN}`,ts));
  await runBatches(env,st);await audit(env.DB,auth.userId,'platform.demo_fixture_core',DEMO_TENANT_ID,undefined,'tenant',DEMO_TENANT_ID,{courses:20,classAdmins:20});return{phase:'core',created:true};
}

async function demoParticipants(env:Env,auth:CoreAuthContext,password:string,chunk:number){
  if(chunk<0||chunk>3)throw new Error('DEMO_CHUNK_INVALID');const ts=nowIso(),hash=await hashPassword(password),st:D1PreparedStatementLike[]=[],from=chunk*5,to=Math.min(from+5,courseDefs.length);
  for(let i=from;i<to;i++){const [,code]=courseDefs[i];for(let j=0;j<20;j++){const first=firstNames[(i*7+j)%firstNames.length],last=lastNames[(i*11+j*3)%lastNames.length],uid=userId('participant',i,j),email=`${slugify(first)}.${slugify(last)}.${code}@${DEMO_DOMAIN}`;st.push(env.DB.prepare(`INSERT INTO users(id,email,display_name,password_hash,force_password_change,is_platform_admin,status,created_at,updated_at) VALUES(?,?,?,?,0,0,'active',?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,display_name=excluded.display_name,password_hash=excluded.password_hash,status='active',updated_at=excluded.updated_at`).bind(uid,email,`${first} ${last}`,hash,ts,ts));st.push(env.DB.prepare("INSERT OR IGNORE INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES(?,?,?,?, 'participant',?)").bind(membershipId('participant',i,j),DEMO_TENANT_ID,courseId(i),uid,ts));}}
  await runBatches(env,st);await audit(env.DB,auth.userId,'platform.demo_fixture_participants',DEMO_TENANT_ID,undefined,'tenant',DEMO_TENANT_ID,{chunk,participants:(to-from)*20});return{phase:'participants',chunk,participants:(to-from)*20};
}

async function demoTimetable(env:Env,auth:CoreAuthContext,chunk:number){
  if(chunk<0||chunk>3)throw new Error('DEMO_CHUNK_INVALID');const ts=nowIso(),st:D1PreparedStatementLike[]=[],from=chunk*5,to=Math.min(from+5,courseDefs.length),blocks=[['08:15','09:45'],['10:00','11:30'],['12:15','13:45'],['14:00','15:30']] as const;
  for(let i=from;i<to;i++){const program=courseDefs[i][2],subjectSet=programSubjects[program];for(let week=0;week<6;week++)for(let day=0;day<5;day++){const date=addDays('2026-08-17',week*7+day);for(let block=0;block<blocks.length;block++){const lessonNo=week*20+day*4+block,subjectIndex=subjectSet[(week+day+block+i)%subjectSet.length],teacherIndex=(i+day*4+block+week)%teacherNames.length,room=`${i%2===0?'M':'O'}${String(101+(i%10)*2+(block%2)).padStart(3,'0')}`,[start,end]=blocks[block];st.push(env.DB.prepare('INSERT OR REPLACE INTO lessons(id,tenant_id,course_id,subject_id,teacher_id,starts_at,ends_at,room,notes,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(`les_demo_${String(i+1).padStart(2,'0')}_${String(lessonNo+1).padStart(3,'0')}`,DEMO_TENANT_ID,courseId(i),subjectId(subjectIndex),teacherId(teacherIndex),stamp(date,start),stamp(date,end),room,block===3&&day===4?'Wochenabschluss und Transfer':null,ts));}}}
  await runBatches(env,st);await audit(env.DB,auth.userId,'platform.demo_fixture_timetable',DEMO_TENANT_ID,undefined,'tenant',DEMO_TENANT_ID,{chunk,lessons:st.length});return{phase:'timetable',chunk,lessons:st.length};
}

async function demoContent(env:Env,auth:CoreAuthContext){
  const ts=nowIso(),st:D1PreparedStatementLike[]=[];
  for(let i=0;i<courseDefs.length;i++){const [name]=courseDefs[i],sub=programSubjects[courseDefs[i][2]][0];st.push(env.DB.prepare('INSERT OR REPLACE INTO announcements(id,tenant_id,course_id,title,body,published_at,visible,created_at) VALUES(?,?,?,?,?,?,1,?)').bind(`ann_demo_${i+1}_1`,DEMO_TENANT_ID,courseId(i),'Willkommen im neuen Lernabschnitt',`Herzlich willkommen in ${name}. Bitte prüft regelmäßig Stundenplan, Aufgaben und Termine im Klassenportal.`,stamp('2026-08-17','07:45'),ts));st.push(env.DB.prepare('INSERT OR REPLACE INTO announcements(id,tenant_id,course_id,title,body,published_at,visible,created_at) VALUES(?,?,?,?,?,?,1,?)').bind(`ann_demo_${i+1}_2`,DEMO_TENANT_ID,courseId(i),'Hinweis zur Lernwoche','Am Freitag endet der Unterricht mit einer gemeinsamen Transfer- und Reflexionsphase.',stamp('2026-08-20','12:00'),ts));for(let h=0;h<3;h++){const due=addDays('2026-08-17',4+h*7);st.push(env.DB.prepare('INSERT OR REPLACE INTO homework(id,tenant_id,course_id,subject_id,title,description,due_at,submission_info,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(`hw_demo_${i+1}_${h+1}`,DEMO_TENANT_ID,courseId(i),subjectId(programSubjects[courseDefs[i][2]][h%programSubjects[courseDefs[i][2]].length]),['Fallbearbeitung vorbereiten','Lernfragen zur Unterrichtswoche','Kurzpräsentation erstellen'][h],['Bearbeite die bereitgestellten Leitfragen und notiere offene Punkte.','Fasse die wichtigsten Begriffe der Woche in eigenen Worten zusammen.','Erstelle eine kurze Präsentation mit Praxisbezug und zwei Beispielen.'][h],stamp(due,'15:30'),h===2?'Upload als PDF im Lernmaterialbereich':'Besprechung im Unterricht',ts,ts));}st.push(env.DB.prepare('INSERT OR REPLACE INTO appointments(id,tenant_id,course_id,title,starts_at,ends_at,location,description,created_at) VALUES(?,?,?,?,?,?,?,?,?)').bind(`apt_demo_${i+1}`,DEMO_TENANT_ID,courseId(i),'Lernstandsgespräch',stamp(addDays('2026-08-17',17+(i%3)),'13:00'),stamp(addDays('2026-08-17',17+(i%3)),'13:30'),i%2===0?'Campus Mitte · Beratungsraum 2':'Campus Ost · Beratungsraum 1','Kurzes Gespräch zum bisherigen Lernfortschritt und zu den nächsten Schritten.',ts));st.push(env.DB.prepare('INSERT OR REPLACE INTO exams(id,tenant_id,course_id,subject_id,title,starts_at,ends_at,room,notes,allowed_aids,visible_to_students,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,1,?,?)').bind(`exam_demo_${i+1}`,DEMO_TENANT_ID,courseId(i),subjectId(sub),`Leistungskontrolle ${subjects[sub][1]}`,stamp(addDays('2026-08-17',31+(i%5)),'10:00'),stamp(addDays('2026-08-17',31+(i%5)),'11:30'),`${i%2===0?'M':'O'}201`,'Bitte 15 Minuten vor Beginn im Raum sein.','Gesetzestexte bzw. zugelassene Formelsammlung gemäß Unterrichtshinweis',ts,ts));st.push(env.DB.prepare('INSERT OR REPLACE INTO links(id,tenant_id,course_id,title,url,category,created_at) VALUES(?,?,?,?,?,?,?)').bind(`lnk_demo_${i+1}_1`,DEMO_TENANT_ID,courseId(i),'IHK Berlin','https://www.ihk.de/berlin/','Service',ts));st.push(env.DB.prepare('INSERT OR REPLACE INTO links(id,tenant_id,course_id,title,url,category,created_at) VALUES(?,?,?,?,?,?,?)').bind(`lnk_demo_${i+1}_2`,DEMO_TENANT_ID,courseId(i),'Berlin.de – ServicePortal','https://service.berlin.de/','Recherche',ts));}
  await runBatches(env,st);await audit(env.DB,auth.userId,'platform.demo_fixture_content',DEMO_TENANT_ID,undefined,'tenant',DEMO_TENANT_ID,{statements:st.length});return{phase:'content',items:st.length};
}

export async function createDemoFixturePhase(env:Env,auth:CoreAuthContext,input:Record<string,unknown>){
  requirePlatform(auth);const phase=String(input.phase||'core'),password=String(input.demo_password||''),chunk=Number(input.chunk??0);
  if((phase==='core'||phase==='participants')&&(password.length<12||password.length>128))throw new Error('DEMO_PASSWORD_INVALID');
  if(phase==='core')return demoCore(env,auth,password);
  const exists=await env.DB.prepare('SELECT id FROM tenants WHERE id=?').bind(DEMO_TENANT_ID).first();if(!exists)throw new Error('DEMO_CORE_REQUIRED');
  if(phase==='participants')return demoParticipants(env,auth,password,chunk);
  if(phase==='timetable')return demoTimetable(env,auth,chunk);
  if(phase==='content')return demoContent(env,auth);
  throw new Error('DEMO_PHASE_INVALID');
}
