const CUSTOMER_ADMIN_NAV_LABEL_PATH=location.pathname.replace(/\/$/,'')==='/kunden-admin';
if(CUSTOMER_ADMIN_NAV_LABEL_PATH){
  const LABELS=new Map([
    ['Unterlagen jetzt einwerfen','Dokumente hochladen'],
    ['Struktur & Zuständigkeiten','Organisation & Struktur'],
    ['Zuständigkeiten','Verantwortliche & Vertretungen'],
    ['SSO SCIM & API','SSO, SCIM & API'],
  ]);
  function applyLabels(){
    document.querySelectorAll('.side .nav').forEach(button=>{
      if(button.id==='logout')return;
      const current=String(button.textContent||'').replace(/\s+/g,' ').trim();
      const source=button.dataset.customerNavSourceLabel||current;
      if(!button.dataset.customerNavSourceLabel)button.dataset.customerNavSourceLabel=source;
      const label=LABELS.get(source);
      if(label&&current!==label)button.textContent=label;
    });
  }
  window.addEventListener('kp:customer-view-changed',applyLabels);
  window.addEventListener('kp:customer-modules-group-ready',applyLabels);
  applyLabels();
}
