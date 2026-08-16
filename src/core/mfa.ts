import type { Env } from './types.js';
import { b64, fromB64, nowIso, randomBytes, sha256Text, toArrayBuffer } from './utils.js';

const CHALLENGE_MINUTES=5;
const MAX_CHALLENGE_ATTEMPTS=5;
const TOTP_STEP=30;
const TOTP_DIGITS=6;
const RECOVERY_CODES=10;

async function ensureSchema(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS platform_mfa (
    user_id TEXT PRIMARY KEY,secret_ciphertext TEXT NOT NULL,secret_iv TEXT NOT NULL,enabled_at TEXT,last_counter INTEGER,updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS platform_mfa_recovery_codes (
    user_id TEXT NOT NULL,code_hash TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL,PRIMARY KEY(user_id,code_hash),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS platform_mfa_challenges (
    token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE)`).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_platform_mfa_challenges_expiry ON platform_mfa_challenges(expires_at)').run();
}
function encryptionKeyBytes(env:Env):Uint8Array{
  const raw=String(env.OWNER_MFA_ENCRYPTION_KEY||'').trim();if(!raw)throw new Error('MFA_ENCRYPTION_KEY_REQUIRED');
  let bytes:Uint8Array;try{bytes=fromB64(raw);}catch{throw new Error('MFA_ENCRYPTION_KEY_INVALID');}
  if(bytes.length!==32)throw new Error('MFA_ENCRYPTION_KEY_INVALID');return bytes;
}
async function aesKey(env:Env):Promise<CryptoKey>{return crypto.subtle.importKey('raw',toArrayBuffer(encryptionKeyBytes(env)),{name:'AES-GCM'},false,['encrypt','decrypt']);}
async function encryptSecret(env:Env,secret:Uint8Array):Promise<{ciphertext:string;iv:string}>{const iv=randomBytes(12),cipher=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:toArrayBuffer(iv)},await aesKey(env),toArrayBuffer(secret)));return{ciphertext:b64(cipher),iv:b64(iv)};}
async function decryptSecret(env:Env,ciphertext:string,iv:string):Promise<Uint8Array>{try{return new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:toArrayBuffer(fromB64(iv))},await aesKey(env),toArrayBuffer(fromB64(ciphertext))));}catch{throw new Error('MFA_SECRET_DECRYPT_FAILED');}}

const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes:Uint8Array):string{let bits=0,value=0,out='';for(const b of bytes){value=(value<<8)|b;bits+=8;while(bits>=5){out+=B32[(value>>>(bits-5))&31];bits-=5;}}if(bits>0)out+=B32[(value<<(5-bits))&31];return out;}
function normalizeOtp(v:unknown):string{return String(v??'').replace(/\s+/g,'').trim();}
function normalizeRecovery(v:unknown):string{return String(v??'').toUpperCase().replace(/[^A-Z0-9]/g,'');}
function dynamicTruncate(bytes:Uint8Array):number{const o=bytes[bytes.length-1]&15;return((bytes[o]&127)<<24)|((bytes[o+1]&255)<<16)|((bytes[o+2]&255)<<8)|(bytes[o+3]&255);}
async function totp(secret:Uint8Array,counter:number):Promise<string>{const msg=new Uint8Array(8);let n=BigInt(counter);for(let i=7;i>=0;i--){msg[i]=Number(n&255n);n>>=8n;}const key=await crypto.subtle.importKey('raw',toArrayBuffer(secret),{name:'HMAC',hash:'SHA-1'},false,['sign']);const sig=new Uint8Array(await crypto.subtle.sign('HMAC',key,toArrayBuffer(msg))),num=dynamicTruncate(sig)%(10**TOTP_DIGITS);return String(num).padStart(TOTP_DIGITS,'0');}
async function matchingCounter(secret:Uint8Array,code:string):Promise<number|null>{if(!/^\d{6}$/.test(code))return null;const current=Math.floor(Date.now()/1000/TOTP_STEP);for(const delta of [-1,0,1]){const c=current+delta;if(await totp(secret,c)===code)return c;}return null;}
function recoveryCode():string{const raw=base32(randomBytes(10)).slice(0,16);return`${raw.slice(0,4)}-${raw.slice(4,8)}-${raw.slice(8,12)}-${raw.slice(12,16)}`;}

export async function mfaEncryptionReady(env:Env):Promise<boolean>{try{encryptionKeyBytes(env);return true;}catch{return false;}}
export async function ownerMfaStatus(env:Env,userId:string){await ensureSchema(env);const row=await env.DB.prepare('SELECT enabled_at FROM platform_mfa WHERE user_id=?').bind(userId).first<{enabled_at:string|null}>();const recovery=Number(await env.DB.prepare('SELECT COUNT(*) AS n FROM platform_mfa_recovery_codes WHERE user_id=? AND used_at IS NULL').bind(userId).first<number>('n')||0);return{enabled:!!row?.enabled_at,enabledAt:row?.enabled_at||null,recoveryCodesRemaining:recovery,encryptionReady:await mfaEncryptionReady(env)};}
export async function ownerMfaEnabled(env:Env,userId:string):Promise<boolean>{await ensureSchema(env);return !!(await env.DB.prepare('SELECT enabled_at FROM platform_mfa WHERE user_id=? AND enabled_at IS NOT NULL').bind(userId).first());}

export async function beginOwnerMfaSetup(env:Env,userId:string,email:string){
  await ensureSchema(env);const secret=randomBytes(20),enc=await encryptSecret(env,secret),ts=nowIso();await env.DB.batch([
    env.DB.prepare(`INSERT INTO platform_mfa(user_id,secret_ciphertext,secret_iv,enabled_at,last_counter,updated_at) VALUES(?,?,?,NULL,NULL,?)
      ON CONFLICT(user_id) DO UPDATE SET secret_ciphertext=excluded.secret_ciphertext,secret_iv=excluded.secret_iv,enabled_at=NULL,last_counter=NULL,updated_at=excluded.updated_at`).bind(userId,enc.ciphertext,enc.iv,ts),
    env.DB.prepare('DELETE FROM platform_mfa_recovery_codes WHERE user_id=?').bind(userId),
  ]);const secretText=base32(secret),label=encodeURIComponent(`Klassenportal:${email}`),issuer=encodeURIComponent('Klassenportal');return{secret:secretText,otpauthUri:`otpauth://totp/${label}?secret=${secretText}&issuer=${issuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP}`};
}

export async function confirmOwnerMfaSetup(env:Env,userId:string,code:unknown){
  await ensureSchema(env);const row=await env.DB.prepare('SELECT secret_ciphertext,secret_iv,enabled_at FROM platform_mfa WHERE user_id=?').bind(userId).first<{secret_ciphertext:string;secret_iv:string;enabled_at:string|null}>();if(!row)throw new Error('MFA_SETUP_NOT_STARTED');if(row.enabled_at)throw new Error('MFA_ALREADY_ENABLED');const secret=await decryptSecret(env,row.secret_ciphertext,row.secret_iv),counter=await matchingCounter(secret,normalizeOtp(code));if(counter===null)throw new Error('MFA_CODE_INVALID');
  const codes=Array.from({length:RECOVERY_CODES},()=>recoveryCode()),ts=nowIso(),statements=[env.DB.prepare('UPDATE platform_mfa SET enabled_at=?,last_counter=?,updated_at=? WHERE user_id=?').bind(ts,counter,ts,userId),env.DB.prepare('DELETE FROM platform_mfa_recovery_codes WHERE user_id=?').bind(userId)];for(const c of codes)statements.push(env.DB.prepare('INSERT INTO platform_mfa_recovery_codes(user_id,code_hash,created_at) VALUES(?,?,?)').bind(userId,await sha256Text(normalizeRecovery(c)),ts));await env.DB.batch(statements);return{enabled:true,recoveryCodes:codes};
}

export async function disableOwnerMfa(env:Env,userId:string):Promise<void>{await ensureSchema(env);await env.DB.batch([env.DB.prepare('DELETE FROM platform_mfa_challenges WHERE user_id=?').bind(userId),env.DB.prepare('DELETE FROM platform_mfa_recovery_codes WHERE user_id=?').bind(userId),env.DB.prepare('DELETE FROM platform_mfa WHERE user_id=?').bind(userId)]);}
export async function regenerateRecoveryCodes(env:Env,userId:string):Promise<string[]>{await ensureSchema(env);if(!(await ownerMfaEnabled(env,userId)))throw new Error('MFA_NOT_ENABLED');const codes=Array.from({length:RECOVERY_CODES},()=>recoveryCode()),ts=nowIso(),statements=[env.DB.prepare('DELETE FROM platform_mfa_recovery_codes WHERE user_id=?').bind(userId)];for(const c of codes)statements.push(env.DB.prepare('INSERT INTO platform_mfa_recovery_codes(user_id,code_hash,created_at) VALUES(?,?,?)').bind(userId,await sha256Text(normalizeRecovery(c)),ts));await env.DB.batch(statements);return codes;}

export async function createMfaChallenge(env:Env,userId:string):Promise<string>{await ensureSchema(env);const raw=b64(randomBytes(32)),hash=await sha256Text(raw),now=Date.now();await env.DB.batch([env.DB.prepare('DELETE FROM platform_mfa_challenges WHERE user_id=? OR expires_at<=?').bind(userId,new Date(now).toISOString()),env.DB.prepare('INSERT INTO platform_mfa_challenges(token_hash,user_id,expires_at,attempts,created_at) VALUES(?,?,?,0,?)').bind(hash,userId,new Date(now+CHALLENGE_MINUTES*60_000).toISOString(),new Date(now).toISOString())]);return raw;}

async function consumeTotp(env:Env,userId:string,code:string):Promise<boolean>{const row=await env.DB.prepare('SELECT secret_ciphertext,secret_iv,last_counter,enabled_at FROM platform_mfa WHERE user_id=?').bind(userId).first<{secret_ciphertext:string;secret_iv:string;last_counter:number|null;enabled_at:string|null}>();if(!row?.enabled_at)return false;const secret=await decryptSecret(env,row.secret_ciphertext,row.secret_iv),counter=await matchingCounter(secret,code);if(counter===null||counter<=Number(row.last_counter??-1))return false;const result=await env.DB.prepare('UPDATE platform_mfa SET last_counter=?,updated_at=? WHERE user_id=? AND enabled_at IS NOT NULL AND (last_counter IS NULL OR last_counter<?)').bind(counter,nowIso(),userId,counter).run();return Number((result.meta as {changes?:number}|undefined)?.changes||0)===1;}
async function consumeRecovery(env:Env,userId:string,code:string):Promise<boolean>{const hash=await sha256Text(normalizeRecovery(code));const result=await env.DB.prepare('UPDATE platform_mfa_recovery_codes SET used_at=? WHERE user_id=? AND code_hash=? AND used_at IS NULL').bind(nowIso(),userId,hash).run();return Number((result.meta as {changes?:number}|undefined)?.changes||0)===1;}

export async function verifyMfaChallenge(env:Env,rawToken:unknown,codeValue:unknown):Promise<string>{
  await ensureSchema(env);const raw=String(rawToken??'');if(!raw)throw new Error('MFA_CHALLENGE_REQUIRED');const hash=await sha256Text(raw),row=await env.DB.prepare('SELECT user_id,expires_at,attempts FROM platform_mfa_challenges WHERE token_hash=?').bind(hash).first<{user_id:string;expires_at:string;attempts:number}>();if(!row||Date.parse(row.expires_at)<=Date.now()){if(row)await env.DB.prepare('DELETE FROM platform_mfa_challenges WHERE token_hash=?').bind(hash).run();throw new Error('MFA_CHALLENGE_EXPIRED');}if(row.attempts>=MAX_CHALLENGE_ATTEMPTS){await env.DB.prepare('DELETE FROM platform_mfa_challenges WHERE token_hash=?').bind(hash).run();throw new Error('MFA_CHALLENGE_LOCKED');}
  const code=normalizeOtp(codeValue),ok=/^\d{6}$/.test(code)?await consumeTotp(env,row.user_id,code):await consumeRecovery(env,row.user_id,String(codeValue??''));if(!ok){await env.DB.prepare('UPDATE platform_mfa_challenges SET attempts=attempts+1 WHERE token_hash=?').bind(hash).run();throw new Error('MFA_CODE_INVALID');}
  await env.DB.prepare('DELETE FROM platform_mfa_challenges WHERE token_hash=?').bind(hash).run();return row.user_id;
}
