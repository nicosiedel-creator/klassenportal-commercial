import type { Env } from './types.js';
import { nowIso } from './utils.js';

export async function runEducationOsMaintenance(env:Env){
  const now=nowIso(),result:Record<string,number>={};
  const exec=async(key:string,sql:string,args:unknown[]=[])=>{const r=await env.DB.prepare(sql).bind(...args).run();result[key]=Number((r.meta as any)?.changes||0);};
  await exec('expired_locks','DELETE FROM education_autopilot_locks WHERE expires_at<=?',[now]);
  await exec('expired_scenarios',"UPDATE education_scenarios SET status='stale',updated_at=? WHERE status IN ('draft','simulated','approved') AND expires_at<=?",[now,now]);
  await exec('old_twin_snapshots',"DELETE FROM education_twin_snapshots WHERE captured_at<datetime('now','-90 day') AND id NOT IN (SELECT snapshot_id FROM education_scenarios) AND payload_sha256 NOT IN (SELECT twin_snapshot_sha256 FROM education_proof_packages WHERE twin_snapshot_sha256 IS NOT NULL)");
  await exec('old_readiness',"DELETE FROM education_readiness_snapshots WHERE generated_at<datetime('now','-730 day')");
  await exec('old_resolved_risks',"DELETE FROM education_risks WHERE status='resolved' AND resolved_at<datetime('now','-365 day')");
  await exec('old_resolved_findings',"DELETE FROM education_consistency_findings WHERE status='resolved' AND resolved_at<datetime('now','-365 day')");
  await exec('old_failed_executions',"DELETE FROM education_autopilot_executions WHERE status='failed' AND completed_at<datetime('now','-365 day') AND id NOT IN (SELECT execution_id FROM education_guardrail_evaluations WHERE execution_id IS NOT NULL)");
  return result;
}
