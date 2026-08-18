import type { Env } from './types.js';
import { ensureLegalDocumentSchema } from './legal-schema.js';
import { publicLegal } from './legal.js';
import { mailConfigured, sendMail } from './mail.js';
import { assertSameOrigin, id, nowIso, safeString, sha256Text } from './utils.js';

function html(v:unknown){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));}
function validEmail(v:string){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);}
async function rateLimit(env:Env,request:Request){
  await ensureLegalDocumentSchema(env);await env.DB.prepare(`CREATE TABLE IF NOT EXISTS legal_content_report_limits (key_hash TEXT PRIMARY KEY,window_started_at TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0)`).run();
  const ip=request.headers.get('CF-Connecting-IP')||'unknown',key=await sha256Text(`legal-report:${ip}`),now=Date.now(),windowStart=new Date(now-3600_000).toISOString(),row=await env.DB.prepare('SELECT window_started_at,attempts FROM legal_content_report_limits WHERE key_hash=?').bind(key).first<{window_started_at:string;attempts:number}>();
  if(!row||row.window_started_at<windowStart){await env.DB.prepare('INSERT INTO legal_content_report_limits(key_hash,window_started_at,attempts) VALUES(?,?,1) ON CONFLICT(key_hash) DO UPDATE SET window_started_at=excluded.window_started_at,attempts=1').bind(key,new Date(now).toISOString()).run();return;}
  if(Number(row.attempts)>=5)throw new Error('LEGAL_REPORT_RATE_LIMITED');await env.DB.prepare('UPDATE legal_content_report_limits SET attempts=attempts+1 WHERE key_hash=?').bind(key).run();
}
export async function submitLegalContentReport(env:Env,request:Request){
  assertSameOrigin(request,env.APP_ORIGIN);await rateLimit(env,request);const b=await request.json().catch(()=>({})) as Record<string,unknown>,name=safeString(b.reporter_name,200),email=safeString(b.reporter_email,320).toLowerCase(),url=safeString(b.affected_url,2048),description=safeString(b.description,8000),reason=safeString(b.legal_reason,1000)||null,good=b.good_faith===true;
  if(!name||!validEmail(email)||!url||!description||!good)throw new Error('LEGAL_REPORT_FIELDS_REQUIRED');try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))throw new Error();}catch{throw new Error('AFFECTED_URL_INVALID');}
  const reportId=id('rep_'),ts=nowIso();await env.DB.prepare("INSERT INTO legal_content_reports(id,reporter_name,reporter_email,affected_url,description,legal_reason,good_faith,status,created_at,updated_at) VALUES(?,?,?,?,?,?,1,'received',?,?)").bind(reportId,name,email,url,description,reason,ts,ts).run();
  const legal=await publicLegal(env),target=legal.dsaContactEmail||legal.supportEmail;
  if(target&&mailConfigured(env)){
    const text=`Neue Meldung zu möglicherweise rechtswidrigem Inhalt\n\nVorgang: ${reportId}\nMeldende Person: ${name} <${email}>\nURL: ${url}\nRechtlicher Grund: ${reason||'nicht angegeben'}\n\nBeschreibung:\n${description}`;
    await sendMail(env,String(target),`Klassenportal: Rechtsverstoß-Meldung ${reportId}`,text,`<p><strong>Neue Meldung zu möglicherweise rechtswidrigem Inhalt</strong></p><p>Vorgang: ${html(reportId)}<br>Meldende Person: ${html(name)} &lt;${html(email)}&gt;<br>URL: ${html(url)}<br>Rechtlicher Grund: ${html(reason||'nicht angegeben')}</p><p>${html(description).replace(/\n/g,'<br>')}</p>`,`legal-report:${reportId}`).catch(()=>undefined);
    await sendMail(env,email,`Eingangsbestätigung ${reportId}`,`Wir haben deine Meldung erhalten. Vorgangsnummer: ${reportId}.`, `<p>Wir haben deine Meldung erhalten.</p><p>Vorgangsnummer: <strong>${html(reportId)}</strong></p><p>Die Meldung wird geprüft.</p>`,`legal-report-ack:${reportId}`).catch(()=>undefined);
  }
  return{reportId,status:'received'};
}
