import type { Env } from './types.js';
import { mailConfigured, sendMail } from './mail.js';
import { safeString } from './utils.js';

function esc(v:unknown):string{return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}

export async function deliverOnboardingLinkMail(env:Env,args:{to:string;name?:string|null;quoteNumber:string;onboardingUrl:string;expiresAt:string;idemKey:string}){
  const to=safeString(args.to,320),name=safeString(args.name,200)||'Guten Tag';
  if(!to)return{sent:false,mailId:null,error:'CUSTOMER_EMAIL_INVALID'};
  if(!mailConfigured(env))return{sent:false,mailId:null,error:'MAIL_PROVIDER_NOT_CONFIGURED'};
  const expires=new Date(args.expiresAt).toLocaleDateString('de-DE');
  const subject=`Klassenportal – Einrichtung zu Angebot ${args.quoteNumber}`;
  const text=`Hallo ${name},\n\nIhr Angebot ${args.quoteNumber} wurde angenommen. Mit dem folgenden persönlichen Einrichtungslink können Sie den Bildungsträger jetzt einrichten:\n${args.onboardingUrl}\n\nDer Link ist bis ${expires} gültig. Bitte geben Sie ihn nicht an unberechtigte Personen weiter.\n\nViele Grüße\nKlassenportal`;
  const html=`<p>Hallo ${esc(name)},</p><p>Ihr Angebot <strong>${esc(args.quoteNumber)}</strong> wurde angenommen. Mit dem folgenden persönlichen Link können Sie den Bildungsträger jetzt einrichten:</p><p><a href="${esc(args.onboardingUrl)}">Klassenportal jetzt einrichten</a></p><p>Der Link ist bis ${esc(expires)} gültig. Bitte geben Sie ihn nicht an unberechtigte Personen weiter.</p><p>Viele Grüße<br>Klassenportal</p>`;
  try{const mailId=await sendMail(env,to,subject,text,html,args.idemKey);return{sent:true,mailId,error:null};}
  catch(e){return{sent:false,mailId:null,error:String((e as Error)?.message||'MAIL_SEND_FAILED')};}
}
