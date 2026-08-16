(()=>{
  if(document.querySelector('#kp-legal-footer'))return;
  const footer=document.createElement('footer');footer.id='kp-legal-footer';footer.style.cssText='max-width:1120px;margin:28px auto 16px;padding:0 16px;text-align:center;font-size:.82rem;color:#667085';footer.innerHTML='<a href="/impressum">Impressum</a> · <a href="/datenschutz">Datenschutz</a> · <a href="/agb">AGB</a> · <a href="/avv">AVV</a> · <a href="/passwort-vergessen">Passwort vergessen</a><span data-support></span>';document.body.append(footer);
  fetch('/api/public/legal',{credentials:'same-origin',cache:'no-store'}).then(r=>r.ok?r.json():null).then(d=>{const email=d?.legal?.supportEmail;if(email){const s=footer.querySelector('[data-support]');s.innerHTML=` · <a href="mailto:${String(email).replace(/["<>]/g,'')}">Support</a>`;}}).catch(()=>{});
})();
