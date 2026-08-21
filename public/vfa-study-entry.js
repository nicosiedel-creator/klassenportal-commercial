const statusEl=document.getElementById('status');
const titleEl=document.getElementById('title');
const spinner=document.getElementById('spinner');
const retry=document.getElementById('retry');
let timer=null;

async function check(){
  try{
    const r=await fetch('/api/live-study/current',{headers:{accept:'application/json'},cache:'no-store'});
    const d=await r.json();
    if(r.ok&&d.ok&&d.ready&&d.participantUrl){
      titleEl.textContent='Quiz ist bereit';
      statusEl.textContent='Du wirst jetzt weitergeleitet …';
      location.replace(d.participantUrl);
      return;
    }
    titleEl.textContent='Quiz wird vorbereitet';
    statusEl.textContent='Noch nicht freigegeben. Sobald der QR-Quiz-Bildschirm am Beamer aktiv ist, geht es hier automatisch weiter.';
    spinner.classList.remove('hidden');
    retry.classList.add('hidden');
  }catch{
    titleEl.textContent='Verbindung unterbrochen';
    statusEl.textContent='Kurz warten – wir versuchen es automatisch erneut.';
    spinner.classList.remove('hidden');
  }
  clearTimeout(timer);
  timer=setTimeout(check,2000);
}

retry.addEventListener('click',check);
check();
