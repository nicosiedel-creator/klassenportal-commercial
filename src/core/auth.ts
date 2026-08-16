import type { AuthContext as PortabilityAuth } from '../portability/types.js';
import type { CoreAuthContext, Env, SessionUser } from './types.js';
import { b64, cookie, fromB64, json, noCookie, normalizeEmail, nowIso, parseCookie, randomBytes, sha256Text, toArrayBuffer } from './utils.js';

const CURRENT_ITERATIONS = 600_000;
const MIN_ACCEPTED_ITERATIONS = 100_000;
const MAX_ACCEPTED_ITERATIONS = 1_000_000;
const SESSION_DAYS = 7;
const PLATFORM_SESSION_HOURS = 12;
const PLATFORM_IDLE_MINUTES = 30;

async function derivePassword(password:string,salt:Uint8Array,iterations:number,bits=256):Promise<Uint8Array>{
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:toArrayBuffer(salt),iterations},key,bits));
}
function passwordIterations(stored:string):number{
  const [kind,iterText]=stored.split('$');if(kind!=='pbkdf2')return 0;const n=Number(iterText);return Number.isInteger(n)?n:0;
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10 || password.length > 256) throw new Error('PASSWORD_LENGTH_INVALID');
  const salt=randomBytes(16),actual=await derivePassword(password,salt,CURRENT_ITERATIONS);
  return `pbkdf2$${CURRENT_ITERATIONS}$${b64(salt)}$${b64(actual)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind,iterText,saltText,hashText]=stored.split('$');
  if(kind!=='pbkdf2'||!iterText||!saltText||!hashText)return false;
  const iterations=Number(iterText);if(!Number.isInteger(iterations)||iterations<MIN_ACCEPTED_ITERATIONS||iterations>MAX_ACCEPTED_ITERATIONS)return false;
  let salt:Uint8Array,expected:Uint8Array;try{salt=fromB64(saltText);expected=fromB64(hashText);}catch{return false;}
  if(salt.length<16||expected.length<32)return false;
  const actual=await derivePassword(password,salt,iterations,expected.length*8);if(actual.length!==expected.length)return false;
  let diff=0;for(let i=0;i<actual.length;i++)diff|=actual[i]^expected[i];return diff===0;
}

async function rateKey(request: Request, email: string): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  return sha256Text(`${ip}|${email}`);
}

async function checkLoginRate(env: Env, request: Request, email: string): Promise<void> {
  const key = await rateKey(request,email); const now = Date.now();
  const row = await env.DB.prepare('SELECT window_started_at, attempts FROM login_attempts WHERE key_hash=?').bind(key).first<{window_started_at:string;attempts:number}>();
  if (!row) return;
  const age = now - Date.parse(row.window_started_at);
  if (age < 15*60_000 && row.attempts >= 5) throw new Error('LOGIN_RATE_LIMITED');
}

async function recordLoginFailure(env: Env, request: Request, email: string): Promise<void> {
  const key = await rateKey(request,email); const now = nowIso();
  const row = await env.DB.prepare('SELECT window_started_at, attempts FROM login_attempts WHERE key_hash=?').bind(key).first<{window_started_at:string;attempts:number}>();
  if (!row || Date.now()-Date.parse(row.window_started_at) >= 15*60_000) {
    await env.DB.prepare('INSERT OR REPLACE INTO login_attempts(key_hash,window_started_at,attempts) VALUES(?,?,1)').bind(key,now).run();
  } else {
    await env.DB.prepare('UPDATE login_attempts SET attempts=attempts+1 WHERE key_hash=?').bind(key).run();
  }
}

async function clearLoginRate(env: Env, request: Request, email: string): Promise<void> {
  await env.DB.prepare('DELETE FROM login_attempts WHERE key_hash=?').bind(await rateKey(request,email)).run();
}

async function sessionUser(env: Env, userId: string): Promise<SessionUser | null> {
  const u = await env.DB.prepare('SELECT id,email,display_name,is_platform_admin,force_password_change,status FROM users WHERE id=?').bind(userId).first<{id:string;email:string;display_name:string;is_platform_admin:number;force_password_change:number;status:string}>();
  if (!u || u.status !== 'active') return null;
  const m = await env.DB.prepare('SELECT tenant_id,course_id,role FROM memberships WHERE user_id=?').bind(userId).all<{tenant_id:string;course_id:string|null;role:SessionUser['tenantRoles'][number]['role']}>();
  return { userId:u.id,email:u.email,displayName:u.display_name,isPlatformAdmin:!!u.is_platform_admin,mustChangePassword:!!u.force_password_change,tenantRoles:(m.results??[]).map(x=>({tenantId:x.tenant_id,courseId:x.course_id,role:x.role})) };
}

export async function login(env: Env, request: Request): Promise<Response> {
  const body = await request.json() as {email?:string;password?:string}; const email=normalizeEmail(body.email); const password=String(body.password??'');
  if (!email || !password) return json({ok:false,error:'EMAIL_PASSWORD_REQUIRED'},400);
  await checkLoginRate(env,request,email);
  const u = await env.DB.prepare('SELECT id,password_hash,status,is_platform_admin FROM users WHERE email=? COLLATE NOCASE').bind(email).first<{id:string;password_hash:string;status:string;is_platform_admin:number}>();
  if (!u || u.status!=='active' || !(await verifyPassword(password,u.password_hash))) {
    await recordLoginFailure(env,request,email); return json({ok:false,error:'LOGIN_FAILED'},401);
  }
  await clearLoginRate(env,request,email);
  if(passwordIterations(u.password_hash)<CURRENT_ITERATIONS){
    const upgraded=await hashPassword(password);await env.DB.prepare('UPDATE users SET password_hash=?,updated_at=? WHERE id=?').bind(upgraded,nowIso(),u.id).run();
  }
  const raw=b64(randomBytes(32)),tokenHash=await sha256Text(raw),created=nowIso(),platform=!!u.is_platform_admin;
  const maxAge=platform?PLATFORM_SESSION_HOURS*3600:SESSION_DAYS*86400,expires=new Date(Date.now()+maxAge*1000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind(tokenHash,u.id,expires,created,created).run();
  const me = await sessionUser(env,u.id);
  return json({ok:true,user:me},200,{'set-cookie':cookie('kp_session',raw,maxAge)});
}

export async function logout(env: Env, request: Request): Promise<Response> {
  const raw=parseCookie(request,'kp_session'); if(raw) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256Text(raw)).run();
  return json({ok:true},200,{'set-cookie':noCookie('kp_session')});
}

export async function getSession(env: Env, request: Request): Promise<SessionUser | null> {
  const raw=parseCookie(request,'kp_session');if(!raw)return null;const hash=await sha256Text(raw);
  const row=await env.DB.prepare(`SELECT s.user_id,s.expires_at,s.last_seen_at,u.is_platform_admin,u.status
    FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?`).bind(hash).first<{user_id:string;expires_at:string;last_seen_at:string;is_platform_admin:number;status:string}>();
  const expired=!row||row.status!=='active'||Date.parse(row.expires_at)<=Date.now();
  const idleExpired=!!row?.is_platform_admin&&(Date.now()-Date.parse(row.last_seen_at)>PLATFORM_IDLE_MINUTES*60_000);
  if(expired||idleExpired){if(row)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run();return null;}
  await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').bind(nowIso(),hash).run();
  return sessionUser(env,row!.user_id);
}

export async function changePassword(env: Env, request: Request): Promise<Response> {
  const session = await getSession(env, request);
  if (!session) return json({ok:false,error:'UNAUTHENTICATED'},401);
  const body = await request.json() as {current_password?:string;new_password?:string};
  const currentPassword=String(body.current_password??''),newPassword=String(body.new_password??'');
  if(!currentPassword||!newPassword) return json({ok:false,error:'PASSWORD_FIELDS_REQUIRED'},400);
  if(currentPassword===newPassword) return json({ok:false,error:'PASSWORD_MUST_CHANGE'},400);
  const u=await env.DB.prepare("SELECT password_hash FROM users WHERE id=? AND status='active'").bind(session.userId).first<{password_hash:string}>();
  if(!u||!(await verifyPassword(currentPassword,u.password_hash))) return json({ok:false,error:'CURRENT_PASSWORD_INVALID'},403);
  const nextHash=await hashPassword(newPassword),raw=parseCookie(request,'kp_session'),currentHash=raw?await sha256Text(raw):'';
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET password_hash=?,force_password_change=0,updated_at=? WHERE id=?').bind(nextHash,nowIso(),session.userId),
    env.DB.prepare('DELETE FROM sessions WHERE user_id=? AND token_hash<>?').bind(session.userId,currentHash),
  ]);
  return json({ok:true});
}

export function authForTenant(session: SessionUser, tenantId?: string, courseId?: string): CoreAuthContext {
  if (session.isPlatformAdmin) return {userId:session.userId,role:'platform_admin',tenantIds:tenantId?[tenantId]:session.tenantRoles.map(x=>x.tenantId),courseIds:courseId?[courseId]:[],isPlatformAdmin:true,session};
  const rows = session.tenantRoles.filter(x=>(!tenantId||x.tenantId===tenantId)&&(!courseId||x.courseId===null||x.courseId===courseId));
  if (!rows.length) throw new Error('FORBIDDEN');
  const rank: Record<string,number>={tenant_admin:4,class_admin:3,participant:2,guest:1};
  const best=[...rows].sort((a,b)=>rank[b.role]-rank[a.role])[0];
  return {userId:session.userId,role:best.role,tenantIds:[best.tenantId],courseIds:rows.map(x=>x.courseId).filter((x):x is string=>!!x),isPlatformAdmin:false,session};
}

export async function resolveCoreAuth(env: Env, request: Request, tenantId?: string, courseId?: string): Promise<CoreAuthContext> {
  const s=await getSession(env,request); if(!s) throw new Error('UNAUTHENTICATED');
  if(s.mustChangePassword) throw new Error('PASSWORD_CHANGE_REQUIRED');
  return authForTenant(s,tenantId,courseId);
}

export async function resolvePortabilityAuth(env: Env, request: Request): Promise<PortabilityAuth> {
  const url=new URL(request.url); const tenantId=url.searchParams.get('tenant_id')??undefined; const a=await resolveCoreAuth(env,request,tenantId);
  return {userId:a.userId,role:a.role,tenantIds:a.tenantIds,isPlatformAdmin:a.isPlatformAdmin};
}
