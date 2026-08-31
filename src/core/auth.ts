import { pbkdf2 as nodePbkdf2, scrypt as nodeScrypt } from 'node:crypto';
import type { AuthContext as PortabilityAuth } from '../portability/types.js';
import type { AuthMethod, CoreAuthContext, Env, SessionUser } from './types.js';
import { augmentOrgAuth, profilePermissions, tenantUserActive, type OrgProfile } from './enterprise-access.js';
import { productionOriginStatus, requestMatchesConfiguredProductionOrigin } from './production-release-state.js';
import { b64, cookie, fromB64, json, noCookie, normalizeEmail, nowIso, parseCookie, randomBytes, requestIsSecure, sha256Text } from './utils.js';

const SCRYPT_N=32_768;
const SCRYPT_R=8;
const SCRYPT_P=3;
const SCRYPT_MAXMEM=64*1024*1024;
const LEGACY_PBKDF2_MIN=100_000;
const LEGACY_PBKDF2_MAX=100_000;
const SESSION_DAYS=7;
const PLATFORM_SESSION_HOURS=12;
const ADMIN_SESSION_HOURS=12;
const PLATFORM_IDLE_MINUTES=30;
const ADMIN_IDLE_MINUTES=60;

async function deriveScrypt(password:string,salt:Uint8Array,length=32,N=SCRYPT_N,r=SCRYPT_R,p=SCRYPT_P):Promise<Uint8Array>{if(length<32||length>64||N<16_384||N>131_072||(N&(N-1))!==0||r!==8||p<1||p>10)throw new Error('PASSWORD_DERIVATION_PARAMS_INVALID');const maxmem=Math.max(SCRYPT_MAXMEM,128*N*r+1024*1024);return new Promise((resolve,reject)=>nodeScrypt(password,salt,length,{N,r,p,maxmem},(error,derived)=>error?reject(error):resolve(Uint8Array.from(derived))));}
async function deriveLegacyPbkdf2(password:string,salt:Uint8Array,iterations:number,bits=256):Promise<Uint8Array>{if(iterations<LEGACY_PBKDF2_MIN||iterations>LEGACY_PBKDF2_MAX||bits<256||bits%8!==0)throw new Error('LEGACY_PASSWORD_PARAMS_INVALID');return new Promise((resolve,reject)=>nodePbkdf2(password,salt,iterations,bits/8,'sha256',(error,derived)=>error?reject(error):resolve(Uint8Array.from(derived))));}
function constantTimeEqual(actual:Uint8Array,expected:Uint8Array):boolean{if(actual.length!==expected.length)return false;let diff=0;for(let i=0;i<actual.length;i++)diff|=actual[i]^expected[i];return diff===0;}
function passwordNeedsUpgrade(stored:string):boolean{const parts=stored.split('$');if(parts[0]!=='scrypt')return true;return Number(parts[1])!==SCRYPT_N||Number(parts[2])!==SCRYPT_R||Number(parts[3])!==SCRYPT_P;}

// Diese Untergrenze gilt nicht nur fuer Passwoerter: ein Zugriffscode einer Klasse wird mit
// derselben Funktion gehasht und faellt damit unter dieselbe Regel. Sie steht deshalb hier
// einmal und wird von den Aufrufern benutzt, statt an jeder Stelle neu geraten zu werden.
export const PASSWORD_MIN_LENGTH=10;
export const PASSWORD_MAX_LENGTH=256;
export async function hashPassword(password:string):Promise<string>{if(password.length<PASSWORD_MIN_LENGTH||password.length>PASSWORD_MAX_LENGTH)throw new Error('PASSWORD_LENGTH_INVALID');const salt=randomBytes(16),actual=await deriveScrypt(password,salt);return`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${b64(salt)}$${b64(actual)}`;}
export async function verifyPassword(password:string,stored:string):Promise<boolean>{const parts=stored.split('$');if(parts[0]==='scrypt'){const[,nText,rText,pText,saltText,hashText]=parts;if(!nText||!rText||!pText||!saltText||!hashText)return false;const N=Number(nText),r=Number(rText),p=Number(pText);let salt:Uint8Array,expected:Uint8Array;try{salt=fromB64(saltText);expected=fromB64(hashText);}catch{return false;}if(salt.length<16||expected.length<32)return false;try{return constantTimeEqual(await deriveScrypt(password,salt,expected.length,N,r,p),expected);}catch{return false;}}if(parts[0]==='pbkdf2'){const[,iterText,saltText,hashText]=parts;if(!iterText||!saltText||!hashText)return false;const iterations=Number(iterText);let salt:Uint8Array,expected:Uint8Array;try{salt=fromB64(saltText);expected=fromB64(hashText);}catch{return false;}if(salt.length<16||expected.length<32)return false;try{return constantTimeEqual(await deriveLegacyPbkdf2(password,salt,iterations,expected.length*8),expected);}catch{return false;}}return false;}

