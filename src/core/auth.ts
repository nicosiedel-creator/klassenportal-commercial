import type { AuthContext as PortabilityAuth } from '../portability/types.js';
import type { CoreAuthContext, Env, SessionUser } from './types.js';
import { b64, cookie, fromB64, id, json, noCookie, normalizeEmail, nowIso, parseCookie, randomBytes, sha256Text, toArrayBuffer } from './utils.js';

const ITERATIONS = 210_000;
const SESSION_DAYS = 7;

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 10 || password.length > 256) throw new Error('PASSWORD_LENGTH_INVALID');
  const salt = randomBytes(16);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:toArrayBuffer(salt), iterations:ITERATIONS }, key, 256);
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${b64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, iterText, saltText, hashText] = stored.split('$');
  if (kind !== 'pbkdf2' || !iterText || !saltText || !hashText) return false;
  const iterations = Number(iterText); if (!Number.isFinite(iterations) || iterations < 100_000) return false;
  const salt = fromB64(saltText); const expected = fromB64(hashText);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const actual = new Uint8Array(await crypto.subtle.deriveBits({ name:'PBKDF2', hash:'SHA-256', salt:toArrayBuffer(salt), iterations }, key, expected.length*8));
  if (actual.length !== expected.length) return false;
  let diff=0; for(let i=0;i<actual.length;i++) diff |= actual[i]^expected[i]; return diff===0;
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
  const u = await env.DB.prepare('SELECT id,email,display_name,is_platform_admin,status FROM users WHERE id=?').bind(userId).first<{id:string;email:string;display_name:string;is_platform_admin:number;status:string}>();
  if (!u || u.status !== 'active') return null;
  const m = await env.DB.prepare('SELECT tenant_id,course_id,role FROM memberships WHERE user_id=?').bind(userId).all<{tenant_id:string;course_id:string|null;role:SessionUser['tenantRoles'][number]['role']}>();
  return { userId:u.id,email:u.email,displayName:u.display_name,isPlatformAdmin:!!u.is_platform_admin,tenantRoles:(m.results??[]).map(x=>({tenantId:x.tenant_id,courseId:x.course_id,role:x.role})) };
}

export async function login(env: Env, request: Request): Promise<Response> {
  const body = await request.json() as {email?:string;password?:string}; const email=normalizeEmail(body.email); const password=String(body.password??'');
  if (!email || !password) return json({ok:false,error:'EMAIL_PASSWORD_REQUIRED'},400);
  await checkLoginRate(env,request,email);
  const u = await env.DB.prepare('SELECT id,password_hash,status FROM users WHERE email=? COLLATE NOCASE').bind(email).first<{id:string;password_hash:string;status:string}>();
  if (!u || u.status!=='active' || !(await verifyPassword(password,u.password_hash))) {
    await recordLoginFailure(env,request,email); return json({ok:false,error:'LOGIN_FAILED'},401);
  }
  await clearLoginRate(env,request,email);
  const raw = b64(randomBytes(32)); const tokenHash=await sha256Text(raw); const created=nowIso(); const expires=new Date(Date.now()+SESSION_DAYS*86400000).toISOString();
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at,last_seen_at) VALUES(?,?,?,?,?)').bind(tokenHash,u.id,expires,created,created).run();
  const me = await sessionUser(env,u.id);
  return json({ok:true,user:me},200,{'set-cookie':cookie('kp_session',raw,SESSION_DAYS*86400)});
}

export async function logout(env: Env, request: Request): Promise<Response> {
  const raw=parseCookie(request,'kp_session'); if(raw) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256Text(raw)).run();
  return json({ok:true},200,{'set-cookie':noCookie('kp_session')});
}

export async function getSession(env: Env, request: Request): Promise<SessionUser | null> {
  const raw=parseCookie(request,'kp_session'); if(!raw) return null; const hash=await sha256Text(raw);
  const row=await env.DB.prepare('SELECT user_id,expires_at FROM sessions WHERE token_hash=?').bind(hash).first<{user_id:string;expires_at:string}>();
  if(!row || Date.parse(row.expires_at)<=Date.now()){ if(row) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(hash).run(); return null; }
  await env.DB.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').bind(nowIso(),hash).run();
  return sessionUser(env,row.user_id);
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
  const s=await getSession(env,request); if(!s) throw new Error('UNAUTHENTICATED'); return authForTenant(s,tenantId,courseId);
}

export async function resolvePortabilityAuth(env: Env, request: Request): Promise<PortabilityAuth> {
  const url=new URL(request.url); const tenantId=url.searchParams.get('tenant_id')??undefined; const a=await resolveCoreAuth(env,request,tenantId);
  return {userId:a.userId,role:a.role,tenantIds:a.tenantIds,isPlatformAdmin:a.isPlatformAdmin};
}

export interface InitialPlatformAdminInput {
  email?: string;
  password?: string;
  display_name?: string;
}

export async function createInitialPlatformAdmin(env: Env, suppliedSecret: string, input: InitialPlatformAdminInput): Promise<{user_id:string}> {
  if(!env.BOOTSTRAP_SECRET || suppliedSecret!==env.BOOTSTRAP_SECRET) throw new Error('BOOTSTRAP_FORBIDDEN');
  const existing=await env.DB.prepare('SELECT COUNT(*) AS n FROM users WHERE is_platform_admin=1').first<{n:number}>();
  if((existing?.n??0)>0) throw new Error('PLATFORM_ADMIN_ALREADY_EXISTS');
  const email=normalizeEmail(input.email); const name=String(input.display_name??'').trim(); const password=String(input.password??'');
  if(!email||!name||!password) throw new Error('FIELDS_REQUIRED');
  const userId=id('usr_'); const ts=nowIso();
  await env.DB.prepare("INSERT INTO users(id,email,display_name,password_hash,is_platform_admin,status,created_at,updated_at) VALUES(?,?,?,?,1,'active',?,?)").bind(userId,email,name,await hashPassword(password),ts,ts).run();
  return {user_id:userId};
}

export async function bootstrapPlatformAdmin(env: Env, request: Request): Promise<Response> {
  try {
    const supplied=request.headers.get('x-bootstrap-secret')??'';
    const body=await request.json() as InitialPlatformAdminInput;
    return json({ok:true,...await createInitialPlatformAdmin(env,supplied,body)},201);
  } catch (e) {
    const code=(e as Error)?.message||'BOOTSTRAP_FAILED';
    const status=code==='BOOTSTRAP_FORBIDDEN'?403:code==='PLATFORM_ADMIN_ALREADY_EXISTS'?409:400;
    return json({ok:false,error:code},status);
  }
}
