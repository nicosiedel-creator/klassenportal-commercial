import { execFileSync } from 'node:child_process';

const npx=process.platform==='win32'?'npx.cmd':'npx';
const branch=String(process.env.WORKERS_CI_BRANCH||'').trim();
const workersBuild=String(process.env.WORKERS_CI||'')==='1';

// This is deliberately a production-build-only demo fixture. Never touch a real customer.
if(!workersBuild||branch!=='main'){
  console.log('Skipping Nico demo-teacher fixtures outside the main Workers production build.');
  process.exit(0);
}

function run(args,{capture=false}={}){
  return execFileSync(npx,['wrangler',...args],{
    encoding:'utf8',
    stdio:capture?['ignore','pipe','inherit']:'inherit',
  })||'';
}
function parseJson(text){
  const clean=String(text||'').replace(/\u001b\[[0-9;]*m/g,'').trim();
  if(!clean)return null;
  const starts=[clean.indexOf('['),clean.indexOf('{')].filter(x=>x>=0).sort((a,b)=>a-b);
  for(const start of starts){try{return JSON.parse(clean.slice(start));}catch{}}
  throw new Error('DEMO_SEED_JSON_PARSE_FAILED');
}
function rowsFrom(value){
  const rows=[],seen=new Set();
  function walk(x){
    if(!x||typeof x!=='object')return;
    if(Array.isArray(x)){for(const item of x)walk(item);return;}
    if(Array.isArray(x.results))for(const row of x.results)if(row&&typeof row==='object'){
      const key=JSON.stringify(row);if(!seen.has(key)){seen.add(key);rows.push(row);}
    }
    for(const [key,val] of Object.entries(x))if(key!=='results')walk(val);
  }
  walk(value);return rows;
}
const esc=value=>String(value??'').replaceAll("'","''");
function query(sql){
  const out=run(['d1','execute','DB','--remote','--json','--command',sql],{capture:true});
  return rowsFrom(parseJson(out));
}
function exec(sql){run(['d1','execute','DB','--remote','--yes','--command',sql]);}
function weekdays(from,to){
  const out=[],cursor=new Date(`${from}T12:00:00Z`),end=new Date(`${to}T12:00:00Z`);
  while(cursor<=end){const day=cursor.getUTCDay();if(day>=1&&day<=5)out.push(cursor.toISOString().slice(0,10));cursor.setUTCDate(cursor.getUTCDate()+1);}
  return out;
}
function localWindow(day,start,durationMinutes=90){
  const startDate=new Date(`${day}T${start}:00+02:00`),endDate=new Date(startDate.getTime()+durationMinutes*60000);
  return{sessionDate:day,startsAt:startDate.toISOString(),endsAt:endDate.toISOString()};
}

const tenant=query("SELECT id,name,slug FROM tenants WHERE slug='bildungszentrum-spreeblick-demo' AND status='active' LIMIT 1")[0];
if(!tenant)throw new Error('DEMO_TENANT_NOT_FOUND');
const user=query("SELECT id,email,display_name,is_platform_admin FROM users WHERE status='active' AND lower(display_name)=lower('Nico Pfeiffer-Siedel') ORDER BY is_platform_admin DESC,id LIMIT 1")[0];
if(!user)throw new Error('NICO_DEMO_USER_NOT_FOUND');

const tenantId=String(tenant.id),userId=String(user.id),teacherId=`tch_demo_nico_${tenantId}`;
exec(`INSERT OR IGNORE INTO tenant_users(tenant_id,user_id,status,external_id,source,created_at,updated_at) VALUES('${esc(tenantId)}','${esc(userId)}','active',NULL,'manual',datetime('now'),datetime('now'))`);
const existingTeacher=query(`SELECT id FROM teachers WHERE tenant_id='${esc(tenantId)}' AND (lower(name)=lower('Nico Pfeiffer-Siedel') OR lower(COALESCE(email,''))=lower('${esc(user.email||'')}')) ORDER BY CASE WHEN lower(name)=lower('Nico Pfeiffer-Siedel') THEN 0 ELSE 1 END LIMIT 1`)[0];
const resolvedTeacherId=String(existingTeacher?.id||teacherId);
if(!existingTeacher)exec(`INSERT INTO teachers(id,tenant_id,name,email,created_at) VALUES('${esc(resolvedTeacherId)}','${esc(tenantId)}','Nico Pfeiffer-Siedel','${esc(user.email||'')}',datetime('now'))`);

const courses=query(`SELECT id,name,code FROM courses WHERE tenant_id='${esc(tenantId)}' AND is_active=1 ORDER BY name,code,id`);
if(!courses.length)throw new Error('DEMO_COURSES_NOT_FOUND');

const augustDays=weekdays('2026-08-20','2026-08-31');
const septemberDays=weekdays('2026-09-01','2026-09-30');
const augustTimes=['13:00','14:45','16:30'];
const septemberTimes=['08:15','10:00'];
let assigned=0,skipped=0,hubSeeded=0;

for(let index=0;index<courses.length;index++){
  const course=courses[index],courseId=String(course.id),courseName=String(course.name||course.code||courseId);
  const conflict=query(`SELECT role FROM memberships WHERE tenant_id='${esc(tenantId)}' AND course_id='${esc(courseId)}' AND user_id='${esc(userId)}' AND role IN ('participant','class_admin') LIMIT 1`)[0];
  if(conflict){console.warn(`Skipping ${courseName}: Nico is already ${conflict.role} in this class.`);skipped++;continue;}

  const existingMembership=query(`SELECT id,role FROM memberships WHERE tenant_id='${esc(tenantId)}' AND course_id='${esc(courseId)}' AND user_id='${esc(userId)}' LIMIT 1`)[0];
  let authMembershipId='';
  if(!existingMembership){
    authMembershipId=`mem_demo_teacher_nico_${courseId}`;
    exec(`INSERT OR IGNORE INTO memberships(id,tenant_id,course_id,user_id,role,created_at) VALUES('${esc(authMembershipId)}','${esc(tenantId)}','${esc(courseId)}','${esc(userId)}','guest',datetime('now'))`);
  }
  const assignmentId=`tpa_demo_nico_${courseId}`;
  exec(`INSERT INTO teacher_portal_assignments(id,tenant_id,teacher_id,user_id,course_id,auth_membership_id,status,granted_by,created_at,updated_at) VALUES('${esc(assignmentId)}','${esc(tenantId)}','${esc(resolvedTeacherId)}','${esc(userId)}','${esc(courseId)}',${authMembershipId?`'${esc(authMembershipId)}'`:'NULL'},'active','${esc(userId)}',datetime('now'),datetime('now')) ON CONFLICT(tenant_id,user_id,course_id) DO UPDATE SET teacher_id=excluded.teacher_id,status='active',auth_membership_id=COALESCE(teacher_portal_assignments.auth_membership_id,excluded.auth_membership_id),granted_by=excluded.granted_by,updated_at=datetime('now')`);

  const augDay=augustDays[Math.floor(index/augustTimes.length)%augustDays.length],augTime=augustTimes[index%augustTimes.length],aug=localWindow(augDay,augTime);
  const sepDay=septemberDays[Math.floor(index/septemberTimes.length)%septemberDays.length],sepTime=septemberTimes[index%septemberTimes.length],sep=localWindow(sepDay,sepTime);
  for(const session of [{tag:'2026-08',...aug},{tag:'2026-09',...sep}]){
    const sessionId=`ats_demo_nico_${session.tag}_${courseId}`,sourceRef=`demo_nico_klassenportal_${session.tag}_${courseId}`;
    exec(`INSERT OR IGNORE INTO attendance_sessions(id,tenant_id,course_id,session_date,starts_at,ends_at,subject,room,instructor_text,delivery_mode,status,source,source_ref,created_by,created_at,updated_at) VALUES('${esc(sessionId)}','${esc(tenantId)}','${esc(courseId)}','${esc(session.sessionDate)}','${esc(session.startsAt)}','${esc(session.endsAt)}','Arbeit für Klassenportal',NULL,'Nico Pfeiffer-Siedel','onsite','planned','import','${esc(sourceRef)}','${esc(userId)}',datetime('now'),datetime('now'))`);
  }

  const lesson=query(`SELECT id FROM lessons WHERE tenant_id='${esc(tenantId)}' AND course_id='${esc(courseId)}' AND starts_at>='2026-08-17T00:00:00.000Z' AND starts_at<='2026-09-30T23:59:59.999Z' ORDER BY starts_at LIMIT 1`)[0];
  if(lesson?.id){
    const lessonId=String(lesson.id),linkId=`lhl_demo_nico_${courseId}`;
    exec(`INSERT INTO lesson_hub_details(lesson_id,tenant_id,course_id,planned_topic,info_text,delivery_mode,updated_by,updated_at) VALUES('${esc(lessonId)}','${esc(tenantId)}','${esc(courseId)}','Klassenportal – integrierter Unterrichts-Hub','Demo-Inhalt: Thema, Hinweise, Links, Dateien und später behandelte Inhalte sind direkt mit dieser Unterrichtsstunde verknüpft.','onsite','${esc(userId)}',datetime('now')) ON CONFLICT(lesson_id) DO UPDATE SET planned_topic=excluded.planned_topic,info_text=excluded.info_text,updated_by=excluded.updated_by,updated_at=datetime('now')`);
    exec(`INSERT OR IGNORE INTO lesson_hub_links(id,tenant_id,course_id,lesson_id,title,url,sort_order,created_by,created_at,updated_at) VALUES('${esc(linkId)}','${esc(tenantId)}','${esc(courseId)}','${esc(lessonId)}','IHK Berlin','https://www.ihk.de/berlin/',10,'${esc(userId)}',datetime('now'),datetime('now'))`);
    hubSeeded++;
  }

  assigned++;
  console.log(`Demo-Dozent: ${courseName} -> August ${aug.sessionDate} ${augTime}, September ${sep.sessionDate} ${sepTime}, jeweils 90 Min.`);
}

if(!assigned)throw new Error(`NICO_DEMO_ASSIGNMENTS_NONE (skipped=${skipped})`);
exec(`INSERT OR IGNORE INTO teacher_messages(id,tenant_id,course_id,title,body,source_label,priority,starts_at,ends_at,created_by,created_at,updated_at) VALUES('tmsg_demo_school_${esc(tenantId)}','${esc(tenantId)}',NULL,'Willkommen im neuen Dozentenportal','Bitte prüfe deine zugeordneten Klassen und öffne Unterrichtstermine künftig direkt über den Kalender. Klassenbuch, Anwesenheit und Unterrichtsinfos sind dort miteinander verknüpft.','Schulleitung','important',NULL,NULL,'${esc(userId)}',datetime('now'),datetime('now'))`);
exec(`INSERT OR IGNORE INTO teacher_messages(id,tenant_id,course_id,title,body,source_label,priority,starts_at,ends_at,created_by,created_at,updated_at) VALUES('tmsg_demo_office_${esc(tenantId)}','${esc(tenantId)}',NULL,'Anwesenheitsdokumentation','Bitte Anwesenheit und Klassenbucheintrag möglichst am Unterrichtstag abschließen. Diese Meldung dient als Test für interne Hinweise im Dozentenportal.','Sekretariat','normal',NULL,NULL,'${esc(userId)}',datetime('now'),datetime('now'))`);

const verification=query(`SELECT COUNT(*) AS assignments FROM teacher_portal_assignments WHERE tenant_id='${esc(tenantId)}' AND user_id='${esc(userId)}' AND status='active'`)[0];
const sessions=query(`SELECT COUNT(*) AS sessions FROM attendance_sessions WHERE tenant_id='${esc(tenantId)}' AND created_by='${esc(userId)}' AND source='import' AND source_ref LIKE 'demo_nico_klassenportal_%'`)[0];
console.log(`Nico demo fixtures complete: ${verification?.assignments||0} active teacher assignments, ${sessions?.sessions||0} demo work sessions, ${hubSeeded} lesson hubs seeded, ${skipped} skipped conflicts.`);