async function rateKey(request:Request,email:string):Promise<string>{const ip=request.headers.get('CF-Connecting-IP')??'unknown';return sha256Text(`${ip}|${email}`);}
async function checkLoginRate(env:Env,request:Request,email:string):Promise<void>{const key=await rateKey(request,email),now=Date.now(),row=await env.DB.prepare('SELECT window_started_at, attempts FROM login_attempts WHERE key_hash=?').bind(key).first<{window_started_at:string;attempts:number}>();if(!row)return;const age=now-Date.parse(row.window_started_at);if(age<15*60_000&&row.attempts>=5)throw new Error('LOGIN_RATE_LIMITED');}
async function recordLoginFailure(env:Env,request:Request,email:string):Promise<void>{const key=await rateKey(request,email),now=nowIso(),row=await env.DB.prepare('SELECT window_started_at, attempts FROM login_attempts WHERE key_hash=?').bind(key).first<{window_started_at:string;attempts:number}>();if(!row||Date.now()-Date.parse(row.window_started_at)>=15*60_000)await env.DB.prepare('INSERT OR REPLACE INTO login_attempts(key_hash,window_started_at,attempts) VALUES(?,?,1)').bind(key,now).run();else await env.DB.prepare('UPDATE login_attempts SET attempts=attempts+1 WHERE key_hash=?').bind(key).run();}
async function clearLoginRate(env:Env,request:Request,email:string):Promise<void>{await env.DB.prepare('DELETE FROM login_attempts WHERE key_hash=?').bind(await rateKey(request,email)).run();}
async function tableExists(env:Env,name:string):Promise<boolean>{return !!await env.DB.prepare("SELECT 1 AS ok FROM sqlite_master WHERE type='table' AND name=?").bind(name).first();}

