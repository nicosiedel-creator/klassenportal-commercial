const pathMatch=location.pathname.match(/^\/quiz\/vfa13\/([a-f0-9]{24})\/?$/);
const sessionId=pathMatch?.[1]||'';
const waiting=document.getElementById('waiting');
const quiz=document.getElementById('quiz');
const done=document.getElementById('done');
const error=document.getElementById('error');
const waitStatus=document.getElementById('waitStatus');
const questionHost=document.getElementById('questionHost');
const questionNav=document.getElementById('questionNav');
const timer=document.getElementById('timer');
const answeredText=document.getElementById('answeredText');
let participant=null;
let session=null;
let questions=[];
let answers={};
let index=0;
let pollTimer=null;
let clockTimer=null;
let submitting=false;

function storageKey(){return `vfa-live-study-participant:${sessionId}`;}
function esc(value){return String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function shuffle(items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function showOnly(id){[waiting,quiz,done,error].forEach(x=>x.classList.toggle('hidden',x.id!==id));}
function fail(message){clearInterval(pollTimer);clearInterval(clockTimer);document.getElementById('errorText').textContent=message;showOnly('error');}
async function request(path,options={}){
  const headers=new Headers(options.headers||{});if(options.method&&options.method!=='GET')headers.set('content-type','application/json');
  if(participant?.id&&participant?.token){headers.set('X-Live-Study-Participant-Id',participant.id);headers.set('X-Live-Study-Participant-Token',participant.token);}
  const response=await fetch(path,{...options,headers,credentials:'same-origin'});const data=await response.json().catch(()=>({ok:false,error:'INVALID_RESPONSE'}));if(!response.ok||!data.ok)throw new Error(data.error||`HTTP_${response.status}`);return data;
}
async function join(){
  if(!sessionId)return fail('Der Quiz-Link ist ungültig.');
  try{const saved=JSON.parse(localStorage.getItem(storageKey())||'null');if(saved?.id&&saved?.token)participant=saved;}catch{}
  try{
    const joined=await request(`/api/live-study/sessions/${sessionId}/join`,{method:'POST',body:'{}'});participant=joined.participant;session=joined.session;localStorage.setItem(storageKey(),JSON.stringify(participant));
    if(participant.submitted){waitStatus.textContent='Dieser anonyme Test wurde bereits abgegeben.';return;}
    if(session.status==='quiz')return startQuiz();
    if(session.status==='closed')return fail('Dieser Test ist bereits beendet.');
    waitStatus.textContent='Verbunden. Warte auf den gemeinsamen Start …';
    clearInterval(pollTimer);pollTimer=setInterval(checkStatus,1500);
  }catch(e){fail(e.message==='LIVE_STUDY_NOT_OPEN'?'Der QR-Code ist noch nicht freigegeben. Bitte kurz warten und neu laden.':`Verbindung fehlgeschlagen: ${e.message}`);}
}
async function checkStatus(){
  try{const data=await request(`/api/live-study/sessions/${sessionId}/public`);session=data.session;if(session.status==='quiz'){clearInterval(pollTimer);await startQuiz();}else if(session.status==='closed')fail('Der Test wurde beendet.');else waitStatus.textContent=`Verbunden. ${data.counts?.joined||0} Geräte sind bereit.`;}catch(e){if(['LIVE_STUDY_EXPIRED','LIVE_STUDY_NOT_FOUND'].includes(e.message))fail('Die Quiz-Sitzung ist nicht mehr verfügbar.');}
}
async function startQuiz(){
  try{
    const data=await request(`/api/live-study/sessions/${sessionId}/questions`);session=data.session;
    questions=shuffle(data.questions).map(q=>({...q,options:shuffle(q.options)}));
    answers={};index=0;buildNav();renderQuestion();showOnly('quiz');updateClock();clearInterval(clockTimer);clockTimer=setInterval(updateClock,1000);
  }catch(e){fail(`Test konnte nicht geladen werden: ${e.message}`);}
}
function buildNav(){questionNav.innerHTML=questions.map((_,i)=>`<button id="qnav-${i}" type="button" data-i="${i}">${i+1}</button>`).join('');questionNav.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{index=Number(b.dataset.i);renderQuestion();scrollTo({top:0,behavior:'smooth'});}));}
function renderQuestion(){
  const q=questions[index];if(!q)return;
  questionHost.innerHTML=`<article class="quiz-card"><div class="eyebrow">${esc(q.topic)} · Frage ${index+1} von ${questions.length}</div><h1>${esc(q.question)}</h1>${q.options.map((o,i)=>`<label class="option"><input type="radio" name="answer" value="${esc(o.id)}" ${answers[q.id]===o.id?'checked':''}><span><b>${'ABCD'[i]}.</b> ${esc(o.label)}</span></label>`).join('')}</article>`;
  questionHost.querySelectorAll('input[name="answer"]').forEach(input=>input.addEventListener('change',()=>{answers[q.id]=input.value;updateNav();}));
  document.getElementById('prevQuestion').disabled=index===0;document.getElementById('nextQuestion').disabled=index===questions.length-1;updateNav();
}
function updateNav(){questions.forEach((q,i)=>{const b=document.getElementById(`qnav-${i}`);if(!b)return;b.classList.toggle('answered',!!answers[q.id]);b.classList.toggle('current',i===index);});answeredText.textContent=`${Object.keys(answers).length} / ${questions.length} beantwortet`;}
function move(delta){index=Math.max(0,Math.min(questions.length-1,index+delta));renderQuestion();scrollTo({top:0,behavior:'smooth'});}
document.getElementById('prevQuestion').addEventListener('click',()=>move(-1));document.getElementById('nextQuestion').addEventListener('click',()=>move(1));document.getElementById('submit').addEventListener('click',()=>submit(false));
function remainingSeconds(){if(!session?.quizStartedAt)return 0;const end=Date.parse(session.quizStartedAt)+Number(session.durationSeconds||3600)*1000;return Math.max(0,Math.ceil((end-Date.now())/1000));}
function updateClock(){const sec=remainingSeconds();timer.textContent=`${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;if(sec<=0){clearInterval(clockTimer);submit(true);}}
async function submit(auto){
  if(submitting)return;const missing=questions.length-Object.keys(answers).length;if(!auto&&!confirm(missing?`${missing} Fragen sind noch unbeantwortet. Trotzdem endgültig abgeben?`:'Test jetzt endgültig abgeben?'))return;
  submitting=true;document.getElementById('submit').disabled=true;
  try{const data=await request(`/api/live-study/sessions/${sessionId}/submit`,{method:'POST',body:JSON.stringify({answers})});showResult(data.result);localStorage.setItem(storageKey(),JSON.stringify({...participant,submitted:true}));}
  catch(e){submitting=false;document.getElementById('submit').disabled=false;if(e.message==='LIVE_STUDY_ALREADY_SUBMITTED')fail('Dieser anonyme Test wurde bereits abgegeben.');else fail(`Abgabe fehlgeschlagen: ${e.message}`);}
}
function showResult(result){clearInterval(clockTimer);clearInterval(pollTimer);showOnly('done');document.getElementById('score').textContent=`${result.percent}%`;document.getElementById('scoreText').textContent=`${result.score} von ${result.total} Fragen richtig.`;document.getElementById('personalTopics').innerHTML=Object.entries(result.topics||{}).map(([topic,v])=>{const pct=v.total?Math.round(v.correct/v.total*100):0;return `<div class="topic-row"><b>${esc(topic)}</b><div class="bar"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>`;}).join('');}

join();
