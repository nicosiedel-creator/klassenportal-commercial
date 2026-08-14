const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

async function jsonFetch(url,opt={}){
  const r=await fetch(url,{credentials:'same-origin',...opt,headers:{'content-type':'application/json',...(opt.headers||{})}});
  let d={}; try{d=await r.json()}catch{}
  if(!r.ok) throw new Error(d.error||`HTTP_${r.status}`);
  return d;
}

function renderPasswordChange(user){
  const root=document.querySelector('#app'); if(!root)return;
  root.innerHTML=`<main class="center"><form class="login" id="forcePw"><div class="brand">Passwort ändern</div><p class="muted">Hallo ${esc(user.displayName)}. Dieses Konto wurde mit einem temporären Passwort angelegt. Bevor du das Portal weiter nutzen kannst, musst du ein eigenes Passwort setzen.</p><label class="field">Aktuelles temporäres Passwort<input name="current_password" type="password" autocomplete="current-password" required></label><label class="field">Neues Passwort<input name="new_password" type="password" minlength="10" autocomplete="new-password" required></label><label class="field">Neues Passwort wiederholen<input name="repeat_password" type="password" minlength="10" autocomplete="new-password" required></label><button class="btn">Passwort ändern</button><p id="forcePwMsg" class="error"></p></form></main>`;
  const form=document.querySelector('#forcePw'),msg=document.querySelector('#forcePwMsg');
  form.addEventListener('submit',async e=>{
    e.preventDefault(); const d=Object.fromEntries(new FormData(form)); msg.textContent='';
    if(d.new_password!==d.repeat_password){msg.textContent='Die neuen Passwörter stimmen nicht überein.';return;}
    try{
      await jsonFetch('/api/auth/change-password',{method:'POST',body:JSON.stringify({current_password:d.current_password,new_password:d.new_password})});
      location.reload();
    }catch(x){
      const map={CURRENT_PASSWORD_INVALID:'Das aktuelle temporäre Passwort ist nicht korrekt.',PASSWORD_MUST_CHANGE:'Das neue Passwort muss sich vom temporären Passwort unterscheiden.',PASSWORD_LENGTH_INVALID:'Das neue Passwort muss mindestens 10 Zeichen lang sein.',PASSWORD_FIELDS_REQUIRED:'Bitte alle Felder ausfüllen.'};
      msg.textContent=map[x.message]||x.message;
    }
  });
}

async function enforcePasswordChange(){
  try{
    const r=await fetch('/api/auth/me',{credentials:'same-origin',cache:'no-store'}); if(!r.ok)return;
    const d=await r.json(); if(d?.user?.mustChangePassword) renderPasswordChange(d.user);
  }catch{}
}

window.addEventListener('DOMContentLoaded',()=>setTimeout(enforcePasswordChange,0));
