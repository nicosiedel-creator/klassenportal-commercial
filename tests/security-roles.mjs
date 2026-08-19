import { strict as assert } from 'node:assert';
import { readFile } from 'node:fs/promises';
import { authForTenant, hashPassword, verifyPassword } from '../dist/core/auth.js';
import { asStudentView, forbidClassAdminStudentData } from '../dist/core/student-role.js';
import { assertSameOrigin, b64, cookie, randomBytes, toArrayBuffer } from '../dist/core/utils.js';

async function legacyHash(password,iterations=100000){
  const salt=randomBytes(16),key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:toArrayBuffer(salt),iterations},key,256);
  return `pbkdf2$${iterations}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

const modern=await hashPassword('Sicheres-Passwort-2026!');
assert.match(modern,/^scrypt\$32768\$8\$3\$/,'new password hashes must use the runtime-verified OWASP scrypt profile');
assert.equal(await verifyPassword('Sicheres-Passwort-2026!',modern),true);
assert.equal(await verifyPassword('falsch',modern),false);
const legacy=await legacyHash('Alt-Aber-Gültig-2026!',100000);
assert.equal(await verifyPassword('Alt-Aber-Gültig-2026!',legacy),true,'legacy 100k PBKDF2 hashes remain login-compatible for transparent upgrade');
const weak=await legacyHash('Zu-Schwach-2026!',50000);
assert.equal(await verifyPassword('Zu-Schwach-2026!',weak),false,'hashes below the accepted legacy security floor must be rejected');
const unsupportedHigh=await legacyHash('Nicht-Lauffähig-2026!',600000);
assert.equal(await verifyPassword('Nicht-Lauffähig-2026!',unsupportedHigh),false,'legacy PBKDF2 hashes above the Worker runtime limit must fail closed');

const base={userId:'u1',email:'u@example.de',displayName:'U',isPlatformAdmin:false,mustChangePassword:false};
const classAdmin={...base,tenantRoles:[{tenantId:'t1',courseId:'c1',role:'class_admin'}]};
const classAdminAuth=authForTenant(classAdmin,'t1','c1');
assert.equal(classAdminAuth.role,'class_admin');
assert.equal(asStudentView(classAdminAuth).role,'participant','class admin self-service must use the same student role as classmates');
assert.throws(()=>forbidClassAdminStudentData(classAdminAuth),/FORBIDDEN_CLASS_ADMIN_STUDENT_DATA/,'class admin must fail closed on cross-student data APIs');
assert.throws(()=>authForTenant(classAdmin,'t1','c2'),/FORBIDDEN/,'class admin must not see another class');
assert.throws(()=>authForTenant(classAdmin,'t2','c1'),/FORBIDDEN/,'class admin must not see another tenant');
const participant={...base,tenantRoles:[{tenantId:'t1',courseId:'c1',role:'participant'}]};
assert.equal(authForTenant(participant,'t1','c1').role,'participant');
assert.throws(()=>authForTenant(participant,'t1','c2'),/FORBIDDEN/,'participant must not see another class');
const tenantAdmin={...base,tenantRoles:[{tenantId:'t1',courseId:null,role:'tenant_admin'}]};
assert.equal(authForTenant(tenantAdmin,'t1','c99').role,'tenant_admin','tenant admin may administer every class inside own tenant');
assert.throws(()=>authForTenant(tenantAdmin,'t2','c99'),/FORBIDDEN/,'tenant admin must not see another tenant');
const owner={...base,isPlatformAdmin:true,tenantRoles:[]};
assert.equal(authForTenant(owner,'t2','c99').role,'platform_admin');

const users=await readFile('src/core/users.ts','utf8');
assert.match(users,/CLASS_ADMIN_PARTICIPANT_MANAGED/,'automatic participant companion must be protected from independent mutation');
assert.match(users,/NOT \(m\.role='participant' AND EXISTS/,'automatic participant companion must be hidden from tenant-admin membership listing');
assert.match(users,/classAdminCapabilityRemoved:true/,'class-admin demotion must remove only the extra capability while preserving the requested resulting role');
const classAdminMigration=await readFile('migrations/0064_class_admin_student_teacher_portal.sql','utf8');
assert.match(classAdminMigration,/OLD\.role='class_admin'[\s\S]*OLD\.course_id IS NOT NEW\.course_id[\s\S]*role='participant'/,'moving a class-admin capability must remove the stale participant companion from the old course');

assert.doesNotThrow(()=>assertSameOrigin(new Request('https://portal.example/api/x',{method:'POST',headers:{origin:'https://portal.example','sec-fetch-site':'same-origin'}}),'https://portal.example'));
assert.throws(()=>assertSameOrigin(new Request('https://portal.example/api/x',{method:'POST',headers:{origin:'https://evil.example','sec-fetch-site':'cross-site'}}),'https://portal.example'),/CSRF_ORIGIN_MISMATCH/);
assert.throws(()=>assertSameOrigin(new Request('https://portal.example/api/x',{method:'POST',headers:{origin:'https://evil.example'}}),'https://portal.example'),/CSRF_ORIGIN_MISMATCH/);
assert.doesNotThrow(()=>assertSameOrigin(new Request('https://portal.example/api/x',{method:'GET',headers:{origin:'https://evil.example'}}),'https://portal.example'));
assert.match(cookie('kp_session','abc',60),/HttpOnly; Secure; SameSite=Strict/);

console.log('Security hardening + class-admin-as-student role isolation tests: OK');
