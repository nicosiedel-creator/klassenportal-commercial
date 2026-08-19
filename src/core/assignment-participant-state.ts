import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess, requireRole } from './permissions.js';
import { id, nowIso, safeString } from './utils.js';

export type AssignmentParticipantState={
  id:string;
  tenant_id:string;
  course_id:string;
  homework_id:string;
  user_id:string;
  progress:'open'|'in_progress'|'completed';
  private_note:string|null;
  completed_at:string|null;
  created_at:string;
  updated_at:string;
};

async function ensureSchema(env:Env){
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS assignment_participant_state (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    course_id TEXT NOT NULL,
    homework_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    progress TEXT NOT NULL DEFAULT 'open' CHECK(progress IN ('open','in_progress','completed')),
    private_note TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
    FOREIGN KEY(course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY(homework_id) REFERENCES homework(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(tenant_id,homework_id,user_id)
  )`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_assignment_participant_state_user ON assignment_participant_state(tenant_id,course_id,user_id,progress,updated_at DESC)').run();
}
function requireParticipant(auth:CoreAuthContext,courseId:string){requireRole(auth,'participant');requireCourseAccess(auth,courseId);if(auth.role!=='participant')throw new Error('PARTICIPANT_REQUIRED');}
async function assignmentMode(env:Env,tenantId:string,courseId:string,homeworkId:string){const row=await env.DB.prepare('SELECT submission_mode FROM homework WHERE id=? AND tenant_id=? AND course_id=?').bind(homeworkId,tenantId,courseId).first<{submission_mode:string}>();if(!row)throw new Error('ASSIGNMENT_NOT_FOUND');return row.submission_mode||'info';}
async function state(env:Env,tenantId:string,courseId:string,homeworkId:string,userId:string){return env.DB.prepare('SELECT * FROM assignment_participant_state WHERE tenant_id=? AND course_id=? AND homework_id=? AND user_id=?').bind(tenantId,courseId,homeworkId,userId).first<AssignmentParticipantState>();}

export async function listMyAssignmentStates(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string){
  await ensureSchema(env);requireParticipant(auth,courseId);
  const rows=await env.DB.prepare('SELECT id,homework_id,progress,private_note,completed_at,created_at,updated_at FROM assignment_participant_state WHERE tenant_id=? AND course_id=? AND user_id=? ORDER BY updated_at DESC').bind(tenantId,courseId,auth.userId).all<AssignmentParticipantState>();
  return rows.results??[];
}

export async function updateMyAssignmentState(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,homeworkId:string,input:Record<string,unknown>){
  await ensureSchema(env);requireParticipant(auth,courseId);const mode=await assignmentMode(env,tenantId,courseId,homeworkId),current=await state(env,tenantId,courseId,homeworkId,auth.userId);
  const progress=String(input.progress??current?.progress??'open') as AssignmentParticipantState['progress'];if(!['open','in_progress','completed'].includes(progress))throw new Error('ASSIGNMENT_PROGRESS_INVALID');
  if(mode!=='info'&&progress==='completed')throw new Error('ASSIGNMENT_COMPLETION_REQUIRES_SUBMISSION');
  let note=current?.private_note??null;if(input.private_note!==undefined){const raw=input.private_note===null?'':safeString(input.private_note,6000);note=raw||null;}
  const ts=nowIso(),completedAt=progress==='completed'?(current?.progress==='completed'&&current.completed_at?current.completed_at:ts):null;
  if(current){await env.DB.prepare('UPDATE assignment_participant_state SET progress=?,private_note=?,completed_at=?,updated_at=? WHERE id=?').bind(progress,note,completedAt,ts,current.id).run();}
  else{await env.DB.prepare('INSERT INTO assignment_participant_state(id,tenant_id,course_id,homework_id,user_id,progress,private_note,completed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(id('aps_'),tenantId,courseId,homeworkId,auth.userId,progress,note,completedAt,ts,ts).run();}
  await audit(env.DB,auth.userId,'assignment.personal_state_updated',tenantId,courseId,'homework',homeworkId,{progress,hasPrivateNote:!!note});
  return (await state(env,tenantId,courseId,homeworkId,auth.userId))!;
}
