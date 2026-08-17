const OFFER_MAIL_PATH=location.pathname.replace(/\/$/,'')==='/plattform-admin';
if(OFFER_MAIL_PATH){
  async function api(url,opt={}){const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{...(opt.body?{'content-type':'application/json'}:{}),...(opt.headers||{})}});let d={};try{d=await r.json();}catch{}if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);return d;}
  function copy(url){navigator.clipboard?.writeText(url).then(()=>{}).catch(()=>{});}
  function enhance(){
    document.querySelectorAll('tr').forEach(row=>{
      const detail=row.querySelector('button[data-detail]');if(!detail||row.querySelector('[data-email-offer]'))return;
      const text=row.textContent||'';if(!/Entwurf|Versendet\/Freigegeben/.test(text))return;
      const b=document.createElement('button');b.className='btn secondary';b.type='button';b.dataset.emailOffer=detail.dataset.detail||'';b.textContent='Per E-Mail senden';detail.insertAdjacentElement('afterend',b);
      b.onclick=async()=>{if(!confirm('Angebot an die im Angebot hinterlegte Kunden-E-Mail senden? Dabei wird aus Sicherheitsgründen ein neuer Angebotslink erzeugt.'))return;b.disabled=true;try{const d=await api(`/api/platform/offers/${encodeURIComponent(b.dataset.emailOffer)}/email`,{method:'POST',body:'{}'});if(d.publicUrl)copy(d.publicUrl);if(d.sent)alert('Angebot wurde per E-Mail versendet. Der neue Angebotslink wurde zusätzlich in die Zwischenablage kopiert.');else alert(`E-Mail konnte nicht versendet werden. Der Angebotslink ist trotzdem gültig und wurde kopiert. Fehler: ${d.error||'MAIL_SEND_FAILED'}`);}catch(e){alert(({MAIL_PROVIDER_NOT_CONFIGURED:'Transaktions-E-Mail ist noch nicht eingerichtet. Nutze bis dahin „Freigeben“ und sende den kopierten Angebotslink manuell.',LEGAL_CONFIGURATION_INCOMPLETE:'Rechtliche Unterlagen müssen vor dem Versand veröffentlicht sein.',SELLER_PROFILE_INCOMPLETE:'Die Anbieter-/Impressumsdaten sind noch unvollständig.'})[e.message]||e.message);}finally{b.disabled=false;}};
    });
  }
  new MutationObserver(()=>queueMicrotask(enhance)).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});enhance();
}
