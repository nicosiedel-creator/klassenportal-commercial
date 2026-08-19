import type { CoreAuthContext } from './types.js';

/**
 * class_admin is a capability layered on top of being a student. Sensitive
 * self-service APIs must therefore evaluate it exactly like participant.
 */
export function asStudentView(auth:CoreAuthContext):CoreAuthContext{
  return auth.role==='class_admin'?{...auth,role:'participant'}:auth;
}

/**
 * A class_admin must never use manager endpoints that reveal another
 * participant's attendance, absence, submission or grade data.
 */
export function forbidClassAdminStudentData(auth:CoreAuthContext):void{
  if(auth.role==='class_admin')throw new Error('FORBIDDEN_CLASS_ADMIN_STUDENT_DATA');
}
