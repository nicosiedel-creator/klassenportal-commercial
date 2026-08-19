import type { CoreAuthContext, Env, SessionUser } from './types.js';
import { id, nowIso } from './utils.js';
import { processPushOutbox } from './collaboration-reporting.js';
import { processErpOutbox, syncCommercialAccounting, syncStripeFees } from './platform-accounting.js';
import { autoMatchBankTransactions, refreshDunningCases } from './platform-accounting-autopilot.js';
import { runEducationOperationsAutomation } from './education-operations.js';
import { runLearningOperationsAutomation } from './learning-operations.js';

function systemAuth():CoreAuthContext{
  const session:SessionUser={userId:'system:accounting',email:'system@localhost.invalid',displayName:'Systemautomation',isPlatformAdmin:true,mustChangePassword:false,tenantRoles:[],authMethod:'api'};
  return{userId:'system:accounting',role:'platform_admin',tenantIds:[],courseIds:[],permissions:['*'],isPlatformAdmin:true,session};
}
async function enqueueNewNotificationPushes(env:Env,limit=500){
  const cutoff=new Date(Date.now()-7*86400000).toISOString();
  const rows=(await env.DB.prepare(`SELECT n.id,n.tenant_id,n.user_id FROM notifications n WHERE n.user_id IS NOT NULL AND n.created_at>=? AND EXISTS(SELECT 1 FROM push_subscriptions s WHERE s.tenant_id=n.tenant_id AND s.user_id=n.user_id AND s.status='active') AND NOT EXISTS(SELECT 1 FROM push_outbox o WHERE o.notification_id=n.id AND o.user_id=n.user_id) ORDER BY n.created_at LIMIT ?`).bind(cutoff,Math.max(1,Math.min(2000,limit))).all<{id:string;tenant_id:string;user_id:string}>()).results??[];
  const ts=nowIso();if(rows.length)await env.DB.batch(rows.map(x=>env.DB.prepare("INSERT INTO push_outbox(id,tenant_id,user_id,notification_id,status,attempts,next_attempt_at,created_at) VALUES(?,?,?,?,'pending',0,?,?)").bind(id('pob_'),x.tenant_id,x.user_id,x.id,ts,ts)));
  return rows.length;
}
async function stripeFeesDue(env:Env){const last=await env.DB.prepare("SELECT created_at FROM accounting_events WHERE event_type='automation.stripe_fees' ORDER BY created_at DESC LIMIT 1").first<{created_at:string}>();return !last||Date.parse(last.created_at)<Date.now()-6*3600000;}
export async function runPlatformAutomationCycle(env:Env){
  const auth=systemAuth(),result:Record<string,unknown>={};
  try{await runEducationOperationsAutomation(env);result.education_operations='ok';}catch(e){result.education_operations_error=String((e as Error)?.message||e);}
  try{await runLearningOperationsAutomation(env);result.learning_operations='ok';}catch(e){result.learning_operations_error=String((e as Error)?.message||e);}
  try{result.push_queued=await enqueueNewNotificationPushes(env);result.push=await processPushOutbox(env,200);}catch(e){result.push_error=String((e as Error)?.message||e);}
  try{result.accounting=await syncCommercialAccounting(env,auth);}catch(e){result.accounting_error=String((e as Error)?.message||e);}
  try{result.bank_match=await autoMatchBankTransactions(env,auth);}catch(e){result.bank_match_error=String((e as Error)?.message||e);}
  try{result.dunning=await refreshDunningCases(env,auth);}catch(e){result.dunning_error=String((e as Error)?.message||e);}
  if(env.STRIPE_SECRET_KEY){try{if(await stripeFeesDue(env)){result.stripe_fees=await syncStripeFees(env,auth);await env.DB.prepare("INSERT INTO accounting_events(id,event_type,actor_user_id,entity_type,entity_id,detail_json,created_at) VALUES(?,'automation.stripe_fees','system:accounting','accounting_sync','stripe',?,?)").bind(id('ace_'),JSON.stringify(result.stripe_fees||{}),nowIso()).run();}}catch(e){result.stripe_fee_error=String((e as Error)?.message||e);}}
  try{result.erp=await processErpOutbox(env,100);}catch(e){result.erp_error=String((e as Error)?.message||e);}
  return result;
}
