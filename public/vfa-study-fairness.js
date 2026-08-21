(() => {
  const style=document.createElement('style');style.textContent='body.vfa-hide-hardest #hardestWrap{display:none!important}';document.head.appendChild(style);
  document.body.classList.add('vfa-hide-hardest');
  async function update(){
    let saved=null;try{saved=JSON.parse(localStorage.getItem('vfa-live-study-presenter')||'null');}catch{}
    if(!saved?.id){document.body.classList.add('vfa-hide-hardest');return;}
    try{
      const response=await fetch(`/api/live-study/sessions/${saved.id}/public`,{credentials:'same-origin'});const data=await response.json();
      const counts=data.counts||{},finished=data.session?.status==='closed'||(Number(counts.joined)>0&&Number(counts.submitted)>=Number(counts.joined));
      document.body.classList.toggle('vfa-hide-hardest',!finished);
    }catch{document.body.classList.add('vfa-hide-hardest');}
  }
  addEventListener('DOMContentLoaded',()=>{update();setInterval(update,1500);},{once:true});
})();
