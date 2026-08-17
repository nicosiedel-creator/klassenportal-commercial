import type { CoreAuthContext, Env } from './types.js';
import { requirePlatform } from './permissions.js';
import { audit } from './audit.js';
import { mailConfigured, sendMail } from './mail.js';
import { publishOrRotatePlatformOffer } from './platform-offer-links.js';
import { id, nowIso, safeString } from './utils.js';

function money(cents:number,currency:string):string{try{return new Intl.NumberFormat('de-DE',{style:'currency',currency}).format(Number(cents||0)/100);}catch{return `${(Number(cents||0)/100).toFixed(2)} ${currency}`;}}
function esc(v:unknown):string{return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}

export async function emailPlatformOffer(env:Env,auth:CoreAuthContext,quoteId:string,request:Request){
  requirePlatform(auth);
  if(!mailConfigured(env))throw new Error('MAIL_PROVIDER_NOT_CONFIGURED');
  const q=await env.DB.prepare(`SELECT id,quote_number,subject,offer_kind,customer_name,customer_contact_name,customer_email,currency,recurring_monthly_cents,setup_cents,first_total_cents,valid_until,status FROM commercial_quotes WHERE id=?`).bind(quoteId).first<Record<string,unknown>>();
  if(!q)throw new Error('OFFER_NOT_FOUND');if(!['draft','offered'].includes(String(q.status)))throw new Error('OFFER_EMAIL_NOT_AVAILABLE');
  const to=safeString(q.customer_email,320),contact=safeString(q.customer_contact_name,200)||safeString(q.customer_name,200);if(!to)throw new Error('CUSTOMER_EMAIL_INVALID');
  const published=await publishOrRotatePlatformOffer(env,auth,quoteId,request),url=published.publicUrl,number=String(q.quote_number),pilot=String(q.offer_kind)==='pilot',currency=String(q.currency||'EUR'),valid=new Date(String(q.valid_until)).toLocaleDateString('de-DE');
  const price=pilot?'kostenloser Pilot (0 €)':`${money(Number(q.recurring_monthly_cents||0),currency)} pro Monat${Number(q.setup_cents||0)>0?` + ${money(Number(q.setup_cents||0),currency)} einmalig`:''}`;
  const subject=`Klassenportal – ${pilot?'Pilotangebot':'Angebot'} ${number}`;
  const text=`Hallo ${contact},\n\nfür ${String(q.customer_name||'Ihren Bildungsträger')} wurde das ${pilot?'Pilotangebot':'Angebot'} ${number} erstellt.\n\nKondition: ${price}\nGültig bis: ${valid}\n\nAngebot ansehen und bei Interesse verbindlich annehmen:\n${url}\n\nAGB, Datenschutz und AVV stehen direkt im Angebot zur Verfügung. Ein kostenloser Pilot wird nicht automatisch kostenpflichtig.\n\nViele Grüße\nKlassenportal`;
  const html=`<p>Hallo ${esc(contact)},</p><p>für <strong>${esc(q.customer_name)}</strong> wurde das ${pilot?'Pilotangebot':'Angebot'} <strong>${esc(number)}</strong> erstellt.</p><p>Kondition: <strong>${esc(price)}</strong><br>Gültig bis: ${esc(valid)}</p><p><a href="${esc(url)}">Angebot ansehen und annehmen</a></p><p>AGB, Datenschutz und AVV stehen direkt im Angebot zur Verfügung.${pilot?' Der kostenlose Pilot wird nicht automatisch kostenpflichtig.':''}</p><p>Viele Grüße<br>Klassenportal</p>`;
  let mailId:string|null=null,error:string|null=null;
  try{mailId=await sendMail(env,to,subject,text,html,`offer:${quoteId}:${String(q.updated_at||nowIso())}`);}catch(e){error=String((e as Error)?.message||'MAIL_SEND_FAILED');}
  await env.DB.prepare('INSERT INTO commercial_offer_events(id,quote_id,event_type,detail_json,created_at) VALUES(?,?,?,?,?)').bind(id('ofe_'),quoteId,'published',JSON.stringify({emailed:!!mailId,mailId,error,recipient:to,rotated:true}),nowIso()).run();
  await audit(env.DB,auth.userId,mailId?'commerce.offer.emailed':'commerce.offer.email_failed',undefined,undefined,'commercial_quote',quoteId,{quoteNumber:number,recipient:to,mailId,error});
  return{sent:!!mailId,mailId,publicUrl:url,error};
}
