const PLATFORM_DIRECT_PATH=location.pathname.replace(/\/$/,'')==='/plattform-admin';

if(PLATFORM_DIRECT_PATH){
  const root=document.querySelector('#app');
  let loading=false;

  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function json(url,opt={}){
    const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});
    let d={};try{d=await r.clone().json();}catch{}
    return{r,d};
  }
  async function currentUser(){const {r,d}=await json('/api/auth/me');return r.ok?(d.user||null):null;}
  async function logout(){try{await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'});}catch{}}

  function renderLogin(message=''){
    root.innerHTML=`<main class="center"><form class="login" id="platform-login" autocomplete="on"><div class="brand">Klassenportal · Plattform-Admin</div><p class="muted">Direkte Anmeldung für die Plattformverwaltung.</p><label class="field">E-Mail<input name="email" type="email" autocomplete="username" required autofocus></label><label class="field">Passwort<input name="password" type="password" autocomplete="current-password" required></label><button class="btn" type="submit">Anmelden</button><a href="/passwort-vergessen" style="display:inline-block;margin-top:12px">Passwort vergessen?</a><p class="error" id="platform-login-error">${esc(message)}</p></form></main>`;
    const form=root.querySelector('#platform-login'),err=root.querySelector('#platform-login-error'),button=form.querySelector('button');
    form.onsubmit=async e=>{
      e.preventDefault();err.textContent='';button.disabled=true;
      try{
        const f=new FormData(form),email=String(f.get('email')||'').trim(),password=String(f.get('password')||'');
        const {r,d}=await json('/api/auth/login',{method:'POST',body:JSON.stringify({email,password})});
        if(!r.ok){const messages={LOGIN_FAILED:'E-Mail oder Passwort ist nicht korrekt.',LOGIN_RATE_LIMITED:'Zu viele Anmeldeversuche. Bitte später erneut versuchen.'};throw new Error(messages[d.error]||d.error||`HTTP_${r.status}`);}
        if(!d?.user?.isPlatformAdmin){await logout();throw new Error('Dieses Konto hat keinen Plattform-Admin-Zugang.');}
        location.reload();
      }catch(x){err.textContent=(window.KP_ERROR_TEXT?window.KP_ERROR_TEXT(x):x.message)||'Anmeldung fehlgeschlagen.';button.disabled=false;}
    };
  }

  async function loadPlatform(){
    if(loading)return;loading=true;
    root.innerHTML='<main class="center"><div class="loader">Plattform-Admin wird geladen …</div></main>';
    // Keep first paint deliberately small. localization.js is already loaded by
    // platform-admin.html; importing another query-string variant used to create
    // a second independent localization runtime and another document observer.
    await import('/boot.js?v=20260822-platform-perf-1');
    await Promise.all([
      import('/platform-admin-ui.js?v=20260822-platform-perf-1'),
      import('/platform-admin-i18n.js?v=20260822-platform-perf-1'),
      import('/platform-admin-lazy-modules.js?v=20260822-platform-perf-1')
    ]);
  }

  try{
    const user=await currentUser();
    if(user?.isPlatformAdmin)await loadPlatform();
    else{
      if(user)await logout();
      renderLogin(user?'Bitte melde Dich mit Deinem Plattform-Admin-Konto an.':'');
    }
  }catch{
    renderLogin('Die Plattform-Anmeldung konnte nicht geladen werden. Bitte erneut versuchen.');
  }
}
