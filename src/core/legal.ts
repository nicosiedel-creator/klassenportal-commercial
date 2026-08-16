import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requirePlatform } from './permissions.js';
import { nowIso, safeString } from './utils.js';

type LegalRow={provider_name:string|null;legal_notice_url:string|null;privacy_url:string|null;terms_url:string|null;dpa_url:string|null;support_email:string|null;updated_by:string|null;updated_at:string};

export async function ensureLegalSchema(env:Env):Promise<void>{
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS legal_configuration (
    id INTEGER PRIMARY KEY CHECK(id=1),provider_name TEXT,legal_notice_url TEXT,privacy_url TEXT,terms_url TEXT,dpa_url TEXT,support_email TEXT,updated_by TEXT,updated_at TEXT NOT NULL)`).run();
  await env.DB.prepare('INSERT OR IGNORE INTO legal_configuration(id,updated_at) VALUES(1,?)').bind(nowIso()).run();
}
function httpsUrl(value:unknown,field:string):string{const s=safeString(value,2048);if(!s)throw new Error(`${field}_REQUIRED`);try{const u=new URL(s);if(u.protocol!=='https:'||u.username||u.password)throw new Error();return u.toString();}catch{throw new Error(`${field}_INVALID`);}}
function supportEmail(value:unknown):string{const s=safeString(value,320).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))throw new Error('SUPPORT_EMAIL_INVALID');return s;}
async function row(env:Env):Promise<LegalRow>{await ensureLegalSchema(env);return (await env.DB.prepare('SELECT provider_name,legal_notice_url,privacy_url,terms_url,dpa_url,support_email,updated_by,updated_at FROM legal_configuration WHERE id=1').first<LegalRow>())!;}
export function legalComplete(x:LegalRow):boolean{return !!x.provider_name&&!!x.legal_notice_url&&!!x.privacy_url&&!!x.terms_url&&!!x.dpa_url&&!!x.support_email;}
export async function publicLegal(env:Env){const x=await row(env);return{providerName:x.provider_name,legalNoticeUrl:x.legal_notice_url,privacyUrl:x.privacy_url,termsUrl:x.terms_url,dpaUrl:x.dpa_url,supportEmail:x.support_email,complete:legalComplete(x)};}
export async function ownerLegal(env:Env,auth:CoreAuthContext){requirePlatform(auth);return{...(await publicLegal(env)),updatedAt:(await row(env)).updated_at};}
export async function updateOwnerLegal(env:Env,auth:CoreAuthContext,input:Record<string,unknown>){
  requirePlatform(auth);const provider=safeString(input.provider_name,250);if(!provider)throw new Error('PROVIDER_NAME_REQUIRED');const legal=httpsUrl(input.legal_notice_url,'LEGAL_NOTICE_URL'),privacy=httpsUrl(input.privacy_url,'PRIVACY_URL'),terms=httpsUrl(input.terms_url,'TERMS_URL'),dpa=httpsUrl(input.dpa_url,'DPA_URL'),email=supportEmail(input.support_email),ts=nowIso();await env.DB.prepare('UPDATE legal_configuration SET provider_name=?,legal_notice_url=?,privacy_url=?,terms_url=?,dpa_url=?,support_email=?,updated_by=?,updated_at=? WHERE id=1').bind(provider,legal,privacy,terms,dpa,email,auth.userId,ts).run();await audit(env.DB,auth.userId,'platform.legal_configuration.updated',undefined,undefined,'legal_configuration','1',{providerName:provider});return ownerLegal(env,auth);
}
