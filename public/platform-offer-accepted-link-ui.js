const OFFER_REISSUE_PATH=location.pathname.replace(/\/$/,'')==='/plattform-admin';
if(OFFER_REISSUE_PATH){
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
  function copy(url){navigator.clipboard?.writeText(url).then(()=>alert('Neuer Einrichtungslink wurde kopiert.')).catch(()=>prompt('Einrichtungslink kopieren:',url));}
  function enhance(){
    document.querySelectorAll('tr').forEach(row=>{
      if(!/Angenommen/.test(row.textContent||''))return;
      const detail=row.querySelector('button[data-detail]');if(!detail||row.querySelector('[data-reissue-onboarding]'))return;
      const b=document.createElement('button');b.className='btn secondary';b.type='button';b.dataset.reissueOnboarding=detail.dataset.detail||'';b.textContent='Einrichtungslink neu';detail.insertAdjacentElement('afterend',b);
      b.onclick=async()=>{if(!confirm('Neuen Einrichtungslink erzeugen? Ein noch offener vorheriger Link wird ungültig.'))return;b.disabled=true;try{const d=await api(`/api/platform/offers/${encodeURIComponent(b.dataset.reissueOnboarding)}/onboarding-link`,{method:'POST',body:'{}'});copy(d.onboardingUrl);}catch(e){alert(({OFFER_ONBOARDING_ALREADY_COMPLETED:'Die Einrichtung wurde bereits abgeschlossen.',OFFER_NOT_ACCEPTED:'Das Angebot ist noch nicht angenommen.'})[e.message]||(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(e):e.message));}finally{b.disabled=false;}};
    });
  }
  new MutationObserver(()=>queueMicrotask(enhance)).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});enhance();
}
