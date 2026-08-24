import type { CoreAuthContext, Env } from './types.js';
import { audit } from './audit.js';
import { requireCourseAccess } from './permissions.js';
import { decryptTenantSecret, encryptTenantSecret, tenantSecretEncryptionReady } from './tenant-secrets.js';
import { teacherAttendanceAuth } from './teacher-portal.js';
import { b64, nowIso, randomBytes, safeString, sha256Text } from './utils.js';

const MICROSOFT_SCOPES='openid profile offline_access User.Read Calendars.ReadWrite';
const GRAPH_BASE='https://graph.microsoft.com/v1.0';
const AUTHORITY='https://login.microsoftonline.com/organizations/oauth2/v2.0';

type TokenResponse={access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;id_token?:string;error?:string;error_description?:string};
type GraphAccount={tenant_id:string;user_id:string;access_token_ciphertext:string;refresh_token_ciphertext:string;expires_at:string;status:string;scopes:string;display_name?:string|null;email?:string|null;microsoft_user_id?:string|null;microsoft_tenant_id?:string|null};
type LessonRow={id:string;tenant_id:string;course_id:string;starts_at:string;ends_at:string;subject_name?:string|null;course_name?:string|null;teacher_name?:string|null};
type MeetingRow={tenant_id:string;course_id:string;lesson_id:string;organizer_user_id:string;provider:string;external_event_id?:string|null;join_url?:string|null;web_url?:string|null;subject:string;starts_at:string;ends_at:string;status:string;last_synced_at?:string|null;updated_at:string};

function b64url(bytes:Uint8Array):string{return b64(bytes).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function pkceChallenge(verifier:string):Promise<string>{const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier)));return b64url(digest);}
function redirectUri(env:Env):string{if(env.MICROSOFT_REDIRECT_URI)return env.MICROSOFT_REDIRECT_URI;if(!env.APP_ORIGIN)throw new Error('MICROSOFT_REDIRECT_URI_REQUIRED');return `${env.APP_ORIGIN.replace(/\/$/,'')}/api/integrations/microsoft/callback`;}
function requireMicrosoftConfig(env:Env):void{if(!env.MICROSOFT_CLIENT_ID)throw new Error('MICROSOFT_CLIENT_ID_REQUIRED');if(!env.MICROSOFT_CLIENT_SECRET)throw new Error('MICROSOFT_CLIENT_SECRET_REQUIRED');if(!tenantSecretEncryptionReady(env))throw new Error('TENANT_SECRETS_ENCRYPTION_KEY_REQUIRED');redirectUri(env);}

async function requireOrganizer(env:Env,auth:CoreAuthContext,tenantId:string,courseId?:string):Promise<void>{
  if(auth.isPlatformAdmin)throw new Error('FORBIDDEN_PLATFORM_ADMIN_TENANT_INTEGRATION');
  if(auth.role==='tenant_admin')return;
  if(!courseId)throw new Error('COURSE_ID_REQUIRED');
  await teacherAttendanceAuth(env,auth,tenantId,courseId);
}

async function lesson(env:Env,tenantId:string,courseId:string,lessonId:string):Promise<LessonRow>{
  const row=await env.DB.prepare(`SELECT l.id,l.tenant_id,l.course_id,l.starts_at,l.ends_at,s.name subject_name,c.name course_name,t.name teacher_name
    FROM lessons l JOIN courses c ON c.id=l.course_id AND c.tenant_id=l.tenant_id
    LEFT JOIN subjects s ON s.id=l.subject_id AND s.tenant_id=l.tenant_id
    LEFT JOIN teachers t ON t.id=l.teacher_id AND t.tenant_id=l.tenant_id
    WHERE l.id=? AND l.tenant_id=? AND l.course_id=?`).bind(lessonId,tenantId,courseId).first<LessonRow>();
  if(!row)throw new Error('LESSON_NOT_FOUND');return row;
}
function utcDateTime(value:string):string{const d=new Date(value);if(!Number.isFinite(d.getTime()))throw new Error('LESSON_TIME_INVALID');return d.toISOString().slice(0,19);}
function meetingSubject(row:LessonRow):string{return safeString(`Unterricht: ${row.subject_name||row.course_name||'Klassenportal'}`,240);}
function accountAad(tenantId:string,userId:string,kind:'access'|'refresh'):string{return`microsoft-graph:${tenantId}:${userId}:${kind}`;}
function stateAad(tenantId:string,userId:string,stateHash:string):string{return`microsoft-oauth-state:${tenantId}:${userId}:${stateHash}`;}

