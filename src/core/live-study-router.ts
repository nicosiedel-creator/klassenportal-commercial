import type { Env } from './types.js';
import { assertSameOrigin, authStatus, json, safeErrorCode } from './utils.js';
import { LIVE_STUDY_QUESTIONS, publicQuestion, questionMap } from './live-study-content.js';

type SessionRow={id:string;presenter_token_hash:string;title:string;status:'learning'|'lobby'|'quiz'|'closed';duration_seconds:number;quiz_started_at:string|null;created_at:string;expires_at:string};
type ParticipantRow={id:string;session_id:string;participant_token_hash:string;joined_at:string;submitted_at:string|null;score:number|null;total:number|null;topic_scores_json:string|null;wrong_question_ids_json:string|null};

let schemaReady:Promise<void>|null=null;
async function ensureLiveStudySchema(env:Env):Promise<void>{
  if(!schemaReady){
    schemaReady=(async()=>{
      const statements=[
        "CREATE TABLE IF NOT EXISTS live_study_sessions (id TEXT PRIMARY KEY,presenter_token_hash TEXT NOT NULL,title TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'learning' CHECK (status IN ('learning','lobby','quiz','closed')),duration_seconds INTEGER NOT NULL DEFAULT 3600,quiz_started_at TEXT,created_at TEXT NOT NULL,expires_at TEXT NOT NULL)",
        'CREATE INDEX IF NOT EXISTS idx_live_study_sessions_expires ON live_study_sessions(expires_at)',
        'CREATE TABLE IF NOT EXISTS live_study_participants (id TEXT PRIMARY KEY,session_id TEXT NOT NULL,participant_token_hash TEXT NOT NULL,joined_at TEXT NOT NULL,submitted_at TEXT,score INTEGER,total INTEGER,topic_scores_json TEXT,wrong_question_ids_json TEXT,FOREIGN KEY (session_id) REFERENCES live_study_sessions(id) ON DELETE CASCADE)',
        'CREATE INDEX IF NOT EXISTS idx_live_study_participants_session ON live_study_participants(session_id)',
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_live_study_participant_token ON live_study_participants(session_id, participant_token_hash)',
      ];
      for(const sql of statements)await env.DB.prepare(sql).run();
    })();
  }
  try{await schemaReady;}catch(e){schemaReady=null;throw e;}
}

function fail(e:unknown):Response{
  const code=safeErrorCode(e);
  const status=authStatus(code)??(code==='LIVE_STUDY_CAPACITY_REACHED'?429:code==='UNAUTHENTICATED'?401:code==='PLATFORM_ADMIN_REQUIRED'||code==='PRESENTER_TOKEN_INVALID'||code==='PARTICIPANT_TOKEN_INVALID'||code==='CSRF_ORIGIN_MISMATCH'?403:code.includes('NOT_FOUND')?404:code.includes('EXPIRED')?410:code.includes('ALREADY_SUBMITTED')||code.includes('NOT_OPEN')||code.includes('NOT_STARTED')||code.includes('CLOSED')||code.includes('ENDED')?409:code.includes('INVALID')||code.includes('REQUIRED')?400:500);
  return json({ok:false,error:code},status);
}
function nowIso(){return new Date().toISOString();}
function randomToken(bytes=24):string{const a=new Uint8Array(bytes);crypto.getRandomValues(a);return Array.from(a,b=>b.toString(16).padStart(2,'0')).join('');}
async function sha256(value:string):Promise<string>{const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');}
async function body(request:Request):Promise<Record<string,unknown>>{try{return await request.json() as Record<string,unknown>;}catch{return{};}}
function sameOrigin(request:Request,env:Env){assertSameOrigin(request,env.APP_ORIGIN||new URL(request.url).origin);}
async function session(env:Env,id:string):Promise<SessionRow>{const row=await env.DB.prepare('SELECT * FROM live_study_sessions WHERE id=?').bind(id).first<SessionRow>();if(!row)throw new Error('LIVE_STUDY_NOT_FOUND');if(Date.parse(row.expires_at)<=Date.now())throw new Error('LIVE_STUDY_EXPIRED');return row;}
async function presenterSession(request:Request,env:Env,id:string):Promise<SessionRow>{const s=await session(env,id),token=request.headers.get('X-Live-Study-Presenter-Token')||'';if(!token||await sha256(token)!==s.presenter_token_hash)throw new Error('PRESENTER_TOKEN_INVALID');return s;}
async function participant(request:Request,env:Env,id:string):Promise<ParticipantRow>{const pid=request.headers.get('X-Live-Study-Participant-Id')||'',token=request.headers.get('X-Live-Study-Participant-Token')||'';if(!pid||!token)throw new Error('PARTICIPANT_TOKEN_INVALID');const row=await env.DB.prepare('SELECT * FROM live_study_participants WHERE id=? AND session_id=?').bind(pid,id).first<ParticipantRow>();if(!row||await sha256(token)!==row.participant_token_hash)throw new Error('PARTICIPANT_TOKEN_INVALID');return row;}
function sessionPublic(s:SessionRow){return {id:s.id,title:s.title,status:s.status,durationSeconds:Number(s.duration_seconds||3600),quizStartedAt:s.quiz_started_at,expiresAt:s.expires_at};}
function parseObject(raw:string|null):Record<string,{correct:number;total:number}>{try{return raw?JSON.parse(raw):{};}catch{return{};}}
function parseArray(raw:string|null):string[]{try{const v=raw?JSON.parse(raw):[];return Array.isArray(v)?v.map(String):[];}catch{return[];}}

async function presenterStats(env:Env,s:SessionRow){
  const all=await env.DB.prepare('SELECT id,joined_at,submitted_at,score,total,topic_scores_json,wrong_question_ids_json FROM live_study_participants WHERE session_id=? ORDER BY joined_at').bind(s.id).all<ParticipantRow>();
  const rows=all.results||[],submitted=rows.filter(r=>!!r.submitted_at),avg=submitted.length?submitted.reduce((sum,r)=>sum+Number(r.score||0),0)/submitted.reduce((sum,r)=>sum+Number(r.total||0),0)*100:0;
  const topics:Record<string,{correct:number;total:number}>={},wrongCounts:Record<string,number>={};
  for(const r of submitted){for(const [topic,v] of Object.entries(parseObject(r.topic_scores_json))){topics[topic]??={correct:0,total:0};topics[topic].correct+=Number(v.correct||0);topics[topic].total+=Number(v.total||0);}for(const qid of parseArray(r.wrong_question_ids_json))wrongCounts[qid]=(wrongCounts[qid]||0)+1;}
  const map=questionMap();const hardest=Object.entries(wrongCounts).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([id,wrong])=>({id,wrong,question:map.get(id)?.question||id,topic:map.get(id)?.topic||''}));
  return {joined:rows.length,submitted:submitted.length,averagePercent:Math.round(avg*10)/10,topics,hardest};
}

