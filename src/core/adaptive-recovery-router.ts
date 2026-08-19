import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertSameOrigin, json, safeString } from './utils.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { requireAutopilotTenantAdminMfa } from './autopilot-security.js';
import { buildAdaptiveRecoveryPlan } from './adaptive-recovery.js';
import { saveTimetablePlan, saveTimetablePlanEntry } from './learning-operations.js';
import { validateAdvancedTimetablePlan } from './planning-constraints.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=String((e as Error)?.message||'RECOVERY_ERROR'),status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('MFA_REQUIRED')||code.includes('MFA_ENROLLMENT_REQUIRED')?403:code.includes('NOT_FOUND')?404:code.includes('DIGEST')||code.includes('CONFLICT')?409:400;return json({ok:false,error:code},status);}

export async function handleAdaptiveRecoveryApi(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url),path=url.pathname;if(!path.startsWith('/api/education-os/recovery/'))return null;
  try{assertSameOrigin(request,env.APP_ORIGIN);const tenantId=url.searchParams.get('tenant_id')||'',courseId=url.searchParams.get('course_id')||'';if(!tenantId||!courseId)throw new Error('RECOVERY_SCOPE_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId);
    if(path==='/api/education-os/recovery/plan'&&(request.method==='GET'||request.method==='POST')){const input=request.method==='POST'?await body(request):{from_date:url.searchParams.get('from_date'),to_date:url.searchParams.get('to_date'),block_minutes:url.searchParams.get('block_minutes')};return json({ok:true,plan:await buildAdaptiveRecoveryPlan(env,auth,tenantId,courseId,input)});}
    if(path==='/api/education-os/recovery/draft'&&request.method==='POST'){
      await requireAutopilotTenantAdminMfa(env,auth);await assertTenantWriteAllowed(env,tenantId);const input=await body(request),plan=await buildAdaptiveRecoveryPlan(env,auth,tenantId,courseId,input),expected=safeString(input.plan_digest,128);if(!expected||expected!==plan.digest)throw new Error('RECOVERY_PLAN_DIGEST_CHANGED');if(!plan.entries.length)throw new Error('RECOVERY_PLAN_EMPTY');
      const planName=safeString(input.name,300)||`Adaptive Recovery · ${plan.horizon.from}–${plan.horizon.to}`,saved=await saveTimetablePlan(env,auth,tenantId,{name:planName,starts_on:plan.horizon.from,ends_on:plan.horizon.to,status:'draft',notes:`Automatisch aus Education OS Recovery erzeugt. Quelldigest: ${plan.digest}. Vor Veröffentlichung vollständig prüfen.`}),planId=String((saved as any).plan_id);
      for(const e of plan.entries)await saveTimetablePlanEntry(env,auth,tenantId,planId,{course_id:courseId,subject_id:e.subject_id,subject_text:e.subject_text,teacher_id:e.teacher_id,teacher_text:e.teacher_text,starts_at:e.starts_at,ends_at:e.ends_at,room:e.room,activity_type:e.activity_type,location_label:e.room||e.activity_type,supervision_mode:e.activity_type.startsWith('self_study')?'self_directed':e.activity_type==='live_remote'?'remote_instructor':'instructor',attendance_expected:e.activity_type.startsWith('self_study')?0:1,task_text:`Lehrplan-Aufholblock für ${e.subject_text}`,notes:`Curriculum ${e.curriculum_item_id} · ${e.planned_minutes} Minuten · Recovery-Digest ${plan.digest}`,source:'automation'});
      const validation=await validateAdvancedTimetablePlan(env,auth,tenantId,planId);return json({ok:true,draft:{plan_id:planId,name:planName,entries:plan.entries.length,digest:plan.digest,validation},publication:{automatic:false,requires_explicit_review:true}},201);
    }
    return json({ok:false,error:'RECOVERY_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