export async function getMicrosoftConnectionStatus(env:Env,auth:CoreAuthContext,tenantId:string,courseId?:string){
  await requireOrganizer(env,auth,tenantId,courseId);requireMicrosoftConfig(env);
  const row=await env.DB.prepare('SELECT microsoft_tenant_id,microsoft_user_id,display_name,email,scopes,expires_at,status,updated_at FROM microsoft_graph_accounts WHERE tenant_id=? AND user_id=?').bind(tenantId,auth.userId).first<Record<string,unknown>>();
  return{configured:true,connected:row?.status==='active',account:row?{display_name:row.display_name||null,email:row.email||null,microsoft_user_id:row.microsoft_user_id||null,microsoft_tenant_id:row.microsoft_tenant_id||null,scopes:row.scopes||'',status:row.status,updated_at:row.updated_at}:null};
}

export async function startMicrosoftConnection(env:Env,auth:CoreAuthContext,tenantId:string,courseId?:string){
  await requireOrganizer(env,auth,tenantId,courseId);requireMicrosoftConfig(env);
  const state=b64url(randomBytes(32)),verifier=b64url(randomBytes(48)),stateHash=await sha256Text(state),challenge=await pkceChallenge(verifier),ts=nowIso(),expires=new Date(Date.now()+10*60_000).toISOString();
  const encrypted=await encryptTenantSecret(env,verifier,stateAad(tenantId,auth.userId,stateHash));
  await env.DB.batch([
    env.DB.prepare('DELETE FROM microsoft_oauth_states WHERE expires_at<? OR (tenant_id=? AND user_id=?)').bind(ts,tenantId,auth.userId),
    env.DB.prepare('INSERT INTO microsoft_oauth_states(state_hash,tenant_id,user_id,course_id,verifier_ciphertext,expires_at,created_at) VALUES(?,?,?,?,?,?,?)').bind(stateHash,tenantId,auth.userId,courseId||null,encrypted,expires,ts),
  ]);
  const q=new URLSearchParams({client_id:String(env.MICROSOFT_CLIENT_ID),response_type:'code',redirect_uri:redirectUri(env),response_mode:'query',scope:MICROSOFT_SCOPES,state,code_challenge:challenge,code_challenge_method:'S256',prompt:'select_account'});
  await audit(env.DB,auth.userId,'integration.microsoft.oauth_started',tenantId,courseId,'integration','microsoft_graph');
  return{authorization_url:`${AUTHORITY}/authorize?${q.toString()}`,expires_at:expires};
}

async function tokenRequest(env:Env,params:URLSearchParams):Promise<TokenResponse>{
  const r=await fetch(`${AUTHORITY}/token`,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:params.toString()});
  let data:TokenResponse={};try{data=await r.json() as TokenResponse;}catch{}
  if(!r.ok||!data.access_token){const code=data.error==='invalid_grant'?'MICROSOFT_REAUTH_REQUIRED':'MICROSOFT_TOKEN_EXCHANGE_FAILED';throw new Error(code);}return data;
}
function jwtClaim(token:string,name:string):string|null{try{const p=token.split('.')[1];if(!p)return null;const raw=atob(p.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(p.length/4)*4,'='));const obj=JSON.parse(raw) as Record<string,unknown>;return typeof obj[name]==='string'?String(obj[name]):null;}catch{return null;}}

