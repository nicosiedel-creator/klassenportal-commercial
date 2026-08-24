import type { Env } from './types.js';
import { assertEuSafeMail } from './data-residency.js';
import { id, safeString } from './utils.js';

export function mailConfigured(env:Env):boolean{
  return !!env.EMAIL&&!!String(env.MAIL_FROM||'').trim()&&!!String(env.APP_ORIGIN||'').trim();
}
function senderRaw(env:Env):string{const from=safeString(env.MAIL_FROM,320);if(!from||!from.includes('@'))throw new Error('MAIL_FROM_INVALID');return from;}
function cloudflareSender(env:Env):string|{email:string;name?:string}{const raw=senderRaw(env),m=raw.match(/^\s*(.*?)\s*<([^<>\s]+@[^<>\s]+)>\s*$/);if(m)return{email:m[2],...(m[1]?{name:m[1].replace(/^['"]|['"]$/g,'').trim()}:{} )};return raw;}
function appOrigin(env:Env):string{try{const u=new URL(String(env.APP_ORIGIN||''));if(u.protocol!=='https:')throw new Error();return u.origin;}catch{throw new Error('APP_ORIGIN_INVALID');}}
export function accountActionUrl(env:Env,type:'activation'|'password_reset',token:string):string{const path=type==='activation'?'/konto-aktivieren':'/passwort-zuruecksetzen';return `${appOrigin(env)}${path}?token=${encodeURIComponent(token)}`;}
function escapeHtml(v:unknown):string{return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}

export async function sendMail(env:Env,to:string,subject:string,text:string,html:string,idemKey?:string):Promise<string>{
  if(!mailConfigured(env))throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');
  assertEuSafeMail(env);
  const dedupe=String(idemKey||id('mail_')).slice(0,180);
  try{
    const result=await env.EMAIL!.send({to,from:cloudflareSender(env),subject,html,text,headers:{'X-Klassenportal-Message-Key':dedupe}});
    const messageId=String(result?.messageId||'').trim();
    if(!messageId)throw new Error('MAIL_PROVIDER_EMPTY_MESSAGE_ID');
    return messageId;
  }catch(error){
    const code=String((error as {code?:unknown})?.code||(error as Error)?.message||'ERROR').toUpperCase().replace(/[^A-Z0-9_]+/g,'_').slice(0,80);
    console.error('Transactional mail failed',{provider:'cloudflare-email-service',code});
    throw new Error(`MAIL_PROVIDER_${code||'ERROR'}`);
  }
}
export async function sendActivationMail(env:Env,to:string,name:string,token:string):Promise<string>{const url=accountActionUrl(env,'activation',token),safeName=escapeHtml(name);return sendMail(env,to,'Dein Klassenportal-Zugang',`Hallo ${name},\n\nDein Zugang zum Klassenportal wurde angelegt. Lege über diesen sicheren Link dein persönliches Passwort fest:\n${url}\n\nDer Link ist 48 Stunden gültig. Wenn du diese Nachricht nicht erwartet hast, ignoriere sie.`,`<p>Hallo ${safeName},</p><p>Dein Zugang zum Klassenportal wurde angelegt. Lege über den folgenden sicheren Link dein persönliches Passwort fest:</p><p><a href="${escapeHtml(url)}">Zugang aktivieren</a></p><p>Der Link ist 48 Stunden gültig. Wenn du diese Nachricht nicht erwartet hast, ignoriere sie.</p>`,`activation:${to}:${token.slice(0,12)}`);}
export async function sendPasswordResetMail(env:Env,to:string,name:string,token:string):Promise<string>{const url=accountActionUrl(env,'password_reset',token),safeName=escapeHtml(name);return sendMail(env,to,'Passwort für das Klassenportal zurücksetzen',`Hallo ${name},\n\nfür deinen Klassenportal-Zugang wurde eine Passwortänderung angefordert. Verwende innerhalb von 30 Minuten diesen Link:\n${url}\n\nWenn du das nicht angefordert hast, musst du nichts tun.`,`<p>Hallo ${safeName},</p><p>Für deinen Klassenportal-Zugang wurde eine Passwortänderung angefordert.</p><p><a href="${escapeHtml(url)}">Passwort zurücksetzen</a></p><p>Der Link ist 30 Minuten gültig. Wenn du das nicht angefordert hast, musst du nichts tun.</p>`,`reset:${to}:${token.slice(0,12)}`);}
