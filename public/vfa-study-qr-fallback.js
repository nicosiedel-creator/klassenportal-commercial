addEventListener('DOMContentLoaded',()=>{
  const qr=document.getElementById('qr');if(!qr)return;
  qr.addEventListener('error',()=>{
    qr.classList.add('hidden');
    const message=document.getElementById('lobbyMessage');
    if(message)message.textContent='QR-Code konnte nicht geladen werden. Bitte den darunter angezeigten Direktlink verwenden.';
  });
},{once:true});
