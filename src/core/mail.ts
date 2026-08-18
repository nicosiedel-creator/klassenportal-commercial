import type { Env } from './types.js';
import { configuredMailProvider, assertEuSafeMail } from './data-residency.js';
import { id, safeString, sha256Text } from './utils.js';

const RESEND_API='https://api.resend.com/emails';
const BREVO_API='https://api.brevo.com/v3/smtp/email';

export function mailConfigured(env:Env):boolean{
  const provider=configuredMailProvider(env),key=provider==='brevo'?env.BREVO_API_KEY:provider==='resend'?env.RESEND_API_KEY:'';
  return !!String(key||'').trim()&&!!String(env.MAIL_FROM||'').trim()&&!!String(env.APP_ORIGIN||'').trim();
}
function senderRaw(env:Env):string{const from=safeString(env.MAIL_FROM,320);if(!from||!from.includes('@'))throw new Error('MAIL_FROM_INVALID');return from;}
function brevoSender(env:Env):{email:string;name?:string}{const raw=senderRaw(env),m=raw.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);if(m)return{email:m[2],...(m[1]?{name:m[1].replace(/^['"]|['"]$/g,'').trim()}:{} )};return{email:raw};}
function appOrigin(env:Env):string{try{const u=new URL(String(env.APP_ORIGIN||''));if(u.protocol!=='https:')throw new Error();return u.origin;}catch{throw new Error('APP_ORIGIN_INVALID');}}
export function accountActionUrl(env:Env,type:'activation'|'password_reset',token:string):string{const path=type==='activation'?'/konto-aktivieren':'/passwort-zuruecksetzen';return `${appOrigin(env)}${path}?token=${encodeURIComponent(token)}`;}
function escapeHtml(v:unknown):string{return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
async function stableUuid(seed:string):Promise<string>{const b=atob(await sha256Text(seed)),hex=[...b.slice(0,16)].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('').split('');hex[12]='4';hex[16]=(['8','9','a','b'][parseInt(hex[16],16)%4]);const h=hex.join('');return`${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;}

async function sendBrevo(env:Env,to:string,subject:string,html:string,idemKey:string):Promise<string>{
  const key=String(env.BREVO_API_KEY||'').trim();if(!key)throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');const dedupe=await stableUuid(idemKey),r=await fetch(BREVO_API,{method:'POST',headers:{'api-key':key,'content-type':'application/json',accept:'application/json','user-agent':'Klassenportal-Commercial/1.0'},body:JSON.stringify({sender:brevoSender(env),to:[{email:to}],subject,htmlContent:html,headers:{idempotencyKey:dedupe}})});let d:any={};try{d=await r.json();}catch{}if(!r.ok||!d?.messageId){const code=String(d?.code||d?.message||`HTTP_${r.status}`).toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,80);console.error('Transactional mail failed',{provider:'brevo',status:r.status,code});throw new Error(`MAIL_PROVIDER_${code||'ERROR'}`);}return String(d.messageId);
}
async function sendResend(env:Env,to:string,subject:string,text:string,html:string,idemKey:string):Promise<string>{
  const key=String(env.RESEND_API_KEY||'').trim();if(!key)throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');const r=await fetch(RESEND_API,{method:'POST',headers:{authorization:`Bearer ${key}`,'content-type':'application/json','user-agent':'Klassenportal-Commercial/1.0','idempotency-key':idemKey.slice(0,256)},body:JSON.stringify({from:senderRaw(env),to:[to],subject,text,html})});let d:any={};try{d=await r.json();}catch{}if(!r.ok||!d?.id){const code=String(d?.name||d?.error||d?.message||`HTTP_${r.status}`).toUpperCase().replace(/[^A-Z0-9]+/g,'_').slice(0,80);console.error('Transactional mail failed',{provider:'resend',status:r.status,code});throw new Error(`MAIL_PROVIDER_${code||'ERROR'}`);}return String(d.id);
}
export async function sendMail(env:Env,to:string,subject:string,text:string,html:string,idemKey?:string):Promise<string>{
  if(!mailConfigured(env))throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');assertEuSafeMail(env);const provider=configuredMailProvider(env),dedupe=(idemKey||id('mail_')).slice(0,256);if(provider==='brevo')return sendBrevo(env,to,subject,html,dedupe);if(provider==='resend')return sendResend(env,to,subject,text,html,dedupe);throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');
}
export async function sendActivationMail(env:Env,to:string,name:string,token:string):Promise<string>{const url=accountActionUrl(env,'activation',token),safeName=escapeHtml(name);return sendMail(env,to,'Dein Klassenportal-Zugang',`Hallo ${name},\n\nDein Zugang zum Klassenportal wurde angelegt. Lege über diesen sicheren Link dein persönliches Passwort fest:\n${url}\n\nDer Link ist 48 Stunden gültig. Wenn du diese Nachricht nicht erwartet hast, ignoriere sie.`,`<p>Hallo ${safeName},</p><p>Dein Zugang zum Klassenportal wurde angelegt. Lege über den folgenden sicheren Link dein persönliches Passwort fest:</p><p><a href="${escapeHtml(url)}">Zugang aktivieren</a></p><p>Der Link ist 48 Stunden gültig. Wenn du diese Nachricht nicht erwartet hast, ignoriere sie.</p>`,`activation:${to}:${token.slice(0,12)}`);}
export async function sendPasswordResetMail(env:Env,to:string,name:string,token:string):Promise<string>{const url=accountActionUrl(env,'password_reset',token),safeName=escapeHtml(name);return sendMail(env,to,'Passwort für das Klassenportal zurücksetzen',`Hallo ${name},\n\nfür deinen Klassenportal-Zugang wurde eine Passwortänderung angefordert. Verwende innerhalb von 30 Minuten diesen Link:\n${url}\n\nWenn du das nicht angefordert hast, musst du nichts tun.`,`<p>Hallo ${safeName},</p><p>Für deinen Klassenportal-Zugang wurde eine Passwortänderung angefordert.</p><p><a href="${escapeHtml(url)}">Passwort zurücksetzen</a></p><p>Der Link ist 30 Minuten gültig. Wenn du das nicht angefordert hast, musst du nichts tun.</p>`,`reset:${to}:${token.slice(0,12)}`);}
