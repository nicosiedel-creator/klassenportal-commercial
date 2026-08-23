(()=>{
  const path=location.pathname.replace(/\/$/,'');
  let userEnhancing=false,userCacheKey='';

  function notify(text,kind='ok'){
    let n=document.querySelector('#kp-account-mail-status');
    if(!n){n=document.createElement('div');n.id='kp-account-mail-status';n.setAttribute('role','status');n.setAttribute('aria-live','polite');n.style.cssText='position:fixed;right:18px;bottom:18px;z-index:2400;max-width:390px;padding:10px 12px;border:1px solid #dbe3ec;border-radius:8px;background:#fff;color:#172033;box-shadow:0 8px 24px #0002;font:13px/1.4 system-ui';document.body.append(n);}
    n.dataset.kind=kind;n.textContent=text;clearTimeout(notify.timer);notify.timer=setTimeout(()=>n?.remove(),6500);
  }
  function addForgot(root=document){
    root.querySelectorAll?.('form').forEach(form=>{
      if(!form.querySelector('input[type="email"],input[name="email"]')||!form.querySelector('input[type="password"]')||form.querySelector('[data-password-forgot]'))return;
      const p=document.createElement('p');p.dataset.passwordForgot='1';p.style.cssText='margin:10px 0 0;text-align:center;font-size:.88rem';p.innerHTML='<a href="/passwort-vergessen">Passwort vergessen?</a>';form.append(p);
    });
  }
  async function enhanceUserRows(){
    if(userEnhancing||path!=='/kunden-admin')return;
    const tenant=document.querySelector('#tenantPick')?.value||'',heading=document.querySelector('.content > .top h2')?.textContent?.trim();
    if(!tenant||heading!=='Benutzer & Rollen')return;
    const selects=[...document.querySelectorAll('select.userRole[data-mid]')].filter(x=>!x.closest('tr')?.querySelector('[data-secure-reset]'));
    if(!selects.length)return;
    const key=`${tenant}:${selects.map(x=>x.dataset.mid).join(',')}`;if(userCacheKey===key)return;userEnhancing=true;
    try{
      const r=await fetch(`/api/tenant/users?tenant_id=${encodeURIComponent(tenant)}`,{credentials:'same-origin',cache:'no-store'});if(!r.ok)return;
      const d=await r.json(),byMembership=new Map((d.users||[]).map(x=>[String(x.membership_id),x]));
      for(const select of selects){
        const user=byMembership.get(String(select.dataset.mid||'')),row=select.closest('tr'),cell=row?.lastElementChild;if(!user||!cell)continue;
        const b=document.createElement('button');b.type='button';b.className='btn secondary';b.dataset.secureReset='1';b.textContent='Passwort-Link senden';b.title='Beendet bestehende Sitzungen und sendet einen zeitlich begrenzten Passwort-Link per E-Mail';
        b.onclick=async()=>{
          if(!confirm(`Sicheren Passwort-Link an ${user.display_name||user.email} senden? Alle bestehenden Sitzungen dieses Kontos werden sofort beendet.`))return;
          b.disabled=true;
          try{
            const rr=await fetch(`/api/tenant/users/${encodeURIComponent(user.id)}/reset-password?tenant_id=${encodeURIComponent(tenant)}`,{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:'{}'}),x=await rr.json().catch(()=>({}));
            if(!rr.ok)throw new Error(x.error||`HTTP_${rr.status}`);
            notify('Alle bestehenden Sitzungen wurden beendet. Der sichere Passwort-Link wurde per E-Mail versendet.');
          }catch{notify('Passwort-Link konnte nicht versendet werden. Bitte Berechtigung und Verbindung prüfen.','error');}
          finally{b.disabled=false;}
        };
        cell.append(' ',b);
      }
      userCacheKey=key;
    }finally{userEnhancing=false;}
  }
  function refresh(root=document){addForgot(root);void enhanceUserRows();}

  window.KPAccountMail={notify,refresh};
  window.addEventListener('kp:app-rendered',()=>refresh(document.querySelector('#app')||document));
  window.addEventListener('kp:customer-view-changed',()=>refresh(document.querySelector('#app')||document));
  window.addEventListener('kp:customer-modules-group-ready',()=>{userCacheKey='';refresh(document.querySelector('#app')||document);});
  document.addEventListener('change',e=>{if(e.target?.id==='tenantPick'){userCacheKey='';queueMicrotask(()=>refresh(document.querySelector('#app')||document));}});

  // Login gates in the class portal replace only the root shell. Observe only that
  // direct replacement instead of the complete application subtree.
  const portal=document.querySelector('#class-portal');
  if(portal){let frame=0;new MutationObserver(()=>{if(frame)return;frame=requestAnimationFrame(()=>{frame=0;addForgot(portal);});}).observe(portal,{childList:true});}
  refresh(document);
})();