export async function finishMicrosoftConnection(env:Env,codeRaw:string,stateRaw:string){
  requireMicrosoftConfig(env);const code=safeString(codeRaw,4000),state=safeString(stateRaw,1000);if(!code||!state)throw new Error('MICROSOFT_OAUTH_CALLBACK_INVALID');const stateHash=await sha256Text(state),ts=nowIso();
  const row=await env.DB.prepare('SELECT * FROM microsoft_oauth_states WHERE state_hash=?').bind(stateHash).first<Record<string,unknown>>();if(!row)throw new Error('MICROSOFT_OAUTH_STATE_INVALID');
  await env.DB.prepare('DELETE FROM microsoft_oauth_states WHERE state_hash=?').bind(stateHash).run();
  if(String(row.expires_at)<=ts)throw new Error('MICROSOFT_OAUTH_STATE_EXPIRED');
  const tenantId=String(row.tenant_id),userId=String(row.user_id),verifier=await decryptTenantSecret(env,String(row.verifier_ciphertext),stateAad(tenantId,userId,stateHash));
  const params=new URLSearchParams({client_id:String(env.MICROSOFT_CLIENT_ID),client_secret:String(env.MICROSOFT_CLIENT_SECRET),grant_type:'authorization_code',code,redirect_uri:redirectUri(env),scope:MICROSOFT_SCOPES,code_verifier:verifier});
  const token=await tokenRequest(env,params);if(!token.refresh_token)throw new Error('MICROSOFT_REFRESH_TOKEN_MISSING');
  const profileResponse=await fetch(`${GRAPH_BASE}/me?$select=id,displayName,mail,userPrincipalName`,{headers:{authorization:`Bearer ${token.access_token}`}});if(!profileResponse.ok)throw new Error('MICROSOFT_PROFILE_FAILED');const profile=await profileResponse.json() as Record<string,unknown>;
  const access=await encryptTenantSecret(env,String(token.access_token),accountAad(tenantId,userId,'access')),refresh=await encryptTenantSecret(env,String(token.refresh_token),accountAad(tenantId,userId,'refresh')),expires=new Date(Date.now()+Math.max(300,Number(token.expires_in||3600))*1000).toISOString(),scope=String(token.scope||MICROSOFT_SCOPES),microsoftTenant=jwtClaim(String(token.id_token||token.access_token),'tid');
  await env.DB.prepare(`INSERT INTO microsoft_graph_accounts(tenant_id,user_id,microsoft_tenant_id,microsoft_user_id,display_name,email,scopes,access_token_ciphertext,refresh_token_ciphertext,expires_at,status,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,'active',?,?) ON CONFLICT(tenant_id,user_id) DO UPDATE SET microsoft_tenant_id=excluded.microsoft_tenant_id,microsoft_user_id=excluded.microsoft_user_id,display_name=excluded.display_name,email=excluded.email,scopes=excluded.scopes,access_token_ciphertext=excluded.access_token_ciphertext,refresh_token_ciphertext=excluded.refresh_token_ciphertext,expires_at=excluded.expires_at,status='active',updated_at=excluded.updated_at`).bind(tenantId,userId,microsoftTenant,String(profile.id||''),String(profile.displayName||''),String(profile.mail||profile.userPrincipalName||''),scope,access,refresh,expires,ts,ts).run();
  await audit(env.DB,userId,'integration.microsoft.connected',tenantId,row.course_id?String(row.course_id):undefined,'integration','microsoft_graph',{microsoftTenantId:microsoftTenant});
  return{tenant_id:tenantId,course_id:row.course_id||null,connected:true};
}

