const root=document.querySelector('#app');

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

async function getMe(){
  const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'});
  if(!r.ok)return null;
  const d=await r.json();
  return d.user||null;
}

function passwordChange(user){
  root.innerHTML=`<main class="center"><form class="login" id="password-change"><div class="brand">Passwort ändern</div><p class="muted">Hallo ${esc(user.displayName)}. Das temporäre Passwort muss vor der ersten Nutzung geändert werden.</p><label class="field">Temporäres Passwort<input name="current_password" type="password" autocomplete="current-password" required></label><label class="field">Neues Passwort<input name="new_password" type="password" minlength="10" autocomplete="new-password" required></label><label class="field">Neues Passwort wiederholen<input name="confirm_password" type="password" minlength="10" autocomplete="new-password" required></label><button class="btn" type="submit">Passwort ändern und weiter</button><p class="error" id="pw-error"></p></form></main>`;
  document.querySelector('#password-change').addEventListener('submit',async e=>{
    e.preventDefault();
    const f=new FormData(e.currentTarget),current=String(f.get('current_password')||''),next=String(f.get('new_password')||''),confirm=String(f.get('confirm_password')||''),msg=document.querySelector('#pw-error');
    msg.textContent='';
    if(next!==confirm){msg.textContent='Die neuen Passwörter stimmen nicht überein.';return;}
    if(next===current){msg.textContent='Das neue Passwort muss sich vom temporären Passwort unterscheiden.';return;}
    try{
      const r=await fetch('/api/auth/change-password',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({current_password:current,new_password:next})});
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||`HTTP_${r.status}`);
      await import(`/app.js?v=${Date.now()}`);
    }catch(x){
      const messages={CURRENT_PASSWORD_INVALID:'Das temporäre Passwort ist nicht korrekt.',PASSWORD_LENGTH_INVALID:'Das neue Passwort muss mindestens 10 Zeichen lang sein.',PASSWORD_MUST_CHANGE:'Das neue Passwort muss sich vom temporären Passwort unterscheiden.',PASSWORD_FIELDS_REQUIRED:'Bitte alle Felder ausfüllen.'};
      msg.textContent=messages[x.message]||x.message;
    }
  });
}

try{
  const me=await getMe();
  if(me?.mustChangePassword) passwordChange(me);
  else await import(`/app.js?v=${Date.now()}`);
}catch(e){
  root.innerHTML=`<main class="center"><div class="login"><h2>Fehler</h2><p class="error">${esc(e?.message||'START_FAILED')}</p><button class="btn" onclick="location.reload()">Neu laden</button></div></main>`;
}
