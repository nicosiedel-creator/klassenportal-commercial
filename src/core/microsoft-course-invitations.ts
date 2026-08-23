import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { teacherAttendanceAuth } from './teacher-portal.js';
import { decryptTenantSecret, encryptTenantSecret, tenantSecretEncryptionReady } from './tenant-secrets.js';
import { nowIso } from './utils.js';

const GRAPH_BASE='https://graph.microsoft.com/v1.0';
const AUTHORITY='https://login.microsoftonline.com/organizations/oauth2/v2.0';
const MICROSOFT_SCOPES='openid profile offline_access User.Read Calendars.ReadWrite';
type Account={access_token_ciphertext:string;refresh_token_ciphertext:string;expires_at:string;status:string;scopes:string};
type TokenResponse={access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;error?:string};

function requireConfig(env:Env){if(!env.MICROSOFT_CLIENT_ID)throw new Error('MICROSOFT_CLIENT_ID_REQUIRED');if(!env.MICROSOFT_CLIENT_SECRET)throw new Error('MICROSOFT_CLIENT_SECRET_REQUIRED');if(!tenantSecretEncryptionReady(env))throw new Error('TENANT_SECRETS_ENCRYPTION_KEY_REQUIRED');}
function aad(tenantId:string,userId:string,kind:'access'|'refresh'){return`microsoft-graph:${tenantId}:${userId}:${kind}`;}
async function account(env:Env,tenantId:string,userId:string){const row=await env.DB.prepare('SELECT access_token_ciphertext,refresh_token_ciphertext,expires_at,status,scopes FROM microsoft_graph_accounts WHERE tenant_id=? AND user_id=?').bind(tenantId,userId).first<Account>();if(!row||row.status!=='active')throw new Error('MICROSOFT_ACCOUNT_NOT_CONNECTED');return row;}
async function refreshToken(env:Env,tenantId:string,userId:string,row:Account){
  requireConfig(env);const refresh=await decryptTenantSecret(env,row.refresh_token_ciphertext,aad(tenantId,userId,'refresh'));
  const params=new URLSearchParams({client_id:String(env.MICROSOFT_CLIENT_ID),client_secret:String(env.MICROSOFT_CLIENT_SECRET),grant_type:'refresh_token',refresh_token:refresh,scope:MICROSOFT_SCOPES});
  const r=await fetch(`${AUTHORITY}/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params.toString()});let token:TokenResponse={};try{token=await r.json() as TokenResponse;}catch{}
  if(!r.ok||!token.access_token){if(token.error==='invalid_grant')await env.DB.prepare("UPDATE microsoft_graph_accounts SET status='error',updated_at=? WHERE tenant_id=? AND user_id=?").bind(nowIso(),tenantId,userId).run();throw new Error(token.error==='invalid_grant'?'MICROSOFT_REAUTH_REQUIRED':'MICROSOFT_TOKEN_EXCHANGE_FAILED');}
  const accessCipher=await encryptTenantSecret(env,String(token.access_token),aad(tenantId,userId,'access')),refreshCipher=token.refresh_token?await encryptTenantSecret(env,String(token.refresh_token),aad(tenantId,userId,'refresh')):row.refresh_token_ciphertext,expires=new Date(Date.now()+Math.max(300,Number(token.expires_in||3600))*1000).toISOString();
  await env.DB.prepare("UPDATE microsoft_graph_accounts SET access_token_ciphertext=?,refresh_token_ciphertext=?,expires_at=?,scopes=?,status='active',updated_at=? WHERE tenant_id=? AND user_id=?").bind(accessCipher,refreshCipher,expires,String(token.scope||row.scopes),nowIso(),tenantId,userId).run();return String(token.access_token);
}
async function token(env:Env,tenantId:string,userId:string,force=false){requireConfig(env);const row=await account(env,tenantId,userId);if(!force&&Date.parse(row.expires_at)>Date.now()+90_000)return decryptTenantSecret(env,row.access_token_ciphertext,aad(tenantId,userId,'access'));return refreshToken(env,tenantId,userId,row);}
async function graphPatch(env:Env,tenantId:string,userId:string,path:string,body:Record<string,unknown>){let access=await token(env,tenantId,userId);const call=()=>fetch(`${GRAPH_BASE}${path}`,{method:'PATCH',headers:{authorization:`Bearer ${access}`,'content-type':'application/json'},body:JSON.stringify(body)});let r=await call();if(r.status===401){access=await token(env,tenantId,userId,true);r=await call();}if(!r.ok)throw new Error(r.status===403?'MICROSOFT_GRAPH_PERMISSION_REQUIRED':r.status===429?'MICROSOFT_GRAPH_RATE_LIMITED':r.status===404?'MICROSOFT_GRAPH_RESOURCE_NOT_FOUND':'MICROSOFT_GRAPH_REQUEST_FAILED');}

async function courseAttendees(env:Env,tenantId:string,courseId:string){
  const result=await env.DB.prepare(`SELECT DISTINCT u.email,u.display_name
    FROM memberships m
    JOIN users u ON u.id=m.user_id AND u.status='active'
    JOIN tenant_users tu ON tu.tenant_id=m.tenant_id AND tu.user_id=m.user_id AND tu.status='active'
    WHERE m.tenant_id=? AND m.course_id=? AND m.role IN ('participant','class_admin')
    ORDER BY u.display_name,u.email LIMIT 501`).bind(tenantId,courseId).all<{email:string;display_name:string}>();
  const valid=(result.results??[]).filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(x.email||'')));
  if(valid.length>500)throw new Error('MICROSOFT_EVENT_ATTENDEE_LIMIT');
  return valid.map(x=>({emailAddress:{address:String(x.email).toLowerCase(),name:String(x.display_name||x.email)},type:'required'}));
}

export async function syncCourseMeetingAttendees(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string){
  if(auth.isPlatformAdmin)throw new Error('FORBIDDEN_PLATFORM_ADMIN_TENANT_INTEGRATION');
  if(auth.role!=='tenant_admin')await teacherAttendanceAuth(env,auth,tenantId,courseId);
  const meeting=await env.DB.prepare(`SELECT external_event_id,organizer_user_id,provider,status FROM lesson_online_meetings
    WHERE tenant_id=? AND course_id=? AND lesson_id=?`).bind(tenantId,courseId,lessonId).first<Record<string,unknown>>();
  if(!meeting||meeting.status!=='active'||meeting.provider!=='microsoft_teams_graph'||!meeting.external_event_id)throw new Error('MICROSOFT_GRAPH_MEETING_REQUIRED');
  if(String(meeting.organizer_user_id)!==auth.userId)throw new Error('MICROSOFT_MEETING_ORGANIZER_MISMATCH');
  const attendees=await courseAttendees(env,tenantId,courseId);
  if(!attendees.length){await audit(env.DB,auth.userId,'meeting.teams.class_invites_skipped',tenantId,courseId,'lesson',lessonId,{attendeeCount:0});return{invited:0,hidden_attendees:true};}
  await graphPatch(env,tenantId,auth.userId,`/me/events/${encodeURIComponent(String(meeting.external_event_id))}`,{attendees,hideAttendees:true});
  await audit(env.DB,auth.userId,'meeting.teams.class_invites_synced',tenantId,courseId,'lesson',lessonId,{attendeeCount:attendees.length,hiddenAttendees:true});
  return{invited:attendees.length,hidden_attendees:true};
}
