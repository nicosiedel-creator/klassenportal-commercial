import type { Env, SessionUser } from './types.js';
import { verifyPassword } from './auth.js';

const EMPTY={surveys:[] as Record<string,unknown>[],substitutions:[] as Record<string,unknown>[],microsoft365FeedUrl:null as string|null};

function portalRole(session:SessionUser|null,tenantId:string,courseId:string):string|null{
  if(!session||session.mustChangePassword)return null;
  if(session.isPlatformAdmin)return 'platform_admin';
  const rank:Record<string,number>={tenant_admin:4,class_admin:3,participant:2,guest:1};
  return [...session.tenantRoles.filter(x=>x.tenantId===tenantId&&(x.courseId===null||x.courseId===courseId))].sort((a,b)=>(rank[b.role]||0)-(rank[a.role]||0))[0]?.role||null;
}
function canPersonalize(session:SessionUser|null,tenantId:string,courseId:string):boolean{return!!portalRole(session,tenantId,courseId);}
function marks(n:number){return Array.from({length:n},()=>'?').join(',');}
async function safe<T>(label:string,fn:()=>Promise<T>,fallback:T):Promise<T>{
  try{return await fn();}
  catch(error){console.error('Participant advanced overview optional query failed',{label,error:String((error as Error)?.message||error)});return fallback;}
}

export async function publicAdvancedBySlug(env:Env,tenantSlug:string,courseCode:string,session:SessionUser|null,origin:string,accessCode?:string){
  const row=await env.DB.prepare(`SELECT c.id AS course_id,c.tenant_id,c.access_mode,c.access_code_hash FROM courses c JOIN tenants t ON t.id=c.tenant_id WHERE t.slug=? AND c.code=? AND t.status='active' AND c.is_active=1`).bind(tenantSlug,courseCode).first<{course_id:string;tenant_id:string;access_mode:string;access_code_hash:string|null}>();
  if(!row)throw new Error('COURSE_NOT_FOUND');
  const tenantId=row.tenant_id,courseId=row.course_id,role=portalRole(session,tenantId,courseId),hasLogin=!!role,adminPreview=['platform_admin','tenant_admin','class_admin'].includes(String(role||'')),codeOk=!!accessCode&&!!row.access_code_hash&&await verifyPassword(accessCode,row.access_code_hash);
  if(row.access_mode==='login'&&!hasLogin)throw new Error('LOGIN_REQUIRED');
  if(row.access_mode==='link_code'&&!codeOk&&!adminPreview)throw new Error('ACCESS_CODE_REQUIRED');
  if(row.access_mode==='hybrid'&&!hasLogin&&!codeOk)throw new Error('LOGIN_OR_CODE_REQUIRED');

  // This is deliberately not part of the critical /overview request. It is loaded
  // only when the advanced portal module is needed. Never create/repair schemas,
  // entitlements or calendar feeds here; portal reads fail soft.
  const flags=await safe('feature_flags',async()=>{
    const result=await env.DB.prepare("SELECT feature_key,enabled FROM feature_flags WHERE tenant_id=? AND feature_key IN ('substitution_updates','surveys','microsoft_365')").bind(tenantId).all<{feature_key:string;enabled:number}>();
    return new Map((result.results??[]).map(x=>[x.feature_key,Number(x.enabled)===1]));
  },new Map<string,boolean>());

  const substitutionsPromise=flags.get('substitution_updates')?safe('substitutions',async()=>{
    const result=await env.DB.prepare(`SELECT id,starts_at,ends_at,original_text,replacement_text,room,note FROM substitution_updates WHERE tenant_id=? AND course_id=? AND starts_at>=? ORDER BY starts_at ASC LIMIT 100`).bind(tenantId,courseId,new Date(Date.now()-86400000).toISOString()).all<Record<string,unknown>>();
    return result.results??[];
  },[] as Record<string,unknown>[]):Promise.resolve([] as Record<string,unknown>[]);

  const surveysPromise=flags.get('surveys')&&canPersonalize(session,tenantId,courseId)?safe('surveys',async()=>{
    const rows=(await env.DB.prepare(`SELECT id,title,question,closes_at FROM surveys WHERE tenant_id=? AND course_id=? AND status='open' AND (closes_at IS NULL OR closes_at>?) ORDER BY created_at DESC LIMIT 20`).bind(tenantId,courseId,new Date().toISOString()).all<Record<string,unknown>>()).results??[];
    if(!rows.length)return[];
    const ids=rows.map(x=>String(x.id)),userId=String(session!.userId);
    const options=(await env.DB.prepare(`SELECT o.survey_id,o.id,o.label,o.sort_order,COUNT(v.user_id) votes,MAX(CASE WHEN v.user_id=? THEN 1 ELSE 0 END) selected FROM survey_options o LEFT JOIN survey_votes v ON v.survey_id=o.survey_id AND v.option_id=o.id WHERE o.survey_id IN (${marks(ids.length)}) GROUP BY o.survey_id,o.id,o.label,o.sort_order ORDER BY o.survey_id,o.sort_order,o.label`).bind(userId,...ids).all<Record<string,unknown>>()).results??[];
    const bySurvey=new Map<string,Record<string,unknown>[]>();
    for(const option of options){const key=String(option.survey_id),list=bySurvey.get(key)||[];list.push({...option,selected:Number(option.selected||0)===1});bySurvey.set(key,list);}
    return rows.map(survey=>({...survey,options:bySurvey.get(String(survey.id))||[]}));
  },[] as Record<string,unknown>[]):Promise.resolve([] as Record<string,unknown>[]);

  const feedPromise=flags.get('microsoft_365')?safe('calendar_feed',async()=>{
    const feed=await env.DB.prepare('SELECT token FROM calendar_feeds WHERE tenant_id=? AND course_id=?').bind(tenantId,courseId).first<{token:string}>();
    return feed?.token?`${origin}/calendar/${feed.token}.ics`:null;
  },null as string|null):Promise.resolve(null);

  const [substitutions,surveys,microsoft365FeedUrl]=await Promise.all([substitutionsPromise,surveysPromise,feedPromise]);
  return{surveys,substitutions,microsoft365FeedUrl};
}
