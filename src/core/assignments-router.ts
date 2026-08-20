import type { Env } from './types.js';
import { resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { assertSameOrigin, json } from './utils.js';
import { configureAssignment, courseGradebook, deleteMySubmissionFile, downloadSubmissionFile, gradeSubmission, listAssignments, listAssignmentSubmissions, myOfficialGrades, returnSubmission, saveMySubmission, submitMyAssignment, uploadMySubmissionFile, withdrawMyAssignment } from './assignments-gradebook.js';
import { listMyAssignmentStates, updateMyAssignmentState } from './assignment-participant-state.js';
import { asStudentView, forbidClassAdminStudentData } from './student-role.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=String((e as Error)?.message||'ASSIGNMENT_ERROR'),status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('REQUIRED')&&code.startsWith('PARTICIPANT')?403:code.includes('NOT_FOUND')?404:code.includes('TOO_LARGE')?413:code.includes('DEADLINE')||code.includes('LOCKED')||code.includes('SUBMITTED')||code.includes('GRADABLE')||code.includes('RETURNABLE')||code.includes('WITHDRAWAL')||code.includes('COMPLETION')?409:400;return json({ok:false,error:code},status);}

export async function handleAssignmentsApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url),path=u.pathname;if(!path.startsWith('/api/assignments')&&!path.startsWith('/api/gradebook'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);const tenantId=u.searchParams.get('tenant_id')||'',courseId=u.searchParams.get('course_id')||'';if(!tenantId||!courseId)throw new Error('ASSIGNMENT_SCOPE_REQUIRED');const auth=await resolveCoreAuth(env,request,tenantId,courseId),studentAuth=asStudentView(auth),write=request.method!=='GET'&&request.method!=='HEAD';if(write)await assertTenantWriteAllowed(env,tenantId);
    if(path==='/api/assignments'&&request.method==='GET')return json({ok:true,assignments:await listAssignments(env,auth.role==='class_admin'?studentAuth:auth,tenantId,courseId)});
    if(path==='/api/assignments/my-state'&&request.method==='GET')return json({ok:true,states:await listMyAssignmentStates(env,studentAuth,tenantId,courseId)});
    const cfg=path.match(/^\/api\/assignments\/([^/]+)\/config$/);if(cfg&&request.method==='PUT')return json({ok:true,assignment:await configureAssignment(env,auth,tenantId,courseId,decodeURIComponent(cfg[1]),await body(request))});
    const personal=path.match(/^\/api\/assignments\/([^/]+)\/my-state$/);if(personal&&request.method==='PUT')return json({ok:true,state:await updateMyAssignmentState(env,studentAuth,tenantId,courseId,decodeURIComponent(personal[1]),await body(request))});
    const mine=path.match(/^\/api\/assignments\/([^/]+)\/my$/);if(mine&&request.method==='PUT')return json({ok:true,submission:await saveMySubmission(env,studentAuth,tenantId,courseId,decodeURIComponent(mine[1]),await body(request))});
    const upload=path.match(/^\/api\/assignments\/([^/]+)\/my\/files$/);if(upload&&request.method==='POST')return json({ok:true,...await uploadMySubmissionFile(env,studentAuth,tenantId,courseId,decodeURIComponent(upload[1]),request)},201);
    const remove=path.match(/^\/api\/assignments\/([^/]+)\/my\/files\/([^/]+)$/);if(remove&&request.method==='DELETE'){await deleteMySubmissionFile(env,studentAuth,tenantId,courseId,decodeURIComponent(remove[1]),decodeURIComponent(remove[2]));return json({ok:true});}
    const submit=path.match(/^\/api\/assignments\/([^/]+)\/my\/submit$/);if(submit&&request.method==='POST')return json({ok:true,submission:await submitMyAssignment(env,studentAuth,tenantId,courseId,decodeURIComponent(submit[1]))});
    const withdraw=path.match(/^\/api\/assignments\/([^/]+)\/my\/withdraw$/);if(withdraw&&request.method==='POST'){await withdrawMyAssignment(env,studentAuth,tenantId,courseId,decodeURIComponent(withdraw[1]));return json({ok:true});}
    const download=path.match(/^\/api\/assignments\/files\/([^/]+)$/);if(download&&request.method==='GET')return downloadSubmissionFile(env,auth.role==='class_admin'?studentAuth:auth,tenantId,courseId,decodeURIComponent(download[1]));
    const submissions=path.match(/^\/api\/assignments\/([^/]+)\/submissions$/);if(submissions&&request.method==='GET'){forbidClassAdminStudentData(auth);return json({ok:true,submissions:await listAssignmentSubmissions(env,auth,tenantId,courseId,decodeURIComponent(submissions[1]))});}
    const returned=path.match(/^\/api\/assignments\/submissions\/([^/]+)\/return$/);if(returned&&request.method==='POST'){forbidClassAdminStudentData(auth);const b=await body(request);await returnSubmission(env,auth,tenantId,courseId,decodeURIComponent(returned[1]),String(b.note||''));return json({ok:true});}
    const graded=path.match(/^\/api\/assignments\/submissions\/([^/]+)\/grade$/);if(graded&&request.method==='POST'){forbidClassAdminStudentData(auth);return json({ok:true,score:await gradeSubmission(env,auth,tenantId,courseId,decodeURIComponent(graded[1]),await body(request))});}
    if(path==='/api/gradebook'&&request.method==='GET'){forbidClassAdminStudentData(auth);return json({ok:true,...await courseGradebook(env,auth,tenantId,courseId)});}
    if(path==='/api/gradebook/my'&&request.method==='GET')return json({ok:true,grades:await myOfficialGrades(env,studentAuth,tenantId,courseId)});
    return json({ok:false,error:'ASSIGNMENT_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
