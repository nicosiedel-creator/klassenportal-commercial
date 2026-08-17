(()=>{
  const nativeFetch=window.fetch.bind(window);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function isLogin(input,init){try{const url=typeof input==='string'?new URL(input,location.href):new URL(input.url,location.href);return url.origin===location.origin&&url.pathname==='/api/auth/login'&&String(init?.method||input?.method||'GET').toUpperCase()==='POST';}catch{return false;}}
  function safeArea(value){try{if(!value)return'';const u=new URL(value,location.origin);if(u.origin!==location.origin)return'';const p=u.pathname.replace(/\/$/,'')||'/';if(['/plattform-admin','/kunden-admin','/klassen-admin'].includes(p))return p+u.search;if(/^\/portal\/[^/]+\/[^/?#]+$/.test(p))return p+u.search;return'';}catch{return'';}}
  function requestedArea(){const query=safeArea(new URLSearchParams(location.search).get('continue')||'');if(query)return query;return safeArea(location.pathname+location.search);}
  function roleHome(user){if(user?.isPlatformAdmin)return'/plattform-admin';const roles=Array.isArray(user?.tenantRoles)?user.tenantRoles:[];if(roles.some(x=>x?.role==='tenant_admin'))return'/kunden-admin';if(roles.some(x=>x?.role==='class_admin'))return'/klassen-admin';return'';}
  function navigateAndWait(target){location.replace(target);return new Promise(()=>{});}
  async function postAuth(response,user){
    const requested=requestedArea(),area=requested||roleHome(user);
    if(user?.mustChangePassword){const target=area?`/?continue=${encodeURIComponent(area)}`:'/';return navigateAndWait(target);}
    if(requested==='/plattform-admin'&&!user?.isPlatformAdmin)return response;
    if(requested)return navigateAndWait(requested);
    if(location.pathname==='/'&&area)return navigateAndWait(area);
    return response;
  }
  async function challenge(token){
    return new Promise(resolve=>{
      const old=document.querySelector('#kp-owner-mfa-challenge');old?.remove();const back=document.createElement('div');back.id='kp-owner-mfa-challenge';back.className='modal-back';back.style.zIndex='10000';back.innerHTML=`<form class="modal" style="width:min(440px,94vw)" autocomplete="off"><h3 style="margin-top:0">Sicherheitsprüfung</h3><p class="muted">Für den Eigentümerzugang ist zusätzlich der Code aus Deiner Authenticator-App erforderlich. Alternativ funktioniert ein noch unbenutzter Wiederherstellungscode.</p><label class="field">Authenticator- oder Wiederherstellungscode<input name="code" inputmode="numeric" autocomplete="one-time-code" required autofocus></label><button class="btn" type="submit">Sicher anmelden</button><p class="error" data-error></p></form>`;document.body.append(back);const form=back.querySelector('form'),err=back.querySelector('[data-error]'),button=back.querySelector('button');
      form.onsubmit=async e=>{e.preventDefault();err.textContent='';button.disabled=true;try{const code=String(new FormData(form).get('code')||'').trim(),r=await nativeFetch('/api/auth/mfa/verify',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({challenge_token:token,code})});let d={};try{d=await r.clone().json();}catch{}if(!r.ok){const messages={MFA_CODE_INVALID:'Der Code ist ungültig oder wurde bereits verwendet.',MFA_CHALLENGE_EXPIRED:'Die Sicherheitsprüfung ist abgelaufen. Bitte erneut mit E-Mail und Passwort anmelden.',MFA_CHALLENGE_LOCKED:'Zu viele Fehlversuche. Bitte erneut mit E-Mail und Passwort anmelden.'};throw new Error(messages[d.error]||d.error||`HTTP_${r.status}`);}back.remove();resolve({response:r,data:d});}catch(x){err.textContent=x.message;form.querySelector('input').value='';form.querySelector('input').focus();button.disabled=false;}};
    });
  }
  window.fetch=async function(input,init){const r=await nativeFetch(input,init);if(!isLogin(input,init)||!r.ok)return r;let d={};try{d=await r.clone().json();}catch{return r;}if(d?.mfaRequired&&d?.challengeToken){const verified=await challenge(String(d.challengeToken));return postAuth(verified.response,verified.data?.user);}return postAuth(r,d?.user);};
})();