export async function handleLiveStudyApi(request:Request,env:Env):Promise<Response|null>{
  const u=new URL(request.url);if(!u.pathname.startsWith('/api/live-study/'))return null;
  try{
    await ensureLiveStudySchema(env);
    if(u.pathname==='/api/live-study/current'&&request.method==='GET'){
      const now=nowIso();
      const current=await env.DB.prepare("SELECT * FROM live_study_sessions WHERE expires_at > ? AND status IN ('lobby','quiz') ORDER BY created_at DESC LIMIT 1").bind(now).first<SessionRow>();
      if(!current)return json({ok:true,ready:false});
      return json({ok:true,ready:true,session:sessionPublic(current),participantUrl:`${u.origin}/quiz/vfa13/${current.id}`});
    }
    if(u.pathname==='/api/live-study/sessions'&&request.method==='POST'){
      sameOrigin(request,env);
      const id=randomToken(12),presenterToken=randomToken(32),created=nowIso(),expires=new Date(Date.now()+8*60*60*1000).toISOString(),payload=await body(request),title=String(payload.title||'VFA 13 – Lernabend').slice(0,120);
      await env.DB.prepare("DELETE FROM live_study_sessions WHERE expires_at < ?").bind(created).run();
      const active=await env.DB.prepare("SELECT COUNT(*) AS count FROM live_study_sessions WHERE expires_at > ? AND status <> 'closed'").bind(created).first<{count:number}>();
      if(Number(active?.count||0)>=32)throw new Error('LIVE_STUDY_CAPACITY_REACHED');
      await env.DB.prepare("INSERT INTO live_study_sessions (id,presenter_token_hash,title,status,duration_seconds,created_at,expires_at) VALUES (?,?,?,'learning',3600,?,?)").bind(id,await sha256(presenterToken),title,created,expires).run();
      const stored=await session(env,id),participantUrl=`${u.origin}/quiz/vfa13/${id}`;return json({ok:true,session:{...sessionPublic(stored),presenterToken,participantUrl}},201);
    }
    const m=u.pathname.match(/^\/api\/live-study\/sessions\/([a-f0-9]{24})(?:\/(.*))?$/);if(!m)return json({ok:false,error:'LIVE_STUDY_NOT_FOUND'},404);const id=m[1],tail=m[2]||'';

    if(tail==='public'&&request.method==='GET'){const s=await session(env,id);const counts=await env.DB.prepare('SELECT COUNT(*) AS joined, SUM(CASE WHEN submitted_at IS NOT NULL THEN 1 ELSE 0 END) AS submitted FROM live_study_participants WHERE session_id=?').bind(id).first<{joined:number;submitted:number}>();return json({ok:true,session:sessionPublic(s),counts:{joined:Number(counts?.joined||0),submitted:Number(counts?.submitted||0)}});}

    if(tail==='join'&&request.method==='POST'){
      sameOrigin(request,env);const s=await session(env,id);if(!['lobby','quiz'].includes(s.status))throw new Error('LIVE_STUDY_NOT_OPEN');
      const existingId=request.headers.get('X-Live-Study-Participant-Id')||'',existingToken=request.headers.get('X-Live-Study-Participant-Token')||'';
      if(existingId&&existingToken){const row=await env.DB.prepare('SELECT * FROM live_study_participants WHERE id=? AND session_id=?').bind(existingId,id).first<ParticipantRow>();if(row&&await sha256(existingToken)===row.participant_token_hash)return json({ok:true,participant:{id:row.id,token:existingToken,submitted:!!row.submitted_at},session:sessionPublic(s)});}
      const participantId=randomToken(12),participantToken=randomToken(32);await env.DB.prepare('INSERT INTO live_study_participants (id,session_id,participant_token_hash,joined_at) VALUES (?,?,?,?)').bind(participantId,id,await sha256(participantToken),nowIso()).run();
      return json({ok:true,participant:{id:participantId,token:participantToken,submitted:false},session:sessionPublic(s)},201);
    }

    if(tail==='questions'&&request.method==='GET'){const s=await session(env,id);if(s.status!=='quiz')throw new Error('LIVE_STUDY_NOT_STARTED');return json({ok:true,session:sessionPublic(s),questions:LIVE_STUDY_QUESTIONS.map(publicQuestion)});}

    if(tail==='submit'&&request.method==='POST'){
      sameOrigin(request,env);const s=await session(env,id);if(s.status!=='quiz')throw new Error(s.status==='closed'?'LIVE_STUDY_CLOSED':'LIVE_STUDY_NOT_STARTED');const p=await participant(request,env,id);if(p.submitted_at)throw new Error('LIVE_STUDY_ALREADY_SUBMITTED');if(!s.quiz_started_at)throw new Error('LIVE_STUDY_NOT_STARTED');const deadline=Date.parse(s.quiz_started_at)+Number(s.duration_seconds||3600)*1000;if(Date.now()>deadline+90_000)throw new Error('LIVE_STUDY_ENDED');
      const payload=await body(request),answers=(payload.answers&&typeof payload.answers==='object'?payload.answers:{}) as Record<string,unknown>,topics:Record<string,{correct:number;total:number}>={},wrong:string[]=[];let score=0;
      for(const q of LIVE_STUDY_QUESTIONS){const selected=String(answers[q.id]||'');topics[q.topic]??={correct:0,total:0};topics[q.topic].total++;if(selected===q.correctOptionId){score++;topics[q.topic].correct++;}else wrong.push(q.id);}
      const submittedAt=nowIso();await env.DB.prepare('UPDATE live_study_participants SET submitted_at=?,score=?,total=?,topic_scores_json=?,wrong_question_ids_json=? WHERE id=? AND session_id=? AND submitted_at IS NULL').bind(submittedAt,score,LIVE_STUDY_QUESTIONS.length,JSON.stringify(topics),JSON.stringify(wrong),p.id,id).run();
      return json({ok:true,result:{score,total:LIVE_STUDY_QUESTIONS.length,percent:Math.round(score/LIVE_STUDY_QUESTIONS.length*1000)/10,topics,submittedAt}});
    }

    if(tail==='presenter'&&request.method==='GET'){const s=await presenterSession(request,env,id);return json({ok:true,session:sessionPublic(s),stats:await presenterStats(env,s)});}

    if(['lobby','start','close'].includes(tail)&&request.method==='POST'){
      sameOrigin(request,env);const s=await presenterSession(request,env,id);let next=s.status,started=s.quiz_started_at;
      if(tail==='lobby'){if(s.status==='closed')throw new Error('LIVE_STUDY_CLOSED');next='lobby';}
      if(tail==='start'){if(s.status==='closed')throw new Error('LIVE_STUDY_CLOSED');if(s.status!=='quiz'){next='quiz';started=nowIso();}}
      if(tail==='close')next='closed';
      await env.DB.prepare('UPDATE live_study_sessions SET status=?,quiz_started_at=? WHERE id=?').bind(next,started,id).run();const updated=await session(env,id);return json({ok:true,session:sessionPublic(updated),stats:await presenterStats(env,updated)});
    }

    return new Response('Methode nicht erlaubt',{status:405});
  }catch(e){return fail(e);}
}
