import type { Env } from './types.js';
import { b64, fromB64, randomBytes } from './utils.js';

async function key(env:Env):Promise<CryptoKey>{
  const raw=env.TENANT_SECRETS_ENCRYPTION_KEY;if(!raw)throw new Error('TENANT_SECRETS_ENCRYPTION_KEY_REQUIRED');let bytes:Uint8Array;try{bytes=fromB64(raw);}catch{throw new Error('TENANT_SECRETS_ENCRYPTION_KEY_INVALID');}if(bytes.length!==32)throw new Error('TENANT_SECRETS_ENCRYPTION_KEY_INVALID');return crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt']);
}
export async function encryptTenantSecret(env:Env,value:string,aad:string):Promise<string>{const iv=randomBytes(12),data=new TextEncoder().encode(value),additionalData=new TextEncoder().encode(aad),out=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData},await key(env),data);return`v1.${b64(iv)}.${b64(new Uint8Array(out))}`;}
export async function decryptTenantSecret(env:Env,value:string,aad:string):Promise<string>{const [version,ivText,cipherText]=String(value||'').split('.');if(version!=='v1'||!ivText||!cipherText)throw new Error('TENANT_SECRET_FORMAT_INVALID');const additionalData=new TextEncoder().encode(aad),plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:fromB64(ivText),additionalData},await key(env),fromB64(cipherText));return new TextDecoder().decode(plain);}
export function tenantSecretEncryptionReady(env:Env):boolean{try{return !!env.TENANT_SECRETS_ENCRYPTION_KEY&&fromB64(env.TENANT_SECRETS_ENCRYPTION_KEY).length===32;}catch{return false;}}
