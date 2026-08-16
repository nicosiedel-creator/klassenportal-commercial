(()=>{
  const previous=window.fetch.bind(window);
  function pathOf(input){try{return new URL(typeof input==='string'?input:input.url,location.href).pathname;}catch{return'';}}
  function methodOf(input,init){return String(init?.method||input?.method||'GET').toUpperCase();}
  window.fetch=async function(input,init){const r=await previous(input,init),path=pathOf(input),method=methodOf(input,init);if(r.ok&&method==='POST'){try{const d=await r.clone().json();if(path==='/api/tenant/users'&&d.invitation_sent)setTimeout(()=>alert('Benutzer wurde angelegt. Der sichere Aktivierungslink wurde per E-Mail versendet; es wird kein temporäres Passwort angezeigt.'),0);else if(/\/api\/tenant\/users\/[^/]+\/reset-password$/.test(path)&&d.password_reset_link_sent)setTimeout(()=>alert('Alle bestehenden Sitzungen wurden beendet. Der sichere Passwort-Link wurde per E-Mail versendet.'),0);else if(path==='/api/platform/tenants'&&d.invitationSent)setTimeout(()=>alert('Bildungsträger wurde angelegt. Der Kunden-Admin erhält einen sicheren Aktivierungslink per E-Mail.'),0);}catch{}}
    return r;};
  function addForgot(){document.querySelectorAll('form.login').forEach(form=>{if(form.querySelector('[data-password-forgot]'))return;const p=document.createElement('p');p.dataset.passwordForgot='1';p.style.cssText='margin:10px 0 0;text-align:center;font-size:.88rem';p.innerHTML='<a href="/passwort-vergessen">Passwort vergessen?</a>';form.append(p);});}
  new MutationObserver(()=>queueMicrotask(addForgot)).observe(document.querySelector('#app')||document.body,{subtree:true,childList:true});addForgot();
})();
