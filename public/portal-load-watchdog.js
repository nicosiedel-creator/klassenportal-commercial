(()=>{
  const root=document.querySelector('#class-portal');
  if(!root)return;
  const timer=setTimeout(()=>{
    if(!root.classList.contains('portal-loading'))return;
    root.innerHTML='<div class="portal-gate"><div class="portal-gate-card"><h1>Klassenportal lädt ungewöhnlich lange</h1><p>Die Verbindung zum Portal antwortet gerade nicht rechtzeitig. Du kannst die Seite neu laden.</p><button class="portal-btn" type="button" id="portal-watchdog-reload">Neu laden</button></div></div>';
    root.querySelector('#portal-watchdog-reload')?.addEventListener('click',()=>location.reload());
  },12000);
  window.addEventListener('kp:portal-base-ready',()=>clearTimeout(timer),{once:true});
  window.addEventListener('kp:portal-base-failed',()=>clearTimeout(timer),{once:true});
})();
