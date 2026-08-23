import app from './index.js';
import type { Env } from './core/types.js';

const VFA13_HOST='vfa13-klassenportal.pages.dev';
const VFA13_TENANT_SLUG='vfa13';
const VFA13_COURSE_CODE='vfa13';
const VFA13_TENANT_ID='tenant_vfa13_pilot';
const VFA13_COURSE_ID='course_vfa13_pilot';

let bootstrapPromise:Promise<void>|null=null;

function allowedHost(hostname:string):boolean{
  const host=hostname.toLowerCase();
  return host===VFA13_HOST||host.endsWith(`.${VFA13_HOST}`)||host==='localhost'||host==='127.0.0.1';
}

async function ensureVfa13Pilot(env:Env):Promise<void>{
  if(bootstrapPromise)return bootstrapPromise;
  bootstrapPromise=(async()=>{
    const now=new Date().toISOString();
    const existingTenant=await env.DB.prepare('SELECT id FROM tenants WHERE slug=? LIMIT 1').bind(VFA13_TENANT_SLUG).first<{id:string}>();
    const tenantId=String(existingTenant?.id||VFA13_TENANT_ID);
    if(!existingTenant){
      await env.DB.prepare('INSERT INTO tenants(id,name,slug,status,created_at,updated_at) VALUES(?,?,?,?,?,?)')
        .bind(tenantId,'VFA 13',VFA13_TENANT_SLUG,'active',now,now).run();
    }else{
      await env.DB.prepare("UPDATE tenants SET name='VFA 13',status='active',updated_at=? WHERE id=?").bind(now,tenantId).run();
    }

    await env.DB.prepare(`INSERT OR IGNORE INTO tenant_settings(
      tenant_id,portal_name,welcome_text,primary_color,secondary_color,background_color,white_label,locale,timezone,updated_at
    ) VALUES(?,?,?,?,?,?,?,?,?,?)`).bind(
      tenantId,'VFA 13 Klassenportal','Willkommen im Klassenportal der VFA 13.','#2563eb','#0f172a','#f3efe7',0,'de-DE','Europe/Berlin',now
    ).run();
    await env.DB.prepare(`UPDATE tenant_settings SET portal_name=?,welcome_text=?,locale='de-DE',timezone='Europe/Berlin',updated_at=? WHERE tenant_id=?`)
      .bind('VFA 13 Klassenportal','Willkommen im Klassenportal der VFA 13.',now,tenantId).run();

    const existingCourse=await env.DB.prepare('SELECT id FROM courses WHERE tenant_id=? AND code=? LIMIT 1')
      .bind(tenantId,VFA13_COURSE_CODE).first<{id:string}>();
    const courseId=String(existingCourse?.id||VFA13_COURSE_ID);
    if(!existingCourse){
      await env.DB.prepare(`INSERT INTO courses(id,tenant_id,location_id,name,code,start_date,end_date,access_mode,access_code_hash,is_active,created_at,updated_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        courseId,tenantId,null,'VFA 13',VFA13_COURSE_CODE,'2026-02-09','2028-02-08','public',null,1,now,now
      ).run();
    }else{
      await env.DB.prepare("UPDATE courses SET name='VFA 13',access_mode='public',access_code_hash=NULL,is_active=1,updated_at=? WHERE id=? AND tenant_id=?")
        .bind(now,courseId,tenantId).run();
    }

    const subjects=[
      ['sub_vfa13_wiso','Wirtschafts- und Sozialkunde','WiSo'],
      ['sub_vfa13_persw','Personalwesen','PersW'],
      ['sub_vfa13_por','Personal- und Organisationsrecht','POR'],
      ['sub_vfa13_vbw','Verwaltungsbetriebswirtschaft','VBW'],
      ['sub_vfa13_soz','Sozialrecht','Soz'],
      ['sub_vfa13_avr','Allgemeines Verwaltungsrecht','AVR'],
      ['sub_vfa13_stroer','Staats- und Ordnungsrecht','StR/ÖR'],
      ['sub_vfa13_prbgb','Privatrecht / BGB','PR/BGB'],
    ] as const;
    for(const [id,name,shortName] of subjects){
      await env.DB.prepare('INSERT OR IGNORE INTO subjects(id,tenant_id,name,short_name,created_at) VALUES(?,?,?,?,?)')
        .bind(id,tenantId,name,shortName,now).run();
    }

    const features=[
      'announcements','weekly_overview','schedule','homework','appointments','exams','links','files','learning_materials','calendar','reminders',
      'assignments','gradebook','attendance','classbook','teacher_portal','communications','teams','participant_360','planning','curriculum','education_os'
    ];
    for(const feature of features){
      await env.DB.prepare(`INSERT INTO feature_flags(tenant_id,feature_key,enabled,source,updated_at) VALUES(?,?,1,'manual',?)
        ON CONFLICT(tenant_id,feature_key) DO UPDATE SET enabled=1,source='manual',updated_at=excluded.updated_at`)
        .bind(tenantId,feature,now).run();
    }

    await env.DB.prepare(`INSERT OR IGNORE INTO announcements(id,tenant_id,course_id,title,body,published_at,visible,created_at)
      VALUES(?,?,?,?,?,?,1,?)`).bind(
      'ann_vfa13_runtime_20260823',tenantId,courseId,'VFA 13 Portal erweitert',
      'Das Klassenportal läuft jetzt auf der gemeinsamen Plattformbasis. Stundenplan, Aufgaben, Termine, Prüfungen, Materialien und weitere freigegebene Bereiche werden hier zusammengeführt.',
      now,now
    ).run();

    try{
      await env.DB.prepare(`INSERT INTO pilot_programs(tenant_id,customer_name,starts_at,ends_at,read_only_ends_at,course_limit,status,payment_required,auto_convert,notes,created_by,created_at,updated_at)
        VALUES(?,?,?,?,?,3,'active',0,0,?,NULL,?,?)
        ON CONFLICT(tenant_id) DO UPDATE SET customer_name=excluded.customer_name,ends_at=excluded.ends_at,read_only_ends_at=excluded.read_only_ends_at,status='active',payment_required=0,auto_convert=0,updated_at=excluded.updated_at`)
        .bind(tenantId,'VFA 13 Pilot','2026-08-23T00:00:00.000Z','2028-02-08T23:59:59.999Z','2028-03-08T23:59:59.999Z','VFA-13 Pilotbetrieb; keine automatische kostenpflichtige Umwandlung.',now,now).run();
    }catch(error){
      console.warn('VFA13 pilot metadata unavailable',{error:String((error as Error)?.message||error)});
    }

    try{
      const nico=await env.DB.prepare("SELECT id FROM users WHERE status='active' AND lower(display_name)=lower(?) ORDER BY is_platform_admin DESC,id LIMIT 1")
        .bind('Nico Pfeiffer-Siedel').first<{id:string}>();
      if(nico?.id){
        await env.DB.prepare(`INSERT OR IGNORE INTO tenant_users(tenant_id,user_id,status,external_id,source,created_at,updated_at)
          VALUES(?,?,'active',NULL,'manual',?,?)`).bind(tenantId,nico.id,now,now).run();
        await env.DB.prepare(`INSERT INTO memberships(id,tenant_id,course_id,user_id,role,created_at)
          SELECT ?,?,NULL,?,'tenant_admin',? WHERE NOT EXISTS(
            SELECT 1 FROM memberships WHERE tenant_id=? AND user_id=? AND role='tenant_admin' AND course_id IS NULL
          )`).bind(`mem_vfa13_admin_${nico.id}`,tenantId,nico.id,now,tenantId,nico.id).run();
      }
    }catch(error){
      console.warn('VFA13 admin membership bootstrap skipped',{error:String((error as Error)?.message||error)});
    }
  })().catch(error=>{bootstrapPromise=null;throw error;});
  return bootstrapPromise;
}

function internalPreviewRequest(request:Request):Request{
  const url=new URL(request.url);
  url.protocol='http:';
  url.hostname='localhost';
  url.port='';
  return new Request(url.toString(),request);
}

function withRuntimeHeader(response:Response):Response{
  const headers=new Headers(response.headers);
  headers.set('x-klassenportal-vfa13-runtime','20260823-1');
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
    const url=new URL(request.url);
    if(!allowedHost(url.hostname))return new Response('Not Found',{status:404});

    await ensureVfa13Pilot(env);

    if(url.pathname==='/'||url.pathname==='/portal'||url.pathname==='/portal/'){
      const target=new URL(`/portal/${VFA13_TENANT_SLUG}/${VFA13_COURSE_CODE}`,url);
      return Response.redirect(target.toString(),302);
    }
    if(url.pathname==='/admin'||url.pathname==='/admin/'){
      const target=new URL('/kunden-admin',url);
      target.searchParams.set('tenant',VFA13_TENANT_SLUG);
      return Response.redirect(target.toString(),302);
    }
    if(url.pathname==='/plattform-admin'||url.pathname.startsWith('/plattform-admin/')){
      return new Response('Not Found',{status:404});
    }

    const previewEnv={...env,APP_ORIGIN:undefined};
    const response=await app.fetch(internalPreviewRequest(request),previewEnv,ctx);
    return withRuntimeHeader(response);
  }
};
