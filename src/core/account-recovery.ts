import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { hashPassword } from './auth.js';
import { mailConfigured, sendActivationMail, sendPasswordResetMail } from './mail.js';
import { b64, id, normalizeEmail, nowIso, randomBytes, sha256Text } from './utils.js';

const RESET_MINUTES=30;
const ACTIVATION_HOURS=48;
const RATE_WINDOW_MINUTES=15;
const RATE_LIMIT=3;

export async function ensureAccountActionSchema(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS account_action_tokens (
    id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token_hash TEXT NOT NULL UNIQUE,type TEXT NOT NULL CHECK(type IN ('activation','password_reset')),
    expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL,created_by TEXT,FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_account_action_tokens_user ON account_action_tokens(user_id,type,expires_at)').run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS account_action_rate_limits (key_hash TEXT PRIMARY KEY,window_started_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0)`).run();
}
function token():string{return b64(randomBytes(32)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function rateKey(request:Request,email:string):Promise<string>{const ip=request.headers.get('CF-Connecting-IP')||'unknown';return sha256Text(`account-action|${ip}|${email}`);}
async function allowed(env:Env,request:Request,email:string):Promise<boolean>{await ensureAccountActionSchema(env);const key=await rateKey(request,email),row=await env.DB.prepare('SELECT window_started_at,attempts FROM account_action_rate_limits WHERE key_hash=?').bind(key).first<{window_started_at:string;attempts:number}>(),now=Date.now();if(!row||now-Date.parse(row.window_started_at)>=RATE_WINDOW_MINUTES*60_000){await env.DB.prepare('INSERT OR REPLACE INTO account_action_rate_limits(key_hash,window_started_at,attempts) VALUES(?,?,1)').bind(key,nowIso()).run();return true;}if(row.attempts>=RATE_LIMIT)return false;await env.DB.prepare('UPDATE account_action_rate_limits SET attempts=attempts+1 WHERE key_hash=?').bind(key).run();return true;}
async function issue(env:Env,userId:string,type:'activation'|'password_reset',createdBy?:string):Promise<string>{await ensureAccountActionSchema(env);const raw=token(),hash=await sha256Text(raw),now=Date.now(),expires=new Date(now+(type==='activation'?ACTIVATION_HOURS*3600_000:RESET_MINUTES*60_000)).toISOString(),ts=new Date(now).toISOString();await env.DB.batch([env.DB.prepare('UPDATE account_action_tokens SET used_at=? WHERE user_id=? AND type=? AND used_at IS NULL').bind(ts,userId,type),env.DB.prepare('INSERT INTO account_action_tokens(id,user_id,token_hash,type,expires_at,created_at,created_by) VALUES(?,?,?,?,?,?,?)').bind(id('aat_'),userId,hash,type,expires,ts,createdBy||null)]);return raw;}
async function lookup(env:Env,raw:unknown,type:'activation'|'password_reset'){await ensureAccountActionSchema(env);const t=String(raw??'');if(t.length<32)throw new Error('ACCOUNT_TOKEN_INVALID');const hash=await sha256Text(t),row=await env.DB.prepare(`SELECT a.id,a.user_id,a.expires_at,a.used_at,u.email,u.display_name,u.status FROM account_action_tokens a JOIN users u ON u.id=a.user_id WHERE a.token_hash=? AND a.type=?`).bind(hash,type).first<Record<string,unknown>>();if(!row||row.used_at)throw new Error('ACCOUNT_TOKEN_INVALID');if(Date.parse(String(row.expires_at))<=Date.now())throw new Error('ACCOUNT_TOKEN_EXPIRED');if(String(row.status)!=='active')throw new Error('ACCOUNT_TOKEN_INVALID');return row;}
async function nonOwnerUser(env:Env,userId:string){const u=await env.DB.prepare("SELECT email,display_name,status,is_platform_admin FROM users WHERE id=?").bind(userId).first<{email:string;display_name:string;status:string;is_platform_admin:number}>();if(!u||u.status!=='active'||u.is_platform_admin===1)throw new Error('USER_NOT_FOUND');return u;}

export async function createActivationForUser(env:Env,auth:CoreAuthContext,userId:string):Promise<{sent:true}>{if(!mailConfigured(env))throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');const u=await nonOwnerUser(env,userId),raw=await issue(env,userId,'activation',auth.userId);await sendActivationMail(env,u.email,u.display_name,raw);await audit(env.DB,auth.userId,'user.activation_sent',undefined,undefined,'user',userId);return{sent:true};}
export async function createAdminPasswordReset(env:Env,auth:CoreAuthContext,userId:string):Promise<{sent:true;sessionsRevoked:true}>{if(!mailConfigured(env))throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');const u=await nonOwnerUser(env,userId);await env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(userId).run();const raw=await issue(env,userId,'password_reset',auth.userId);await sendPasswordResetMail(env,u.email,u.display_name,raw);await audit(env.DB,auth.userId,'user.password_reset_link_sent',undefined,undefined,'user',userId,{sessionsRevoked:true});return{sent:true,sessionsRevoked:true};}

export async function requestPasswordReset(env:Env,request:Request,emailInput:unknown):Promise<{accepted:true}>{
  const email=normalizeEmail(emailInput);if(!email)return{accepted:true};if(!(await allowed(env,request,email)))return{accepted:true};const u=await env.DB.prepare("SELECT id,email,display_name,is_platform_admin,status FROM users WHERE email=? COLLATE NOCASE").bind(email).first<{id:string;email:string;display_name:string;is_platform_admin:number;status:string}>();
  if(!u||u.status!=='active'||u.is_platform_admin===1)return{accepted:true};if(!mailConfigured(env)){console.error('Password reset requested while mail provider is not configured');return{accepted:true};}
  const raw=await issue(env,u.id,'password_reset');try{await sendPasswordResetMail(env,u.email,u.display_name,raw);}catch(e){console.error('Password reset mail delivery failed',{error:String((e as Error)?.message||e)});}return{accepted:true};
}

export async function inspectAccountToken(env:Env,raw:unknown,type:'activation'|'password_reset'){const row=await lookup(env,raw,type);return{valid:true,displayName:String(row.display_name),emailHint:String(row.email).replace(/^(.{1,2}).*(@.*)$/,'$1••••$2')};}
export async function consumeAccountToken(env:Env,raw:unknown,type:'activation'|'password_reset',newPassword:unknown):Promise<{completed:true}>{const row=await lookup(env,raw,type),password=String(newPassword??'');const hash=await hashPassword(password),ts=nowIso();await env.DB.batch([env.DB.prepare('UPDATE account_action_tokens SET used_at=? WHERE id=? AND used_at IS NULL').bind(ts,row.id),env.DB.prepare('UPDATE users SET password_hash=?,force_password_change=0,updated_at=? WHERE id=?').bind(hash,ts,row.user_id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(row.user_id),env.DB.prepare('UPDATE account_action_tokens SET used_at=? WHERE user_id=? AND used_at IS NULL').bind(ts,row.user_id)]);return{completed:true};}

export async function cleanupAccountActions(env:Env):Promise<void>{await ensureAccountActionSchema(env);const now=Date.now();await env.DB.batch([env.DB.prepare('DELETE FROM account_action_tokens WHERE expires_at<=? OR (used_at IS NOT NULL AND used_at<=?)').bind(new Date(now).toISOString(),new Date(now-7*86400_000).toISOString()),env.DB.prepare('DELETE FROM account_action_rate_limits WHERE window_started_at<=?').bind(new Date(now-24*3600_000).toISOString())]);}