async function sessionUser(env:Env,userId:string):Promise<SessionUser|null>{
  const u=await env.DB.prepare('SELECT id,email,display_name,is_platform_admin,force_password_change,status FROM users WHERE id=?').bind(userId).first<{id:string;email:string;display_name:string;is_platform_admin:number;force_password_change:number;status:string}>();if(!u||u.status!=='active')return null;
  let memberships:{tenant_id:string;course_id:string|null;role:SessionUser['tenantRoles'][number]['role']}[]=[];
  const tenantUsersTable=await tableExists(env,'tenant_users');
  if(!tenantUsersTable){const m=await env.DB.prepare('SELECT tenant_id,course_id,role FROM memberships WHERE user_id=?').bind(userId).all<{tenant_id:string;course_id:string|null;role:SessionUser['tenantRoles'][number]['role']}>();memberships=m.results??[];}
  else{
    const m=await env.DB.prepare(`SELECT m.tenant_id,m.course_id,m.role FROM memberships m JOIN tenant_users tu ON tu.tenant_id=m.tenant_id AND tu.user_id=m.user_id WHERE m.user_id=? AND tu.status='active'`).bind(userId).all<{tenant_id:string;course_id:string|null;role:SessionUser['tenantRoles'][number]['role']}>();memberships=m.results??[];
    const orgTables=await Promise.all(['org_permission_grants','org_units','course_org_units'].map(name=>tableExists(env,name)));
    if(orgTables.every(Boolean)){const now=nowIso(),granted=await env.DB.prepare(`WITH RECURSIVE grant_tree(tenant_id,org_unit_id,profile,permissions_json,inherit_descendants) AS (
      SELECT g.tenant_id,g.org_unit_id,g.profile,g.permissions_json,g.inherit_descendants FROM org_permission_grants g JOIN tenant_users tu ON tu.tenant_id=g.tenant_id AND tu.user_id=g.user_id
      WHERE g.user_id=? AND g.status='active' AND tu.status='active' AND (g.valid_from IS NULL OR g.valid_from<=?) AND (g.valid_until IS NULL OR g.valid_until>?)
      UNION ALL SELECT gt.tenant_id,o.id,gt.profile,gt.permissions_json,gt.inherit_descendants FROM org_units o JOIN grant_tree gt ON o.parent_id=gt.org_unit_id AND o.tenant_id=gt.tenant_id WHERE gt.inherit_descendants=1 AND o.status='active'
    ) SELECT DISTINCT gt.tenant_id,co.course_id,gt.profile,gt.permissions_json FROM grant_tree gt LEFT JOIN course_org_units co ON co.tenant_id=gt.tenant_id AND co.org_unit_id=gt.org_unit_id`).bind(userId,now,now).all<{tenant_id:string;course_id:string|null;profile:string;permissions_json:string}>();
      for(const row of granted.results??[]){const ps=profilePermissions(row.profile as OrgProfile,row.permissions_json),manage=ps.some(x=>['courses.manage','content.manage','participants.manage','org.manage','access.manage'].includes(x)),role:SessionUser['tenantRoles'][number]['role']=manage?'class_admin':'guest';if(!memberships.some(x=>x.tenant_id===row.tenant_id&&x.course_id===row.course_id&&x.role===role))memberships.push({tenant_id:row.tenant_id,course_id:row.course_id,role});}}
  }
  return{userId:u.id,email:u.email,displayName:u.display_name,isPlatformAdmin:!!u.is_platform_admin,mustChangePassword:!!u.force_password_change,tenantRoles:memberships.map(x=>({tenantId:x.tenant_id,courseId:x.course_id,role:x.role}))};
}
function privilegedSession(user:SessionUser):boolean{return user.isPlatformAdmin||user.tenantRoles.some(x=>x.role==='tenant_admin'||x.role==='class_admin');}
function platformOriginAllowed(env:Env,request?:Request):boolean{const configured=productionOriginStatus(env);return !configured.ok||!!request&&requestMatchesConfiguredProductionOrigin(env,request);}

