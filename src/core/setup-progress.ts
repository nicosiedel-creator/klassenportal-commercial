import type { CoreAuthContext, Env } from './types.js';
import { requireRole } from './permissions.js';
import { ensureManagedSetupSchema } from './managed-setup-schema.js';

type CountRow={n:number};

type ManagedSetupRow={
  id:string;setup_name:string;course_count:number;status:string;paid_at:string;started_at:string|null;completed_at:string|null;
};

export async function customerSetupProgress(env:Env,auth:CoreAuthContext,tenantId:string):Promise<Record<string,unknown>>{
  requireRole(auth,'tenant_admin');
  await ensureManagedSetupSchema(env);
  const [settings,courses,lessons,imports,classAdmins,participants,managed]=await Promise.all([
    env.DB.prepare('SELECT portal_name,logo_url,welcome_text,primary_color,secondary_color FROM tenant_settings WHERE tenant_id=?').bind(tenantId).first<Record<string,unknown>>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM courses WHERE tenant_id=? AND is_active=1').bind(tenantId).first<CountRow>(),
    env.DB.prepare('SELECT COUNT(*) AS n FROM lessons WHERE tenant_id=?').bind(tenantId).first<CountRow>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM timetable_import_runs WHERE tenant_id=? AND status='completed'").bind(tenantId).first<CountRow>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE tenant_id=? AND role='class_admin'").bind(tenantId).first<CountRow>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM memberships WHERE tenant_id=? AND role='participant'").bind(tenantId).first<CountRow>(),
    env.DB.prepare(`SELECT id,setup_name,course_count,status,paid_at,started_at,completed_at
      FROM managed_setup_jobs WHERE tenant_id=? ORDER BY paid_at DESC,created_at DESC LIMIT 1`).bind(tenantId).first<ManagedSetupRow>(),
  ]);

  const courseCount=Number(courses?.n||0),lessonCount=Number(lessons?.n||0),importCount=Number(imports?.n||0),classAdminCount=Number(classAdmins?.n||0),participantCount=Number(participants?.n||0);
  const brandingReady=!!String(settings?.logo_url||'').trim();
  const timetableReady=lessonCount>0||importCount>0;
  const steps=[
    {key:'courses',label:'Mindestens eine Klasse / einen Kurs anlegen',done:courseCount>0,required:true,target:'courses'},
    {key:'branding',label:'Logo und Branding festlegen',done:brandingReady,required:false,target:'branding'},
    {key:'timetable',label:'Stundenplan automatisch einlesen',done:timetableReady,required:true,target:'content',action:'timetable'},
    {key:'class_admin',label:'Klassenverantwortliche festlegen',done:classAdminCount>0,required:false,target:'users'},
  ];
  const completed=steps.filter(x=>x.done).length;
  const requiredReady=steps.filter(x=>x.required).every(x=>x.done);

  return {
    mode:managed?'managed':'self_service',
    managedSetup:managed??null,
    progress:{completed,total:steps.length,percent:Math.round((completed/steps.length)*100),requiredReady},
    steps,
    counts:{courses:courseCount,lessons:lessonCount,timetableImports:importCount,classAdmins:classAdminCount,participants:participantCount},
  };
}
