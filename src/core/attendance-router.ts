import type { Env } from './types.js';
import { getSession, resolveCoreAuth } from './auth.js';
import { assertTenantWriteAllowed } from './commerce-offers.js';
import { attendanceSummary, cancelAttendanceSession, courseAttendanceSummary, createAttendanceSession, getAttendanceSession, listAbsenceNotices, listAttendanceSessions, myAbsenceNotices, reviewAbsenceNotice, saveAttendancePolicy, saveAttendanceRecords, saveClassbookEntry, submitAbsenceNotice, upsertAttendanceSessionFromSource } from './attendance-classbook.js';
import { handleAssignmentsApi } from './assignments-router.js';
import { handleLearningSuiteApi } from './learning-suite-router.js';
import { handleCollaborationReportingApi } from './collaboration-reporting-router.js';
import { asStudentView, forbidClassAdminStudentData } from './student-role.js';
import { createTeacherPortalTeacher, listTeacherPortalAssignments, myTeacherPortalCourses, revokeTeacherPortalAssignment, saveTeacherPortalAssignment, teacherAttendanceAuth, teacherPortalOptions } from './teacher-portal.js';
import { assertSameOrigin, json } from './utils.js';

async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function fail(e:unknown){const code=String((e as Error)?.message||'ATTENDANCE_ERROR'),status=code==='UNAUTHENTICATED'?401:code.startsWith('FORBIDDEN')||code.includes('ADMIN_REQUIRED')?403:code.includes('NOT_FOUND')?404:code.includes('CONFLICT')||code.includes('CANCELLED')||code.includes('NOT_PENDING')?409:code.includes('TOO_LONG')?413:400;return json({ok:false,error:code},status);}
export async function handleAttendanceApi(request:Request,env:Env):Promise<Response|null>{
  const assignments=await handleAssignmentsApi(request,env);if(assignments)return assignments;
  const learning=await handleLearningSuiteApi(request,env);if(learning)return learning;
  const collaboration=await handleCollaborationReportingApi(request,env);if(collaboration)return collaboration;
  const u=new URL(request.url),path=u.pathname;if(!path.startsWith('/api/attendance'))return null;
  try{
    assertSameOrigin(request,env.APP_ORIGIN);
    if(path==='/api/attendance/teacher/courses'&&request.method==='GET'){
      const session=await getSession(env,request);if(!session)throw new Error('UNAUTHENTICATED');
      return json({ok:true,courses:await myTeacherPortalCourses(env,session)});
    }
    const tenantId=u.searchParams.get('tenant_id')||'';if(!tenantId)throw new Error('ATTENDANCE_SCOPE_REQUIRED');
    if(path==='/api/attendance/teacher/options'&&request.method==='GET'){
      const auth=await resolveCoreAuth(env,request,tenantId);return json({ok:true,...await teacherPortalOptions(env,auth,tenantId)});
    }
    if(path==='/api/attendance/teacher/master'&&request.method==='POST'){
      await assertTenantWriteAllowed(env,tenantId);const auth=await resolveCoreAuth(env,request,tenantId);return json({ok:true,teacher:await createTeacherPortalTeacher(env,auth,tenantId,await body(request))},201);
    }
    if(path==='/api/attendance/teacher/assignments'&&request.method==='GET'){
      const auth=await resolveCoreAuth(env,request,tenantId);return json({ok:true,assignments:await listTeacherPortalAssignments(env,auth,tenantId)});
    }
    if(path==='/api/attendance/teacher/assignments'&&request.method==='POST'){
      await assertTenantWriteAllowed(env,tenantId);const auth=await resolveCoreAuth(env,request,tenantId);return json({ok:true,assignment:await saveTeacherPortalAssignment(env,auth,tenantId,await body(request))},201);
    }
    const teacherAssignment=path.match(/^\/api\/attendance\/teacher\/assignments\/([^/]+)$/);
    if(teacherAssignment&&request.method==='DELETE'){
      await assertTenantWriteAllowed(env,tenantId);const auth=await resolveCoreAuth(env,request,tenantId);await revokeTeacherPortalAssignment(env,auth,tenantId,decodeURIComponent(teacherAssignment[1]));return json({ok:true});
    }

    const courseId=u.searchParams.get('course_id')||'';if(!courseId)throw new Error('ATTENDANCE_SCOPE_REQUIRED');
    const auth=await resolveCoreAuth(env,request,tenantId,courseId),studentAuth=asStudentView(auth);
    const managerAuth=async()=>{forbidClassAdminStudentData(auth);return teacherAttendanceAuth(env,auth,tenantId,courseId);};

    if(path==='/api/attendance/sessions'&&request.method==='GET')return json({ok:true,sessions:await listAttendanceSessions(env,await managerAuth(),tenantId,courseId,u.searchParams.get('from')||undefined,u.searchParams.get('to')||undefined)});
    if(path==='/api/attendance/sessions'&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,...await createAttendanceSession(env,await managerAuth(),tenantId,courseId,await body(request))},201);}
    if(path==='/api/attendance/sessions/upsert-source'&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,session:await upsertAttendanceSessionFromSource(env,await managerAuth(),tenantId,courseId,await body(request))},201);}
    const session=path.match(/^\/api\/attendance\/sessions\/([^/]+)$/);if(session&&request.method==='GET')return json({ok:true,...await getAttendanceSession(env,await managerAuth(),tenantId,courseId,decodeURIComponent(session[1]))});
    const records=path.match(/^\/api\/attendance\/sessions\/([^/]+)\/records$/);if(records&&request.method==='PUT'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,...await saveAttendanceRecords(env,await managerAuth(),tenantId,courseId,decodeURIComponent(records[1]),await body(request))});}
    const classbook=path.match(/^\/api\/attendance\/sessions\/([^/]+)\/classbook$/);if(classbook&&request.method==='PUT'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,...await saveClassbookEntry(env,await managerAuth(),tenantId,courseId,decodeURIComponent(classbook[1]),await body(request))});}
    const cancel=path.match(/^\/api\/attendance\/sessions\/([^/]+)\/cancel$/);if(cancel&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);await cancelAttendanceSession(env,await managerAuth(),tenantId,courseId,decodeURIComponent(cancel[1]));return json({ok:true});}
    if(path==='/api/attendance/absence/my'&&request.method==='GET')return json({ok:true,notices:await myAbsenceNotices(env,studentAuth,tenantId,courseId)});
    if(path==='/api/attendance/absence/my'&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,notice:await submitAbsenceNotice(env,studentAuth,tenantId,courseId,await body(request))},201);}
    if(path==='/api/attendance/absence'&&request.method==='GET')return json({ok:true,notices:await listAbsenceNotices(env,await managerAuth(),tenantId,courseId,u.searchParams.get('status')||undefined)});
    const review=path.match(/^\/api\/attendance\/absence\/([^/]+)\/(accept|reject)$/);if(review&&request.method==='POST'){await assertTenantWriteAllowed(env,tenantId);await reviewAbsenceNotice(env,await managerAuth(),tenantId,courseId,decodeURIComponent(review[1]),review[2]==='accept'?'accepted':'rejected');return json({ok:true});}
    if(path==='/api/attendance/summary/my'&&request.method==='GET')return json({ok:true,summary:await attendanceSummary(env,studentAuth,tenantId,courseId)});
    if(path==='/api/attendance/summary/course'&&request.method==='GET')return json({ok:true,participants:await courseAttendanceSummary(env,await managerAuth(),tenantId,courseId)});
    if(path==='/api/attendance/policy'&&request.method==='PUT'){await assertTenantWriteAllowed(env,tenantId);return json({ok:true,policy:await saveAttendancePolicy(env,await managerAuth(),tenantId,courseId||null,await body(request))});}
    return json({ok:false,error:'ATTENDANCE_ROUTE_NOT_FOUND'},404);
  }catch(e){return fail(e);}
}