async function account(env:Env,tenantId:string,userId:string):Promise<GraphAccount>{const row=await env.DB.prepare('SELECT * FROM microsoft_graph_accounts WHERE tenant_id=? AND user_id=?').bind(tenantId,userId).first<GraphAccount>();if(!row||row.status!=='active')throw new Error('MICROSOFT_ACCOUNT_NOT_CONNECTED');return row;}
async function accessToken(env:Env,tenantId:string,userId:string,force=false):Promise<string>{
  requireMicrosoftConfig(env);const row=await account(env,tenantId,userId);if(!force&&new Date(row.expires_at).getTime()>Date.now()+90_000)return decryptTenantSecret(env,row.access_token_ciphertext,accountAad(tenantId,userId,'access'));
  const refresh=await decryptTenantSecret(env,row.refresh_token_ciphertext,accountAad(tenantId,userId,'refresh')),params=new URLSearchParams({client_id:String(env.MICROSOFT_CLIENT_ID),client_secret:String(env.MICROSOFT_CLIENT_SECRET),grant_type:'refresh_token',refresh_token:refresh,scope:MICROSOFT_SCOPES});
  let token:TokenResponse;try{token=await tokenRequest(env,params);}catch(e){if(String((e as Error).message)==='MICROSOFT_REAUTH_REQUIRED')await env.DB.prepare("UPDATE microsoft_graph_accounts SET status='error',updated_at=? WHERE tenant_id=? AND user_id=?").bind(nowIso(),tenantId,userId).run();throw e;}
  const access=await encryptTenantSecret(env,String(token.access_token),accountAad(tenantId,userId,'access')),nextRefresh=token.refresh_token?await encryptTenantSecret(env,String(token.refresh_token),accountAad(tenantId,userId,'refresh')):row.refresh_token_ciphertext,expires=new Date(Date.now()+Math.max(300,Number(token.expires_in||3600))*1000).toISOString();
  await env.DB.prepare("UPDATE microsoft_graph_accounts SET access_token_ciphertext=?,refresh_token_ciphertext=?,expires_at=?,scopes=?,status='active',updated_at=? WHERE tenant_id=? AND user_id=?").bind(access,nextRefresh,expires,String(token.scope||row.scopes),nowIso(),tenantId,userId).run();return String(token.access_token);
}
async function graph(env:Env,tenantId:string,userId:string,path:string,init:RequestInit={}):Promise<Response>{let token=await accessToken(env,tenantId,userId);const call=()=>fetch(`${GRAPH_BASE}${path}`,{...init,headers:{authorization:`Bearer ${token}`,'content-type':'application/json',...(init.headers||{})}});let r=await call();if(r.status===401){token=await accessToken(env,tenantId,userId,true);r=await call();}return r;}
async function graphJson(env:Env,tenantId:string,userId:string,path:string,init:RequestInit={}):Promise<Record<string,unknown>>{const r=await graph(env,tenantId,userId,path,init);if(!r.ok)throw new Error(r.status===403?'MICROSOFT_GRAPH_PERMISSION_REQUIRED':r.status===404?'MICROSOFT_GRAPH_RESOURCE_NOT_FOUND':r.status===429?'MICROSOFT_GRAPH_RATE_LIMITED':'MICROSOFT_GRAPH_REQUEST_FAILED');if(r.status===204)return{};try{return await r.json() as Record<string,unknown>;}catch{return{};}}

export async function disconnectMicrosoftAccount(env:Env,auth:CoreAuthContext,tenantId:string,courseId?:string){await requireOrganizer(env,auth,tenantId,courseId);await env.DB.prepare('DELETE FROM microsoft_graph_accounts WHERE tenant_id=? AND user_id=?').bind(tenantId,auth.userId).run();await audit(env.DB,auth.userId,'integration.microsoft.disconnected',tenantId,courseId,'integration','microsoft_graph');return{connected:false};}

function teamsUrl(value:unknown):string{const raw=safeString(value,3000);let u:URL;try{u=new URL(raw);}catch{throw new Error('TEAMS_JOIN_URL_INVALID');}const h=u.hostname.toLowerCase();if(u.protocol!=='https:'||!(h==='teams.microsoft.com'||h.endsWith('.teams.microsoft.com')||h==='teams.live.com'||h==='teams.cloud.microsoft'||h.endsWith('.teams.cloud.microsoft')))throw new Error('TEAMS_JOIN_URL_INVALID');return u.toString();}
async function existingMeeting(env:Env,tenantId:string,lessonId:string):Promise<MeetingRow|null>{return await env.DB.prepare('SELECT * FROM lesson_online_meetings WHERE tenant_id=? AND lesson_id=?').bind(tenantId,lessonId).first<MeetingRow>()||null;}

