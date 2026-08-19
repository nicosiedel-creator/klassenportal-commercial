import type { CoreAuthContext, Env } from './types.js';
import { approveScenarioOption, executeScenarioOption } from './education-autopilot.js';
import { getEducationScenario, type AutopilotAction } from './education-scenarios.js';
import { evaluateAutopilotGuardrails, recordGuardrailEvaluation } from './education-guardrails.js';

async function optionActions(env:Env,auth:CoreAuthContext,tenantId:string,scenarioId:string,optionId:string){const data=await getEducationScenario(env,auth,tenantId,scenarioId),option=(data.options as any[]).find(x=>String(x.id)===optionId);if(!option)throw new Error('SCENARIO_OPTION_NOT_FOUND');return{data,option,actions:(option.actions||[]) as AutopilotAction[]};}

export async function approveGuardedScenarioOption(env:Env,auth:CoreAuthContext,tenantId:string,scenarioId:string,optionId:string,input:Record<string,unknown>={}){
  const {actions}=await optionActions(env,auth,tenantId,scenarioId,optionId),guardrails=await evaluateAutopilotGuardrails(env,tenantId,actions);await recordGuardrailEvaluation(env,auth,tenantId,'pre_approval',guardrails,{scenario_id:scenarioId,option_id:optionId});if(!guardrails.passed)throw new Error('AUTOPILOT_GUARDRAIL_BLOCKED');const approval=await approveScenarioOption(env,auth,tenantId,scenarioId,optionId,input);return{...approval,guardrails:{passed:true,warnings:guardrails.warnings,digest:guardrails.digest}};
}

export async function executeGuardedScenarioOption(env:Env,auth:CoreAuthContext,tenantId:string,scenarioId:string,optionId:string,idempotencyKey:string){
  const {actions}=await optionActions(env,auth,tenantId,scenarioId,optionId),guardrails=await evaluateAutopilotGuardrails(env,tenantId,actions),pre=await recordGuardrailEvaluation(env,auth,tenantId,'pre_execution',guardrails,{scenario_id:scenarioId,option_id:optionId});if(!guardrails.passed)throw new Error('AUTOPILOT_GUARDRAIL_BLOCKED');const execution=await executeScenarioOption(env,auth,tenantId,scenarioId,optionId,idempotencyKey);const postGuardrails=await evaluateAutopilotGuardrails(env,tenantId,actions),post=await recordGuardrailEvaluation(env,auth,tenantId,'post_execution',postGuardrails,{scenario_id:scenarioId,option_id:optionId,execution_id:String((execution as any).execution_id||'')});return{...execution,guardrails:{pre:{evaluation_id:pre.evaluation_id,digest:pre.digest,warnings:pre.warnings},post:{evaluation_id:post.evaluation_id,digest:post.digest,passed:post.passed,blockers:post.blockers,warnings:post.warnings}}};
}
