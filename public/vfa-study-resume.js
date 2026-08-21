(() => {
  let saved=null;
  try{saved=JSON.parse(localStorage.getItem('vfa-live-study-presenter')||'null');}catch{}
  if(!saved?.id||!saved?.token||!saved?.url)return;

  const api=async(path,options={})=>{
    const headers=new Headers(options.headers||{});headers.set('content-type','application/json');headers.set('X-Live-Study-Presenter-Token',saved.token);
    const response=await fetch(path,{...options,headers,credentials:'same-origin'});const data=await response.json().catch(()=>({ok:false,error:'INVALID_RESPONSE'}));
    if(!response.ok||!data.ok)throw new Error(data.error||`HTTP_${response.status}`);return data;
  };
  const esc=value=>String(value??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const remaining=s=>{if(!s.quizStartedAt)return '–';const end=Date.parse(s.quizStartedAt)+Number(s.durationSeconds||3600)*1000,sec=Math.max(0,Math.ceil((end-Date.now())/1000));return `${String(Math.floor(sec/60)).padStart(2,'0')}:${String(sec%60).padStart(2,'0')}`;};

  function render(data){
    const s=data.session,st=data.stats;
    document.getElementById('deck')?.classList.add('hidden');document.getElementById('controls')?.classList.add('hidden');document.getElementById('lobby')?.classList.remove('hidden');
    document.getElementById('quizUrl').textContent=saved.url;
    const qr=document.getElementById('qr');if(qr&&!qr.src){qr.src=`https://quickchart.io/qr?size=500&margin=2&text=${encodeURIComponent(saved.url)}`;qr.onerror=()=>{qr.classList.add('hidden');document.getElementById('lobbyMessage').textContent='QR-Code konnte nicht geladen werden. Bitte den Direktlink verwenden.';};}
    document.getElementById('joined').textContent=st.joined;document.getElementById('submitted').textContent=st.submitted;document.getElementById('average').textContent=st.submitted?`${st.averagePercent}%`:'–';document.getElementById('remaining').textContent=s.status==='quiz'?remaining(s):(s.status==='closed'?'00:00':'–');
    const start=document.getElementById('startQuiz'),close=document.getElementById('closeQuiz');start.classList.toggle('hidden',s.status==='quiz'||s.status==='closed');close.classList.toggle('hidden',s.status!=='quiz');
    document.getElementById('liveTitle').textContent=s.status==='lobby'?'Warte auf Teilnehmer …':s.status==='quiz'?'Test läuft – Ergebnisse kommen live rein':s.status==='closed'?'Test beendet – Gruppenauswertung':'Lernphase';
    document.getElementById('topicStats').innerHTML=Object.entries(st.topics||{}).map(([topic,v])=>{const pct=v.total?Math.round(v.correct/v.total*100):0;return `<div class="topic-row"><b>${esc(topic)}</b><div class="bar"><i style="width:${pct}%"></i></div><span>${pct}%</span></div>`;}).join('');
    const wrap=document.getElementById('hardestWrap'),list=document.getElementById('hardest');if(st.hardest?.length){wrap.classList.remove('hidden');list.innerHTML=st.hardest.map(x=>`<li><b>${esc(x.topic)}</b>: ${esc(x.question)} <span class="muted">(${x.wrong}× falsch)</span></li>`).join('');}else wrap.classList.add('hidden');
    document.getElementById('lobbyMessage').textContent=s.status==='lobby'?`${st.joined} Gerät${st.joined===1?'':'e'} verbunden. Starte erst, wenn alle bereit sind.`:s.status==='quiz'?'Alle Teilnehmer haben denselben serverseitigen 60-Minuten-Zeitraum.':s.status==='closed'?'Die anonymisierte Auswertung bleibt auf diesem Bildschirm sichtbar.':'';
  }

  async function poll(){try{render(await api(`/api/live-study/sessions/${saved.id}/presenter`));}catch(e){if(['LIVE_STUDY_EXPIRED','LIVE_STUDY_NOT_FOUND','PRESENTER_TOKEN_INVALID'].includes(e.message)){localStorage.removeItem('vfa-live-study-presenter');location.reload();}}}
  async function start(){const b=document.getElementById('startQuiz');b.disabled=true;try{render(await api(`/api/live-study/sessions/${saved.id}/start`,{method:'POST',body:'{}'}));}catch(e){b.disabled=false;document.getElementById('lobbyMessage').textContent=`Start fehlgeschlagen: ${e.message}`;}}
  async function close(){if(!confirm('Test wirklich für alle beenden?'))return;try{render(await api(`/api/live-study/sessions/${saved.id}/close`,{method:'POST',body:'{}'}));}catch(e){document.getElementById('lobbyMessage').textContent=`Beenden fehlgeschlagen: ${e.message}`;}}

  addEventListener('DOMContentLoaded',async()=>{
    try{const first=await api(`/api/live-study/sessions/${saved.id}/presenter`);render(first);document.getElementById('startQuiz').onclick=start;document.getElementById('closeQuiz').onclick=close;setInterval(poll,2000);}catch(e){if(['LIVE_STUDY_EXPIRED','LIVE_STUDY_NOT_FOUND','PRESENTER_TOKEN_INVALID'].includes(e.message))localStorage.removeItem('vfa-live-study-presenter');}
  },{once:true});
})();