export async function issueSession(env:Env,userId:string,platform:boolean,authMethod:AuthMethod='password',authTenantId?:string|null,request?:Request):Promise<Response>{if(platform&&!platformOriginAllowed(env,request))throw new Error('PLATFORM_ORIGIN_MISMATCH');const me=await sessionUser(env,userId);if(!me)throw new Error('USER_NOT_FOUND');const raw=b64(randomBytes(32)),tokenHash=await sha256Text(raw),created=nowIso(),maxAge=(platform?PLATFORM_SESSION_HOURS:privilegedSession(me)?ADMIN_SESSION_HOURS:SESSION_DAYS*24)*3600,expires=new Date(Date.now()+maxAge*1000).toISOString();await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind(tokenHash,userId,expires,created,created).run();try{await env.DB.prepare('UPDATE sessions SET auth_method=?,auth_tenant_id=? WHERE token_hash=?').bind(authMethod,authTenantId??null,tokenHash).run();}catch{}me.authMethod=authMethod;me.authTenantId=authTenantId??null;return json({ok:true,user:me},200,{'set-cookie':cookie('kp_session',raw,maxAge,requestIsSecure(request))});}
export async function login(env:Env,request:Request):Promise<Response>{const body=await request.json() as {email?:string;password?:string},email=normalizeEmail(body.email),password=String(body.password??'');if(!email||!password)return json({ok:false,error:'EMAIL_PASSWORD_REQUIRED'},400);await checkLoginRate(env,request,email);const u=await env.DB.prepare('SELECT id,password_hash,status,is_platform_admin FROM users WHERE email=? COLLATE NOCASE').bind(email).first<{id:string;password_hash:string;status:string;is_platform_admin:number}>();if(!u||u.status!=='active'||!(await verifyPassword(password,u.password_hash))){await recordLoginFailure(env,request,email);return json({ok:false,error:'LOGIN_FAILED'},401);}await clearLoginRate(env,request,email);if(u.is_platform_admin&&!platformOriginAllowed(env,request))return json({ok:false,error:'PLATFORM_ORIGIN_MISMATCH'},403);if(passwordNeedsUpgrade(u.password_hash)){const upgraded=await hashPassword(password);await env.DB.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').bind(upgraded,nowIso(),u.id).run();}return issueSession(env,u.id,!!u.is_platform_admin,'password',undefined,request);}
export async function logout(env:Env,request:Request):Promise<Response>{const raw=parseCookie(request,'kp_session');if(raw)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256Text(raw)).run();return json({ok:true},200,{'set-cookie':noCookie('kp_session',requestIsSecure(request))});}
export async function getSession(env:Env,request:Request):Promise<SessionUser|null>{const raw=parseCookie(request,'kp_session');if(!raw)return null;const hash=await sha256Text(raw),row=await env.DB.prepare(`SELECT s.user_id,s.expires_at,s.last_seen_at,u.is_platform_admin,u.status FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).bind(hash).first<{user_id:string;expires_at:string;last_seen_at:string;is_platform_admin:number;status:string}>(),expired=!row||row.status!=='active'||Date.parse(row.expires_at)<=Date.now();if(expired){if(row)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();return null;}const me=await sessionUser(env,row!.user_id);if(!me){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();return null;}if(me.isPlatformAdmin&&!platformOriginAllowed(env,request)){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();return null;}const idleMinutes=me.isPlatformAdmin?PLATFORM_IDLE_MINUTES:privilegedSession(me)?ADMIN_IDLE_MINUTES:0,idleExpired=idleMinutes>0&&(Date.now()-Date.parse(row!.last_seen_at)>idleMinutes*60_000);if(idleExpired){await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();return null;}await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').bind(nowIso(),hash).run();try{const meta=await env.DB.prepare('SELECT auth_method,auth_tenant_id FROM sessions WHERE token_hash=?').bind(hash).first<{auth_method:AuthMethod;auth_tenant_id:string|null}>();me.authMethod=meta?.auth_method||'password';me.authTenantId=meta?.auth_tenant_id??null;}catch{me.authMethod='password';me.authTenantId=null;}return me;}
export async function changePassword(env:Env,request:Request):Promise<Response>{const session=await getSession(env,request);if(!session)return json({ok:false,error:'UNAUTHENTICATED'},401);const body=await request.json() as {current_password?:string;new_password?:string},currentPassword=String(body.current_password??''),newPassword=String(body.new_password??'');if(!currentPassword||!newPassword)return json({ok:false,error:'PASSWORD_FIELDS_REQUIRED'},400);if(currentPassword===newPassword)return json({ok:false,error:'PASSWORD_MUST_CHANGE'},400);const u=await env.DB.prepare("SELECT password_hash FROM users WHERE id=? AND status='active'").bind(session.userId).first<{password_hash:string}>();if(!u||!(await verifyPassword(currentPassword,u.password_hash)))return json({ok:false,error:'CURRENT_PASSWORD_INVALID'},403);const nextHash=await hashPassword(newPassword),raw=parseCookie(request,'kp_session'),currentHash=raw?await sha256Text(raw):'';await env.DB.batch([env.DB.prepare('UPDATE users SET password_hash=?,force_password_change=0,updated_at=? WHERE id=?').bind(nextHash,nowIso(),session.userId),env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').bind(session.userId,currentHash)]);return json({ok:true});}

export function authForTenant(session:SessionUser,tenantId?:string,courseId?:string):CoreAuthContext{if(session.isPlatformAdmin)return{userId:session.userId,role:'platform_admin',tenantIds:tenantId?[tenantId]:session.tenantRoles.map(x=>x.tenantId),courseIds:courseId?[courseId]:[],orgUnitIds:[],permissions:[],isPlatformAdmin:true,session};const rows=session.tenantRoles.filter(x=>(!tenantId||x.tenantId===tenantId)&&(!courseId||x.courseId===null||x.courseId===courseId));if(!rows.length)throw new Error('FORBIDDEN');const rank:Record<string,number>={tenant_admin:4,class_admin:3,participant:2,guest:1},best=[...rows].sort((a,b)=>rank[b.role]-rank[a.role])[0];return{userId:session.userId,role:best.role,tenantIds:[...new Set(rows.map(x=>x.tenantId))],courseIds:rows.map(x=>x.courseId).filter((x):x is string=>!!x),orgUnitIds:[],permissions:[],isPlatformAdmin:false,session};}
async function enforceTenantSso(env:Env,session:SessionUser,tenantId:string):Promise<void>{if(session.isPlatformAdmin)return;if(!await tableExists(env,'tenant_sso_configs'))return;const cfg=await env.DB.prepare('SELECT enabled,enforce_sso,break_glass_user_id FROM tenant_sso_configs WHERE tenant_id=?').bind(tenantId).first<{enabled:number;enforce_sso:number;break_glass_user_id:string|null}>();if(!cfg||!cfg.enabled||!cfg.enforce_sso)return;if(cfg.break_glass_user_id===session.userId)return;if(session.authMethod!=='oidc'||session.authTenantId!==tenantId)throw new Error('SSO_REQUIRED');}
async function tenantMembershipExists(env:Env,tenantId:string,userId:string):Promise<boolean>{return !!await env.DB.prepare('SELECT 1 AS ok FROM memberships WHERE tenant_id=? AND user_id=? LIMIT 1').bind(tenantId,userId).first();}

export async function resolveCoreAuth(env:Env,request:Request,tenantId?:string,courseId?:string):Promise<CoreAuthContext>{
  const s=await getSession(env,request);if(!s)throw new Error('UNAUTHENTICATED');if(s.mustChangePassword)throw new Error('PASSWORD_CHANGE_REQUIRED');
  let base:CoreAuthContext;
  try{base=authForTenant(s,tenantId,courseId);}
  catch(e){
    if((e as Error).message!=='FORBIDDEN')throw e;
    // No membership grants this tenant. Start from no tenant access at all: augmentOrgAuth still
    // adds the tenant when an org permission grant or responsibility assignment covers it. Seeding
    // the requested tenant here would make the membership check below unreachable and leave the
    // whole tenant boundary resting on tenant_users, which is deliberately permissive on databases
    // created before that table existed.
    base={userId:s.userId,role:'guest',tenantIds:[],courseIds:[],orgUnitIds:[],permissions:[],isPlatformAdmin:false,session:s};
  }
  const a=await augmentOrgAuth(env,base,tenantId);
  if(tenantId){
    if(!a.isPlatformAdmin){
      if(!a.tenantIds.includes(tenantId)){
        // A caller who is a member but whose tenant lifecycle link is not active is suspended;
        // a caller with no relationship to the tenant is simply forbidden. Both deny access.
        throw new Error(await tenantMembershipExists(env,tenantId,s.userId)?'TENANT_ACCESS_SUSPENDED':'FORBIDDEN');
      }
      if(!await tenantUserActive(env,tenantId,s.userId))throw new Error('TENANT_ACCESS_SUSPENDED');
    }
    await enforceTenantSso(env,s,tenantId);
    if(courseId&&!a.isPlatformAdmin&&a.role!=='tenant_admin'&&!a.courseIds.includes(courseId))throw new Error('FORBIDDEN_COURSE');
  }else if(!a.isPlatformAdmin&&!a.tenantIds.length)throw new Error('FORBIDDEN');
  return a;
}
export async function resolvePortabilityAuth(env:Env,request:Request):Promise<PortabilityAuth>{const url=new URL(request.url),tenantId=url.searchParams.get('tenant_id')??undefined,a=await resolveCoreAuth(env,request,tenantId);return{userId:a.userId,role:a.role,tenantIds:a.tenantIds,isPlatformAdmin:a.isPlatformAdmin};}