export async function getLessonMeeting(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string){requireCourseAccess(auth,courseId);await lesson(env,tenantId,courseId,lessonId);const row=await existingMeeting(env,tenantId,lessonId);if(!row||row.course_id!==courseId||row.status!=='active'||!row.join_url)return null;return{lesson_id:row.lesson_id,provider:row.provider,join_url:row.join_url,subject:row.subject,starts_at:row.starts_at,ends_at:row.ends_at,status:row.status};}
export async function listCourseMeetings(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,from?:string,to?:string){requireCourseAccess(auth,courseId);let sql="SELECT lesson_id,provider,join_url,subject,starts_at,ends_at,status FROM lesson_online_meetings WHERE tenant_id=? AND course_id=? AND status='active' AND join_url IS NOT NULL",args:unknown[]=[tenantId,courseId];if(from){sql+=' AND starts_at>=?';args.push(safeString(from,80));}if(to){sql+=' AND starts_at<=?';args.push(safeString(to,80));}sql+=' ORDER BY starts_at LIMIT 800';return (await env.DB.prepare(sql).bind(...args).all<Record<string,unknown>>()).results??[];}

export async function createOrSyncTeamsMeeting(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string){
  await requireOrganizer(env,auth,tenantId,courseId);const l=await lesson(env,tenantId,courseId,lessonId),old=await existingMeeting(env,tenantId,lessonId);if(old?.provider==='microsoft_teams_graph'&&old.organizer_user_id!==auth.userId)throw new Error('MICROSOFT_MEETING_ORGANIZER_MISMATCH');
  const subject=meetingSubject(l),payload={subject,start:{dateTime:utcDateTime(l.starts_at),timeZone:'UTC'},end:{dateTime:utcDateTime(l.ends_at),timeZone:'UTC'},isOnlineMeeting:true,onlineMeetingProvider:'teamsForBusiness',body:{contentType:'text',content:'Online-Unterricht über das Klassenportal. Beitritt erfolgt über den im Klassenportal angezeigten Teams-Link.'}};
  let event:Record<string,unknown>;let created=false;
  if(old?.provider==='microsoft_teams_graph'&&old.external_event_id){event=await graphJson(env,tenantId,auth.userId,`/me/events/${encodeURIComponent(old.external_event_id)}`,{method:'PATCH',body:JSON.stringify(payload)});}else{event=await graphJson(env,tenantId,auth.userId,'/me/events',{method:'POST',body:JSON.stringify(payload)});created=true;}
  const eventId=String(event.id||old?.external_event_id||'');if(!eventId)throw new Error('MICROSOFT_GRAPH_EVENT_ID_MISSING');let online=event.onlineMeeting as Record<string,unknown>|undefined;let join=String(online?.joinUrl||old?.join_url||'');
  if(!join){const fresh=await graphJson(env,tenantId,auth.userId,`/me/events/${encodeURIComponent(eventId)}?$select=id,webLink,onlineMeeting`);online=fresh.onlineMeeting as Record<string,unknown>|undefined;join=String(online?.joinUrl||'');event={...event,...fresh};}
  if(!join){if(created)await graph(env,tenantId,auth.userId,`/me/events/${encodeURIComponent(eventId)}`,{method:'DELETE'}).catch(()=>null);throw new Error('MICROSOFT_TEAMS_JOIN_URL_MISSING');}
  join=teamsUrl(join);const ts=nowIso(),web=String(event.webLink||old?.web_url||'')||null;
  await env.DB.prepare(`INSERT INTO lesson_online_meetings(tenant_id,course_id,lesson_id,organizer_user_id,provider,external_event_id,join_url,web_url,subject,starts_at,ends_at,status,last_synced_at,created_by,created_at,updated_at)
    VALUES(?,?,?,?, 'microsoft_teams_graph',?,?,?,?,?,?,'active',?,?,?,?) ON CONFLICT(tenant_id,lesson_id) DO UPDATE SET course_id=excluded.course_id,organizer_user_id=excluded.organizer_user_id,provider=excluded.provider,external_event_id=excluded.external_event_id,join_url=excluded.join_url,web_url=excluded.web_url,subject=excluded.subject,starts_at=excluded.starts_at,ends_at=excluded.ends_at,status='active',last_synced_at=excluded.last_synced_at,updated_at=excluded.updated_at`).bind(tenantId,courseId,lessonId,auth.userId,eventId,join,web,subject,l.starts_at,l.ends_at,ts,auth.userId,ts,ts).run();
  await audit(env.DB,auth.userId,created?'meeting.teams.created':'meeting.teams.synced',tenantId,courseId,'lesson',lessonId,{provider:'microsoft_teams_graph'});return getLessonMeeting(env,auth,tenantId,courseId,lessonId);
}

export async function linkTeamsMeeting(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string,joinUrl:unknown){
  await requireOrganizer(env,auth,tenantId,courseId);const l=await lesson(env,tenantId,courseId,lessonId),old=await existingMeeting(env,tenantId,lessonId);if(old?.provider==='microsoft_teams_graph'&&old.status==='active')throw new Error('MICROSOFT_GRAPH_MEETING_EXISTS');const join=teamsUrl(joinUrl),subject=meetingSubject(l),ts=nowIso();
  await env.DB.prepare(`INSERT INTO lesson_online_meetings(tenant_id,course_id,lesson_id,organizer_user_id,provider,external_event_id,join_url,web_url,subject,starts_at,ends_at,status,last_synced_at,created_by,created_at,updated_at)
    VALUES(?,?,?,?, 'microsoft_teams_manual',NULL,?,NULL,?,?,?,'active',NULL,?,?,?) ON CONFLICT(tenant_id,lesson_id) DO UPDATE SET course_id=excluded.course_id,organizer_user_id=excluded.organizer_user_id,provider='microsoft_teams_manual',external_event_id=NULL,join_url=excluded.join_url,web_url=NULL,subject=excluded.subject,starts_at=excluded.starts_at,ends_at=excluded.ends_at,status='active',last_synced_at=NULL,updated_at=excluded.updated_at`).bind(tenantId,courseId,lessonId,auth.userId,join,subject,l.starts_at,l.ends_at,auth.userId,ts,ts).run();await audit(env.DB,auth.userId,'meeting.teams.linked',tenantId,courseId,'lesson',lessonId,{provider:'microsoft_teams_manual'});return getLessonMeeting(env,auth,tenantId,courseId,lessonId);
}

export async function cancelTeamsMeeting(env:Env,auth:CoreAuthContext,tenantId:string,courseId:string,lessonId:string){
  await requireOrganizer(env,auth,tenantId,courseId);await lesson(env,tenantId,courseId,lessonId);const old=await existingMeeting(env,tenantId,lessonId);if(!old||old.course_id!==courseId||old.status!=='active')throw new Error('TEAMS_MEETING_NOT_FOUND');if(old.provider==='microsoft_teams_graph'){if(old.organizer_user_id!==auth.userId)throw new Error('MICROSOFT_MEETING_ORGANIZER_MISMATCH');if(old.external_event_id){const r=await graph(env,tenantId,auth.userId,`/me/events/${encodeURIComponent(old.external_event_id)}`,{method:'DELETE'});if(!r.ok&&r.status!==404)throw new Error(r.status===403?'MICROSOFT_GRAPH_PERMISSION_REQUIRED':'MICROSOFT_GRAPH_REQUEST_FAILED');}}
  const ts=nowIso();await env.DB.prepare("UPDATE lesson_online_meetings SET status='cancelled',join_url=NULL,last_synced_at=?,updated_at=? WHERE tenant_id=? AND course_id=? AND lesson_id=?").bind(ts,ts,tenantId,courseId,lessonId).run();await audit(env.DB,auth.userId,'meeting.teams.cancelled',tenantId,courseId,'lesson',lessonId,{provider:old.provider});return{cancelled:true};
}
